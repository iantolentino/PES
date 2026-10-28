<?php
declare(strict_types=1);

require_once __DIR__ . '/../database/db.php';

function e(?string $s): string
{
    return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8');
}

/** Human-readable role label. */
function role_label(?string $role): string
{
    $map = [
        'super_admin' => 'Super Admin',
        'hr'          => 'HR',
        'manager'     => 'Manager',
    ];
    return $map[$role ?? ''] ?? ucwords(str_replace('_', ' ', (string)$role));
}

/** Generate a cryptographically secure token; only its SHA-256 hash is stored. */
function generate_token(): array
{
    $raw = bin2hex(random_bytes(32)); // 64 hex chars
    $hash = hash('sha256', $raw);
    return [$raw, $hash];
}

function hash_token(string $raw): string
{
    return hash('sha256', $raw);
}

function grade_for_score(float $score): string
{
    $stmt = db()->query('SELECT grade, min_score, max_score FROM grade_bands ORDER BY sort_order');
    foreach ($stmt->fetchAll() as $band) {
        if ($score >= $band['min_score'] && $score <= $band['max_score']) {
            return $band['grade'];
        }
    }
    return 'N/A';
}

function status_label(string $status): string
{
    $map = [
        'link_generated'   => 'Link Generated',
        'pending_client'   => 'Pending Client',
        'submitted'        => 'Submitted',
        'manager_review'   => 'Manager Review',
        'manager_approved' => 'Manager Approved',
        'manager_rejected' => 'Manager Rejected',
        'hr_review'        => 'HR Review',
        'hr_approved'      => 'HR Approved',
        'hr_rejected'      => 'HR Rejected',
        'finalized'        => 'Finalized',
        'expired'          => 'Expired',
        'cancelled'        => 'Cancelled',
        'revoked'          => 'Revoked',
    ];
    return $map[$status] ?? ucfirst($status);
}

function status_badge_class(string $status): string
{
    $map = [
        'link_generated'   => 'badge-neutral',
        'pending_client'   => 'badge-neutral',
        'submitted'        => 'badge-info',
        'manager_review'   => 'badge-info',
        'manager_approved' => 'badge-info',
        'manager_rejected' => 'badge-danger',
        'hr_review'        => 'badge-info',
        'hr_approved'      => 'badge-success',
        'hr_rejected'      => 'badge-danger',
        'finalized'        => 'badge-success',
        'expired'          => 'badge-warning',
        'cancelled'        => 'badge-warning',
        'revoked'          => 'badge-warning',
    ];
    return $map[$status] ?? 'badge-neutral';
}

/** Mark expired-but-not-yet-flagged sessions. Cheap enough to run per admin page load. */
function sweep_expired_sessions(): void
{
    db()->exec(
        "UPDATE evaluation_sessions
         SET status = 'expired'
         WHERE status IN ('link_generated','pending_client')
           AND revoked = 0
           AND token_expires_at < datetime('now')"
    );
}

function base_url(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . app_base_path();
}

/** URL path for this app, whether served from the domain root or /pes. */
function app_base_path(): string
{
    static $base = null;
    if ($base !== null) {
        return $base;
    }
    $docRoot = str_replace('\\', '/', rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/'));
    $projectRoot = str_replace('\\', '/', dirname(__DIR__));
    if ($docRoot !== '' && strpos($projectRoot, $docRoot) === 0) {
        $base = rtrim(substr($projectRoot, strlen($docRoot)), '/');
    } else {
        $base = '';
    }
    return $base;
}

function app_path(string $path): string
{
    return app_base_path() . '/' . ltrim($path, '/');
}
