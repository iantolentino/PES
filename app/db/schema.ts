import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  boolean,
  decimal,
  mysqlEnum,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/* ---------------------------------- users ---------------------------------- */

export const userRoles = ["super_admin", "hr", "manager"] as const;
export type UserRole = (typeof userRoles)[number];

export const users = mysqlTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 64 }).notNull().unique(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    role: mysqlEnum("role", userRoles).notNull().default("manager"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);
export type User = typeof users.$inferSelect;

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expiresAt").notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("userAgent", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);
export type AuthSession = typeof authSessions.$inferSelect;

/* ----------------------------- organization ----------------------------- */

export const departments = mysqlTable("departments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Department = typeof departments.$inferSelect;

export const employees = mysqlTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    position: varchar("position", { length: 255 }),
    departmentId: bigint("departmentId", { mode: "number", unsigned: true }).references(
      () => departments.id,
    ),
    managerId: bigint("managerId", { mode: "number", unsigned: true }).references(
      () => users.id,
    ),
    email: varchar("email", { length: 320 }),
    photoUrl: varchar("photoUrl", { length: 1024 }),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("employees_department_idx").on(t.departmentId),
    index("employees_manager_idx").on(t.managerId),
    index("employees_name_idx").on(t.name),
  ],
);
export type Employee = typeof employees.$inferSelect;

export const clients = mysqlTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    contactName: varchar("contactName", { length: 255 }),
    contactEmail: varchar("contactEmail", { length: 320 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("clients_name_idx").on(t.name)],
);
export type Client = typeof clients.$inferSelect;

