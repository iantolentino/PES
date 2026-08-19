import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function userFromRequest(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data.user ?? null;
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");

  if (request.method === "GET" && path === "health") return json({ ok: true, service: "pes-api" });

  if (request.method === "POST" && path === "auth/login") {
    const body = await request.json();
    const { data, error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
    if (error) return json({ error: error.message }, 401);
    return json({ session: data.session, user: data.user });
  }

  if (request.method === "POST" && path === "auth/register") {
    const body = await request.json();
    const { data, error } = await supabase.auth.signUp({ email: body.email, password: body.password, options: { data: { name: body.name ?? body.email, role: "manager" } } });
    if (error) return json({ error: error.message }, 400);
    return json({ session: data.session, user: data.user }, 201);
  }

  const user = await userFromRequest(request);
  if (!user) return json({ error: "Authentication required" }, 401);

  if (request.method === "GET" && path === "me") return json({ user });

  if (request.method === "GET" && path === "employees") {
    const { data, error } = await supabase.from("employees").select("*").order("name");
    return error ? json({ error: error.message }, 500) : json({ employees: data });
  }

  if (request.method === "POST" && path === "employees") {
    const body = await request.json();
    const { data, error } = await supabase.from("employees").insert({ name: body.name, position: body.position, department: body.department, manager_id: user.id }).select().single();
    return error ? json({ error: error.message }, 400) : json({ employee: data }, 201);
  }

  if (request.method === "GET" && path === "evaluations") {
    const { data, error } = await supabase.from("evaluation_sessions").select("*, employees(*)").order("created_at", { ascending: false });
    return error ? json({ error: error.message }, 500) : json({ evaluations: data });
  }

  if (request.method === "POST" && path === "evaluations") {
    const body = await request.json();
    const { data, error } = await supabase.from("evaluation_sessions").insert({ employee_id: body.employee_id, period: body.period ?? new Date().getFullYear().toString(), status: "draft", created_by: user.id }).select().single();
    return error ? json({ error: error.message }, 400) : json({ evaluation: data }, 201);
  }

  return json({ error: "Not found" }, 404);
}
