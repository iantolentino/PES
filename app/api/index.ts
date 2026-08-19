import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

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

async function audit(supabase: any, actorId: string, action: string, entityType: string, entityId: number | null, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from("audit_logs").insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata });
  if (error) throw error;
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

    const publicMatch = path.match(/^public-evaluations\/([^/]+)$/);
    if (publicMatch && req.method === "GET") {
      const { data, error } = await supabase.from("evaluation_sessions").select("id, period, status, public_employee_name, form_config, client_score, client_grade, submitted_at").eq("public_token", publicMatch[1]).maybeSingle();
      if (error) return send(res, { error: error.message }, 500);
      if (!data) return send(res, { error: "Evaluation link not found or expired." }, 404);
      return send(res, { evaluation: data });
    }

    if (publicMatch && req.method === "POST") {
      const input = await body(req) as { client_score: number; client_scores?: Record<string, number>; client_pct: number; client_comments?: string };
      const score = Number(input.client_score);
      const increase = Number(input.client_pct);
      if (!Number.isFinite(score) || score < 0 || score > 100 || !Number.isFinite(increase) || increase < 0) return send(res, { error: "Enter a valid score and salary increase percentage." }, 400);
      const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
      const { data, error } = await supabase.from("evaluation_sessions").update({ client_score: score, client_scores: input.client_scores || {}, client_grade: grade, client_pct: increase, client_comments: input.client_comments?.trim() || null, submitted_at: new Date().toISOString(), status: "manager_review" }).eq("public_token", publicMatch[1]).eq("status", "draft").is("submitted_at", null).select("id, period, status, public_employee_name, form_config, client_score, client_grade, client_pct, submitted_at").maybeSingle();
      if (error) return send(res, { error: error.message }, 400);
      if (!data) return send(res, { error: "This evaluation has already been submitted or the link is invalid." }, 409);
      return send(res, { evaluation: data });
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
      if (!error && data) await audit(supabase, auth.user.id, "employee_created", "employee", data.id, { name: data.name });
      return error ? send(res, { error: error.message }, 400) : send(res, { employee: data }, 201);
    }

    if (req.method === "GET" && path === "audit-logs") {
      const { data, error } = await supabase.from("audit_logs").select("*, profiles(name)").order("created_at", { ascending: false }).limit(100);
      return error ? send(res, { error: error.message }, 500) : send(res, { logs: data });
    }

    if (req.method === "GET" && path === "evaluations") {
      const { data, error } = await supabase.from("evaluation_sessions").select("*, employees(*)").order("created_at", { ascending: false });
      return error ? send(res, { error: error.message }, 500) : send(res, { evaluations: data });
    }

    const evaluationMatch = path.match(/^evaluations\/(\d+)$/);
    if (req.method === "GET" && evaluationMatch) {
      const { data, error } = await supabase.from("evaluation_sessions").select("*, employees(*)").eq("id", Number(evaluationMatch[1])).maybeSingle();
      if (error) return send(res, { error: error.message }, 500);
      return data ? send(res, { evaluation: data }) : send(res, { error: "Evaluation not found." }, 404);
    }

    if (req.method === "POST" && path === "evaluations") {
      const input = await body(req) as { employee_id: number; period?: string; form_config?: { criteria?: string[]; instructions?: string } };
      const publicToken = randomUUID().replaceAll("-", "");
      const { data: employee, error: employeeError } = await supabase.from("employees").select("name").eq("id", input.employee_id).single();
      if (employeeError || !employee) return send(res, { error: "Selected employee was not found." }, 400);
      const criteria = Array.isArray(input.form_config?.criteria) && input.form_config.criteria.length ? input.form_config.criteria.slice(0, 12).map(String) : ["Communication", "Quality of work", "Responsiveness", "Professionalism"];
      const formConfig = { criteria, instructions: String(input.form_config?.instructions || "Please score the employee based on your direct experience.").slice(0, 1000) };
      const { data, error } = await supabase.from("evaluation_sessions").insert({ employee_id: input.employee_id, period: input.period ?? String(new Date().getFullYear()), status: "draft", created_by: auth.user.id, public_token: publicToken, public_employee_name: employee.name, form_config: formConfig }).select().single();
      if (!error && data) await audit(supabase, auth.user.id, "evaluation_created", "evaluation", data.id, { employee_id: data.employee_id, period: data.period });
      return error ? send(res, { error: error.message }, 400) : send(res, { evaluation: data, public_url: `https://${req.headers.host || "pes-phi-eight.vercel.app"}/evaluation/${publicToken}` }, 201);
    }

    return send(res, { error: "Not found" }, 404);
  } catch (error) {
    return send(res, { error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
}
