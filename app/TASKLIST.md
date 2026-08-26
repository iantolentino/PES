# Performance Evaluation System — Finalized MVP Task List

Source: finalized decisions supplied on 2026-08-26.
Implementation pass: 2026-08-26.

## Architecture decision

- [ ] Confirm deployment target.
  - Current application: React + Vercel + Supabase.
  - Finalized note: PHP 8 + MySQL/MariaDB + cPanel + Apache.
  - These are different architectures; the cPanel migration remains a separate track.

## Implemented in this pass

- [x] Client review/confirmation step; no database write before Confirm & submit.
- [x] Client copy and print/save-PDF option before submission.
- [x] Temporary link history with status, expiration, and creator fields.
- [x] Expired-link regeneration while preserving old link records.
- [x] Staff + form + period duplicate-cycle guard.
- [x] Soft archive columns for staff, forms, evaluations, and links.
- [x] Staff add, edit, archive, and restore controls.
- [x] Data-driven form fields: rating, text, textarea, select, required/optional, and ordering.
- [x] Submission limit field with default 1 on link records.
- [x] Employee position on the client form.
- [x] Read-only completed responses with original response JSON.

## Remaining application work

- [ ] Apply `supabase/migrations/20260826000000_finalized_mvp_rules.sql` to the hosted database.
- [ ] Add archive filtering and restore controls to HR evaluation/form lists.
- [ ] Add actual automatic HR email notifications.
  - Submission must remain successful if email fails.
  - Requires a sender/SMTP provider and recipient configuration.
- [ ] Add HR CSV/PDF export for completed evaluations.
- [ ] Add HR notification-recipient configuration.
- [ ] Add server-side role enforcement for manager versus HR approval actions.

## cPanel migration, only after architecture confirmation

- [ ] Create PHP 8 / MySQL schema and migrations.
- [ ] Port authenticated HR portal to PHP sessions.
- [ ] Port tokenized public evaluation flow to Apache/PHP routes.
- [ ] Configure `.htaccess`, environment configuration, error handling, and backups.
- [ ] Deploy to `staff-evaluation.stratastaff.com` and run end-to-end acceptance tests.

## Acceptance checklist

- [x] A client cannot save a draft to the database.
- [x] A client cannot submit until reviewing the summary and confirming.
- [x] A submitted evaluation cannot be changed, regenerated, or resubmitted.
- [x] An expired unsubmitted link can be regenerated and its old link remains auditable.
- [x] HR can see permanent evaluation data after link expiry.
- [x] No HR records are hard-deleted from the UI.

## Current implementation notes

- The new migration has not been applied to the hosted database in this session because the Supabase CLI/MCP connection is unavailable. Apply it before deploying these API changes.
- Automatic email is intentionally not enabled until a sender/SMTP provider and recipient are supplied. The existing mailto link remains free and non-blocking.
