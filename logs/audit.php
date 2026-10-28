<?php
declare(strict_types=1);
require_once __DIR__ . '/../backend/bootstrap.php';

$user = require_role(['super_admin', 'hr']);
$pdo = db();

$stmt = $pdo->query(
    "SELECT audit_logs.*, employees.name AS emp_name
     FROM audit_logs
     LEFT JOIN evaluation_sessions ON evaluation_sessions.id = audit_logs.session_id
     LEFT JOIN employees ON employees.id = evaluation_sessions.employee_id
     ORDER BY audit_logs.created_at DESC LIMIT 300"
);
$rows = $stmt->fetchAll();

$pageTitle = 'Audit Logs';
$active = 'audit';
require __DIR__ . '/../frontend/partials/layout_top.php';
?>
<div class="page-head">
  <div>
    <h1>Audit Logs</h1>
    <div class="page-sub">Immutable workflow history — read only.</div>
  </div>
</div>

<div class="table-wrap">
<table>
  <thead><tr><th>When</th><th>Action</th><th>Employee</th><th>Actor</th><th>Previous</th><th>New</th></tr></thead>
  <tbody>
  <?php if (!$rows): ?>
    <tr><td colspan="6" class="empty-state">No audit entries yet.</td></tr>
  <?php endif; ?>
  <?php foreach ($rows as $r): ?>
    <tr>
      <td class="small-muted"><?= e($r['created_at']) ?></td>
      <td><?= e(ucwords(str_replace('_',' ',$r['action']))) ?></td>
      <td><?= e($r['emp_name'] ?? '—') ?></td>
      <td><?= e($r['actor_label'] ?? '—') ?></td>
      <td class="small-muted"><?= e($r['previous_value'] ?? '') ?: '—' ?></td>
      <td class="small-muted"><?= e($r['new_value'] ?? '') ?: '—' ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>
<?php require __DIR__ . '/../frontend/partials/layout_bottom.php'; ?>
