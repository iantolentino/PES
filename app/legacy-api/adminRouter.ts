import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { evaluationCriteria, evaluationTemplates, gradeBands, users } from "@db/schema";
import { USER_ROLES } from "@contracts/constants";
import { createRouter } from "./middleware";
import { authedProcedure, superAdminProcedure } from "./guards";
import { getDb } from "./queries/connection";
import { hashPassword } from "./services/authService";

/**
 * Super Admin configuration: users & roles, evaluation templates/criteria,
 * grade bands.
 */

export const adminRouter = createRouter({
  /* -------------------------------- users -------------------------------- */

  listUsers: superAdminProcedure.query(async () => {
    return getDb()
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.name);
  }),

  createUser: superAdminProcedure
    .input(
      z.object({
        username: z.string().min(3).max(64),
        name: z.string().min(1).max(255),
        email: z.string().email().optional().or(z.literal("")),
        password: z.string().min(8, "Password must be at least 8 characters."),
        role: z.enum(USER_ROLES),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const username = input.username.trim().toLowerCase();
      const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists." });
      }
      const [{ id }] = await db
        .insert(users)
        .values({
          username,
          name: input.name,
          email: input.email || null,
          role: input.role,
          passwordHash: hashPassword(input.password),
        })
        .$returningId();
      return { id };
    }),

  updateUser: superAdminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255),
        email: z.string().email().optional().or(z.literal("")),
        role: z.enum(USER_ROLES),
        isActive: z.boolean(),
        newPassword: z.string().min(8).optional().or(z.literal("")),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.id === ctx.user.id && (!input.isActive || input.role !== "super_admin")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot deactivate or demote your own account.",
        });
      }
      await db
        .update(users)
        .set({
          name: input.name,
          email: input.email || null,
          role: input.role,
          isActive: input.isActive,
          ...(input.newPassword ? { passwordHash: hashPassword(input.newPassword) } : {}),
        })
        .where(eq(users.id, input.id));
      return { ok: true };
    }),

  /* ------------------------------ templates ------------------------------ */

  listTemplates: superAdminProcedure.query(async () => {
    const db = getDb();
    const templates = await db.select().from(evaluationTemplates).orderBy(evaluationTemplates.name);
    const criteria = await db
      .select()
      .from(evaluationCriteria)
      .orderBy(asc(evaluationCriteria.sortOrder));
    return templates.map((t) => ({
      ...t,
      criteria: criteria.filter((c) => c.templateId === t.id),
    }));
  }),

  createTemplate: superAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        criteria: z
          .array(
            z.object({
              name: z.string().min(1).max(255),
              description: z.string().max(2000).optional(),
              weight: z.number().positive().max(100).default(1),
              scaleMin: z.number().int().default(1),
              scaleMax: z.number().int().default(100),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const id = await db.transaction(async (tx) => {
        const [{ id: templateId }] = await tx
          .insert(evaluationTemplates)
          .values({ name: input.name, description: input.description || null })
          .$returningId();
        await tx.insert(evaluationCriteria).values(
          input.criteria.map((c, i) => ({
            templateId,
            name: c.name,
            description: c.description || null,
            weight: String(c.weight),
            scaleMin: c.scaleMin,
            scaleMax: c.scaleMax,
            sortOrder: i,
          })),
        );
        return templateId;
      });
      return { id };
    }),

  updateTemplate: superAdminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        isActive: z.boolean(),
        criteria: z
          .array(
            z.object({
              id: z.number().optional(),
              name: z.string().min(1).max(255),
              description: z.string().max(2000).optional(),
              weight: z.number().positive().max(100).default(1),
              scaleMin: z.number().int().default(1),
              scaleMax: z.number().int().default(100),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.transaction(async (tx) => {
        await tx
          .update(evaluationTemplates)
          .set({
            name: input.name,
            description: input.description || null,
            isActive: input.isActive,
          })
          .where(eq(evaluationTemplates.id, input.id));

        const existing = await tx
          .select()
          .from(evaluationCriteria)
          .where(eq(evaluationCriteria.templateId, input.id));
        const keepIds = new Set(input.criteria.filter((c) => c.id).map((c) => c.id!));
        for (const old of existing) {
          if (!keepIds.has(old.id)) {
            await tx.delete(evaluationCriteria).where(eq(evaluationCriteria.id, old.id));
          }
        }
        for (const [i, c] of input.criteria.entries()) {
          const values = {
            name: c.name,
            description: c.description || null,
            weight: String(c.weight),
            scaleMin: c.scaleMin,
            scaleMax: c.scaleMax,
            sortOrder: i,
          };
          if (c.id) {
            await tx.update(evaluationCriteria).set(values).where(eq(evaluationCriteria.id, c.id));
          } else {
            await tx.insert(evaluationCriteria).values({ ...values, templateId: input.id });
          }
        }
      });
      return { ok: true };
    }),

  /** Active templates for the Create Evaluation form (any internal user). */
  listActiveTemplates: authedProcedure.query(async () => {
    const db = getDb();
    return db
      .select()
      .from(evaluationTemplates)
      .where(eq(evaluationTemplates.isActive, true))
      .orderBy(evaluationTemplates.name);
  }),

  /* ------------------------------ grade bands ----------------------------- */

  listGradeBands: superAdminProcedure.query(async () => {
    return getDb().select().from(gradeBands).orderBy(asc(gradeBands.sortOrder));
  }),

  updateGradeBands: superAdminProcedure
    .input(
      z.object({
        bands: z
          .array(
            z.object({
              id: z.number().optional(),
              grade: z.string().min(1).max(8),
              minScore: z.number().min(0),
              maxScore: z.number().max(1000),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ input }) => {
      for (const b of input.bands) {
        if (b.minScore > b.maxScore) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Band ${b.grade}: min score cannot exceed max score.`,
          });
        }
      }
      const db = getDb();
      await db.transaction(async (tx) => {
        const existing = await tx.select().from(gradeBands);
        const keepIds = new Set(input.bands.filter((b) => b.id).map((b) => b.id!));
        for (const old of existing) {
          if (!keepIds.has(old.id)) await tx.delete(gradeBands).where(eq(gradeBands.id, old.id));
        }
        for (const [i, b] of input.bands.entries()) {
          const values = {
            grade: b.grade,
            minScore: String(b.minScore),
            maxScore: String(b.maxScore),
            sortOrder: i,
          };
          if (b.id) {
            await tx.update(gradeBands).set(values).where(eq(gradeBands.id, b.id));
          } else {
            await tx.insert(gradeBands).values(values);
          }
        }
      });
      return { ok: true };
    }),
});
