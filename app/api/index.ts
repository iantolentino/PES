import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";

type Request = IncomingMessage & { body?: unknown };
type Response = ServerResponse & { status?: (code: number) => Response; json?: (value: unknown) => void };

function send(res: ServerResponse, value: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
}

async function body(req: Request) {
  if (req.body) return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function ensureProfile(supabase: any, user: { id: string; email?: string; user_metadata?: Record<string, any> | null }) {
  await supabase.from("profiles").upsert({ id: user.id, name: user.user_metadata?.name ?? user.email ?? "User", role: user.user_metadata?.role ?? "manager" }, { onConflict: "id" });
}

export default async function handler(req: Request, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/^\/api\/?/, "");
    let supabase: any = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

    if (req.method === "GET" && path === "health") return send(res, { ok: true, service: "pes-api", database: Boolean(process.env.SUPABASE_URL) });

    if (req.method === "POST" && path === "auth/login") {
      const input = await body(req) as { email: string; password: string };
      const { data, error } = await supabase.auth.signInWithPassword(input);
      if (data.user) await ensureProfile(supabase, data.user);
      return error ? send(res, { error: error.message }, 401) : send(res, { session: data.session, user: data.user });
    }

    if (req.method === "POST" && path === "auth/register") {
      const input = await body(req) as { email: string; password: string; name?: string };
      const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password, options: { data: { name: input.name ?? input.email, role: "manager" } } });
      if (data.user) await ensureProfile(supabase, data.user);
      return error ? send(res, { error: error.message }, 400) : send(res, { session: data.session, user: data.user }, 201);
    }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return send(res, { error: "Authentication required" }, 401);

    // Pass the caller's JWT to PostgREST as well as auth.getUser(). Without
    // this, database queries run as anon and RLS rejects employee inserts.
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) return send(res, { error: "Invalid session" }, 401);
    await ensureProfile(supabase, auth.user);

    if (req.method === "GET" && path === "me") return send(res, { user: auth.user });

    if (req.method === "GET" && path === "employees") {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      return error ? send(res, { error: error.message }, 500) : send(res, { employees: data });
    }

    if (req.method === "POST" && path === "employees") {
      const input = await body(req) as { name: string; position?: string; department?: string };
      const { data, error } = await supabase.from("employees").insert({ ...input, manager_id: auth.user.id }).select().single();
      return error ? send(res, { error: error.message }, 400) : send(res, { employee: data }, 201);
    }

    if (req.method === "GET" && path === "evaluations") {
      const { data, error } = await supabase.from("evaluation_sessions").select("*, employees(*)").order("created_at", { ascending: false });
      return error ? send(res, { error: error.message }, 500) : send(res, { evaluations: data });
    }

    if (req.method === "POST" && path === "evaluations") {
      const input = await body(req) as { employee_id: number; period?: string };
      const { data, error } = await supabase.from("evaluation_sessions").insert({ employee_id: input.employee_id, period: input.period ?? String(new Date().getFullYear()), status: "draft", created_by: auth.user.id }).select().single();
      return error ? send(res, { error: error.message }, 400) : send(res, { evaluation: data }, 201);
    }

    return send(res, { error: "Not found" }, 404);
  } catch (error) {
    return send(res, { error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
}
