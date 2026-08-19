# Performance Evaluation System — Design & Architecture

Version 1.0 · Prepared before implementation, per project specification §25.

---

## 1. System Architecture

**Stack**: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui (frontend) · Hono + tRPC 11 + Drizzle ORM + MySQL (backend) · Vitest (tests).

```
┌────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│  ┌──────────────────────┐      ┌─────────────────────────────┐ │
│  │ Internal Portal       │      │ Public Client Page          │ │
│  │ (session cookie auth) │      │ /evaluation/{token}         │ │
│  │ React SPA             │      │ (no login, no navigation)   │ │
│  └──────────┬───────────┘      └──────────────┬──────────────┘ │
└─────────────┼──────────────────────────────────┼───────────────┘
              │ tRPC over HTTP (superjson)       │ tRPC public procedures
┌─────────────▼──────────────────────────────────▼───────────────┐
│  Hono server (port 3000)                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ tRPC routers                                              │  │
│  │  auth · dashboard · employees · clients · departments     │  │
│  │  evaluations · approvals · admin · audit · publicEval     │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Middleware chain                                          │  │
│  │  sessionResolver → roleGuard → scopeGuard (manager)       │  │
│  │  rateLimiter (public evaluation endpoints only)           │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Services (pure, unit-tested business logic)               │  │
│  │  grading · tokens · stateMachine · audit                  │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Drizzle ORM queries (parameterized, no raw SQL)           │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
                        MySQL database
```

Two audiences, one server:

- **Internal portal** — every route requires a valid session; every procedure re-checks role and (for managers) team scope server-side.
- **Public client page** — a small set of public procedures that accept only an opaque token, rate-limited per IP, returning only the fields a client needs.

---

## 2. User / Role Permission Matrix

| Capability | Client (no account) | Manager | HR / Dept Head | Super Admin |
|---|---|---|---|---|
| Access own tokenized evaluation link | ✅ | — | — | — |
| Complete / review / submit evaluation (once) | ✅ | — | — | — |
| View employees | — | own team only | all | all |
| Create / edit employees, clients, departments | — | — | ✅ | ✅ |
| Create evaluation session + generate link | — | ✅ (own team) | ✅ | ✅ |
| Extend expiration / revoke / regenerate link | — | ✅ (own team) | ✅ | ✅ |
| View evaluations | — | own team only | all | all |
| Manager approve / reject / adjust % (with mandatory explanation) | — | ✅ (own team) | — | ✅ |
| HR approve / reject (no percentage change) | — | — | ✅ | ✅ |
| View audit logs | — | — | ✅ | ✅ |
| Manage users & roles | — | — | — | ✅ |
| Manage templates, criteria, grade bands | — | — | — | ✅ |
| Cancel evaluation sessions | — | — | ✅ | ✅ |

All checks are enforced in server middleware/services — never trusted from the frontend.

---

## 3. Database Schema

MySQL via Drizzle ORM. All PKs `bigint unsigned auto_increment`; FKs type-matched. Indexes on all FK and lookup columns.

| Table | Key columns | Notes |
|---|---|---|
| `users` | username (unique), passwordHash, name, email, role `super_admin\|hr\|manager`, isActive | Internal accounts only |
| `auth_sessions` | token (unique, indexed), userId FK, expiresAt, ip, userAgent | Opaque cookie sessions, 7-day expiry |
| `departments` | name (unique) | |
| `employees` | name, position, departmentId FK, managerId FK→users, email, photoUrl, isActive | |
| `clients` | name, contactName, contactEmail | Client organizations/contacts |
| `employee_client_assignments` | employeeId FK, clientId FK, project | Drives Create-Evaluation dropdowns |
| `evaluation_templates` | name, description, isActive | |
| `evaluation_criteria` | templateId FK, name, description, weight (default 1.0), scaleMin (1), scaleMax (100), sortOrder | Configurable by Super Admin |
| `grade_bands` | grade, minScore, maxScore, sortOrder | Configurable; seeded A/90+, B/80–89, C/70–79, D/60–69, F/<60 |
| `evaluation_sessions` | employeeId, clientId, templateId FKs, period, project?, status enum (13 states), createdBy FK, createdAt, submittedAt, clientFirstAccessedAt, managerReviewedAt, hrReviewedAt, finalizedAt, cancelledAt | Central record. One active session per employee+client+period (app-enforced, transaction-checked) |
| `evaluation_tokens` | sessionId FK, tokenHash (SHA-256, unique), expiresAt, createdBy, createdAt, revokedAt, revokedBy | Raw token never stored; full issuance/revocation history |
| `evaluation_responses` | sessionId FK, criteriaId FK, score int; unique(sessionId, criteriaId) | Written once, at submission |
| `evaluation_results` | sessionId FK (unique), overallScore decimal(5,2), grade, clientComments, submittedAt | |
| `salary_recommendations` | sessionId FK (unique), clientPct, managerPct?, finalPct? | Three values stored separately — originals never overwritten |
| `approvals` | sessionId FK, actorId FK, actorRole `manager\|hr`, decision `approved\|rejected`, comments, clientPctSnapshot, managerPctSnapshot, createdAt | |
| `audit_logs` | actorType `user\|client\|system`, actorId?, actorLabel, sessionId?, action, details JSON, previousValue, newValue, ip, createdAt | Append-only; no update/delete path exists |

