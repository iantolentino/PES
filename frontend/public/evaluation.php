<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

/**
 * Public, no-login evaluation page. Reached via /evaluation/{token} (rewritten
 * to this file with ?token=... by the web server — see .htaccess).
 *
 * Security notes:
 * - Token is looked up by hash; the raw token is never stored server-side.
 * - Every render revalidates status/expiry/revocation server-side — never trust the client.
 * - Submission locking is enforced here, not just in the UI.
 * - No employee/client/manager DB IDs are ever exposed to the client.
 */

start_session_safe();

// Very small fixed-window rate limiter per session to blunt token brute-forcing.
$_SESSION['rl'] = $_SESSION['rl'] ?? ['count' => 0, 'window' => time()];
if (time() - $_SESSION['rl']['window'] > 60) {
    $_SESSION['rl'] = ['count' => 0, 'window' => time()];
}
$_SESSION['rl']['count']++;
if ($_SESSION['rl']['count'] > 40) {
    http_response_code(429);
    die('Too many requests. Please try again shortly.');
}

$rawToken = (string)($_GET['token'] ?? '');
if ($rawToken === '' || !preg_match('/^[a-f0-9]{64}$/', $rawToken)) {
    http_response_code(404);
    include __DIR__ . '/evaluation_invalid.php';
    exit;
}

$pdo = db();
$tokenHash = hash_token($rawToken);

$stmt = $pdo->prepare(
    "SELECT evaluation_sessions.*, employees.name AS emp_name, employees.position, employees.department_id,
            departments.name AS dept_name, clients.name AS client_name, evaluation_templates.id AS tmpl_id
     FROM evaluation_sessions
     JOIN employees ON employees.id = evaluation_sessions.employee_id
     LEFT JOIN departments ON departments.id = employees.department_id
     JOIN clients ON clients.id = evaluation_sessions.client_id
     JOIN evaluation_templates ON evaluation_templates.id = evaluation_sessions.template_id
     WHERE evaluation_sessions.token_hash = ?"
);
$stmt->execute([$tokenHash]);
$session = $stmt->fetch();

if (!$session) {
    http_response_code(404);
    include __DIR__ . '/evaluation_invalid.php';
    exit;
}

// Expiry check (server-side; does not delete the record)
if ($session['status'] !== 'expired' && strtotime($session['token_expires_at']) < time()
    && in_array($session['status'], ['link_generated', 'pending_client'], true)) {
    $pdo->prepare("UPDATE evaluation_sessions SET status = 'expired' WHERE id = ?")->execute([$session['id']]);
    $session['status'] = 'expired';
}

if ($session['revoked'] || $session['status'] === 'revoked') {
    include __DIR__ . '/evaluation_revoked.php';
    exit;
}

if ($session['status'] === 'expired') {
    include __DIR__ . '/evaluation_expired.php';
    exit;
}

// Already submitted — locked, regardless of what the client tries to POST.
if (!in_array($session['status'], ['link_generated', 'pending_client'], true)) {
    include __DIR__ . '/evaluation_already_submitted.php';
    exit;
}

// First view: flip to pending_client so admins see it's been opened.
if ($session['status'] === 'link_generated') {
    $pdo->prepare("UPDATE evaluation_sessions SET status = 'pending_client' WHERE id = ?")->execute([$session['id']]);
    audit((int)$session['id'], null, 'Client (token)', 'link_opened');
    $session['status'] = 'pending_client';
}

$criteriaStmt = $pdo->prepare('SELECT * FROM evaluation_criteria WHERE template_id = ? ORDER BY sort_order');
$criteriaStmt->execute([$session['tmpl_id']]);
$criteria = $criteriaStmt->fetchAll();

$step = $_POST['step'] ?? ($_GET['step'] ?? 'form');
$errors = [];

