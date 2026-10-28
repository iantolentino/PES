<?php

declare(strict_types=1);

/**
 * Front controller used by Vercel (serverless). Locally Apache serves the
 * real files directly; this router mirrors those URLs for the deployed host.
 */
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$requestPath = '/' . trim($requestPath, '/');

// The function itself lives at /backend/api/index.php on Vercel.
if (in_array($requestPath, ['/backend/api/index.php', '/api/index.php'], true)) {
    $requestPath = '/';
}

$routes = [
    '/'                            => __DIR__ . '/../../authentication/login.php',
    '/login'                       => __DIR__ . '/../../authentication/login.php',
    '/authentication/login.php'    => __DIR__ . '/../../authentication/login.php',
    '/authentication/logout.php'   => __DIR__ . '/../../authentication/logout.php',
    '/frontend/admin/dashboard.php'        => __DIR__ . '/../../frontend/admin/dashboard.php',
    '/frontend/admin/users.php'            => __DIR__ . '/../../frontend/admin/users.php',
    '/frontend/admin/clients.php'          => __DIR__ . '/../../frontend/admin/clients.php',
    '/frontend/admin/employees.php'        => __DIR__ . '/../../frontend/admin/employees.php',
    '/frontend/admin/employee_detail.php'  => __DIR__ . '/../../frontend/admin/employee_detail.php',
    '/frontend/admin/evaluations.php'      => __DIR__ . '/../../frontend/admin/evaluations.php',
    '/frontend/admin/evaluation_create.php' => __DIR__ . '/../../frontend/admin/evaluation_create.php',
    '/frontend/admin/evaluation_detail.php' => __DIR__ . '/../../frontend/admin/evaluation_detail.php',
    '/logs/audit.php'              => __DIR__ . '/../../logs/audit.php',
];

if (preg_match('#^/evaluation/([a-f0-9]{64})$#', $requestPath, $matches)) {
    $_GET['token'] = $matches[1];
    require __DIR__ . '/../../frontend/public/evaluation.php';
    exit;
}

if (isset($routes[$requestPath])) {
    require $routes[$requestPath];
    exit;
}

http_response_code(404);
echo 'Not found';
