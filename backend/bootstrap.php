<?php
declare(strict_types=1);

/**
 * Single entry point for the server-side layers.
 * Require this from any page instead of individual files.
 *
 *   database  -> PDO connection + schema bootstrap
 *   logs      -> audit() writer
 *   backend   -> shared helpers (tokens, grades, status, URL helpers)
 *   authentication -> sessions, login, CSRF, RBAC
 */
require_once __DIR__ . '/../database/db.php';
require_once __DIR__ . '/../logs/logger.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../authentication/auth.php';
