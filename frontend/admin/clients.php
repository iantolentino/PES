<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

$user = require_role(['super_admin']);
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $stmt = $pdo->prepare('INSERT INTO clients (name, contact_email) VALUES (?, ?)');
    $stmt->execute([trim($_POST['name']), trim($_POST['contact_email']) ?: null]);
    audit(null, (int)$user['id'], $user['name'], 'client_created', null, trim($_POST['name']));
    $_SESSION['flash_success'] = 'Client added.';
    header('Location: ' . app_path('/frontend/admin/clients.php'));
    exit;
}

$clients = $pdo->query('SELECT * FROM clients ORDER BY name')->fetchAll();

$pageTitle = 'Clients';
$active = 'clients';
require __DIR__ . '/../partials/layout_top.php';
?>
<div class="page-head">
  <div>
    <h1>Clients</h1>
    <div class="page-sub">Manage client organizations linked to evaluations.</div>
  </div>
</div>

<div class="table-wrap">
<table>
  <thead><tr><th>Name</th><th>Contact Email</th><th>Added</th></tr></thead>
  <tbody>
  <?php if (!$clients): ?>
    <tr><td colspan="3" class="empty-state">No clients yet.</td></tr>
  <?php endif; ?>
  <?php foreach ($clients as $c): ?>
    <tr>
      <td><?= e($c['name']) ?></td>
      <td><?= e($c['contact_email'] ?: '—') ?></td>
      <td class="small-muted"><?= e($c['created_at']) ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>

<div class="section-head"><h2>Add Client</h2></div>
<div class="panel" style="max-width:540px;">
  <form method="post">
    <?= csrf_field() ?>
    <div class="form-group"><label>Client Name</label><input type="text" name="name" required placeholder="e.g. Acme Corp"></div>
    <div class="form-group"><label>Contact Email</label><input type="email" name="contact_email" placeholder="contact@example.com"></div>
    <button class="btn" type="submit">Add Client</button>
  </form>
</div>
<?php require __DIR__ . '/../partials/layout_bottom.php'; ?>
