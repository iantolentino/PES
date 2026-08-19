import "dotenv/config";
import { getDb } from "../api/queries/connection";
import {
  users,
  departments,
  employees,
  clients,
  employeeClientAssignments,
  evaluationTemplates,
  evaluationCriteria,
  gradeBands,
} from "./schema";
import { hashPassword } from "../api/services/authService";

/**
 * Seeds the initial dataset: accounts, org structure, default template
 * (7 criteria, 1–100 scale) and default A–F grade bands.
 *
 * Default credentials (change after first login):
 *   admin / Admin@12345     (Super Admin)
 *   hr.smith / Hr@12345     (HR / Department Head)
 *   manager.jones / Manager@12345
 *   manager.lee / Manager@12345
 */

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  /* users */
  const seedUsers = [
    { username: "admin", name: "System Administrator", role: "super_admin" as const, password: "Admin@12345", email: "admin@company.com" },
    { username: "hr.smith", name: "Sarah Smith", role: "hr" as const, password: "Hr@12345", email: "hr@company.com" },
    { username: "manager.jones", name: "Michael Jones", role: "manager" as const, password: "Manager@12345", email: "mjones@company.com" },
    { username: "manager.lee", name: "Laura Lee", role: "manager" as const, password: "Manager@12345", email: "llee@company.com" },
  ];
  const userIds: Record<string, number> = {};
  for (const u of seedUsers) {
    const existing = await db.query.users.findFirst({
      where: (t, { eq }) => eq(t.username, u.username),
    });
    if (existing) {
      userIds[u.username] = existing.id;
      continue;
    }
    const [{ id }] = await db
      .insert(users)
      .values({
        username: u.username,
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: hashPassword(u.password),
      })
      .$returningId();
    userIds[u.username] = id;
  }
  console.log("users:", userIds);

  /* departments */
  const deptNames = ["Engineering", "Design", "Customer Success", "Operations"];
  const deptIds: Record<string, number> = {};
  for (const name of deptNames) {
    const existing = await db.query.departments.findFirst({
      where: (t, { eq }) => eq(t.name, name),
    });
    if (existing) {
      deptIds[name] = existing.id;
      continue;
    }
    const [{ id }] = await db.insert(departments).values({ name }).$returningId();
    deptIds[name] = id;
  }

  /* employees */
  const seedEmployees = [
    { name: "Alice Chen", position: "Senior Developer", department: "Engineering", manager: "manager.jones", email: "achen@company.com" },
    { name: "Brian Patel", position: "Frontend Developer", department: "Engineering", manager: "manager.jones", email: "bpatel@company.com" },
    { name: "Carla Gomez", position: "UX Designer", department: "Design", manager: "manager.lee", email: "cgomez@company.com" },
    { name: "David Kim", position: "Account Manager", department: "Customer Success", manager: "manager.lee", email: "dkim@company.com" },
  ];
  const empIds: Record<string, number> = {};
  for (const e of seedEmployees) {
    const existing = await db.query.employees.findFirst({
      where: (t, { eq }) => eq(t.name, e.name),
    });
    if (existing) {
      empIds[e.name] = existing.id;
      continue;
    }
    const [{ id }] = await db
      .insert(employees)
      .values({
        name: e.name,
        position: e.position,
        departmentId: deptIds[e.department],
        managerId: userIds[e.manager],
        email: e.email,
      })
      .$returningId();
    empIds[e.name] = id;
  }

  /* clients */
  const seedClients = [
    { name: "Acme Corporation", contactName: "John Acme", contactEmail: "john@acme.example" },
    { name: "Globex Ltd", contactName: "Mary Globex", contactEmail: "mary@globex.example" },
    { name: "Initech", contactName: "Peter Initech", contactEmail: "peter@initech.example" },
  ];
  const clientIds: Record<string, number> = {};
  for (const c of seedClients) {
    const existing = await db.query.clients.findFirst({
      where: (t, { eq }) => eq(t.name, c.name),
    });
    if (existing) {
      clientIds[c.name] = existing.id;
      continue;
    }
    const [{ id }] = await db.insert(clients).values(c).$returningId();
    clientIds[c.name] = id;
  }

  /* assignments */
  const assignments = [
    { employee: "Alice Chen", client: "Acme Corporation", project: "Platform Migration" },
    { employee: "Alice Chen", client: "Globex Ltd", project: null },
    { employee: "Brian Patel", client: "Acme Corporation", project: "Platform Migration" },
    { employee: "Carla Gomez", client: "Initech", project: "Brand Refresh" },
    { employee: "David Kim", client: "Globex Ltd", project: null },
  ];
  for (const a of assignments) {
    const existing = await db.query.employeeClientAssignments.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.employeeId, empIds[a.employee]), eq(t.clientId, clientIds[a.client])),
    });
    if (existing) continue;
    await db.insert(employeeClientAssignments).values({
      employeeId: empIds[a.employee],
      clientId: clientIds[a.client],
      project: a.project,
    });
  }

  /* default template + criteria */
  let template = await db.query.evaluationTemplates.findFirst({
    where: (t, { eq }) => eq(t.name, "Standard Client Evaluation"),
  });
  if (!template) {
    const [{ id }] = await db
      .insert(evaluationTemplates)
      .values({
        name: "Standard Client Evaluation",
        description: "Default 7-criterion client evaluation, 1–100 scale per criterion.",
      })
      .$returningId();
    const criteriaNames = [
      "Quality of Work",
      "Communication",
      "Responsiveness",
      "Professionalism",
      "Reliability",
      "Productivity",
      "Overall Performance",
    ];
    await db.insert(evaluationCriteria).values(
      criteriaNames.map((name, i) => ({
        templateId: id,
        name,
        weight: "1.00",
        scaleMin: 1,
        scaleMax: 100,
        sortOrder: i,
      })),
    );
  }

  /* grade bands */
  const bands = [
    { grade: "A", minScore: "90.00", maxScore: "100.00", sortOrder: 5 },
    { grade: "B", minScore: "80.00", maxScore: "89.99", sortOrder: 4 },
    { grade: "C", minScore: "70.00", maxScore: "79.99", sortOrder: 3 },
    { grade: "D", minScore: "60.00", maxScore: "69.99", sortOrder: 2 },
    { grade: "F", minScore: "0.00", maxScore: "59.99", sortOrder: 1 },
  ];
  for (const b of bands) {
    const existing = await db.query.gradeBands.findFirst({
      where: (t, { eq }) => eq(t.grade, b.grade),
    });
    if (existing) continue;
    await db.insert(gradeBands).values(b);
  }

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
