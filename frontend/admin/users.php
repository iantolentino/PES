<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/bootstrap.php';

$user = require_role(['super_admin']);
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = $_POST['action'] ?? 'create';

    if ($action === 'create') {
        $name = trim($_POST['name']);
        $email = trim($_POST['email']);
        $roleId = (int)$_POST['role_id'];
        $password = (string)$_POST['password'];
        if ($name && $email && $roleId && strlen($password) >= 8) {
            $stmt = $pdo->prepare('INSERT INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)');
            $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $roleId]);
            audit(null, (int)$user['id'], $user['name'], 'user_created', null, $email);
            $_SESSION['flash_success'] = 'User created.';
        } else {
            $_SESSION['flash_error'] = 'All fields required; password must be at least 8 characters.';
        }
    } elseif ($action === 'toggle_active') {
        $targetId = (int)$_POST['user_id'];
        $stmt = $pdo->prepare('UPDATE users SET active = 1 - active WHERE id = ?');
        $stmt->execute([$targetId]);
        audit(null, (int)$user['id'], $user['name'], 'user_active_toggled', null, (string)$targetId);
    }
    header('Location: ' . app_path('/frontend/admin/users.php'));
    exit;
}

$users = $pdo->query('SELECT users.*, roles.name AS role_name FROM users JOIN roles ON roles.id = users.role_id ORDER BY users.name')->fetchAll();
$roles = $pdo->query('SELECT * FROM roles ORDER BY id')->fetchAll();

$pageTitle = 'Users & Roles';
$active = 'users';
require __DIR__ . '/../partials/layout_top.php';
?>
<div class="page-head">
  <div>
    <h1>Users &amp; Roles</h1>
    <div class="page-sub">Manage system accounts and their access levels.</div>
  </div>
</div>

<div class="table-wrap">
<table>
  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th style="width:120px;"></th></tr></thead>
  <tbody>
  <?php foreach ($users as $u): ?>
    <tr>
      <td><strong><?= e($u['name']) ?></strong></td>
      <td><?= e($u['email']) ?></td>
      <td><?= e(role_label($u['role_name'])) ?></td>
      <td><?= $u['active'] ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Disabled</span>' ?></td>
      <td>
        <form method="post" class="inline">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="toggle_active">
          <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
          <button class="btn btn-sm btn-secondary" type="submit"><?= $u['active'] ? 'Disable' : 'Enable' ?></button>
        </form>
      </td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>

<div class="section-head"><h2>Add User</h2></div>
<div class="panel" style="max-width:580px;">
  <form method="post">
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="create">
    <div class="two-col" style="gap:16px;">
      <div class="form-group"><label>Full Name</label><input type="text" name="name" required placeholder="e.g. John Smith"></div>
      <div class="form-group"><label>Email Address</label><input type="email" name="email" required placeholder="john@company.com"></div>
    </div>
    <div class="two-col" style="gap:16px;">
      <div class="form-group"><label>Role</label>
        <select name="role_id" required>
          <?php foreach ($roles as $r): ?><option value="<?= (int)$r['id'] ?>"><?= e(ucwords(str_replace('_',' ',$r['name']))) ?></option><?php endforeach; ?>
        </select>
      </div>
      <div class="form-group"><label>Password (min 8 chars)</label><input type="password" name="password" required minlength="8" placeholder="Create a password"></div>
    </div>
    <button class="btn" type="submit">Add User</button>
  </form>
</div>
<?php require __DIR__ . '/../partials/layout_bottom.php'; ?>
