import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authSessions, users } from "@db/schema";
import { AUDIT_ACTIONS, SESSION_TTL_DAYS } from "@contracts/constants";
import { createRouter, publicQuery } from "./middleware";
import { authedProcedure, clearSessionCookie, parseCookie, resolveUser, setSessionCookie } from "./guards";
import { getDb } from "./queries/connection";
import { verifyPassword, sessionExpiry } from "./services/authService";
import { generateSessionToken } from "./services/tokens";
import { writeAudit } from "./services/audit";
import { clientIpFrom, rateLimitOrThrow } from "./services/rateLimit";
import { SESSION_COOKIE } from "@contracts/constants";

export const authRouter = createRouter({
  login: publicQuery
    .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`login:${clientIpFrom(ctx.req)}`);
      const db = getDb();
      const user = await db.query.users.findFirst({
        where: eq(users.username, input.username.trim().toLowerCase()),
      });
      if (!user || !user.isActive || !verifyPassword(input.password, user.passwordHash)) {
        await writeAudit(db, {
          actorType: "system",
          actorLabel: input.username,
          action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
          ip: clientIpFrom(ctx.req),
        });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
      }
      const token = generateSessionToken();
      await db.insert(authSessions).values({
        token,
        userId: user.id,
        expiresAt: sessionExpiry(SESSION_TTL_DAYS),
        ip: clientIpFrom(ctx.req),
        userAgent: ctx.req.headers.get("user-agent")?.slice(0, 500) ?? null,
      });
      const secure = ctx.req.url.startsWith("https://");
      setSessionCookie(ctx.resHeaders, token, SESSION_TTL_DAYS * 86400, secure);
      await writeAudit(db, {
        actorType: "user",
        actorId: user.id,
        actorLabel: user.name,
        action: AUDIT_ACTIONS.USER_LOGIN,
        ip: clientIpFrom(ctx.req),
      });
      return { id: user.id, name: user.name, username: user.username, role: user.role };
    }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    const token = parseCookie(ctx.req, SESSION_COOKIE);
    if (token) {
      await getDb().delete(authSessions).where(eq(authSessions.token, token));
    }
    clearSessionCookie(ctx.resHeaders);
    return { ok: true };
  }),

  me: publicQuery.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.req);
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }),
});
