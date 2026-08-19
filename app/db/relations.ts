import { relations } from "drizzle-orm";
import {
  users,
  employees,
  departments,
  clients,
  evaluationTemplates,
  evaluationCriteria,
  evaluationSessions,
  evaluationTokens,
  evaluationResponses,
  evaluationResults,
  salaryRecommendations,
  approvals,
  auditLogs,
} from "./schema";

export const employeesRelations = relations(employees, ({ one }) => ({
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  manager: one(users, { fields: [employees.managerId], references: [users.id] }),
}));

export const evaluationCriteriaRelations = relations(evaluationCriteria, ({ one }) => ({
  template: one(evaluationTemplates, {
    fields: [evaluationCriteria.templateId],
    references: [evaluationTemplates.id],
  }),
}));

export const evaluationSessionsRelations = relations(
  evaluationSessions,
  ({ one, many }) => ({
    employee: one(employees, {
      fields: [evaluationSessions.employeeId],
      references: [employees.id],
    }),
    client: one(clients, {
      fields: [evaluationSessions.clientId],
      references: [clients.id],
    }),
    template: one(evaluationTemplates, {
      fields: [evaluationSessions.templateId],
      references: [evaluationTemplates.id],
    }),
    tokens: many(evaluationTokens),
    responses: many(evaluationResponses),
    result: one(evaluationResults, {
      fields: [evaluationSessions.id],
      references: [evaluationResults.sessionId],
    }),
    salary: one(salaryRecommendations, {
      fields: [evaluationSessions.id],
      references: [salaryRecommendations.sessionId],
    }),
    approvals: many(approvals),
  }),
);

export const evaluationTokensRelations = relations(evaluationTokens, ({ one }) => ({
  session: one(evaluationSessions, {
    fields: [evaluationTokens.sessionId],
    references: [evaluationSessions.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  session: one(evaluationSessions, {
    fields: [auditLogs.sessionId],
    references: [evaluationSessions.id],
  }),
}));