export const employeeClientAssignments = mysqlTable(
  "employee_client_assignments",
  {
    id: serial("id").primaryKey(),
    employeeId: bigint("employeeId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => employees.id),
    clientId: bigint("clientId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => clients.id),
    project: varchar("project", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("eca_employee_idx").on(t.employeeId),
    index("eca_client_idx").on(t.clientId),
  ],
);
export type EmployeeClientAssignment = typeof employeeClientAssignments.$inferSelect;

/* ------------------------- templates & criteria ------------------------- */

export const evaluationTemplates = mysqlTable("evaluation_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EvaluationTemplate = typeof evaluationTemplates.$inferSelect;

export const evaluationCriteria = mysqlTable(
  "evaluation_criteria",
  {
    id: serial("id").primaryKey(),
    templateId: bigint("templateId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => evaluationTemplates.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    weight: decimal("weight", { precision: 6, scale: 2 }).notNull().default("1.00"),
    scaleMin: int("scaleMin").notNull().default(1),
    scaleMax: int("scaleMax").notNull().default(100),
    sortOrder: int("sortOrder").notNull().default(0),
  },
  (t) => [index("criteria_template_idx").on(t.templateId)],
);
export type EvaluationCriterion = typeof evaluationCriteria.$inferSelect;

export const gradeBands = mysqlTable(
  "grade_bands",
  {
    id: serial("id").primaryKey(),
    grade: varchar("grade", { length: 8 }).notNull().unique(),
    minScore: decimal("minScore", { precision: 5, scale: 2 }).notNull(),
    maxScore: decimal("maxScore", { precision: 5, scale: 2 }).notNull(),
    sortOrder: int("sortOrder").notNull().default(0),
  },
  (t) => [index("grade_bands_score_idx").on(t.minScore)],
);
export type GradeBand = typeof gradeBands.$inferSelect;

/* --------------------------- evaluation sessions --------------------------- */

export const sessionStatuses = [
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
export type SessionStatus = (typeof sessionStatuses)[number];

export const evaluationSessions = mysqlTable(
  "evaluation_sessions",
  {
    id: serial("id").primaryKey(),
    employeeId: bigint("employeeId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => employees.id),
    clientId: bigint("clientId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => clients.id),
    templateId: bigint("templateId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => evaluationTemplates.id),
    period: varchar("period", { length: 64 }).notNull(),
    project: varchar("project", { length: 255 }),
    status: mysqlEnum("status", sessionStatuses).notNull().default("link_generated"),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    clientFirstAccessedAt: timestamp("clientFirstAccessedAt"),
    submittedAt: timestamp("submittedAt"),
    managerReviewedAt: timestamp("managerReviewedAt"),
    hrReviewedAt: timestamp("hrReviewedAt"),
    finalizedAt: timestamp("finalizedAt"),
    cancelledAt: timestamp("cancelledAt"),
    cancelledBy: bigint("cancelledBy", { mode: "number", unsigned: true }),
  },
  (t) => [
    index("sessions_employee_idx").on(t.employeeId),
    index("sessions_client_idx").on(t.clientId),
    index("sessions_status_idx").on(t.status),
    index("sessions_period_idx").on(t.period),
    index("sessions_active_combo_idx").on(t.employeeId, t.clientId, t.period),
  ],
);
export type EvaluationSession = typeof evaluationSessions.$inferSelect;

export const evaluationTokens = mysqlTable(
  "evaluation_tokens",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => evaluationSessions.id),
    /** SHA-256 hex of the raw token — the raw token is never stored. */
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
    revokedBy: bigint("revokedBy", { mode: "number", unsigned: true }),
  },
  (t) => [index("tokens_session_idx").on(t.sessionId)],
);
export type EvaluationToken = typeof evaluationTokens.$inferSelect;

export const evaluationResponses = mysqlTable(
  "evaluation_responses",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => evaluationSessions.id),
    criteriaId: bigint("criteriaId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => evaluationCriteria.id),
    score: int("score").notNull(),
  },
  (t) => [
    uniqueIndex("responses_session_criteria_uniq").on(t.sessionId, t.criteriaId),
  ],
);
export type EvaluationResponse = typeof evaluationResponses.$inferSelect;

export const evaluationResults = mysqlTable(
  "evaluation_results",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => evaluationSessions.id),
    overallScore: decimal("overallScore", { precision: 5, scale: 2 }).notNull(),
    grade: varchar("grade", { length: 8 }).notNull(),
    clientComments: text("clientComments"),
    submittedAt: timestamp("submittedAt").notNull(),
  },
  (t) => [uniqueIndex("results_session_uniq").on(t.sessionId)],
);
export type EvaluationResult = typeof evaluationResults.$inferSelect;

export const salaryRecommendations = mysqlTable(
  "salary_recommendations",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => evaluationSessions.id),
    /** Client-entered value — never overwritten. */
    clientPct: decimal("clientPct", { precision: 7, scale: 2 }).notNull(),
    /** Manager-adjusted value — stored separately, never overwrites clientPct. */
    managerPct: decimal("managerPct", { precision: 7, scale: 2 }),
    /** Final approved value — set on HR approval (equals managerPct ?? clientPct). */
    finalPct: decimal("finalPct", { precision: 7, scale: 2 }),
  },
  (t) => [uniqueIndex("salary_session_uniq").on(t.sessionId)],
);
export type SalaryRecommendation = typeof salaryRecommendations.$inferSelect;

/* ------------------------------- approvals -------------------------------- */

export const approvals = mysqlTable(
  "approvals",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => evaluationSessions.id),
    actorId: bigint("actorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    actorRole: mysqlEnum("actorRole", ["manager", "hr"]).notNull(),
    decision: mysqlEnum("decision", ["approved", "rejected"]).notNull(),
    comments: text("comments"),
    clientPctSnapshot: decimal("clientPctSnapshot", { precision: 7, scale: 2 }),
    managerPctSnapshot: decimal("managerPctSnapshot", { precision: 7, scale: 2 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("approvals_session_idx").on(t.sessionId)],
);
export type Approval = typeof approvals.$inferSelect;

/* -------------------------------- audit log -------------------------------- */

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorType: mysqlEnum("actorType", ["user", "client", "system"]).notNull(),
    actorId: bigint("actorId", { mode: "number", unsigned: true }),
    actorLabel: varchar("actorLabel", { length: 255 }),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true }),
    action: varchar("action", { length: 64 }).notNull(),
    details: json("details"),
    previousValue: text("previousValue"),
    newValue: text("newValue"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("audit_session_idx").on(t.sessionId),
    index("audit_action_idx").on(t.action),
    index("audit_created_idx").on(t.createdAt),
  ],
);
export type AuditLog = typeof auditLogs.$inferSelect;
