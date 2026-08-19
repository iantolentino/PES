import { useEffect, useState } from "react";
import { Link } from "react-router";
import Page from "./_Page";

export default function CreateEvaluation() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("pes_access_token");
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setLoading(false);
      return;
    }
    fetch("/api/employees", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || `Unable to load employees (${response.status})`);
        setEmployees(value.employees || []);
      })
      .catch((reason) => setError(reason.message || "Unable to load employees."))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const token = localStorage.getItem("pes_access_token");
    if (!token) { setError("Your session has expired. Please sign in again."); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employee_id: Number(employeeId), period }),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || "Unable to create evaluation.");
      setMessage(`Evaluation created successfully${value.evaluation?.id ? ` (ID ${value.evaluation.id})` : ""}.`);
      setEmployeeId("");
    } catch (reason: any) { setError(reason.message || "Unable to create evaluation."); }
    finally { setSubmitting(false); }
  };

  return <Page title="Create evaluation">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm text-slate-500">Start a client evaluation session for a specific employee.</p></div>
      <Link to="/evaluations/preview" className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Preview & customize form</Link>
    </div>
    <form onSubmit={submit} className="max-w-2xl rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">New evaluation session</h2>
      <p className="mt-1 text-sm text-slate-500">The client will score the employee and enter the requested salary increase percentage freely.</p>
      {loading && <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Loading employees…</p>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="mt-6 block text-sm font-medium">Employee
        <select required disabled={loading || employees.length === 0} value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="mt-2 w-full rounded-lg border p-3 disabled:cursor-not-allowed disabled:bg-slate-100">
          <option value="">{loading ? "Loading employees…" : employees.length ? "Select employee" : "No employees available"}</option>
          {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.department ? ` · ${employee.department}` : ""}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-sm font-medium">Evaluation period
        <input required value={period} onChange={e => setPeriod(e.target.value)} className="mt-2 w-full rounded-lg border p-3" placeholder="2026 Mid-year" />
      </label>
      <div className="mt-6 flex flex-wrap gap-3">
        <button disabled={submitting || loading || employees.length === 0} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Creating…" : "Create evaluation"}</button>
        <Link to="/evaluations" className="rounded-lg border px-4 py-2">Cancel</Link>
      </div>
      {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    </form>
  </Page>;
}
