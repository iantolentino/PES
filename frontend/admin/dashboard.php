<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

$user = require_login();
sweep_expired_sessions();
$pdo = db();
$scope = scope_employee_query($user);

$countSql = function (string $statusFilter) use ($pdo, $scope): int {
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) c FROM evaluation_sessions
         JOIN employees ON employees.id = evaluation_sessions.employee_id
         WHERE $statusFilter $scope"
    );
    $stmt->execute();
    return (int)$stmt->fetch()['c'];
};

$totalEmployees = (int)$pdo->query(
    "SELECT COUNT(*) c FROM employees WHERE active = 1" . ($user['role_name'] === 'manager' ? ' AND manager_id = ' . (int)$user['id'] : '')
)->fetch()['c'];

$pendingClient   = $countSql("evaluation_sessions.status IN ('link_generated','pending_client')");
$awaitingManager = $countSql("evaluation_sessions.status = 'manager_review'");
$awaitingHR      = $countSql("evaluation_sessions.status = 'hr_review'");
$completed       = $countSql("evaluation_sessions.status = 'finalized'");
$expiredLinks    = $countSql("evaluation_sessions.status = 'expired'");

$recentStmt = $pdo->prepare(
    "SELECT audit_logs.*, evaluation_sessions.id AS es_id, employees.name AS emp_name
     FROM audit_logs
     LEFT JOIN evaluation_sessions ON evaluation_sessions.id = audit_logs.session_id
     LEFT JOIN employees ON employees.id = evaluation_sessions.employee_id
     WHERE 1=1 " . str_replace('employees.manager_id', 'employees.manager_id', $scope) . "
     ORDER BY audit_logs.created_at DESC LIMIT 10"
);
$recentStmt->execute();
$recent = $recentStmt->fetchAll();

$pageTitle = 'Dashboard';
$active = 'dashboard';
require __DIR__ . '/../partials/layout_top.php';
?>
<h1>Dashboard</h1>
<div class="page-sub">Operational overview of evaluation activity.</div>

<div class="cards">
  <div class="stat-card">
    <div class="stat-icon indigo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
    <div class="stat-body"><div class="num"><?= $totalEmployees ?></div><div class="label">Total Employees</div></div>
  </div>
  <div class="stat-card">
    <div class="stat-icon sky"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
    <div class="stat-body"><div class="num"><?= $pendingClient ?></div><div class="label">Pending Client</div></div>
  </div>
  <div class="stat-card">
    <div class="stat-icon amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4M12 16h.01"/></svg></div>
    <div class="stat-body"><div class="num"><?= $awaitingManager ?></div><div class="label">Awaiting Manager</div></div>
  </div>
  <div class="stat-card">
    <div class="stat-icon teal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
    <div class="stat-body"><div class="num"><?= $awaitingHR ?></div><div class="label">Awaiting HR</div></div>
  </div>
  <div class="stat-card">
    <div class="stat-icon indigo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg></div>
    <div class="stat-body"><div class="num"><?= $completed ?></div><div class="label">Completed</div></div>
  </div>
  <div class="stat-card">
    <div class="stat-icon rose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div>
    <div class="stat-body"><div class="num"><?= $expiredLinks ?></div><div class="label">Expired Links</div></div>
  </div>
</div>

<h2>Recent Activity</h2>
<div class="table-wrap">
<table>
  <thead><tr><th>When</th><th>Action</th><th>Employee</th><th>Actor</th></tr></thead>
  <tbody>
  <?php if (!$recent): ?>
    <tr><td colspan="4" class="empty-state">No activity yet.</td></tr>
  <?php endif; ?>
  <?php foreach ($recent as $row): ?>
    <tr>
      <td class="small-muted"><?= e($row['created_at']) ?></td>
      <td><?= e(ucwords(str_replace('_',' ', $row['action']))) ?></td>
      <td><?= $row['es_id'] ? '<a href="' . app_path('/frontend/admin/evaluation_detail.php') . '?id=' . (int)$row['es_id'] . '">' . e($row['emp_name']) . '</a>' : '<span class="small-muted">—</span>' ?></td>
      <td><?= e($row['actor_label'] ?? '—') ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>
<?php require __DIR__ . '/../partials/layout_bottom.php'; ?>
