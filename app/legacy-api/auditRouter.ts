import { z } from "zod";
import { and, desc, eq, like, type SQL } from "drizzle-orm";
import { auditLogs } from "@db/schema";
import { createRouter } from "./middleware";
import { hrProcedure } from "./guards";
import { getDb } from "./queries/connection";

/** Audit log viewer — HR and Super Admin. Append-only: no mutation endpoints exist. */
export const auditRouter = createRouter({
  list: hrProcedure
    .input(
      z
        .object({
          sessionId: z.number().optional(),
          action: z.string().optional(),
          search: z.string().optional(),
          limit: z.number().min(1).max(500).default(100),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions: (SQL | undefined)[] = [];
      if (input?.sessionId) conditions.push(eq(auditLogs.sessionId, input.sessionId));
      if (input?.action) conditions.push(eq(auditLogs.action, input.action));
      if (input?.search) conditions.push(like(auditLogs.actorLabel, `%${input.search}%`));
      return getDb()
        .select()
        .from(auditLogs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(input?.limit ?? 100);
    }),
});
