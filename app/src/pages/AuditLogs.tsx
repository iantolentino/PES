import { useEffect, useState } from "react";
import Page from "./_Page";

export default function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const token = localStorage.getItem("pes_access_token");
    fetch("/api/audit-logs", { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.error || "Unable to load audit logs."); setLogs(value.logs || []); })
      .catch(reason => setError(reason.message || "Unable to load audit logs."))
      .finally(() => setLoading(false));
  }, []);
  return <Page title="Audit logs"><p className="text-sm text-slate-500">A record of employee and evaluation activity.</p>{error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 overflow-hidden rounded-xl border bg-white shadow-sm">{loading ? <p className="p-6 text-sm text-slate-500">Loading audit logs…</p> : logs.length === 0 ? <p className="p-6 text-sm text-slate-500">No audit activity yet.</p> : <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">Action</th><th className="p-4">Entity</th><th className="p-4">Actor</th><th className="p-4">Date</th></tr></thead><tbody className="divide-y">{logs.map(log => <tr key={log.id}><td className="p-4 font-medium">{log.action.replaceAll("_", " ")}</td><td className="p-4 text-slate-600">{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}</td><td className="p-4 text-slate-600">{log.profiles?.name || "Current user"}</td><td className="p-4 text-slate-500">{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</td></tr>)}</tbody></table>}</div></Page>;
}
