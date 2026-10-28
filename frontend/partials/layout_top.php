<?php
/** @var array $user */
/** @var string $active */
$active = $active ?? '';
$navItems = [
    'dashboard'   => ['label' => 'Dashboard', 'href' => app_path('/frontend/admin/dashboard.php'), 'roles' => ['super_admin','hr','manager']],
    'employees'   => ['label' => 'Employees', 'href' => app_path('/frontend/admin/employees.php'), 'roles' => ['super_admin','hr','manager']],
    'evaluations' => ['label' => 'Evaluations', 'href' => app_path('/frontend/admin/evaluations.php'), 'roles' => ['super_admin','hr','manager']],
    'clients'     => ['label' => 'Clients', 'href' => app_path('/frontend/admin/clients.php'), 'roles' => ['super_admin']],
    'users'       => ['label' => 'Users & Roles', 'href' => app_path('/frontend/admin/users.php'), 'roles' => ['super_admin']],
    'audit'       => ['label' => 'Audit Logs', 'href' => app_path('/logs/audit.php'), 'roles' => ['super_admin','hr']],
];
$icons = [
    'dashboard'   => '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
    'employees'   => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'evaluations' => '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
    'clients'     => '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01"/>',
    'users'       => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    'audit'       => '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/>',
];
$nameParts = array_values(array_filter(explode(' ', trim($user['name'] ?? ''))));
$userInitials = '';
foreach (array_slice($nameParts, 0, 2) as $p) {
    $userInitials .= mb_substr($p, 0, 1);
}
$userInitials = strtoupper($userInitials ?: '?');
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle ?? 'Performance Evaluation System') ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= e(app_path('/frontend/assets/style.css')) ?>">
</head>
<body>
<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-avatar">PES</div>
      <div class="brand-text">
        <div class="name">Performance Evaluation</div>
        <small><?= e(role_label($user['role_name'] ?? '')) ?> Portal</small>
      </div>
    </div>
    <nav>
      <div class="section-label">Workspace</div>
      <?php foreach ($navItems as $key => $item): ?>
        <?php if (!in_array($user['role_name'], $item['roles'], true)) continue; ?>
        <a href="<?= e($item['href']) ?>" class="<?= $active === $key ? 'active' : '' ?>">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><?= $icons[$key] ?></svg>
          <?= e($item['label']) ?>
        </a>
      <?php endforeach; ?>
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="user-avatar"><?= e($userInitials) ?></div>
        <div class="user-info">
          <div class="name"><?= e($user['name'] ?? '') ?></div>
          <div class="role"><?= e(role_label($user['role_name'] ?? '')) ?></div>
        </div>
      </div>
      <form method="post" action="<?= e(app_path('/authentication/logout.php')) ?>" id="logoutForm">
        <?= csrf_field() ?>
        <button class="logout-btn" type="button" id="logoutTrigger" aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Log out
        </button>
      </form>
    </div>
  </aside>
  <div class="main">
    <div class="topbar">
      <div class="crumb"><b><?= e($pageTitle ?? '') ?></b> &nbsp;/&nbsp; <?= e(role_label($user['role_name'] ?? '')) ?></div>
      <div class="top-actions">
        <span class="small-muted"><?= date('l, M j, Y') ?></span>
      </div>
    </div>
    <div class="content">
    <?php if (!empty($_SESSION['flash_success'])): ?>
      <div class="flash flash-success"><?= e($_SESSION['flash_success']) ?></div>
      <?php unset($_SESSION['flash_success']); ?>
    <?php endif; ?>
    <?php if (!empty($_SESSION['flash_error'])): ?>
      <div class="flash flash-error"><?= e($_SESSION['flash_error']) ?></div>
      <?php unset($_SESSION['flash_error']); ?>
    <?php endif; ?>
