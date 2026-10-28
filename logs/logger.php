<?php
declare(strict_types=1);

/**
 * Audit logging — append-only history writer.
 * The audit_logs table has no UI path to edit or delete rows.
 */
require_once __DIR__ . '/../database/db.php';

function audit(?int $sessionId, ?int $actorUserId, string $actorLabel, string $action, ?string $previous = null, ?string $new = null): void
{
    $stmt = db()->prepare(
        'INSERT INTO audit_logs (session_id, actor_user_id, actor_label, action, previous_value, new_value)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$sessionId, $actorUserId, $actorLabel, $action, $previous, $new]);
}
