<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

$user = require_login();
sweep_expired_sessions();
$pdo = db();
$scope = scope_employee_query($user);

$where = ['1=1'];
$params = [];

if (!empty($_GET['status'])) { $where[] = 'evaluation_sessions.status = ?'; $params[] = $_GET['status']; }
if (!empty($_GET['client_id'])) { $where[] = 'evaluation_sessions.client_id = ?'; $params[] = $_GET['client_id']; }
if (!empty($_GET['employee_id'])) { $where[] = 'evaluation_sessions.employee_id = ?'; $params[] = $_GET['employee_id']; }
if (!empty($_GET['period'])) { $where[] = 'evaluation_sessions.period_label LIKE ?'; $params[] = '%' . $_GET['period'] . '%'; }

$sql = "SELECT evaluation_sessions.*, employees.name AS emp_name, clients.name AS client_name
        FROM evaluation_sessions
        JOIN employees ON employees.id = evaluation_sessions.employee_id
        JOIN clients ON clients.id = evaluation_sessions.client_id
        WHERE " . implode(' AND ', $where) . " $scope
        ORDER BY evaluation_sessions.created_at DESC";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$clients = $pdo->query('SELECT * FROM clients ORDER BY name')->fetchAll();
$statuses = ['link_generated','pending_client','submitted','manager_review','manager_approved','manager_rejected','hr_review','hr_approved','hr_rejected','finalized','expired','cancelled','revoked'];

$pageTitle = 'Evaluations';
$active = 'evaluations';
require __DIR__ . '/../partials/layout_top.php';
?>
<div class="page-head">
  <div>
    <h1>Evaluations</h1>
    <div class="page-sub">All evaluation sessions across employees and clients.</div>
  </div>
</div>

<div class="panel">
  <form method="get">
    <div class="three-col">
      <div class="form-group">
        <label>Status</label>
        <select name="status">
          <option value="">All statuses</option>
          <?php foreach ($statuses as $s): ?>
            <option value="<?= e($s) ?>" <?= ($_GET['status'] ?? '') === $s ? 'selected' : '' ?>><?= e(status_label($s)) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="form-group">
        <label>Client</label>
        <select name="client_id">
          <option value="">All clients</option>
          <?php foreach ($clients as $c): ?>
            <option value="<?= (int)$c['id'] ?>" <?= (string)($_GET['client_id'] ?? '') === (string)$c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="form-group">
        <label>Period contains</label>
        <input type="text" name="period" value="<?= e($_GET['period'] ?? '') ?>" placeholder="e.g. Q3 2026">
      </div>
    </div>
    <div style="display:flex; gap:10px;">
      <button class="btn" type="submit">Apply Filters</button>
      <a class="btn btn-secondary" href="<?= e(app_path('/frontend/admin/evaluations.php')) ?>">Clear</a>
    </div>
  </form>
</div>

<div class="table-wrap">
<table>
  <thead><tr><th>Employee</th><th>Client</th><th>Period</th><th>Status</th><th>Created</th><th>Expires</th><th style="width:100px;"></th></tr></thead>
  <tbody>
  <?php if (!$rows): ?>
    <tr><td colspan="7" class="empty-state">No evaluations match.</td></tr>
  <?php endif; ?>
  <?php foreach ($rows as $r): ?>
    <tr>
      <td><a href="<?= e(app_path('/frontend/admin/evaluation_detail.php')) ?>?id=<?= (int)$r['id'] ?>"><?= e($r['emp_name']) ?></a></td>
      <td><?= e($r['client_name']) ?></td>
      <td><?= e($r['period_label']) ?></td>
      <td><span class="badge <?= status_badge_class($r['status']) ?>"><?= e(status_label($r['status'])) ?></span></td>
      <td class="small-muted"><?= e($r['created_at']) ?></td>
      <td class="small-muted"><?= e($r['token_expires_at']) ?></td>
      <td><a class="btn btn-sm btn-secondary" href="<?= e(app_path('/frontend/admin/evaluation_detail.php')) ?>?id=<?= (int)$r['id'] ?>">View</a></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>
<?php require __DIR__ . '/../partials/layout_bottom.php'; ?>
