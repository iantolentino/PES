import { z } from "zod";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  clients,
  departments,
  employeeClientAssignments,
  employees,
  evaluationResults,
  evaluationSessions,
  salaryRecommendations,
  users,
} from "@db/schema";
import { createRouter } from "./middleware";
import { authedProcedure, hrProcedure, managerProcedure } from "./guards";
import { getDb } from "./queries/connection";
import type { User } from "@db/schema";

function scopeCondition(user: User) {
  return user.role === "manager" ? eq(employees.managerId, user.id) : undefined;
}

async function assertEmployeeAccess(user: User, employeeId: number) {
  const db = getDb();
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });
  if (user.role === "manager" && emp.managerId !== user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This employee is not assigned to you." });
  }
  return emp;
}

export const employeeRouter = createRouter({
  list: authedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [scopeCondition(ctx.user)];
      if (input?.search) {
        conditions.push(
          or(like(employees.name, `%${input.search}%`), like(employees.position, `%${input.search}%`)),
        );
      }
      const rows = await db
        .select({
          employee: employees,
          departmentName: departments.name,
          managerName: users.name,
        })
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .leftJoin(users, eq(employees.managerId, users.id))
        .where(and(...conditions.filter(Boolean)))
        .orderBy(employees.name);

      // Last evaluation per employee (score + status)
      const ids = rows.map((r) => r.employee.id);
      const lastEvals = ids.length
        ? await db
            .select({
              session: evaluationSessions,
              score: evaluationResults.overallScore,
              grade: evaluationResults.grade,
            })
            .from(evaluationSessions)
            .leftJoin(evaluationResults, eq(evaluationResults.sessionId, evaluationSessions.id))
            .where(inArray(evaluationSessions.employeeId, ids))
            .orderBy(desc(evaluationSessions.createdAt))
        : [];
      const lastByEmployee = new Map<number, (typeof lastEvals)[number]>();
      for (const row of lastEvals) {
        if (!lastByEmployee.has(row.session.employeeId)) {
          lastByEmployee.set(row.session.employeeId, row);
        }
      }

      return rows.map((r) => ({
        ...r.employee,
        departmentName: r.departmentName,
        managerName: r.managerName,
        lastEvaluation: lastByEmployee.get(r.employee.id)
          ? {
              period: lastByEmployee.get(r.employee.id)!.session.period,
              status: lastByEmployee.get(r.employee.id)!.session.status,
              score: lastByEmployee.get(r.employee.id)!.score,
              grade: lastByEmployee.get(r.employee.id)!.grade,
            }
          : null,
      }));
    }),

  get: authedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const emp = await assertEmployeeAccess(ctx.user, input.id);
      const [dept] = emp.departmentId
        ? await db.select().from(departments).where(eq(departments.id, emp.departmentId))
        : [null];
      const [mgr] = emp.managerId
        ? await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(eq(users.id, emp.managerId))
        : [null];
      const assignments = await db
        .select({
          assignment: employeeClientAssignments,
          clientName: clients.name,
        })
        .from(employeeClientAssignments)
        .innerJoin(clients, eq(employeeClientAssignments.clientId, clients.id))
        .where(eq(employeeClientAssignments.employeeId, emp.id));

      const history = await db
        .select({
          session: evaluationSessions,
          clientName: clients.name,
          score: evaluationResults.overallScore,
          grade: evaluationResults.grade,
          clientPct: salaryRecommendations.clientPct,
          managerPct: salaryRecommendations.managerPct,
          finalPct: salaryRecommendations.finalPct,
        })
        .from(evaluationSessions)
        .innerJoin(clients, eq(evaluationSessions.clientId, clients.id))
        .leftJoin(evaluationResults, eq(evaluationResults.sessionId, evaluationSessions.id))
        .leftJoin(salaryRecommendations, eq(salaryRecommendations.sessionId, evaluationSessions.id))
        .where(eq(evaluationSessions.employeeId, emp.id))
        .orderBy(desc(evaluationSessions.createdAt));

      return {
        employee: emp,
        departmentName: dept?.name ?? null,
        managerName: mgr?.name ?? null,
        assignments: assignments.map((a) => ({
          id: a.assignment.id,
          clientId: a.assignment.clientId,
          clientName: a.clientName,
          project: a.assignment.project,
        })),
        history: history.map((h) => ({
          id: h.session.id,
          period: h.session.period,
          project: h.session.project,
          clientName: h.clientName,
          status: h.session.status,
          score: h.score,
          grade: h.grade,
          clientPct: h.clientPct,
          managerPct: h.managerPct,
          finalPct: h.finalPct,
          createdAt: h.session.createdAt,
        })),
      };
    }),

  create: hrProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        position: z.string().max(255).optional(),
        departmentId: z.number().optional().nullable(),
        managerId: z.number().optional().nullable(),
        email: z.string().email().optional().or(z.literal("")),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [{ id }] = await db
        .insert(employees)
        .values({
          name: input.name,
          position: input.position || null,
          departmentId: input.departmentId ?? null,
          managerId: input.managerId ?? null,
          email: input.email || null,
        })
        .$returningId();
      return { id };
    }),

  update: hrProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255),
        position: z.string().max(255).optional(),
        departmentId: z.number().optional().nullable(),
        managerId: z.number().optional().nullable(),
        email: z.string().email().optional().or(z.literal("")),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(employees)
        .set({
          name: input.name,
          position: input.position || null,
          departmentId: input.departmentId ?? null,
          managerId: input.managerId ?? null,
          email: input.email || null,
          isActive: input.isActive,
        })
        .where(eq(employees.id, input.id));
      return { ok: true };
    }),

  assignClient: hrProcedure
    .input(
      z.object({
        employeeId: z.number(),
        clientId: z.number(),
        project: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.query.employeeClientAssignments.findFirst({
        where: and(
          eq(employeeClientAssignments.employeeId, input.employeeId),
          eq(employeeClientAssignments.clientId, input.clientId),
          input.project
            ? eq(employeeClientAssignments.project, input.project)
            : sql`${employeeClientAssignments.project} IS NULL`,
        ),
      });
      if (existing) return { id: existing.id, existed: true };
      const [{ id }] = await db
        .insert(employeeClientAssignments)
        .values({
          employeeId: input.employeeId,
          clientId: input.clientId,
          project: input.project || null,
        })
        .$returningId();
      return { id, existed: false };
    }),

  /** Managers who can be assigned to employees (for dropdowns). */
  managers: managerProcedure.query(async () => {
    const db = getDb();
    return db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(inArray(users.role, ["manager", "hr", "super_admin"]), eq(users.isActive, true)))
      .orderBy(users.name);
  }),
});

