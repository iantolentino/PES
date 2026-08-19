import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./authRouter";
import { dashboardRouter } from "./dashboardRouter";
import { employeeRouter, clientRouter, departmentRouter } from "./employeeRouter";
import { evaluationRouter } from "./evaluationRouter";
import { approvalRouter } from "./approvalRouter";
import { adminRouter } from "./adminRouter";
import { auditRouter } from "./auditRouter";
import { publicEvalRouter } from "./publicEvalRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  dashboard: dashboardRouter,
  employees: employeeRouter,
  clients: clientRouter,
  departments: departmentRouter,
  evaluations: evaluationRouter,
  approvals: approvalRouter,
  admin: adminRouter,
  audit: auditRouter,
  publicEval: publicEvalRouter,
});

export type AppRouter = typeof appRouter;
