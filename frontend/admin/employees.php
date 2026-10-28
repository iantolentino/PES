<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

$user = require_login();
$pdo = db();
$scope = scope_employee_query($user);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'create_employee') {
    require_role(['super_admin', 'hr']);
    require_csrf();
    $stmt = $pdo->prepare('INSERT INTO employees (name, position, department_id, manager_id) VALUES (?, ?, ?, ?)');
    $stmt->execute([
        trim($_POST['name']),
        trim($_POST['position']) ?: null,
        $_POST['department_id'] ?: null,
        $_POST['manager_id'] ?: null,
    ]);
    audit(null, (int)$user['id'], $user['name'], 'employee_created', null, trim($_POST['name']));
    $_SESSION['flash_success'] = 'Employee added.';
    header('Location: ' . app_path('/frontend/admin/employees.php'));
    exit;
}

$stmt = $pdo->prepare(
    "SELECT employees.*, departments.name AS dept_name, managers.name AS manager_name,
        (SELECT status FROM evaluation_sessions WHERE employee_id = employees.id ORDER BY created_at DESC LIMIT 1) AS last_status,
        (SELECT period_label FROM evaluation_sessions WHERE employee_id = employees.id ORDER BY created_at DESC LIMIT 1) AS last_period
     FROM employees
     LEFT JOIN departments ON departments.id = employees.department_id
     LEFT JOIN users managers ON managers.id = employees.manager_id
     WHERE employees.active = 1 $scope
     ORDER BY employees.name"
);
$stmt->execute();
$employees = $stmt->fetchAll();

$departments = $pdo->query('SELECT * FROM departments ORDER BY name')->fetchAll();
$managers = $pdo->query("SELECT users.* FROM users JOIN roles ON roles.id = users.role_id WHERE roles.name='manager' AND active=1 ORDER BY name")->fetchAll();

$pageTitle = 'Employees';
$active = 'employees';
require __DIR__ . '/../partials/layout_top.php';
?>
<div class="page-head">
  <div>
    <h1>Employees</h1>
    <div class="page-sub">Manage employee records and start new evaluations.</div>
  </div>
</div>

<div class="table-wrap">
<table>
  <thead><tr><th>Employee</th><th>Position</th><th>Department</th><th>Manager</th><th>Last Period</th><th>Status</th><th style="width:150px;"></th></tr></thead>
  <tbody>
  <?php if (!$employees): ?>
    <tr><td colspan="7" class="empty-state">No employees yet.</td></tr>
  <?php endif; ?>
  <?php foreach ($employees as $emp): ?>
    <tr>
      <td><a href="<?= e(app_path('/frontend/admin/employee_detail.php')) ?>?id=<?= (int)$emp['id'] ?>"><?= e($emp['name']) ?></a></td>
      <td><?= e($emp['position'] ?: '—') ?></td>
      <td><?= e($emp['dept_name'] ?: '—') ?></td>
      <td><?= e($emp['manager_name'] ?: '—') ?></td>
      <td class="small-muted"><?= e($emp['last_period'] ?: '—') ?></td>
      <td><?= $emp['last_status'] ? '<span class="badge ' . status_badge_class($emp['last_status']) . '">' . e(status_label($emp['last_status'])) . '</span>' : '<span class="small-muted">None</span>' ?></td>
      <td><a class="btn btn-sm btn-secondary" href="<?= e(app_path('/frontend/admin/evaluation_create.php')) ?>?employee_id=<?= (int)$emp['id'] ?>">New Evaluation</a></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>

<?php if (in_array($user['role_name'], ['super_admin','hr'], true)): ?>
<div class="section-head"><h2>Add Employee</h2></div>
<div class="panel" style="max-width:580px;">
  <form method="post">
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="create_employee">
    <div class="two-col" style="gap:16px;">
      <div class="form-group"><label>Full Name</label><input type="text" name="name" required placeholder="e.g. Jane Dela Cruz"></div>
      <div class="form-group"><label>Position</label><input type="text" name="position" placeholder="e.g. Web Developer"></div>
    </div>
    <div class="two-col" style="gap:16px;">
      <div class="form-group"><label>Department</label>
        <select name="department_id"><option value="">— Select —</option>
          <?php foreach ($departments as $d): ?><option value="<?= (int)$d['id'] ?>"><?= e($d['name']) ?></option><?php endforeach; ?>
        </select>
      </div>
      <div class="form-group"><label>Assigned Manager</label>
        <select name="manager_id"><option value="">— Select —</option>
          <?php foreach ($managers as $m): ?><option value="<?= (int)$m['id'] ?>"><?= e($m['name']) ?></option><?php endforeach; ?>
        </select>
      </div>
    </div>
    <button class="btn" type="submit">Add Employee</button>
  </form>
</div>
<?php endif; ?>
<?php require __DIR__ . '/../partials/layout_bottom.php'; ?>
