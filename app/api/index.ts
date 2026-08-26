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

function gradeForScore(score: number) { return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F"; }
function isExpired(item: any) { return Boolean(item.expires_at && new Date(item.expires_at).getTime() < Date.now() && !item.submitted_at); }
const defaultFields = ["Communication", "Quality of work", "Responsiveness", "Professionalism"].map((label, index) => ({ id: `criterion-${index + 1}`, label, type: "rating", required: true }));
function normaliseFields(input: any) {
  const fields = Array.isArray(input?.fields) ? input.fields : (Array.isArray(input?.criteria) ? input.criteria : defaultFields.map(field => field.label)).map((label: string, index: number) => ({ id: `criterion-${index + 1}`, label, type: "rating", required: true }));
  return fields.filter((field: any) => field && String(field.label || "").trim()).slice(0, 20).map((field: any, index: number) => ({ id: String(field.id || `field-${index + 1}`), label: String(field.label).trim().slice(0, 120), type: ["rating", "text", "textarea", "select"].includes(field.type) ? field.type : "text", required: Boolean(field.required), options: Array.isArray(field.options) ? field.options.map(String).slice(0, 20) : [] }));
}
function normaliseFormConfig(input: any) { const fields = normaliseFields(input); return { fields, criteria: fields.filter((field: any) => field.type === "rating").map((field: any) => field.label), instructions: String(input?.instructions || "Please score the employee based on your direct experience.").slice(0, 1000), scoringType: input?.scoringType === "overall" ? "overall" : "criteria_average" }; }

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
      const { data, error } = await supabase.from("evaluation_sessions").select("id, period, status, public_employee_name, public_employee_position, form_config, client_score, client_grade, submitted_at, expires_at").eq("public_token", publicMatch[1]).maybeSingle();
      if (error) return send(res, { error: error.message }, 500);
      if (!data) return send(res, { error: "Evaluation link not found or expired." }, 404);
      if (isExpired(data)) return send(res, { error: "This evaluation link has expired." }, 410);
      return send(res, { evaluation: data });
    }

    if (publicMatch && req.method === "POST") {
      const input = await body(req) as { client_score: number; client_scores?: Record<string, number>; client_responses?: Record<string, unknown>; client_pct: number; client_name?: string; client_company?: string; client_email?: string; client_comments?: string };
      const score = Number(input.client_score);
      const increase = Number(input.client_pct);
      if (!Number.isFinite(score) || score < 0 || score > 100 || !Number.isFinite(increase) || increase < 0) return send(res, { error: "Enter a valid score and salary increase percentage." }, 400);
      const { data: current } = await supabase.from("evaluation_sessions").select("expires_at, form_config").eq("public_token", publicMatch[1]).maybeSingle();
      if (isExpired(current)) return send(res, { error: "This evaluation link has expired." }, 410);
      const fields = normaliseFields(current?.form_config); const responses = input.client_responses || {};
      const missing = fields.find((field: any) => field.required && !String(responses[field.id] ?? "").trim());
      if (missing) return send(res, { error: `Please complete: ${missing.label}` }, 400);
      const grade = gradeForScore(score);
      const { data, error } = await supabase.from("evaluation_sessions").update({ client_score: score, client_scores: input.client_scores || {}, client_responses: responses, client_grade: grade, client_pct: increase, client_name: input.client_name?.trim() || null, client_company: input.client_company?.trim() || null, client_email: input.client_email?.trim() || null, client_comments: input.client_comments?.trim() || null, submitted_at: new Date().toISOString(), status: "manager_review" }).eq("public_token", publicMatch[1]).eq("status", "draft").is("submitted_at", null).select("id, period, status, public_employee_name, public_employee_position, form_config, client_score, client_grade, client_pct, client_name, client_company, client_email, client_responses, submitted_at").maybeSingle();
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

    if (req.method === "PATCH" && path.match(/^employees\/\d+$/)) {
      const employeeId = Number(path.split("/")[1]); const input = await body(req) as { name?: string; position?: string; department?: string; archived_at?: string | null };
      if (!input.name?.trim()) return send(res, { error: "Employee name is required." }, 400);
      const { data, error } = await supabase.from("employees").update({ name: input.name.trim(), position: input.position?.trim() || null, department: input.department?.trim() || null, archived_at: input.archived_at || null }).eq("id", employeeId).select().maybeSingle();
      if (!error && data) await audit(supabase, auth.user.id, data.archived_at ? "employee_archived" : "employee_updated", "employee", employeeId, { name: data.name });
      return error ? send(res, { error: error.message }, 400) : data ? send(res, { employee: data }) : send(res, { error: "Employee not found." }, 404);
    }

    if (req.method === "POST" && path === "employees") {
      const input = await body(req) as { name: string; position?: string; department?: string };
      const { data, error } = await supabase.from("employees").insert({ ...input, manager_id: auth.user.id }).select().single();
      if (!error && data) await audit(supabase, auth.user.id, "employee_created", "employee", data.id, { name: data.name });
      return error ? send(res, { error: error.message }, 400) : send(res, { employee: data }, 201);
    }
    if (req.method === "POST" && path === "employees/bulk") {
      const input = await body(req) as { employees?: Array<{ name: string; position?: string; department?: string }> };
      const rows = (input.employees || []).filter(item => item.name?.trim()).slice(0, 500).map(item => ({ name: item.name.trim(), position: item.position?.trim() || null, department: item.department?.trim() || null, manager_id: auth.user.id }));
      if (!rows.length) return send(res, { error: "Add at least one employee." }, 400);
      const { data, error } = await supabase.from("employees").insert(rows).select();
      if (error) return send(res, { error: error.message }, 400);
      await audit(supabase, auth.user.id, "employees_bulk_imported", "employee", null, { count: data?.length || 0 });
      return send(res, { employees: data }, 201);
    }

    if (req.method === "GET" && path === "audit-logs") {
      const action = url.searchParams.get("action");
      let query = supabase.from("audit_logs").select("*, profiles(name)").order("created_at", { ascending: false }).limit(250);
      if (action) query = query.eq("action", action);
      const { data, error } = await query;
      return error ? send(res, { error: error.message }, 500) : send(res, { logs: data });
    }

    if (req.method === "GET" && path === "settings") {
      const { data, error } = await supabase.from("user_settings").select("notifications_enabled").eq("user_id", auth.user.id).maybeSingle();
      return error ? send(res, { error: error.message }, 500) : send(res, { settings: data || { notifications_enabled: true } });
    }
    if (req.method === "PATCH" && path === "settings") {
      const input = await body(req) as { notifications_enabled?: boolean };
      const { data, error } = await supabase.from("user_settings").upsert({ user_id: auth.user.id, notifications_enabled: Boolean(input.notifications_enabled), updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select().single();
      return error ? send(res, { error: error.message }, 400) : send(res, { settings: data });
    }

    if (req.method === "GET" && path === "templates") {
      const { data, error } = await supabase.from("evaluation_templates").select("*").order("created_at", { ascending: false });
      return error ? send(res, { error: error.message }, 500) : send(res, { templates: data });
    }
    if (req.method === "POST" && path === "templates") {
      const input = await body(req) as { name: string; description?: string; form_config: unknown };
      if (!input.name?.trim()) return send(res, { error: "Template name is required." }, 400);
      const { data, error } = await supabase.from("evaluation_templates").insert({ name: input.name.trim(), description: input.description?.trim() || null, form_config: input.form_config || {}, created_by: auth.user.id }).select().single();
      return error ? send(res, { error: error.message }, 400) : send(res, { template: data }, 201);
    }

    if (req.method === "GET" && path === "forms") {
      const { data, error } = await supabase.from("evaluation_forms").select("*").is("archived_at", null).order("created_at", { ascending: false });
      return error ? send(res, { error: error.message }, 500) : send(res, { forms: data });
    }
    if (req.method === "POST" && path === "forms") {
      const input = await body(req) as { name: string; description?: string; fields?: unknown[] };
      const fields = normaliseFields({ fields: input.fields });
      if (!input.name?.trim() || !fields.length) return send(res, { error: "Form name and at least one field are required." }, 400);
      const { data, error } = await supabase.from("evaluation_forms").insert({ name: input.name.trim(), description: input.description?.trim() || null, fields, created_by: auth.user.id }).select().single();
      return error ? send(res, { error: error.message }, 400) : send(res, { form: data }, 201);
    }
    const formMatch = path.match(/^forms\/(\d+)$/);
    if (req.method === "PATCH" && formMatch) {
      const input = await body(req) as { name?: string; description?: string; fields?: unknown[]; archived?: boolean };
      const update: Record<string, unknown> = {}; if (input.name?.trim()) update.name = input.name.trim(); if (input.description !== undefined) update.description = input.description?.trim() || null; if (input.fields) update.fields = normaliseFields({ fields: input.fields }); if (input.archived !== undefined) update.archived_at = input.archived ? new Date().toISOString() : null;
      const { data, error } = await supabase.from("evaluation_forms").update(update).eq("id", Number(formMatch[1])).select().maybeSingle(); return error ? send(res, { error: error.message }, 400) : data ? send(res, { form: data }) : send(res, { error: "Form not found." }, 404);
    }

    if (req.method === "GET" && path === "evaluations") {
      const { data, error } = await supabase.from("evaluation_sessions").select("*, employees(*)").order("created_at", { ascending: false });
      if (!error && data?.length) { const links = await supabase.from("evaluation_links").select("*, profiles(name)").in("evaluation_id", data.map((item: any) => item.id)).order("created_at", { ascending: false }); if (!links.error) data.forEach((item: any) => { item.links = (links.data || []).filter((link: any) => link.evaluation_id === item.id); }); }
      return error ? send(res, { error: error.message }, 500) : send(res, { evaluations: data });
    }

    const evaluationMatch = path.match(/^evaluations\/(\d+)$/);
    const decisionMatch = path.match(/^evaluations\/(\d+)\/decision$/);
    const archiveEvaluationMatch = path.match(/^evaluations\/(\d+)\/archive$/);
    if (req.method === "GET" && evaluationMatch) {
      const { data, error } = await supabase.from("evaluation_sessions").select("*, employees(*)").eq("id", Number(evaluationMatch[1])).maybeSingle();
      if (error) return send(res, { error: error.message }, 500);
      if (data) { const links = await supabase.from("evaluation_links").select("*, profiles(name)").eq("evaluation_id", data.id).order("created_at", { ascending: false }); if (!links.error) data.links = links.data || []; }
      return data ? send(res, { evaluation: data }) : send(res, { error: "Evaluation not found." }, 404);
    }

    if (req.method === "PATCH" && evaluationMatch) {
      const input = await body(req) as { form_config?: { fields?: unknown[]; criteria?: string[]; instructions?: string; scoringType?: string }; expires_at?: string; client_name?: string; client_company?: string; client_email?: string };
      const formConfig = normaliseFormConfig(input.form_config); if (!formConfig.fields.length) return send(res, { error: "Add at least one evaluation field." }, 400);
      const { data, error } = await supabase.from("evaluation_sessions").update({ form_config: formConfig, expires_at: input.expires_at || null, client_name: input.client_name?.trim() || null, client_company: input.client_company?.trim() || null, client_email: input.client_email?.trim() || null }).eq("id", Number(evaluationMatch[1])).eq("status", "draft").select("*, employees(*)").maybeSingle();
      if (error) return send(res, { error: error.message }, 400);
      if (!data) return send(res, { error: "Only draft evaluations can be edited." }, 409);
      await audit(supabase, auth.user.id, "evaluation_form_updated", "evaluation", data.id, { fields: formConfig.fields });
      return send(res, { evaluation: data });
    }

    if (req.method === "POST" && archiveEvaluationMatch) {
      const id = Number(archiveEvaluationMatch[1]); const input = await body(req) as { archived?: boolean }; const { data, error } = await supabase.from("evaluation_sessions").update({ archived_at: input.archived === false ? null : new Date().toISOString(), status: input.archived === false ? "draft" : "archived" }).eq("id", id).select().maybeSingle();
      if (error) return send(res, { error: error.message }, 400); if (!data) return send(res, { error: "Evaluation not found." }, 404); await audit(supabase, auth.user.id, input.archived === false ? "evaluation_restored" : "evaluation_archived", "evaluation", id); return send(res, { evaluation: data });
    }

    if (req.method === "POST" && path === "evaluations") {
      const input = await body(req) as { employee_id: number; form_id?: number; period?: string; expires_at?: string; max_submissions?: number; client_name?: string; client_company?: string; client_email?: string; form_config?: { fields?: unknown[]; criteria?: string[]; instructions?: string; scoringType?: string } };
      const publicToken = randomUUID().replaceAll("-", "");
      const { data: employee, error: employeeError } = await supabase.from("employees").select("name, position").eq("id", input.employee_id).is("archived_at", null).single();
      if (employeeError || !employee) return send(res, { error: "Selected employee was not found." }, 400);
      const period = input.period ?? String(new Date().getFullYear()); const formId = Number(input.form_id) || null; let duplicateQuery = supabase.from("evaluation_sessions").select("id").eq("employee_id", input.employee_id).eq("period", period).is("archived_at", null).not("status", "in", "(rejected,archived)"); duplicateQuery = formId ? duplicateQuery.eq("form_id", formId) : duplicateQuery.is("form_id", null); const duplicate = await duplicateQuery.limit(1);
      if (!duplicate.error && duplicate.data?.length) return send(res, { error: "An active evaluation already exists for this employee and period." }, 409);
      let selectedForm: any = null; if (formId) { const formResult = await supabase.from("evaluation_forms").select("id, name, fields").eq("id", formId).is("archived_at", null).maybeSingle(); if (formResult.error || !formResult.data) return send(res, { error: "Selected evaluation form was not found." }, 400); selectedForm = formResult.data; }
      const formConfig = normaliseFormConfig(selectedForm ? { ...input.form_config, fields: selectedForm.fields } : input.form_config); if (!formConfig.fields.length) return send(res, { error: "Add at least one evaluation field." }, 400);
      const { data, error } = await supabase.from("evaluation_sessions").insert({ employee_id: input.employee_id, form_id: formId, form_name: selectedForm?.name || null, period, status: "draft", created_by: auth.user.id, public_token: publicToken, public_employee_name: employee.name, public_employee_position: employee.position, form_config: formConfig, expires_at: input.expires_at || null, client_name: input.client_name?.trim() || null, client_company: input.client_company?.trim() || null, client_email: input.client_email?.trim() || null }).select().single();
      if (!error && data) await audit(supabase, auth.user.id, "evaluation_created", "evaluation", data.id, { employee_id: data.employee_id, period: data.period });
      if (!error && data) { const link = await supabase.from("evaluation_links").insert({ evaluation_id: data.id, token: publicToken, expires_at: input.expires_at || null, max_submissions: Math.max(1, Number(input.max_submissions || 1)), created_by: auth.user.id }).select().single(); if (link.error) return send(res, { error: link.error.message }, 400); }
      return error ? send(res, { error: error.message }, 400) : send(res, { evaluation: data, public_url: `https://${req.headers.host || "pes-phi-eight.vercel.app"}/evaluation/${publicToken}` }, 201);
    }

    const regenerationMatch = path.match(/^evaluations\/(\d+)\/regenerate-link$/);
    if (req.method === "POST" && regenerationMatch) {
      const id = Number(regenerationMatch[1]); const { data: current, error: currentError } = await supabase.from("evaluation_sessions").select("*").eq("id", id).maybeSingle();
      if (currentError || !current) return send(res, { error: "Evaluation not found." }, 404);
      if (current.submitted_at || current.client_score != null) return send(res, { error: "Submitted evaluations cannot generate another link." }, 409);
      const newToken = randomUUID().replaceAll("-", ""); const input = await body(req) as { expires_at?: string; max_submissions?: number }; const link = await supabase.from("evaluation_links").insert({ evaluation_id: id, token: newToken, expires_at: input.expires_at || null, max_submissions: Math.max(1, Number(input.max_submissions || 1)), created_by: auth.user.id }).select().single();
      if (link.error) return send(res, { error: link.error.message }, 400); const { data, error } = await supabase.from("evaluation_sessions").update({ public_token: newToken, expires_at: input.expires_at || null }).eq("id", id).select().single(); if (error) return send(res, { error: error.message }, 400); await audit(supabase, auth.user.id, "token_regenerated", "evaluation", id, { link_id: link.data.id }); return send(res, { evaluation: data, public_url: `https://${req.headers.host || "pes-phi-eight.vercel.app"}/evaluation/${newToken}` });
    }

    if (req.method === "POST" && decisionMatch) {
      const input = await body(req) as { stage: "manager" | "hr"; decision: "approve" | "reject" | "adjust"; percentage?: number; comments?: string };
      const id = Number(decisionMatch[1]);
      if (!["manager", "hr"].includes(input.stage) || !["approve", "reject", "adjust"].includes(input.decision)) return send(res, { error: "Invalid approval decision." }, 400);
      const { data: current } = await supabase.from("evaluation_sessions").select("*").eq("id", id).maybeSingle();
      if (!current) return send(res, { error: "Evaluation not found." }, 404);
      const expected = input.stage === "manager" ? "manager_review" : "hr_review";
      if (current.status !== expected) return send(res, { error: `This evaluation is not waiting for ${input.stage} review.` }, 409);
      const pct = input.decision === "adjust" ? Number(input.percentage) : Number(current.manager_adjusted_pct ?? current.client_pct);
      if (!Number.isFinite(pct) || pct < 0) return send(res, { error: "Enter a valid increase percentage." }, 400);
      const nextStatus = input.decision === "reject" ? "rejected" : input.stage === "manager" ? "hr_review" : "finalized";
      const update = input.stage === "manager" ? { manager_decision: input.decision, manager_adjusted_pct: pct, manager_comments: input.comments?.trim() || null, manager_reviewed_at: new Date().toISOString(), status: nextStatus } : { hr_decision: input.decision, hr_adjusted_pct: pct, hr_comments: input.comments?.trim() || null, hr_reviewed_at: new Date().toISOString(), final_increase_pct: pct, finalized_at: nextStatus === "finalized" ? new Date().toISOString() : null, status: nextStatus };
      const { data, error } = await supabase.from("evaluation_sessions").update(update).eq("id", id).select("*, employees(*)").single();
      if (error) return send(res, { error: error.message }, 400);
      await audit(supabase, auth.user.id, `${input.stage}_${input.decision}`, "evaluation", id, { percentage: pct, comments: input.comments || null });
      return send(res, { evaluation: data });
    }

    return send(res, { error: "Not found" }, 404);
  } catch (error) {
    return send(res, { error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
}