---

## 4. Evaluation State Machine

```
                 create + generate link
 draft ────────────────────────────────▶ link_generated
                                              │ client opens link (first access)
                                              ▼
                                        pending_client
                                              │ client confirms submission (locks)
                                              ▼
                                          submitted ──(auto)──▶ manager_review
                                                                   │     │
                                          manager approves ◀───────┘     └──────▶ manager_rejected (terminal)
                                              │ (may adjust %, explanation required)
                                              ▼ (auto)
                                          hr_review
                                              │     │
                            hr approves ◀─────┘     └──────▶ hr_rejected (terminal)
                              │ (final % = manager % if set, else client %)
                              ▼ (auto)
                          finalized (terminal)

 link_generated / pending_client with expiresAt < now  ──▶ expired (recoverable:
        extend expiration, or revoke + regenerate link → back to link_generated)
 any non-terminal state ──▶ cancelled (HR / Super Admin; record preserved)
```

Rules:
- `submitted → manager_review` and `manager_approved → hr_review` and `hr_approved → finalized` are immediate paired transitions; the intermediate status is still written so every spec-listed state and timestamp exists.
- Submission is one-way: the `submitted` transition writes responses + result + recommendation in one transaction and flips the lock server-side.
- `expired` never deletes anything; it blocks client access until extended or re-linked.
- Terminal states: `manager_rejected`, `hr_rejected`, `finalized`, `cancelled`. Rejected sessions keep full data for audit/history.

---

## 5. Token / Link Lifecycle

1. **Generate** — `crypto.randomBytes(32)` → base64url token (256 bits, unpredictable). Only `SHA-256(token)` is stored in `evaluation_tokens`; raw token exists only in the copied URL.
2. **Distribute** — admin copies `/evaluation/{token}` manually. URL contains no IDs.
3. **Validate (every access)** — hash presented token → look up → checks, in order: token exists → not revoked → session not cancelled → not expired → not already submitted. Each failure yields a specific, safe message (invalid / expired / already submitted).
4. **First access** — sets `clientFirstAccessedAt`, status → `pending_client`.
5. **Submit** — session locks; token remains valid only to show the "already submitted" page.
6. **Expire** — past `expiresAt`, client sees the expired message. Internal user may **extend** (new `expiresAt` on same token) or **regenerate** (old token `revokedAt` set, brand-new token issued, status returns to `link_generated`).
7. **Revoke** — sets `revokedAt`; link immediately dead, session data intact.

Every step writes an `audit_logs` row (token generated / revoked / regenerated / extended).

---

## 6. Project Structure

```
/mnt/agents/output/app/
├── src/                          # Frontend
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Employees.tsx  EmployeeDetail.tsx
│   │   ├── Evaluations.tsx  EvaluationDetail.tsx  CreateEvaluation.tsx
│   │   ├── Clients.tsx  Departments.tsx  AuditLogs.tsx
│   │   ├── admin/Users.tsx  admin/Templates.tsx  admin/GradeBands.tsx
│   │   └── PublicEvaluation.tsx        # /evaluation/:token — no chrome
│   ├── components/ (ui/ shadcn + AppLayout, StatusBadge, ScoreInput…)
│   ├── hooks/useAuth.ts  providers/trpc.tsx
├── api/
│   ├── routers/ auth · dashboard · employees · clients · departments
│   │            evaluations · approvals · admin · audit · publicEval
│   ├── services/ grading.ts · tokens.ts · stateMachine.ts · audit.ts
│   │             · auth.ts (scrypt hashing, session issue/verify)
│   ├── guards.ts   (sessionResolver, requireRole, managerScope)
│   ├── queries/ (Drizzle query functions per aggregate)
│   └── router.ts
├── contracts/ (shared enums: statuses, roles, actions)
├── db/ schema.ts · relations.ts · seed.ts
└── tests/ grading · tokens · stateMachine · auth (Vitest)
```

---

## 7. API / Route Structure

**tRPC procedures** (all mutations Zod-validated; `🔒` = session required; role in brackets):

