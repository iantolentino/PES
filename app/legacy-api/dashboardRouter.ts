import { and, desc, eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  employees,
  evaluationSessions,
  evaluationTokens,
} from "@db/schema";
import { createRouter } from "./middleware";
import { authedProcedure } from "./guards";
import { getDb } from "./queries/connection";
import { effectiveStatus } from "./services/stateMachine";

export const dashboardRouter = createRouter({
  stats: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const isManager = ctx.user.role === "manager";

    const empRows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        isManager
          ? and(eq(employees.managerId, ctx.user.id), eq(employees.isActive, true))
          : eq(employees.isActive, true),
      );
    const empIds = empRows.map((e) => e.id);

    const sessions = empIds.length
      ? await db
          .select()
          .from(evaluationSessions)
          .where(inArray(evaluationSessions.employeeId, empIds))
      : [];

    const sessionIds = sessions.map((s) => s.id);
    const tokens = sessionIds.length
      ? await db
          .select()
          .from(evaluationTokens)
          .where(inArray(evaluationTokens.sessionId, sessionIds))
          .orderBy(desc(evaluationTokens.id))
      : [];
    const latestToken = new Map<number, (typeof tokens)[number]>();
    for (const t of tokens) if (!latestToken.has(t.sessionId)) latestToken.set(t.sessionId, t);

    let pendingClient = 0;
    let expiredLinks = 0;
    for (const s of sessions) {
      const latest = latestToken.get(s.id);
      const live = latest && !latest.revokedAt ? latest : null;
      const eff = effectiveStatus(s.status, live?.expiresAt ?? null);
      if (eff === "expired") expiredLinks++;
      else if (eff === "link_generated" || eff === "pending_client") pendingClient++;
    }

    return {
      totalEmployees: empIds.length,
      pendingClient,
      awaitingManager: sessions.filter((s) => s.status === "manager_review").length,
      awaitingHr: sessions.filter((s) => s.status === "hr_review").length,
      completed: sessions.filter((s) => s.status === "finalized").length,
      expiredLinks,
    };
  }),

  recentActivity: authedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const isManager = ctx.user.role === "manager";

    let allowedSessionIds: number[] | null = null;
    if (isManager) {
      const empRows = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.managerId, ctx.user.id));
      const empIds = empRows.map((e) => e.id);
      const sessions = empIds.length
        ? await db
            .select({ id: evaluationSessions.id })
            .from(evaluationSessions)
            .where(inArray(evaluationSessions.employeeId, empIds))
        : [];
      allowedSessionIds = sessions.map((s) => s.id);
      if (allowedSessionIds.length === 0) return [];
    }

    const rows = await db
      .select()
      .from(auditLogs)
      .where(allowedSessionIds ? inArray(auditLogs.sessionId, allowedSessionIds) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(20);
    return rows;
  }),
});
