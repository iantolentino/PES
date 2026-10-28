<?php
declare(strict_types=1);

/**
 * App entry point. Redirects to the dashboard when signed in,
 * otherwise to the login page.
 */
require_once __DIR__ . '/backend/bootstrap.php';

if (current_user()) {
    header('Location: ' . app_path('/frontend/admin/dashboard.php'));
} else {
    header('Location: ' . app_path('/authentication/login.php'));
}
exit;
