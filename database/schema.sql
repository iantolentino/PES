-- Performance Evaluation System — SQLite schema
PRAGMA foreign_keys = ON;

CREATE TABLE roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE -- super_admin, hr, manager
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_email TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position TEXT,
    department_id INTEGER REFERENCES departments(id),
    manager_id INTEGER REFERENCES users(id), -- assigned manager (user with role=manager)
    photo_path TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_client_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    project_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evaluation_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evaluation_criteria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES evaluation_templates(id),
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    min_score INTEGER NOT NULL DEFAULT 1,
    max_score INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE grade_bands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,       -- A, B, C, D, F
    min_score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- Central evaluation record
CREATE TABLE evaluation_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    template_id INTEGER NOT NULL REFERENCES evaluation_templates(id),
    project_name TEXT,
    period_label TEXT NOT NULL,       -- e.g. "Q1 2026"
    token_hash TEXT NOT NULL UNIQUE,  -- sha256 of raw token, raw token never stored
    token_expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'link_generated',
        -- link_generated, pending_client, submitted, manager_review, manager_approved,
        -- manager_rejected, hr_review, hr_approved, hr_rejected, finalized, expired, cancelled, revoked
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TEXT,
    manager_reviewed_at TEXT,
    hr_reviewed_at TEXT,
    finalized_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_eval_sessions_employee ON evaluation_sessions(employee_id);
CREATE INDEX idx_eval_sessions_status ON evaluation_sessions(status);
CREATE INDEX idx_eval_sessions_token_hash ON evaluation_sessions(token_hash);

CREATE TABLE evaluation_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES evaluation_sessions(id),
    criterion_id INTEGER NOT NULL REFERENCES evaluation_criteria(id),
    score INTEGER NOT NULL
);

CREATE TABLE evaluation_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL UNIQUE REFERENCES evaluation_sessions(id),
    overall_score REAL NOT NULL,
    grade TEXT NOT NULL,
    client_comments TEXT,
    computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preserves client / manager / HR values separately, never overwritten
CREATE TABLE salary_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL UNIQUE REFERENCES evaluation_sessions(id),
    client_increase_pct REAL NOT NULL,
    manager_increase_pct REAL,
    manager_comment TEXT,
    manager_decided_by INTEGER REFERENCES users(id),
    manager_decided_at TEXT,
    hr_final_pct REAL,
    hr_comment TEXT,
    hr_decided_by INTEGER REFERENCES users(id),
    hr_decided_at TEXT
);

CREATE TABLE approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES evaluation_sessions(id),
    stage TEXT NOT NULL,       -- manager, hr
    decision TEXT NOT NULL,    -- approved, rejected
    decided_by INTEGER NOT NULL REFERENCES users(id),
    comment TEXT,
    decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES evaluation_sessions(id),
    actor_user_id INTEGER REFERENCES users(id),
    actor_label TEXT,          -- e.g. "Client (token)" when no user account
    action TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_session ON audit_logs(session_id);

-- Seed data -----------------------------------------------------------

INSERT INTO roles (name) VALUES ('super_admin'), ('hr'), ('manager');

INSERT INTO grade_bands (grade, min_score, max_score, sort_order) VALUES
    ('A', 90, 100, 1),
    ('B', 80, 89, 2),
    ('C', 70, 79, 3),
    ('D', 60, 69, 4),
    ('F', 0, 59, 5);

INSERT INTO evaluation_templates (name) VALUES ('Standard Client Evaluation');

INSERT INTO evaluation_criteria (template_id, label, sort_order) VALUES
    (1, 'Quality of Work', 1),
    (1, 'Communication', 2),
    (1, 'Responsiveness', 3),
    (1, 'Professionalism', 4),
    (1, 'Reliability', 5),
    (1, 'Productivity', 6),
    (1, 'Overall Performance', 7);

INSERT INTO departments (name) VALUES ('IT'), ('Customer Experience'), ('Operations');
