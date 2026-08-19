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
  const [shareUrl, setShareUrl] = useState("");
  const [criteria, setCriteria] = useState(["Communication", "Quality of work", "Responsiveness", "Professionalism"]);
  const [instructions, setInstructions] = useState("Please score the employee based on your direct experience.");
  const [newCriterion, setNewCriterion] = useState("");

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
        body: JSON.stringify({ employee_id: Number(employeeId), period, form_config: { criteria, instructions } }),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || "Unable to create evaluation.");
      setMessage(`Evaluation created successfully${value.evaluation?.id ? ` (ID ${value.evaluation.id})` : ""}.`);
      setShareUrl(value.public_url || "");
      setEmployeeId("");
    } catch (reason: any) { setError(reason.message || "Unable to create evaluation."); }
    finally { setSubmitting(false); }
  };

  const addCriterion = () => { const value = newCriterion.trim(); if (value && !criteria.includes(value)) { setCriteria([...criteria, value]); setNewCriterion(""); } };
  return <Page title="Create evaluation">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm text-slate-500">Start a client evaluation session for a specific employee.</p></div>
      <Link to="/evaluations/preview" className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Preview & customize form</Link>
    </div>
    <form onSubmit={submit} className="max-w-2xl rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">New evaluation session</h2>
      <p className="mt-1 text-sm text-slate-500">Use the ready-made performance template or customize the client form before creating it.</p>
      {loading && <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Loading employees…</p>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="mt-6 block text-sm font-medium">Employee
        <select required disabled={loading || employees.length === 0} value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="mt-2 w-full rounded-lg border p-3 disabled:cursor-not-allowed disabled:bg-slate-100">
          <option value="">{loading ? "Loading employees…" : employees.length ? "Select employee" : "No employees available"}</option>
          {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.department ? ` · ${employee.department}` : ""}</option>)}
        </select>
      </label>
      <div className="mt-6 rounded-lg border bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Standard performance template</h3><p className="mt-1 text-xs text-slate-500">These criteria will appear on the client form.</p></div><span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">Ready to use</span></div><div className="mt-4 space-y-2">{criteria.map((criterion, index) => <div key={criterion} className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><span>{index + 1}. {criterion}</span><button type="button" disabled={criteria.length <= 1} onClick={() => setCriteria(criteria.filter(item => item !== criterion))} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-30">Remove</button></div>)}</div><div className="mt-3 flex gap-2"><input value={newCriterion} onChange={event => setNewCriterion(event.target.value)} onKeyDown={event => event.key === "Enter" && (event.preventDefault(), addCriterion())} className="min-w-0 flex-1 rounded-md border p-2 text-sm" placeholder="Add criterion" /><button type="button" onClick={addCriterion} className="rounded-md border px-3 py-2 text-xs font-semibold">Add</button></div><label className="mt-4 block text-sm font-medium">Client instructions<textarea rows={2} value={instructions} onChange={event => setInstructions(event.target.value)} className="mt-2 w-full rounded-md border p-2.5 text-sm" /></label></div>
      <label className="mt-4 block text-sm font-medium">Evaluation period
        <input required value={period} onChange={e => setPeriod(e.target.value)} className="mt-2 w-full rounded-lg border p-3" placeholder="2026 Mid-year" />
      </label>
      <div className="mt-6 flex flex-wrap gap-3">
        <button disabled={submitting || loading || employees.length === 0} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Creating…" : "Create evaluation"}</button>
        <Link to="/evaluations" className="rounded-lg border px-4 py-2">Cancel</Link>
      </div>
      {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {shareUrl && <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40"><p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Client evaluation link</p><p className="mt-1 break-all text-xs text-indigo-700 dark:text-indigo-300">{shareUrl}</p><div className="mt-3 flex flex-wrap gap-2"><a href={shareUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">Preview form</a><button type="button" onClick={() => navigator.clipboard?.writeText(shareUrl)} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300">Copy link</button></div></div>}
    </form>
  </Page>;
}
