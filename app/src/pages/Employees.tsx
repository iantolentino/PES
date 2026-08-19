import { useEffect, useState } from "react";
import { Link } from "react-router";
import Page from "./_Page";

type Employee = { id: number; name: string; position?: string; department?: string; status?: string };

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  const loadEmployees = async () => {
    const token = localStorage.getItem("pes_access_token");
    if (!token) { setError("Your session has expired. Please sign in again."); setLoading(false); return; }
    try {
      const response = await fetch("/api/employees", { headers: { Authorization: `Bearer ${token}` } });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || `Unable to load employees (${response.status})`);
      setEmployees(value.employees || []);
    } catch (reason: any) { setError(reason.message || "Unable to load employees."); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadEmployees(); }, []);

  const addEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); setMessage(""); setSaving(true);
    const token = localStorage.getItem("pes_access_token");
    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), position: position.trim(), department: department.trim() }),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || "Unable to add employee.");
      if (value.employee) setEmployees(current => [...current, value.employee].sort((a, b) => a.name.localeCompare(b.name)));
      setName(""); setPosition(""); setDepartment(""); setShowForm(false);
      setMessage("Employee added successfully. They are now available when creating an evaluation.");
    } catch (reason: any) { setError(reason.message || "Unable to add employee."); }
    finally { setSaving(false); }
  };

  return <Page title="Employees">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">Manage the employees who can be assigned to evaluation sessions.</p>
      <button type="button" onClick={() => setShowForm(value => !value)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{showForm ? "Close" : "Add employee"}</button>
    </div>
    {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {showForm && <form onSubmit={addEmployee} className="mt-5 max-w-2xl rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Add employee</h2>
      <p className="mt-1 text-sm text-slate-500">Required employee details are marked with an asterisk.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Full name *<input required value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-lg border p-3" placeholder="e.g. Jamie Rivera" /></label>
        <label className="text-sm font-medium">Position<input value={position} onChange={e => setPosition(e.target.value)} className="mt-2 w-full rounded-lg border p-3" placeholder="e.g. Web Developer" /></label>
        <label className="text-sm font-medium">Department<input value={department} onChange={e => setDepartment(e.target.value)} className="mt-2 w-full rounded-lg border p-3" placeholder="e.g. IT" /></label>
      </div>
      <button disabled={saving} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? "Adding…" : "Save employee"}</button>
    </form>}
    <div className="mt-5 overflow-hidden rounded-xl border bg-white shadow-sm">
      {loading ? <p className="p-6 text-sm text-slate-500">Loading employees…</p> : employees.length === 0 ? <div className="p-6"><p className="font-medium">No employees yet</p><p className="mt-1 text-sm text-slate-500">Add your first employee above before creating an evaluation.</p></div> : <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">Employee</th><th className="p-4">Position</th><th className="p-4">Department</th><th className="p-4">Status</th></tr></thead><tbody className="divide-y">{employees.map(employee => <tr key={employee.id}><td className="p-4"><Link className="font-medium text-indigo-700" to={`/employees/${employee.id}`}>{employee.name}</Link></td><td className="p-4 text-slate-600">{employee.position || "—"}</td><td className="p-4 text-slate-600">{employee.department || "—"}</td><td className="p-4"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{employee.status || "Active"}</span></td></tr>)}</tbody></table>}
    </div>
    <div className="mt-5"><Link to="/evaluations/new" className="text-sm font-semibold text-indigo-700 hover:underline">Create an evaluation from an employee →</Link></div>
  </Page>;
}
