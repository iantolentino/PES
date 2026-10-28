<?php
declare(strict_types=1);

require_once __DIR__ . '/../database/db.php';
require_once __DIR__ . '/../backend/helpers.php';

/**
 * Session-based auth + RBAC. Every protected action re-checks the role
 * against the DB record — never trusts anything from the client/frontend.
 */

function start_session_safe(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
            // 'secure' => true, // enable when served over HTTPS
        ]);
        session_start();
    }
}

function current_user(): ?array
{
    start_session_safe();
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $stmt = db()->prepare(
        'SELECT users.*, roles.name AS role_name
         FROM users JOIN roles ON roles.id = users.role_id
         WHERE users.id = ? AND users.active = 1'
    );
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function require_login(): array
{
    $user = current_user();
    if (!$user) {
        header('Location: ' . app_path('/authentication/login.php'));
        exit;
    }
    return $user;
}

/** @param string[] $roles */
function require_role(array $roles): array
{
    $user = require_login();
    if (!in_array($user['role_name'], $roles, true)) {
        http_response_code(403);
        echo '403 — You do not have permission to view this page.';
        exit;
    }
    return $user;
}

function attempt_login(string $email, string $password): ?array
{
    $stmt = db()->prepare(
        'SELECT users.*, roles.name AS role_name
         FROM users JOIN roles ON roles.id = users.role_id
         WHERE users.email = ? AND users.active = 1'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        return null;
    }

    start_session_safe();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    return $user;
}

function logout(): void
{
    start_session_safe();
    $_SESSION = [];
    session_destroy();
}

function csrf_token(): string
{
    start_session_safe();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . htmlspecialchars(csrf_token()) . '">';
}

function require_csrf(): void
{
    start_session_safe();
    $sent = $_POST['csrf'] ?? '';
    if (!is_string($sent) || $sent === '' || !hash_equals($_SESSION['csrf'] ?? '', $sent)) {
        http_response_code(403);
        echo 'Invalid CSRF token.';
        exit;
    }
}

/**
 * Managers can only see employees assigned to them.
 * HR / Super Admin see everything.
 */
function scope_employee_query(array $user): string
{
    if ($user['role_name'] === 'manager') {
        return ' AND employees.manager_id = ' . (int)$user['id'] . ' ';
    }
    return ' ';
}
