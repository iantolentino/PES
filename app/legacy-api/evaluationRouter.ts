import { z } from "zod";
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  clients,
  departments,
  employees,
  evaluationCriteria,
  evaluationResponses,
  evaluationResults,
  evaluationSessions,
  evaluationTemplates,
  evaluationTokens,
  salaryRecommendations,
  users,
  approvals,
  auditLogs,
  type User,
} from "@db/schema";
import {
  AUDIT_ACTIONS,
  BLOCKING_STATUSES,
  SESSION_STATUSES,
  type SessionStatus,
} from "@contracts/constants";
import { createRouter } from "./middleware";
import { authedProcedure, hrProcedure } from "./guards";
import { getDb } from "./queries/connection";
import { generateToken, hashToken } from "./services/tokens";
import { writeAudit } from "./services/audit";
import { assertTransition, effectiveStatus } from "./services/stateMachine";

async function loadSessionBundle(sessionId: number) {
  const db = getDb();
  const rows = await db
    .select({
      session: evaluationSessions,
      employee: employees,
      client: clients,
      template: evaluationTemplates,
      departmentName: departments.name,
      managerName: users.name,
    })
    .from(evaluationSessions)
    .innerJoin(employees, eq(evaluationSessions.employeeId, employees.id))
    .innerJoin(clients, eq(evaluationSessions.clientId, clients.id))
    .innerJoin(evaluationTemplates, eq(evaluationSessions.templateId, evaluationTemplates.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(users, eq(employees.managerId, users.id))
    .where(eq(evaluationSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

/** Latest non-revoked token for a session (the "live" link). */
async function liveToken(sessionId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(evaluationTokens)
    .where(eq(evaluationTokens.sessionId, sessionId))
    .orderBy(desc(evaluationTokens.id));
  return rows.find((t) => !t.revokedAt) ?? null;
}

function scopeFilter(user: User): SQL | undefined {
  return user.role === "manager" ? eq(employees.managerId, user.id) : undefined;
}

async function assertSessionAccess(user: User, sessionId: number) {
  const bundle = await loadSessionBundle(sessionId);
  if (!bundle) throw new TRPCError({ code: "NOT_FOUND", message: "Evaluation not found." });
  if (user.role === "manager" && bundle.employee.managerId !== user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This evaluation belongs to another manager's team.",
    });
  }
  return bundle;
}

export const evaluationRouter = createRouter({
  list: authedProcedure
    .input(
      z
        .object({
          status: z.enum(SESSION_STATUSES).optional(),
          employeeId: z.number().optional(),
          clientId: z.number().optional(),
          departmentId: z.number().optional(),
          period: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions: (SQL | undefined)[] = [scopeFilter(ctx.user)];
      if (input?.status) conditions.push(eq(evaluationSessions.status, input.status));
      if (input?.employeeId) conditions.push(eq(evaluationSessions.employeeId, input.employeeId));
      if (input?.clientId) conditions.push(eq(evaluationSessions.clientId, input.clientId));
      if (input?.departmentId) conditions.push(eq(employees.departmentId, input.departmentId));
      if (input?.period) conditions.push(eq(evaluationSessions.period, input.period));
      if (input?.dateFrom) conditions.push(gte(evaluationSessions.createdAt, new Date(input.dateFrom)));
      if (input?.dateTo) conditions.push(lte(evaluationSessions.createdAt, new Date(input.dateTo + "T23:59:59")));

      const rows = await db
        .select({
          session: evaluationSessions,
          employeeName: employees.name,
          clientName: clients.name,
          score: evaluationResults.overallScore,
          grade: evaluationResults.grade,
          clientPct: salaryRecommendations.clientPct,
          managerPct: salaryRecommendations.managerPct,
          finalPct: salaryRecommendations.finalPct,
        })
        .from(evaluationSessions)
        .innerJoin(employees, eq(evaluationSessions.employeeId, employees.id))
        .innerJoin(clients, eq(evaluationSessions.clientId, clients.id))
        .leftJoin(evaluationResults, eq(evaluationResults.sessionId, evaluationSessions.id))
        .leftJoin(salaryRecommendations, eq(salaryRecommendations.sessionId, evaluationSessions.id))
        .where(and(...conditions.filter(Boolean)))
        .orderBy(desc(evaluationSessions.createdAt))
        .limit(500);

      // Effective status with live-token expiry.
      const tokens = rows.length
        ? await db
            .select()
            .from(evaluationTokens)
            .where(inArray(evaluationTokens.sessionId, rows.map((r) => r.session.id)))
            .orderBy(desc(evaluationTokens.id))
        : [];
      // Tokens are ordered newest-first: first occurrence per session is the latest;
      // it counts as "live" only when not revoked.
      const latestBySession = new Map<number, (typeof tokens)[number]>();
      for (const t of tokens) {
        if (!latestBySession.has(t.sessionId)) latestBySession.set(t.sessionId, t);
      }

      return rows.map((r) => {
        const latest = latestBySession.get(r.session.id) ?? null;
        const live = latest && !latest.revokedAt ? latest : null;
        return {
          ...r.session,
          employeeName: r.employeeName,
          clientName: r.clientName,
          score: r.score,
          grade: r.grade,
          clientPct: r.clientPct,
          managerPct: r.managerPct,
          finalPct: r.finalPct,
          effectiveStatus: effectiveStatus(r.session.status, live?.expiresAt ?? null),
          linkExpiresAt: live?.expiresAt ?? null,
        };
      });
    }),

  /** Distinct period labels for the filter dropdown. */
  periods: authedProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ period: evaluationSessions.period })
      .from(evaluationSessions)
      .orderBy(desc(evaluationSessions.period));
    return rows.map((r) => r.period);
  }),

  get: authedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const bundle = await assertSessionAccess(ctx.user, input.id);
      const { session, employee, client, template, departmentName, managerName } = bundle;

      const [responses, result, salary, approvalRows, tokenRows, auditRows, criteriaList] =
        await Promise.all([
          db
            .select()
            .from(evaluationResponses)
            .where(eq(evaluationResponses.sessionId, session.id)),
          db.query.evaluationResults.findFirst({
            where: eq(evaluationResults.sessionId, session.id),
          }),
          db.query.salaryRecommendations.findFirst({
            where: eq(salaryRecommendations.sessionId, session.id),
          }),
          db
            .select({ approval: approvals, actorName: users.name })
            .from(approvals)
            .innerJoin(users, eq(approvals.actorId, users.id))
            .where(eq(approvals.sessionId, session.id))
            .orderBy(approvals.createdAt),
          db
            .select()
            .from(evaluationTokens)
            .where(eq(evaluationTokens.sessionId, session.id))
            .orderBy(desc(evaluationTokens.id)),
          db
            .select()
            .from(auditLogs)
            .where(eq(auditLogs.sessionId, session.id))
            .orderBy(auditLogs.createdAt),
          db
            .select()
            .from(evaluationCriteria)
            .where(eq(evaluationCriteria.templateId, session.templateId))
            .orderBy(evaluationCriteria.sortOrder),
        ]);

      const live = tokenRows.find((t) => !t.revokedAt) ?? null;

      return {
        session,
        employee: {
          id: employee.id,
          name: employee.name,
          position: employee.position,
          photoUrl: employee.photoUrl,
          departmentName,
          managerName,
        },
        client: { id: client.id, name: client.name, contactName: client.contactName },
        template: { id: template.id, name: template.name },
        criteria: criteriaList,
        responses,
        result: result ?? null,
        salary: salary ?? null,
        approvals: approvalRows.map((a) => ({ ...a.approval, actorName: a.actorName })),
        tokens: tokenRows.map((t) => ({
          id: t.id,
          expiresAt: t.expiresAt,
          createdAt: t.createdAt,
          revokedAt: t.revokedAt,
          isLive: live?.id === t.id,
        })),
        audit: auditRows,
        effectiveStatus: effectiveStatus(session.status, live?.expiresAt ?? null),
        liveTokenExpiresAt: live?.expiresAt ?? null,
        hasLiveToken: !!live,
      };
    }),

  create: authedProcedure
    .input(
      z.object({
        employeeId: z.number(),
        clientId: z.number(),
        templateId: z.number(),
        period: z.string().min(1).max(64),
        project: z.string().max(255).optional(),
        expiresAt: z.string().min(1), // ISO date
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, input.employeeId),
      });
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });
      if (user.role === "manager" && employee.managerId !== user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only create evaluations for your own team.",
        });
      }
      const client = await db.query.clients.findFirst({ where: eq(clients.id, input.clientId) });
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
      const template = await db.query.evaluationTemplates.findFirst({
        where: eq(evaluationTemplates.id, input.templateId),
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });

      const expiresAt = new Date(input.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Expiration must be a future date." });
      }

      // Business rule: one active session per employee + client + period.
      const duplicates = await db
        .select({ id: evaluationSessions.id, status: evaluationSessions.status })
        .from(evaluationSessions)
        .where(
          and(
            eq(evaluationSessions.employeeId, input.employeeId),
            eq(evaluationSessions.clientId, input.clientId),
            eq(evaluationSessions.period, input.period),
            inArray(evaluationSessions.status, BLOCKING_STATUSES),
          ),
        );
      if (duplicates.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "An active evaluation already exists for this employee, client, and period. Cancel or complete it first.",
        });
      }

      const rawToken = generateToken();
      const tokenHash = hashToken(rawToken);

      const sessionId = await db.transaction(async (tx) => {
        const [{ id }] = await tx
          .insert(evaluationSessions)
          .values({
            employeeId: input.employeeId,
            clientId: input.clientId,
            templateId: input.templateId,
            period: input.period.trim(),
            project: input.project?.trim() || null,
            status: "link_generated",
            createdBy: user.id,
          })
          .$returningId();

        await tx.insert(evaluationTokens).values({
          sessionId: id,
          tokenHash,
          expiresAt,
          createdBy: user.id,
        });

        await writeAudit(tx, {
          actorType: "user",
          actorId: user.id,
          actorLabel: user.name,
          sessionId: id,
          action: AUDIT_ACTIONS.EVALUATION_CREATED,
          details: {
            employeeId: input.employeeId,
            clientId: input.clientId,
            period: input.period,
            templateId: input.templateId,
          },
          newValue: "link_generated",
        });
        await writeAudit(tx, {
          actorType: "user",
          actorId: user.id,
          actorLabel: user.name,
          sessionId: id,
          action: AUDIT_ACTIONS.TOKEN_GENERATED,
          details: { expiresAt: expiresAt.toISOString() },
        });
        return id;
      });

      return { sessionId, token: rawToken, path: `/evaluation/${rawToken}` };
    }),

  extendExpiration: authedProcedure
    .input(z.object({ sessionId: z.number(), expiresAt: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const bundle = await assertSessionAccess(ctx.user, input.sessionId);
      const { session } = bundle;
      const live = await liveToken(session.id);
      if (!live) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active link — generate a replacement link instead.",
        });
      }
      const newExpiry = new Date(input.expiresAt);
      if (Number.isNaN(newExpiry.getTime()) || newExpiry.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "New expiration must be in the future." });
      }
      if (!["link_generated", "pending_client", "expired"].includes(session.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pre-submission evaluations can be extended.",
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(evaluationTokens)
          .set({ expiresAt: newExpiry })
          .where(eq(evaluationTokens.id, live.id));
        if (session.status === "expired") {
          const restore = session.clientFirstAccessedAt ? "pending_client" : "link_generated";
          assertTransition("expired", restore as SessionStatus);
          await tx
            .update(evaluationSessions)
            .set({ status: restore as SessionStatus })
            .where(eq(evaluationSessions.id, session.id));
        }
        await writeAudit(tx, {
          actorType: "user",
          actorId: ctx.user.id,
          actorLabel: ctx.user.name,
          sessionId: session.id,
          action: AUDIT_ACTIONS.TOKEN_EXTENDED,
          previousValue: live.expiresAt.toISOString(),
          newValue: newExpiry.toISOString(),
        });
      });
      return { ok: true, expiresAt: newExpiry };
    }),

  regenerateLink: authedProcedure
    .input(z.object({ sessionId: z.number(), expiresAt: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const bundle = await assertSessionAccess(ctx.user, input.sessionId);
      const { session } = bundle;
      if (!["link_generated", "pending_client", "expired"].includes(session.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A new link can only be generated before submission.",
        });
      }
      const newExpiry = new Date(input.expiresAt);
      if (Number.isNaN(newExpiry.getTime()) || newExpiry.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "New expiration must be in the future." });
      }

      const rawToken = generateToken();
      await db.transaction(async (tx) => {
        const live = await liveToken(session.id);
        if (live) {
          await tx
            .update(evaluationTokens)
            .set({ revokedAt: new Date(), revokedBy: ctx.user.id })
            .where(eq(evaluationTokens.id, live.id));
          await writeAudit(tx, {
            actorType: "user",
            actorId: ctx.user.id,
            actorLabel: ctx.user.name,
            sessionId: session.id,
            action: AUDIT_ACTIONS.TOKEN_REVOKED,
            details: { reason: "regenerated" },
          });
        }
        await tx.insert(evaluationTokens).values({
          sessionId: session.id,
          tokenHash: hashToken(rawToken),
          expiresAt: newExpiry,
          createdBy: ctx.user.id,
        });
        if (session.status === "expired") {
          await tx
            .update(evaluationSessions)
            .set({ status: "link_generated" })
            .where(eq(evaluationSessions.id, session.id));
        }
        await writeAudit(tx, {
          actorType: "user",
          actorId: ctx.user.id,
          actorLabel: ctx.user.name,
          sessionId: session.id,
          action: AUDIT_ACTIONS.TOKEN_REGENERATED,
          details: { expiresAt: newExpiry.toISOString() },
        });
      });
      return { token: rawToken, path: `/evaluation/${rawToken}` };
    }),

  revokeLink: authedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const bundle = await assertSessionAccess(ctx.user, input.sessionId);
      const live = await liveToken(bundle.session.id);
      if (!live) throw new TRPCError({ code: "BAD_REQUEST", message: "No active link to revoke." });
      await db.transaction(async (tx) => {
        await tx
          .update(evaluationTokens)
          .set({ revokedAt: new Date(), revokedBy: ctx.user.id })
          .where(eq(evaluationTokens.id, live.id));
        await writeAudit(tx, {
          actorType: "user",
          actorId: ctx.user.id,
          actorLabel: ctx.user.name,
          sessionId: bundle.session.id,
          action: AUDIT_ACTIONS.TOKEN_REVOKED,
        });
      });
      return { ok: true };
    }),

  cancel: hrProcedure
    .input(z.object({ sessionId: z.number(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const bundle = await assertSessionAccess(ctx.user, input.sessionId);
      const { session } = bundle;
      assertTransition(session.status, "cancelled");
      await db.transaction(async (tx) => {
        const live = await liveToken(session.id);
        if (live) {
          await tx
            .update(evaluationTokens)
            .set({ revokedAt: new Date(), revokedBy: ctx.user.id })
            .where(eq(evaluationTokens.id, live.id));
        }
        await tx
          .update(evaluationSessions)
          .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: ctx.user.id })
          .where(eq(evaluationSessions.id, session.id));
        await writeAudit(tx, {
          actorType: "user",
          actorId: ctx.user.id,
          actorLabel: ctx.user.name,
          sessionId: session.id,
          action: AUDIT_ACTIONS.CANCELLED,
          previousValue: session.status,
          newValue: "cancelled",
          details: input.reason ? { reason: input.reason } : null,
        });
      });
      return { ok: true };
    }),
});
