<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

$user = require_login();
$pdo = db();
$id = (int)($_GET['id'] ?? 0);
$scope = scope_employee_query($user);

function load_session(PDO $pdo, int $id, string $scope): ?array
{
    $stmt = $pdo->prepare(
        "SELECT evaluation_sessions.*, employees.name AS emp_name, employees.id AS emp_id,
                clients.name AS client_name, evaluation_templates.name AS template_name
         FROM evaluation_sessions
         JOIN employees ON employees.id = evaluation_sessions.employee_id
         JOIN clients ON clients.id = evaluation_sessions.client_id
         JOIN evaluation_templates ON evaluation_templates.id = evaluation_sessions.template_id
         WHERE evaluation_sessions.id = ? $scope"
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

$session = load_session($pdo, $id, $scope);
if (!$session) {
    http_response_code(404);
    die('Evaluation not found or you do not have access.');
}

// ---- Actions -------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = $_POST['action'] ?? '';

    if ($action === 'extend_expiration' && in_array($user['role_name'], ['super_admin','hr','manager'], true)) {
        $newDate = trim($_POST['expires_at']) . ' 23:59:59';
        $prev = $session['token_expires_at'];
        $stmt = $pdo->prepare("UPDATE evaluation_sessions SET token_expires_at = ?, status = CASE WHEN status = 'expired' THEN 'link_generated' ELSE status END WHERE id = ?");
        $stmt->execute([$newDate, $id]);
        audit($id, (int)$user['id'], $user['name'], 'link_expiration_extended', $prev, $newDate);
        $_SESSION['flash_success'] = 'Expiration updated.';
        header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
    }

    if ($action === 'revoke_link' && in_array($user['role_name'], ['super_admin','hr','manager'], true)) {
        $stmt = $pdo->prepare("UPDATE evaluation_sessions SET revoked = 1, status = 'revoked' WHERE id = ?");
        $stmt->execute([$id]);
        audit($id, (int)$user['id'], $user['name'], 'token_revoked');
        $_SESSION['flash_success'] = 'Link revoked.';
        header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
    }

    if ($action === 'regenerate_link' && in_array($user['role_name'], ['super_admin','hr','manager'], true)) {
        [$rawToken, $tokenHash] = generate_token();
        $expires = trim($_POST['expires_at']) . ' 23:59:59';
        $stmt = $pdo->prepare("UPDATE evaluation_sessions SET token_hash = ?, token_expires_at = ?, status = 'link_generated', revoked = 0 WHERE id = ?");
        $stmt->execute([$tokenHash, $expires, $id]);
        audit($id, (int)$user['id'], $user['name'], 'token_regenerated');
        $_SESSION['flash_success'] = 'New link generated: ' . base_url() . '/evaluation/' . $rawToken;
        header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
    }

    if ($action === 'manager_decision' && $user['role_name'] === 'manager') {
        if ($session['status'] !== 'manager_review') { die('Not awaiting manager review.'); }
        $decision = $_POST['decision']; // approved / rejected
        $mgrPct = $_POST['manager_pct'] !== '' ? (float)$_POST['manager_pct'] : null;
        $comment = trim($_POST['comment'] ?? '');

        $srStmt = $pdo->prepare('SELECT client_increase_pct FROM salary_recommendations WHERE session_id = ?');
        $srStmt->execute([$id]);
        $clientPct = (float)$srStmt->fetch()['client_increase_pct'];

        if ($decision === 'rejected' && $comment === '') {
            $_SESSION['flash_error'] = 'A comment is required when rejecting.';
            header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
        }
        if ($mgrPct !== null && $mgrPct != $clientPct && $comment === '') {
            $_SESSION['flash_error'] = 'A comment is required when adjusting the recommended increase.';
            header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
        }

        $upd = $pdo->prepare('UPDATE salary_recommendations SET manager_increase_pct = ?, manager_comment = ?, manager_decided_by = ?, manager_decided_at = CURRENT_TIMESTAMP WHERE session_id = ?');
        $upd->execute([$mgrPct, $comment ?: null, $user['id'], $id]);

        $newStatus = $decision === 'approved' ? 'hr_review' : 'manager_rejected';
        $pdo->prepare('UPDATE evaluation_sessions SET status = ?, manager_reviewed_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$newStatus, $id]);

        $pdo->prepare('INSERT INTO approvals (session_id, stage, decision, decided_by, comment) VALUES (?, "manager", ?, ?, ?)')
            ->execute([$id, $decision, $user['id'], $comment ?: null]);

        audit($id, (int)$user['id'], $user['name'], 'manager_' . $decision, (string)$clientPct, $mgrPct !== null ? (string)$mgrPct : null);
        $_SESSION['flash_success'] = 'Manager decision recorded.';
        header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
    }

    if ($action === 'hr_decision' && in_array($user['role_name'], ['hr','super_admin'], true)) {
        if ($session['status'] !== 'hr_review') { die('Not awaiting HR review.'); }
        $decision = $_POST['decision'];
        $finalPct = $_POST['hr_pct'] !== '' ? (float)$_POST['hr_pct'] : null;
        $comment = trim($_POST['comment'] ?? '');

        if ($decision === 'rejected' && $comment === '') {
            $_SESSION['flash_error'] = 'A comment is required when rejecting.';
            header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
        }
        if ($decision === 'approved' && $finalPct === null) {
            $_SESSION['flash_error'] = 'Final percentage is required to approve.';
            header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
        }

        $upd = $pdo->prepare('UPDATE salary_recommendations SET hr_final_pct = ?, hr_comment = ?, hr_decided_by = ?, hr_decided_at = CURRENT_TIMESTAMP WHERE session_id = ?');
        $upd->execute([$finalPct, $comment ?: null, $user['id'], $id]);

        $newStatus = $decision === 'approved' ? 'finalized' : 'hr_rejected';
        $extra = $decision === 'approved' ? ", finalized_at = CURRENT_TIMESTAMP" : "";
        $pdo->prepare("UPDATE evaluation_sessions SET status = ?, hr_reviewed_at = CURRENT_TIMESTAMP $extra WHERE id = ?")->execute([$newStatus, $id]);

        $pdo->prepare('INSERT INTO approvals (session_id, stage, decision, decided_by, comment) VALUES (?, "hr", ?, ?, ?)')
            ->execute([$id, $decision, $user['id'], $comment ?: null]);

        audit($id, (int)$user['id'], $user['name'], 'hr_' . $decision, null, $finalPct !== null ? (string)$finalPct : null);
        if ($decision === 'approved') {
            audit($id, (int)$user['id'], $user['name'], 'evaluation_finalized');
        }
        $_SESSION['flash_success'] = 'HR decision recorded.';
        header("Location: " . app_path('/frontend/admin/evaluation_detail.php') . "?id=$id"); exit;
    }

    $session = load_session($pdo, $id, $scope);
}

// ---- Load related data ---------------------------------------------
$resultStmt = $pdo->prepare('SELECT * FROM evaluation_results WHERE session_id = ?');
$resultStmt->execute([$id]);
$result = $resultStmt->fetch();

$responsesStmt = $pdo->prepare(
    'SELECT evaluation_responses.score, evaluation_criteria.label
     FROM evaluation_responses JOIN evaluation_criteria ON evaluation_criteria.id = evaluation_responses.criterion_id
     WHERE session_id = ? ORDER BY evaluation_criteria.sort_order'
);
$responsesStmt->execute([$id]);
$responses = $responsesStmt->fetchAll();

$srStmt = $pdo->prepare('SELECT * FROM salary_recommendations WHERE session_id = ?');
$srStmt->execute([$id]);
$sr = $srStmt->fetch();

$auditStmt = $pdo->prepare('SELECT * FROM audit_logs WHERE session_id = ? ORDER BY created_at ASC');
$auditStmt->execute([$id]);
$auditRows = $auditStmt->fetchAll();

$pageTitle = 'Evaluation — ' . $session['emp_name'];
$active = 'evaluations';
require __DIR__ . '/../partials/layout_top.php';
?>
<h1><?= e($session['emp_name']) ?> &mdash; <?= e($session['period_label']) ?></h1>
<div class="page-sub">
  Client: <?= e($session['client_name']) ?> &middot; Template: <?= e($session['template_name']) ?>
  &middot; <span class="badge <?= status_badge_class($session['status']) ?>"><?= e(status_label($session['status'])) ?></span>
</div>

<div class="two-col">
  <div>
    <div class="panel">
      <div class="panel-title">Client Evaluation</div>
      <?php if (!$result): ?>
        <p class="small-muted">Not yet submitted by the client.</p>
      <?php else: ?>
        <table class="panel">
          <?php foreach ($responses as $r): ?>
            <tr><td><?= e($r['label']) ?></td><td class="num"><?= (int)$r['score'] ?></td></tr>
          <?php endforeach; ?>
          <tr><td><b>Overall Score</b></td><td class="num"><b><?= number_format((float)$result['overall_score'], 1) ?></b></td></tr>
          <tr><td><b>Grade</b> <span class="small-muted">(informational only)</span></td><td class="num"><b><?= e($result['grade']) ?></b></td></tr>
        </table>
        <?php if ($result['client_comments']): ?>
          <h3>Client Comments</h3>
          <p><?= nl2br(e($result['client_comments'])) ?></p>
        <?php endif; ?>
      <?php endif; ?>
    </div>

    <?php if ($sr): ?>
    <div class="panel">
      <div class="panel-title">Salary Increase Recommendations</div>
      <div class="rec-compare">
        <div class="rec"><div class="who">Client</div><div class="pct"><?= number_format((float)$sr['client_increase_pct'], 2) ?>%</div></div>
        <div class="rec"><div class="who">Manager</div><div class="pct"><?= $sr['manager_increase_pct'] !== null ? number_format((float)$sr['manager_increase_pct'], 2) . '%' : '—' ?></div></div>
        <div class="rec <?= $sr['hr_final_pct'] !== null ? 'final' : '' ?>"><div class="who">HR Final</div><div class="pct"><?= $sr['hr_final_pct'] !== null ? number_format((float)$sr['hr_final_pct'], 2) . '%' : '—' ?></div></div>
      </div>
      <?php if ($sr['manager_comment']): ?><p class="small-muted"><b>Manager note:</b> <?= e($sr['manager_comment']) ?></p><?php endif; ?>
      <?php if ($sr['hr_comment']): ?><p class="small-muted"><b>HR note:</b> <?= e($sr['hr_comment']) ?></p><?php endif; ?>
    </div>
    <?php endif; ?>

    <?php if ($session['status'] === 'manager_review' && $user['role_name'] === 'manager'): ?>
    <div class="panel">
      <div class="panel-title">Manager Review</div>
      <form method="post">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="manager_decision">
        <div class="form-group">
          <label>Recommended Increase % (adjust if needed — client's original value is always preserved)</label>
          <input type="number" step="0.01" name="manager_pct" value="<?= e((string)$sr['client_increase_pct']) ?>">
        </div>
        <div class="form-group"><label>Comment (required if rejecting or adjusting)</label><textarea name="comment"></textarea></div>
        <button class="btn btn-success" type="submit" name="decision" value="approved">Approve</button>
        <button class="btn btn-danger" type="submit" name="decision" value="rejected">Reject</button>
      </form>
    </div>
    <?php endif; ?>

    <?php if ($session['status'] === 'hr_review' && in_array($user['role_name'], ['hr','super_admin'], true)): ?>
    <div class="panel">
      <div class="panel-title">HR / Department Head Review</div>
      <form method="post">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="hr_decision">
        <div class="form-group">
          <label>Final Approved Increase %</label>
          <input type="number" step="0.01" name="hr_pct" value="<?= e((string)($sr['manager_increase_pct'] ?? $sr['client_increase_pct'])) ?>">
        </div>
        <div class="form-group"><label>Comment (required if rejecting)</label><textarea name="comment"></textarea></div>
        <button class="btn btn-success" type="submit" name="decision" value="approved">Approve &amp; Finalize</button>
        <button class="btn btn-danger" type="submit" name="decision" value="rejected">Reject</button>
      </form>
    </div>
    <?php endif; ?>

    <h2>Audit History</h2>
    <ul class="timeline">
      <?php foreach ($auditRows as $a): ?>
        <li><?= e(str_replace('_', ' ', $a['action'])) ?> <span class="small-muted">by <?= e($a['actor_label'] ?: 'System') ?></span><div class="when"><?= e($a['created_at']) ?></div></li>
      <?php endforeach; ?>
    </ul>
  </div>

  <div>
    <div class="panel">
      <div class="panel-title">Link Management</div>
      <p class="small-muted">Expires: <?= e($session['token_expires_at']) ?></p>
      <?php if (in_array($user['role_name'], ['super_admin','hr','manager'], true) && !in_array($session['status'], ['finalized'], true)): ?>
        <form method="post" style="margin-bottom:10px;">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="extend_expiration">
          <div class="form-group"><label>New Expiration</label><input type="date" name="expires_at" value="<?= date('Y-m-d', strtotime($session['token_expires_at'])) ?>"></div>
          <button class="btn btn-secondary btn-sm" type="submit">Extend</button>
        </form>
        <form method="post" style="margin-bottom:10px;">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="regenerate_link">
          <input type="hidden" name="expires_at" value="<?= date('Y-m-d', strtotime('+30 days')) ?>">
          <button class="btn btn-secondary btn-sm" type="submit" onclick="return confirm('Regenerate the link? The old link will stop working.');">Regenerate Link</button>
        </form>
        <?php if (!$session['revoked']): ?>
        <form method="post">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="revoke_link">
          <button class="btn btn-danger btn-sm" type="submit" onclick="return confirm('Revoke this link? The evaluation record is kept.');">Revoke Link</button>
        </form>
        <?php endif; ?>
      <?php endif; ?>
    </div>
  </div>
</div>
<?php require __DIR__ . '/../partials/layout_bottom.php'; ?>