// ---- Handle POST -----------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();

    if (($_POST['stage'] ?? '') === 'review') {
        // Validate scores server-side, stash in session (client re-enters nothing sensitive).
        $scores = [];
        foreach ($criteria as $c) {
            $val = (int)($_POST['score_' . $c['id']] ?? -1);
            if ($val < $c['min_score'] || $val > $c['max_score']) {
                $errors[] = 'Invalid score for ' . $c['label'];
            }
            $scores[$c['id']] = $val;
        }
        $increasePct = $_POST['increase_pct'] ?? '';
        if (!is_numeric($increasePct) || (float)$increasePct < 0 || (float)$increasePct > 100) {
            $errors[] = 'Please enter a valid recommended increase percentage (0–100).';
        }
        $comments = trim((string)($_POST['comments'] ?? ''));

        if (!$errors) {
            $_SESSION['pending_eval_' . $session['id']] = [
                'scores' => $scores,
                'increase_pct' => (float)$increasePct,
                'comments' => $comments,
            ];
            $step = 'review';
        } else {
            $step = 'form';
        }
    }

    if (($_POST['stage'] ?? '') === 'submit') {
        $pending = $_SESSION['pending_eval_' . $session['id']] ?? null;
        if (!$pending) {
            $errors[] = 'Your session expired before submission. Please review the form again.';
            $step = 'form';
        } else {
            // Re-check status server-side right before writing — prevents double submission.
            $lockStmt = $pdo->prepare("SELECT status FROM evaluation_sessions WHERE id = ?");
            $lockStmt->execute([$session['id']]);
            $liveStatus = $lockStmt->fetch()['status'];

            if (!in_array($liveStatus, ['link_generated', 'pending_client'], true)) {
                include __DIR__ . '/evaluation_already_submitted.php';
                exit;
            }

            $pdo->beginTransaction();
            try {
                $insResp = $pdo->prepare('INSERT INTO evaluation_responses (session_id, criterion_id, score) VALUES (?, ?, ?)');
                $total = 0;
                $count = 0;
                foreach ($pending['scores'] as $critId => $score) {
                    $insResp->execute([$session['id'], $critId, $score]);
                    $total += $score;
                    $count++;
                }
                $overall = $count > 0 ? round($total / $count, 2) : 0;
                $grade = grade_for_score($overall);

                $pdo->prepare('INSERT INTO evaluation_results (session_id, overall_score, grade, client_comments) VALUES (?, ?, ?, ?)')
                    ->execute([$session['id'], $overall, $grade, $pending['comments'] ?: null]);

                $pdo->prepare('INSERT INTO salary_recommendations (session_id, client_increase_pct) VALUES (?, ?)')
                    ->execute([$session['id'], $pending['increase_pct']]);

                $pdo->prepare("UPDATE evaluation_sessions SET status = 'manager_review', submitted_at = CURRENT_TIMESTAMP WHERE id = ?")
                    ->execute([$session['id']]);

                $pdo->commit();

                audit((int)$session['id'], null, 'Client (token)', 'client_submitted', null, (string)$overall);
                unset($_SESSION['pending_eval_' . $session['id']]);

                include __DIR__ . '/evaluation_thankyou.php';
                exit;
            } catch (Throwable $e) {
                $pdo->rollBack();
                $errors[] = 'Something went wrong saving your evaluation. Please try again.';
                $step = 'form';
            }
        }
    }

    if (($_POST['stage'] ?? '') === 'back') {
        $step = 'form';
    }
}

$pending = $_SESSION['pending_eval_' . $session['id']] ?? null;
if ($step === 'review' && !$pending) {
    $step = 'form';
}

