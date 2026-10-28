<?php
declare(strict_types=1);

/**
 * Run once from the command line (or browser, then delete) to bootstrap
 * the first Super Admin account and some demo data:
 *   php seed.php
 */
require_once __DIR__ . '/db.php';

$pdo = db();

$existing = $pdo->query('SELECT COUNT(*) c FROM users')->fetch()['c'];
if ($existing > 0) {
    echo "Users already exist — seed skipped. Delete database/pes.sqlite to reseed.\n";
    exit;
}

$roleId = fn(string $name) => (int)$pdo->query("SELECT id FROM roles WHERE name = '$name'")->fetch()['id'];

$pdo->prepare('INSERT INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)')
    ->execute(['Super Admin', 'admin@example.com', password_hash('ChangeMe123!', PASSWORD_DEFAULT), $roleId('super_admin')]);

$pdo->prepare('INSERT INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)')
    ->execute(['HR Reviewer', 'hr@example.com', password_hash('ChangeMe123!', PASSWORD_DEFAULT), $roleId('hr')]);

$pdo->prepare('INSERT INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)')
    ->execute(['Sample Manager', 'manager@example.com', password_hash('ChangeMe123!', PASSWORD_DEFAULT), $roleId('manager')]);

$managerId = (int)$pdo->lastInsertId();

$pdo->prepare('INSERT INTO clients (name, contact_email) VALUES (?, ?)')
    ->execute(['Acme Corp', 'contact@acme.example']);
$clientId = (int)$pdo->lastInsertId();

$deptId = (int)$pdo->query("SELECT id FROM departments WHERE name = 'IT'")->fetch()['id'];

$pdo->prepare('INSERT INTO employees (name, position, department_id, manager_id) VALUES (?, ?, ?, ?)')
    ->execute(['Jane Dela Cruz', 'Web Developer', $deptId, $managerId]);

echo "Seed complete.\n";
echo "Super Admin: admin@example.com / ChangeMe123!\n";
echo "HR:          hr@example.com / ChangeMe123!\n";
echo "Manager:     manager@example.com / ChangeMe123!\n";
echo "IMPORTANT: change these passwords immediately after first login.\n";
