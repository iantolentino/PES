<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

$user = require_role(['super_admin', 'hr', 'manager']);
$pdo = db();
$scope = scope_employee_query($user);

$employeeId = (int)($_GET['employee_id'] ?? $_POST['employee_id'] ?? 0);

$empStmt = $pdo->prepare("SELECT * FROM employees WHERE id = ? $scope");
$empStmt->execute([$employeeId]);
$employee = $empStmt->fetch();
if (!$employee) {
    http_response_code(404);
    die('Employee not found or you do not have access.');
}

$clients = $pdo->query('SELECT * FROM clients ORDER BY name')->fetchAll();
$templates = $pdo->query('SELECT * FROM evaluation_templates WHERE active = 1 ORDER BY name')->fetchAll();

$rawToken = null;
$createdSessionId = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $clientId = (int)$_POST['client_id'];
    $templateId = (int)$_POST['template_id'];
    $period = trim($_POST['period_label']);
    $project = trim($_POST['project_name'] ?? '') ?: null;
    $expiresAt = trim($_POST['expires_at']); // yyyy-mm-dd

    if ($clientId && $templateId && $period && $expiresAt) {
        [$rawToken, $tokenHash] = generate_token();

        $stmt = $pdo->prepare(
            'INSERT INTO evaluation_sessions
                (employee_id, client_id, template_id, project_name, period_label, token_hash, token_expires_at, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $employee['id'], $clientId, $templateId, $project, $period,
            $tokenHash, $expiresAt . ' 23:59:59', 'link_generated', $user['id'],
        ]);
        $createdSessionId = (int)$pdo->lastInsertId();

        audit($createdSessionId, (int)$user['id'], $user['name'], 'evaluation_created', null, $period);
        audit($createdSessionId, (int)$user['id'], $user['name'], 'token_generated');
    }
}

$pageTitle = 'Create Evaluation';
$active = 'employees';
require __DIR__ . '/../partials/layout_top.php';
?>
<h1>Create Evaluation — <?= e($employee['name']) ?></h1>
<div class="page-sub">Generates a one-time, unpredictable client link tied to this employee and evaluation session.</div>

<?php if ($rawToken): ?>
  <div class="panel">
    <div class="panel-title">Link Generated</div>
    <p>Share this link with the client. It is shown only once — the raw token is not stored, only its hash.</p>
    <div class="copy-row">
      <input type="text" id="linkBox" readonly value="<?= e(base_url() . '/evaluation/' . $rawToken) ?>">
      <button class="btn btn-secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('linkBox').value); this.textContent='Copied';">Copy Link</button>
    </div>
    <p class="small-muted" style="margin-top:10px;">
      <a href="<?= e(app_path('/frontend/admin/evaluation_detail.php')) ?>?id=<?= (int)$createdSessionId ?>">View evaluation session &rarr;</a>
    </p>
  </div>
<?php else: ?>
  <div class="panel" style="max-width:520px;">
    <form method="post">
      <?= csrf_field() ?>
      <input type="hidden" name="employee_id" value="<?= (int)$employee['id'] ?>">
      <div class="form-group">
        <label>Client</label>
        <select name="client_id" required>
          <option value="">Select client…</option>
          <?php foreach ($clients as $c): ?><option value="<?= (int)$c['id'] ?>"><?= e($c['name']) ?></option><?php endforeach; ?>
        </select>
      </div>
      <div class="form-group">
        <label>Evaluation Template</label>
        <select name="template_id" required>
          <?php foreach ($templates as $t): ?><option value="<?= (int)$t['id'] ?>"><?= e($t['name']) ?></option><?php endforeach; ?>
        </select>
      </div>
      <div class="form-group">
        <label>Evaluation Period</label>
        <input type="text" name="period_label" placeholder="e.g. Q3 2026" required>
      </div>
      <div class="form-group">
        <label>Project / Engagement (optional)</label>
        <input type="text" name="project_name">
      </div>
      <div class="form-group">
        <label>Link Expiration Date</label>
        <input type="date" name="expires_at" required min="<?= date('Y-m-d') ?>" value="<?= date('Y-m-d', strtotime('+30 days')) ?>">
      </div>
      <button class="btn" type="submit">Generate Evaluation Link</button>
    </form>
  </div>
<?php endif; ?>
<?php require __DIR__ . '/../partials/layout_bottom.php'; ?>
