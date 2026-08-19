import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  approvals,
  employees,
  evaluationSessions,
  salaryRecommendations,
} from "@db/schema";
import { AUDIT_ACTIONS } from "@contracts/constants";
import { createRouter } from "./middleware";
import { authedProcedure, hrProcedure } from "./guards";
import { getDb } from "./queries/connection";
import { writeAudit } from "./services/audit";
import { assertTransition } from "./services/stateMachine";
import { validateIncreasePct } from "./services/grading";

/**
 * Approval workflow.
 *
 * Manager: approve / reject / adjust the client's recommended increase.
 *   - Adjustment requires a written explanation and NEVER overwrites clientPct.
 * HR: approve / reject only (business decision: HR does not change the %).
 *   - On approval the final % = managerPct ?? clientPct, stored separately.
 */

export const approvalRouter = createRouter({
  managerDecide: authedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        decision: z.enum(["approved", "rejected"]),
        adjustedPct: z.number().optional().nullable(),
        comments: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;

      const session = await db.query.evaluationSessions.findFirst({
        where: eq(evaluationSessions.id, input.sessionId),
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Evaluation not found." });

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, session.employeeId),
      });
      if (user.role === "manager" && employee?.managerId !== user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only review evaluations for your own team.",
        });
      }
      if (user.role === "hr") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "HR reviews happen at the next stage.",
        });
      }

      assertTransition(session.status, "manager_approved"); // validates manager_review state

      const salary = await db.query.salaryRecommendations.findFirst({
        where: eq(salaryRecommendations.sessionId, session.id),
      });
      if (!salary) throw new TRPCError({ code: "CONFLICT", message: "No submission on record." });

      const clientPct = Number(salary.clientPct);
      const isAdjustment =
        input.decision === "approved" &&
        input.adjustedPct != null &&
        Number(input.adjustedPct) !== clientPct;

      if (isAdjustment) {
        const check = validateIncreasePct(Number(input.adjustedPct));
        if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: check.error });
        if (!input.comments?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "An explanation is required when changing the client's recommendation.",
          });
        }
      }
      if (input.decision === "rejected" && !input.comments?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An explanation is required when rejecting an evaluation.",
        });
      }

      await db.transaction(async (tx) => {
        if (isAdjustment) {
          await tx
            .update(salaryRecommendations)
            .set({ managerPct: String(input.adjustedPct) })
            .where(eq(salaryRecommendations.sessionId, session.id));
        }
        await tx.insert(approvals).values({
          sessionId: session.id,
          actorId: user.id,
          actorRole: "manager",
          decision: input.decision,
          comments: input.comments?.trim() || null,
          clientPctSnapshot: salary.clientPct,
          managerPctSnapshot:
            input.decision === "approved"
              ? String(isAdjustment ? input.adjustedPct : clientPct)
              : null,
        });

        if (input.decision === "approved") {
          // manager_review → manager_approved → hr_review (paired instant transitions)
          await tx
            .update(evaluationSessions)
            .set({ status: "manager_approved", managerReviewedAt: new Date() })
            .where(eq(evaluationSessions.id, session.id));
          await tx
            .update(evaluationSessions)
            .set({ status: "hr_review" })
            .where(eq(evaluationSessions.id, session.id));
        } else {
          await tx
            .update(evaluationSessions)
            .set({ status: "manager_rejected", managerReviewedAt: new Date() })
            .where(eq(evaluationSessions.id, session.id));
        }

        const action =
          input.decision === "rejected"
            ? AUDIT_ACTIONS.MANAGER_REJECTED
            : isAdjustment
              ? AUDIT_ACTIONS.MANAGER_ADJUSTED
              : AUDIT_ACTIONS.MANAGER_APPROVED;
        await writeAudit(tx, {
          actorType: "user",
          actorId: user.id,
          actorLabel: user.name,
          sessionId: session.id,
          action,
          previousValue: `${clientPct}%`,
          newValue:
            input.decision === "approved"
              ? `${isAdjustment ? input.adjustedPct : clientPct}%`
              : null,
          details: { comments: input.comments?.trim() || null },
        });
      });

      return { ok: true };
    }),

  hrDecide: hrProcedure
    .input(
      z.object({
        sessionId: z.number(),
        decision: z.enum(["approved", "rejected"]),
        comments: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;

      const session = await db.query.evaluationSessions.findFirst({
        where: eq(evaluationSessions.id, input.sessionId),
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Evaluation not found." });

      if (input.decision === "rejected" && !input.comments?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An explanation is required when rejecting an evaluation.",
        });
      }

      const salary = await db.query.salaryRecommendations.findFirst({
        where: eq(salaryRecommendations.sessionId, session.id),
      });
      if (!salary) throw new TRPCError({ code: "CONFLICT", message: "No submission on record." });

      await db.transaction(async (tx) => {
        if (input.decision === "approved") {
          // final % = manager's adjustment if present, otherwise the client's value
          const finalPct = salary.managerPct ?? salary.clientPct;
          await tx
            .update(salaryRecommendations)
            .set({ finalPct })
            .where(eq(salaryRecommendations.sessionId, session.id));
          await tx.insert(approvals).values({
            sessionId: session.id,
            actorId: user.id,
            actorRole: "hr",
            decision: "approved",
            comments: input.comments?.trim() || null,
            clientPctSnapshot: salary.clientPct,
            managerPctSnapshot: salary.managerPct,
          });
          // hr_review → hr_approved → finalized (paired instant transitions)
          const now = new Date();
          await tx
            .update(evaluationSessions)
            .set({ status: "hr_approved", hrReviewedAt: now })
            .where(eq(evaluationSessions.id, session.id));
          await tx
            .update(evaluationSessions)
            .set({ status: "finalized", finalizedAt: now })
            .where(eq(evaluationSessions.id, session.id));
          await writeAudit(tx, {
            actorType: "user",
            actorId: user.id,
            actorLabel: user.name,
            sessionId: session.id,
            action: AUDIT_ACTIONS.HR_APPROVED,
            newValue: `${finalPct}%`,
            details: { comments: input.comments?.trim() || null },
          });
          await writeAudit(tx, {
            actorType: "user",
            actorId: user.id,
            actorLabel: user.name,
            sessionId: session.id,
            action: AUDIT_ACTIONS.FINALIZED,
            newValue: "finalized",
          });
        } else {
          assertTransition(session.status, "hr_rejected");
          await tx.insert(approvals).values({
            sessionId: session.id,
            actorId: user.id,
            actorRole: "hr",
            decision: "rejected",
            comments: input.comments?.trim() || null,
            clientPctSnapshot: salary.clientPct,
            managerPctSnapshot: salary.managerPct,
          });
          await tx
            .update(evaluationSessions)
            .set({ status: "hr_rejected", hrReviewedAt: new Date() })
            .where(eq(evaluationSessions.id, session.id));
          await writeAudit(tx, {
            actorType: "user",
            actorId: user.id,
            actorLabel: user.name,
            sessionId: session.id,
            action: AUDIT_ACTIONS.HR_REJECTED,
            details: { comments: input.comments?.trim() || null },
          });
        }
      });

      return { ok: true };
    }),
});
