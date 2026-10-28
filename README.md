# Performance Evaluation System

Vanilla PHP 8 + SQLite (PDO), no Composer, no external dependencies. Matches
your usual stack for internal tools.

## What's implemented (Phases 1–4 of the plan)

- **Auth + RBAC**: Super Admin, HR/Department Head, Manager. Session-based,
  server-side role checks on every protected page/action — nothing trusts
  the frontend.
- **Employees**: list, add, per-employee detail with full evaluation history.
- **Evaluation sessions**: create → generates a cryptographically secure
  64-char token (`random_bytes(32)`, hex). Only the **SHA-256 hash** of the
  token is stored — the raw token is shown once at creation time and never
  persisted.
- **Public client page** at `/evaluation/{token}` — no login, no nav, no
  exposed internal IDs. Handles: invalid token, expired, revoked, and
  already-submitted states, each with its own friendly screen.
- **Client flow**: score criteria (1–100 sliders) → free-text salary
  increase % → review/confirm screen → locked submission. Locking is
  enforced **server-side** (status re-checked inside the DB transaction at
  submit time, not just hidden in the UI).
- **Grade calculation**: automatic from configurable grade bands, purely
  informational — never caps or overrides the client's entered %.
- **Approval workflow**: Manager review (approve/reject/adjust, comment
  required on reject or adjustment) → HR review (approve + set final %, or
  reject) → Finalized. Client/Manager/HR percentages are stored in three
  separate columns and never overwritten.
- **Link management**: extend expiration, revoke, regenerate — all
  preserve the underlying evaluation record per the spec.
- **Dashboard**: actionable counts (pending client, awaiting manager,
  awaiting HR, completed, expired) + recent activity feed.
- **Audit log**: append-only `audit_logs` table, viewable by Super
  Admin/HR; no UI path to edit or delete entries.
- **Manager scoping**: managers only ever see employees/evaluations where
  `employees.manager_id` is their own user ID — enforced in the SQL, not
  just hidden in the UI.

## Not yet built (flagged, not silently assumed)

Per your spec's "open business questions," these are left as TODOs rather
than guessed at:

- Super-Admin-configurable evaluation criteria / grade bands (schema
  supports it — `evaluation_criteria` and `grade_bands` are already
  relational tables — but there's no admin UI to edit them yet).
- Email notifications (Manager/HR "notified" currently means: it appears
  in their dashboard queue, not an actual email send).
- Multiple client representatives per employee, multiple evaluations per
  period, min/max increase bounds, rejected-evaluation resubmission path,
  employee-facing portal.

## Setup

1. Point your web server's document root at this folder (`pes/`).
2. Ensure `database/` is writable by the web server user — the SQLite file
   and schema are created automatically on first request.
3. Seed the first accounts:
   ```bash
   php database/seed.php
   ```
   This creates a Super Admin, an HR reviewer, a sample Manager, one
   client, and one employee. **Change these passwords immediately.**
4. For Apache, the included `.htaccess` rewrites
   `/evaluation/{64-char-hex-token}` to `frontend/public/evaluation.php`. If you're
   on Nginx instead, let me know and I'll write the equivalent server block.
5. Log in at `/authentication/login.php`.

## Security notes worth knowing

- Session cookies are `HttpOnly` + `SameSite=Lax`. Uncomment the `secure`
  flag in `authentication/auth.php` once you're serving over HTTPS (you should
  be, given this handles compensation data).
- CSRF tokens are required on every POST, admin and public alike.
- `database/.htaccess` blocks direct web access to the SQLite file as a second
  layer of defense (on top of it not being in the public folder tree).
- The public evaluation page has a basic per-session rate limiter (40
  requests/minute) to blunt token brute-forcing — token space is 2^256, so
  brute force isn't realistic, but the limiter is cheap insurance.

## Structure

```
pes/
├── frontend/        UI layer
│   ├── admin/       internal portal pages (auth required)
│   ├── public/      no-login client evaluation pages + status screens
│   ├── partials/    shared layout header/footer
│   └── assets/      style.css
├── backend/         shared logic + deployment adapter
│   ├── helpers.php  tokens, grades, status labels, URL helpers
│   ├── bootstrap.php single include for all server layers
│   └── api/         Vercel front controller (serverless routing)
├── authentication/  auth.php (session/CSRF/RBAC), login.php, logout.php
├── database/        db.php (PDO), schema.sql, seed.php, pes.sqlite
├── logs/            audit.php (viewer) + logger.php (audit writer)
├── index.php        entry point (redirects to login/dashboard)
└── .htaccess        /evaluation/{token} rewrite + DB protection
```

Each page only needs one include:

```php
require_once __DIR__ . '/../../backend/bootstrap.php';
```
