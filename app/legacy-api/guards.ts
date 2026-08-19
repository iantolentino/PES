import { TRPCError } from "@trpc/server";
import { eq, and, gt } from "drizzle-orm";
import { authSessions, users, type User } from "@db/schema";
import { SESSION_COOKIE } from "@contracts/constants";
import { publicQuery } from "./middleware";
import { getDb } from "./queries/connection";

/**
 * Authentication & authorization guards.
 *
 * The context object is generated infrastructure and intentionally untouched;
 * session resolution happens here, reading the cookie straight from the request.
 */

export function parseCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function resolveUser(req: Request): Promise<User | null> {
  const token = parseCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const db = getDb();
  const rows = await db
    .select({ user: users, session: authSessions })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.user.isActive) return null;
  return row.user;
}

/** Base authenticated procedure — attaches ctx.user or throws 401. */
export const authedProcedure = publicQuery.use(async ({ ctx, next }) => {
  const user = await resolveUser(ctx.req);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated." });
  return next({ ctx: { ...ctx, user } });
});

/** Role-restricted procedure factory. */
export function requireRole(...roles: User["role"][]) {
  return authedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions." });
    }
    return next({ ctx });
  });
}

export const superAdminProcedure = requireRole("super_admin");
export const hrProcedure = requireRole("hr", "super_admin");
export const managerProcedure = requireRole("manager", "hr", "super_admin");

/**
 * Manager data-scoping helper: managers only touch employees assigned to them.
 * HR and Super Admin are organization-wide.
 */
export function assertEmployeeScope(user: User, employeeManagerId: number | null): void {
  if (user.role === "manager" && employeeManagerId !== user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only access employees assigned to you.",
    });
  }
}

export function setSessionCookie(resHeaders: Headers, token: string, maxAgeSec: number, secure: boolean): void {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) attrs.push("Secure");
  resHeaders.append("Set-Cookie", attrs.join("; "));
}

export function clearSessionCookie(resHeaders: Headers): void {
  resHeaders.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}
