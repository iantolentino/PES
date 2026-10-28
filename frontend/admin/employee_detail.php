<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

$user = require_login();
$pdo = db();
$id = (int)($_GET['id'] ?? 0);

$scope = scope_employee_query($user);
$stmt = $pdo->prepare(
    "SELECT employees.*, departments.name AS dept_name, managers.name AS manager_name
     FROM employees
     LEFT JOIN departments ON departments.id = employees.department_id
     LEFT JOIN users managers ON managers.id = employees.manager_id
     WHERE employees.id = ? $scope"
);
$stmt->execute([$id]);
$emp = $stmt->fetch();
if (!$emp) {
    http_response_code(404);
    die('Employee not found or you do not have access.');
}

$histStmt = $pdo->prepare(
    "SELECT evaluation_sessions.*, clients.name AS client_name,
        evaluation_results.overall_score, evaluation_results.grade,
        salary_recommendations.client_increase_pct, salary_recommendations.hr_final_pct
     FROM evaluation_sessions
     JOIN clients ON clients.id = evaluation_sessions.client_id
     LEFT JOIN evaluation_results ON evaluation_results.session_id = evaluation_sessions.id
     LEFT JOIN salary_recommendations ON salary_recommendations.session_id = evaluation_sessions.id
     WHERE evaluation_sessions.employee_id = ?
     ORDER BY evaluation_sessions.created_at DESC"
);
$histStmt->execute([$id]);
$history = $histStmt->fetchAll();

$pageTitle = $emp['name'];
$active = 'employees';
require __DIR__ . '/../partials/layout_top.php';
?>
<h1><?= e($emp['name']) ?></h1>
<div class="page-sub"><?= e($emp['position']) ?> &middot; <?= e($emp['dept_name']) ?> &middot; Manager: <?= e($emp['manager_name'] ?: '—') ?></div>

<a class="btn" href="<?= e(app_path('/frontend/admin/evaluation_create.php')) ?>?employee_id=<?= (int)$emp['id'] ?>">Create Evaluation</a>

<h2>Evaluation History</h2>
<div class="table-wrap">
<table>
  <thead><tr><th>Period</th><th>Client</th><th class="num">Score</th><th>Grade</th><th class="num">Client %</th><th class="num">Final %</th><th>Status</th></tr></thead>
  <tbody>
  <?php if (!$history): ?>
    <tr><td colspan="7" class="empty-state">No evaluations yet.</td></tr>
  <?php endif; ?>
  <?php foreach ($history as $h): ?>
    <tr>
      <td><a href="<?= e(app_path('/frontend/admin/evaluation_detail.php')) ?>?id=<?= (int)$h['id'] ?>"><?= e($h['period_label']) ?></a></td>
      <td><?= e($h['client_name']) ?></td>
      <td class="num"><?= $h['overall_score'] !== null ? number_format((float)$h['overall_score'], 1) : '—' ?></td>
      <td><?= e($h['grade'] ?? '—') ?></td>
      <td class="num"><?= $h['client_increase_pct'] !== null ? number_format((float)$h['client_increase_pct'], 2) . '%' : '—' ?></td>
      <td class="num"><?= $h['hr_final_pct'] !== null ? number_format((float)$h['hr_final_pct'], 2) . '%' : '—' ?></td>
      <td><span class="badge <?= status_badge_class($h['status']) ?>"><?= e(status_label($h['status'])) ?></span></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>
<?php require __DIR__ . '/../partials/layout_bottom.php'; ?>
