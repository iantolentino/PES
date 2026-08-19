import { useEffect, useState } from "react";
import { Link } from "react-router";
import Page from "./_Page";

export default function Evaluations() {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const token = localStorage.getItem("pes_access_token");
    fetch("/api/evaluations", { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.error || "Unable to load evaluations."); setEvaluations(value.evaluations || []); })
      .catch(reason => setError(reason.message || "Unable to load evaluations."))
      .finally(() => setLoading(false));
  }, []);
  return <Page title="Evaluations"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Live evaluation sessions created in the system.</p><Link to="/evaluations/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">New evaluation</Link></div>{error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 overflow-hidden rounded-xl border bg-white shadow-sm">{loading ? <p className="p-6 text-sm text-slate-500">Loading evaluations…</p> : evaluations.length === 0 ? <div className="p-6"><p className="font-medium">No evaluations created yet</p><p className="mt-1 text-sm text-slate-500">Create an evaluation session to see it here.</p></div> : <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">Employee</th><th className="p-4">Period</th><th className="p-4">Status</th><th className="p-4">Created</th><th className="p-4">Client form</th></tr></thead><tbody className="divide-y">{evaluations.map(item => <tr key={item.id}><td className="p-4 font-medium">{item.employees?.name || `Employee #${item.employee_id}`}</td><td className="p-4 text-slate-600">{item.period}</td><td className="p-4"><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{item.status || "draft"}</span></td><td className="p-4 text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString() : "—"}</td><td className="p-4">{item.public_token ? <a href={`/evaluation/${item.public_token}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-700 hover:underline">Preview / share</a> : <span className="text-xs text-slate-400">Unavailable</span>}</td></tr>)}</tbody></table>}</div></Page>;
}
