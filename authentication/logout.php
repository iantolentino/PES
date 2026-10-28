<?php
declare(strict_types=1);
require_once __DIR__ . '/../backend/bootstrap.php';

start_session_safe();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    logout();
}
header('Location: ' . app_path('/authentication/login.php'));
exit;