- `auth.login / logout / me`
- `dashboard.stats / recentActivity` 🔒
- `employees.list / get / create / update` 🔒 [manager sees own team]
- `employees.evaluationHistory` 🔒
- `clients.list / create / update`, `departments.list / create` 🔒 [hr, super_admin]
- `evaluations.list` (filters: employee, client, manager, department, period, status, date) 🔒
- `evaluations.get` — full record: client eval, manager decision, HR decision, audit trail 🔒
- `evaluations.create` — session + first token + link 🔒 [manager own team / hr / super_admin]
- `evaluations.extendExpiration / regenerateLink / revokeLink / cancel` 🔒
- `approvals.managerDecide` (approve | reject | adjust %, explanation mandatory) 🔒 [manager own team]
- `approvals.hrDecide` (approve | reject; no % change) 🔒 [hr, super_admin]
- `admin.users.* / templates.* / criteria.* / gradeBands.*` 🔒 [super_admin]
- `audit.list` 🔒 [hr, super_admin]
- `publicEval.getByToken` — rate-limited; returns employee display info, criteria, period, expiry, and state (open / submitted / expired / invalid)
- `publicEval.submit` — rate-limited; scores + client increase % + comments; transactional lock

**Frontend routes**: `/login` · `/` dashboard · `/employees` `/employees/:id` · `/evaluations` `/evaluations/new` `/evaluations/:id` · `/clients` `/departments` · `/audit` · `/admin/users` `/admin/templates` `/admin/grades` · public `/evaluation/:token`.

---

## 8. Security Design

- **Auth**: username + password; passwords hashed with **scrypt** (node:crypto, per-user salt). Sessions are opaque 256-bit tokens in an `httpOnly; SameSite=Lax; Secure` cookie, 7-day expiry, stored server-side (revocable).
- **CSRF**: SameSite=Lax cookie + JSON-only tRPC mutations (cross-site forms can't set `Content-Type: application/json` without preflight).
- **Authorization**: server-side middleware on every protected procedure — role check + manager team scoping (`employees.managerId = current user`) at the query layer, defeating IDOR.
- **Tokens**: 256-bit random, SHA-256 hash at rest, single-use-lock, expiry, revocation — per §5.
- **Rate limiting**: in-memory per-IP limiter on `publicEval.*` (e.g. 30 req/min), slowing token-guessing and brute force.
- **Injection/XSS**: Drizzle parameterized queries only (no raw SQL); React escapes all rendered output; client comments rendered as text.
- **Audit**: append-only `audit_logs` written inside the same transaction as the action; actor, timestamps, previous/new values.
- **Secrets**: DB credentials and session secret from environment only.
- **Locking**: submission lock enforced in the `submit` transaction (`status` precondition), not by hiding UI buttons.

---

## 9. Implementation Phases

1. **Foundation** — schema, db push, credential auth + sessions, RBAC middleware, users/employees/clients/departments routers + pages.
2. **Evaluation engine** — templates/criteria, sessions, token service, public evaluation page (form → review → confirm → lock), expiration states.
3. **Approval workflow** — manager approve/reject/adjust (explanation required), HR approve/reject, salary recommendation history, transitions + timestamps.
4. **Administration** — dashboard cards + activity feed, evaluation filters/history, audit log viewer, template & grade-band config, user management.
5. **Production readiness** — seed data, Vitest suite (grading, tokens, state machine, auth), validation pass, build, version save.

---

## 10. Testing Strategy

Vitest unit tests over pure services (no DB needed):

- **Grading**: weighted average, boundary scores (90→A, 89→B…), band lookup.
- **Tokens**: 256-bit uniqueness, base64url charset, hash-only storage, tamper mismatch.
- **State machine**: every legal transition accepted; illegal ones rejected (submit twice, review before submission, decide after terminal state, etc.).
- **Auth service**: scrypt hash/verify round-trip, wrong-password rejection, session expiry check.
- **Validation**: Zod schemas for score ranges, percentage numerics, required explanations.

Plus a scripted end-to-end smoke pass against the running server: login → create employee → create evaluation → open link → submit → manager approve → HR approve → finalized, verifying each status and the audit trail.

---

## 11. Business Decisions — Confirmed vs. Open

**Confirmed with stakeholder (this session):**

| # | Question | Decision |
|---|---|---|
| 7 | Manager adjust client %? | **Yes** — explanation mandatory, client value preserved |
| 8 | HR adjust manager %? | **No** — HR approves/rejects only; final % = manager's (or client's if manager didn't adjust) |
| 6 | Min/max increase limits? | **None** — any numeric % accepted (validation hooks kept configurable) |
| 1/4 | Multiple sessions, same employee/client/period? | **No** — one active session per employee+client+period |

**Marked configurable / TODO (not silently invented):**

| # | Question | Current handling |
|---|---|---|
| 2 | Cadence (quarterly/annual/project) | Free-text `period` label; scheduling can be added |
| 3 | Multiple client reps per employee | One link = one respondent; parallel sessions possible via separate sessions if ever allowed |
| 5 | Low grade auto-flags HR? | Not implemented; add via audit/notification hook |
| 9 | Rejected → reconsideration? | Rejection is terminal; create a new session instead |
| 10 | Notifications | In-app activity feed + dashboard queues; email TODO |
| 11/12 | Employee portal / visibility | Out of scope; schema keeps data needed to add it |
| 13 | Client Health Tracker integration | Out of scope; `clients` table is integration-ready |