?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Performance Evaluation — <?= e($session['emp_name']) ?></title>
<link rel="stylesheet" href="<?= e(app_path('/frontend/assets/style.css')) ?>">
</head>
<body>
<div class="client-shell">
  <div class="client-header">
    <div class="company">Performance Evaluation</div>
    <h1><?= e($session['emp_name']) ?></h1>
    <div class="small-muted"><?= e($session['position']) ?><?= $session['dept_name'] ? ' &middot; ' . e($session['dept_name']) : '' ?></div>
    <div class="small-muted">Period: <?= e($session['period_label']) ?><?= $session['project_name'] ? ' &middot; ' . e($session['project_name']) : '' ?></div>
  </div>

  <?php if ($errors): ?>
    <div class="flash flash-error"><?php foreach ($errors as $err) echo e($err) . '<br>'; ?></div>
  <?php endif; ?>

  <?php if ($step === 'form'): ?>
    <form method="post">
      <?= csrf_field() ?>
      <input type="hidden" name="stage" value="review">
      <?php foreach ($criteria as $c): ?>
        <div class="criterion-row">
          <label for="score_<?= (int)$c['id'] ?>"><?= e($c['label']) ?></label>
          <div class="score-slider-row">
            <input type="range" min="<?= (int)$c['min_score'] ?>" max="<?= (int)$c['max_score'] ?>"
                   id="score_<?= (int)$c['id'] ?>" name="score_<?= (int)$c['id'] ?>"
                   value="<?= (int)($pending['scores'][$c['id']] ?? round(($c['min_score'] + $c['max_score']) / 2)) ?>"
                   oninput="document.getElementById('val_<?= (int)$c['id'] ?>').textContent = this.value">
            <span class="score-val" id="val_<?= (int)$c['id'] ?>"><?= (int)($pending['scores'][$c['id']] ?? round(($c['min_score'] + $c['max_score']) / 2)) ?></span>
          </div>
        </div>
      <?php endforeach; ?>

      <div class="panel">
        <div class="form-group">
          <label>Recommended Salary Increase (%)</label>
          <input type="number" step="0.01" min="0" max="100" name="increase_pct" required value="<?= e((string)($pending['increase_pct'] ?? '')) ?>">
          <div class="hint">Enter the percentage you believe this person deserves. This is independent of the calculated grade.</div>
        </div>
        <div class="form-group">
          <label>Comments (optional)</label>
          <textarea name="comments"><?= e($pending['comments'] ?? '') ?></textarea>
        </div>
      </div>

      <button class="btn" type="submit" style="width:100%;">Review Before Submitting</button>
    </form>
  <?php elseif ($step === 'review'): ?>
    <div class="panel">
      <div class="panel-title">Review Your Evaluation</div>
      <table>
        <?php
        $total = 0; $count = 0;
        foreach ($criteria as $c):
            $val = (int)$pending['scores'][$c['id']];
            $total += $val; $count++;
        ?>
          <tr><td><?= e($c['label']) ?></td><td class="num"><?= $val ?></td></tr>
        <?php endforeach; ?>
        <?php $overall = $count ? round($total / $count, 1) : 0; ?>
        <tr><td><b>Overall Score</b></td><td class="num"><b><?= $overall ?></b></td></tr>
        <tr><td><b>Grade</b></td><td class="num"><b><?= e(grade_for_score($overall)) ?></b></td></tr>
        <tr><td><b>Recommended Increase</b></td><td class="num"><b><?= e(number_format((float)$pending['increase_pct'], 2)) ?>%</b></td></tr>
      </table>
      <?php if ($pending['comments']): ?>
        <h3>Comments</h3>
        <p><?= nl2br(e($pending['comments'])) ?></p>
      <?php endif; ?>
    </div>
    <form method="post" style="display:flex; gap:10px;">
      <?= csrf_field() ?>
      <input type="hidden" name="stage" value="back">
      <button class="btn btn-secondary" type="submit" style="flex:1;">Back and Edit</button>
    </form>
    <form method="post" style="margin-top:10px;">
      <?= csrf_field() ?>
      <input type="hidden" name="stage" value="submit">
      <button class="btn btn-success" type="submit" style="width:100%;" onclick="return confirm('Submit this evaluation? It cannot be changed afterward.');">Confirm &amp; Submit</button>
    </form>
  <?php endif; ?>
</div>
</body>
</html>
