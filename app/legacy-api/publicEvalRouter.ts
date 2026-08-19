import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  employees,
  departments,
  evaluationCriteria,
  evaluationResponses,
  evaluationResults,
  evaluationSessions,
  evaluationTemplates,
  evaluationTokens,
  gradeBands,
  salaryRecommendations,
} from "@db/schema";
import { AUDIT_ACTIONS } from "@contracts/constants";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { hashToken } from "./services/tokens";
import { writeAudit } from "./services/audit";
import { computeOverallScore, gradeForScore, validateIncreasePct } from "./services/grading";
import { isClientOpen } from "./services/stateMachine";
import { clientIpFrom, rateLimitOrThrow } from "./services/rateLimit";

/**
 * Public client evaluation endpoints. No authentication — the secure token
 * is the credential. Rate-limited per IP. Never exposes internal IDs beyond
 * what the client needs to complete the form.
 */

async function resolveToken(rawToken: string) {
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select({ token: evaluationTokens, session: evaluationSessions })
    .from(evaluationTokens)
    .innerJoin(evaluationSessions, eq(evaluationTokens.sessionId, evaluationSessions.id))
    .where(eq(evaluationTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export const publicEvalRouter = createRouter({
  getByToken: publicQuery
    .input(z.object({ token: z.string().min(16).max(256) }))
    .query(async ({ ctx, input }) => {
      rateLimitOrThrow(`eval:${clientIpFrom(ctx.req)}`);
      const db = getDb();
      const resolved = await resolveToken(input.token);

      if (!resolved || resolved.token.revokedAt) {
        return { state: "invalid" as const };
      }
      const { token, session } = resolved;

      if (session.status === "cancelled") {
        return { state: "invalid" as const };
      }

      // Already submitted → locked view (server-side enforced).
      if (!isClientOpen(session.status) && session.status !== "expired") {
        return { state: "submitted" as const, submittedAt: session.submittedAt };
      }

      // Expiration — lazily persist the expired status.
      if (token.expiresAt.getTime() < Date.now()) {
        if (isClientOpen(session.status)) {
          await db
            .update(evaluationSessions)
            .set({ status: "expired" })
            .where(eq(evaluationSessions.id, session.id));
        }
        return { state: "expired" as const, validUntil: token.expiresAt };
      }

      const [employee, criteria, template] = await Promise.all([
        db.query.employees.findFirst({ where: eq(employees.id, session.employeeId) }),
        db
          .select()
          .from(evaluationCriteria)
          .where(eq(evaluationCriteria.templateId, session.templateId))
          .orderBy(asc(evaluationCriteria.sortOrder)),
        db.query.evaluationTemplates.findFirst({
          where: eq(evaluationTemplates.id, session.templateId),
        }),
      ]);
      if (!employee) return { state: "invalid" as const };

      let departmentName: string | null = null;
      if (employee.departmentId) {
        const dept = await db.query.departments.findFirst({
          where: eq(departments.id, employee.departmentId),
        });
        departmentName = dept?.name ?? null;
      }

      // First access: link_generated → pending_client
      if (session.status === "link_generated") {
        await db
          .update(evaluationSessions)
          .set({ status: "pending_client", clientFirstAccessedAt: new Date() })
          .where(eq(evaluationSessions.id, session.id));
        await writeAudit(db, {
          actorType: "client",
          actorLabel: "Client (link access)",
          sessionId: session.id,
          action: AUDIT_ACTIONS.CLIENT_OPENED,
          ip: clientIpFrom(ctx.req),
        });
      }

      return {
        state: "open" as const,
        employee: {
          name: employee.name,
          position: employee.position,
          departmentName,
          photoUrl: employee.photoUrl,
        },
        period: session.period,
        project: session.project,
        templateName: template?.name ?? null,
        validUntil: token.expiresAt,
        criteria: criteria.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          scaleMin: c.scaleMin,
          scaleMax: c.scaleMax,
          weight: Number(c.weight),
        })),
      };
    }),

  submit: publicQuery
    .input(
      z.object({
        token: z.string().min(16).max(256),
        scores: z.array(z.object({ criteriaId: z.number(), score: z.number() })).min(1),
        increasePct: z.number(),
        comments: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`eval-submit:${clientIpFrom(ctx.req)}`);
      const db = getDb();
      const resolved = await resolveToken(input.token);
      if (!resolved || resolved.token.revokedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This evaluation link is not valid." });
      }
      const { token, session } = resolved;

      // Server-side submission lock — never trust the frontend.
      if (!isClientOpen(session.status)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This evaluation has already been submitted.",
        });
      }
      if (token.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This evaluation link has expired. Please contact the organization for a new evaluation link.",
        });
      }

      const pctCheck = validateIncreasePct(input.increasePct);
      if (!pctCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: pctCheck.error });

      const criteria = await db
        .select()
        .from(evaluationCriteria)
        .where(eq(evaluationCriteria.templateId, session.templateId));
      if (criteria.length === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "This template has no criteria." });
      }
      const scoreById = new Map(input.scores.map((s) => [s.criteriaId, s.score]));

      // Every criterion must have exactly one in-range score.
      for (const c of criteria) {
        const s = scoreById.get(c.id);
        if (s == null || !Number.isInteger(s) || s < c.scaleMin || s > c.scaleMax) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Score for "${c.name}" must be a whole number between ${c.scaleMin} and ${c.scaleMax}.`,
          });
        }
      }

      const overall = computeOverallScore(
        criteria.map((c) => ({ score: scoreById.get(c.id)!, weight: Number(c.weight) })),
      );
      if (overall == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not compute the score." });
      }
      const bands = await db.select().from(gradeBands);
      const grade = gradeForScore(
        overall,
        bands.map((b) => ({
          grade: b.grade,
          minScore: Number(b.minScore),
          maxScore: Number(b.maxScore),
          sortOrder: b.sortOrder,
        })),
      ) ?? "N/A";

      const now = new Date();
      try {
        await db.transaction(async (tx) => {
          // Re-check the lock inside the transaction.
          const fresh = await tx
            .select({ status: evaluationSessions.status })
            .from(evaluationSessions)
            .where(eq(evaluationSessions.id, session.id))
            .limit(1);
          if (!fresh[0] || !isClientOpen(fresh[0].status)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This evaluation has already been submitted.",
            });
          }

          await tx.insert(evaluationResponses).values(
            criteria.map((c) => ({
              sessionId: session.id,
              criteriaId: c.id,
              score: scoreById.get(c.id)!,
            })),
          );
          await tx.insert(evaluationResults).values({
            sessionId: session.id,
            overallScore: String(overall),
            grade,
            clientComments: input.comments?.trim() || null,
            submittedAt: now,
          });
          await tx.insert(salaryRecommendations).values({
            sessionId: session.id,
            clientPct: String(input.increasePct),
          });
          // submitted → manager_review (paired instant transitions)
          await tx
            .update(evaluationSessions)
            .set({ status: "submitted", submittedAt: now })
            .where(eq(evaluationSessions.id, session.id));
          await tx
            .update(evaluationSessions)
            .set({ status: "manager_review" })
            .where(eq(evaluationSessions.id, session.id));
          await writeAudit(tx, {
            actorType: "client",
            actorLabel: "Client (link submission)",
            sessionId: session.id,
            action: AUDIT_ACTIONS.CLIENT_SUBMITTED,
            details: { overall, grade, increasePct: input.increasePct },
            ip: clientIpFrom(ctx.req),
          });
        });
      } catch (err) {
        // Unique-key violation on responses/results also means double submission.
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "CONFLICT",
          message: "This evaluation has already been submitted.",
        });
      }

      return { ok: true, overall, grade };
    }),
});
