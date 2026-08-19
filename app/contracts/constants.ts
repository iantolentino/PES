/**
 * Shared constants between frontend and backend.
 * Keep in sync with the enums in db/schema.ts.
 */

export const SESSION_STATUSES = [
  "draft",
  "link_generated",
  "pending_client",
  "submitted",
  "manager_review",
  "manager_approved",
  "manager_rejected",
  "hr_review",
  "hr_approved",
  "hr_rejected",
  "finalized",
  "expired",
  "cancelled",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const USER_ROLES = ["super_admin", "hr", "manager"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STATUS_LABELS: Record<SessionStatus, string> = {
  draft: "Draft",
  link_generated: "Link Generated",
  pending_client: "Pending Client",
  submitted: "Submitted",
  manager_review: "Manager Review",
  manager_approved: "Manager Approved",
  manager_rejected: "Manager Rejected",
  hr_review: "HR Review",
  hr_approved: "HR Approved",
  hr_rejected: "HR Rejected",
  finalized: "Finalized",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** Statuses in which a brand-new session for the same employee/client/period is blocked. */
export const BLOCKING_STATUSES: SessionStatus[] = [
  "draft",
  "link_generated",
  "pending_client",
  "submitted",
  "manager_review",
  "manager_approved",
  "hr_review",
  "hr_approved",
  "finalized",
  "expired",
];

/** Statuses where the client link can still be used to submit. */
export const CLIENT_OPEN_STATUSES: SessionStatus[] = ["link_generated", "pending_client"];

export const AUDIT_ACTIONS = {
  EVALUATION_CREATED: "evaluation_created",
  TOKEN_GENERATED: "token_generated",
  TOKEN_REVOKED: "token_revoked",
  TOKEN_REGENERATED: "token_regenerated",
  TOKEN_EXTENDED: "token_extended",
  CLIENT_OPENED: "client_opened_link",
  CLIENT_SUBMITTED: "client_submitted",
  MANAGER_APPROVED: "manager_approved",
  MANAGER_ADJUSTED: "manager_adjusted",
  MANAGER_REJECTED: "manager_rejected",
  HR_APPROVED: "hr_approved",
  HR_REJECTED: "hr_rejected",
  FINALIZED: "evaluation_finalized",
  CANCELLED: "evaluation_cancelled",
  USER_LOGIN: "user_login",
  USER_LOGIN_FAILED: "user_login_failed",
} as const;

export const SESSION_COOKIE = "pes_session";
export const SESSION_TTL_DAYS = 7;