export const clientRouter = createRouter({
  list: authedProcedure.query(async () => {
    return getDb().select().from(clients).orderBy(clients.name);
  }),

  create: hrProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        contactName: z.string().max(255).optional(),
        contactEmail: z.string().email().optional().or(z.literal("")),
      }),
    )
    .mutation(async ({ input }) => {
      const [{ id }] = await getDb()
        .insert(clients)
        .values({
          name: input.name,
          contactName: input.contactName || null,
          contactEmail: input.contactEmail || null,
        })
        .$returningId();
      return { id };
    }),

  update: hrProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255),
        contactName: z.string().max(255).optional(),
        contactEmail: z.string().email().optional().or(z.literal("")),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .update(clients)
        .set({
          name: input.name,
          contactName: input.contactName || null,
          contactEmail: input.contactEmail || null,
        })
        .where(eq(clients.id, input.id));
      return { ok: true };
    }),
});

export const departmentRouter = createRouter({
  list: authedProcedure.query(async () => {
    return getDb().select().from(departments).orderBy(departments.name);
  }),

  create: hrProcedure
    .input(z.object({ name: z.string().min(1).max(255) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.query.departments.findFirst({
        where: eq(departments.name, input.name),
      });
      if (existing) return { id: existing.id, existed: true };
      const [{ id }] = await db.insert(departments).values({ name: input.name }).$returningId();
      return { id, existed: false };
    }),
});
