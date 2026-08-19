import React from "react";
import { Link, NavLink } from "react-router";
import { ClipboardCheck, FileClock, LayoutDashboard, Moon, Settings2, Sun, Users, type LucideIcon } from "lucide-react";

const links: [string, string, LucideIcon][] = [["/", "Dashboard", LayoutDashboard], ["/employees", "Employees", Users], ["/evaluations", "Evaluations", ClipboardCheck], ["/clients", "Clients", Users], ["/departments", "Departments", Settings2], ["/audit", "Audit logs", FileClock]];

function ThemeSwitch({ dark, onToggle, mobile = false }: { dark: boolean; onToggle: () => void; mobile?: boolean }) {
  return <button type="button" onClick={onToggle} role="switch" aria-checked={dark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Switch to light mode" : "Switch to dark mode"} className="flex items-center gap-3 rounded-xl border p-2 text-left transition-colors dark:border-slate-700">
    <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${dark ? "bg-slate-700" : "bg-slate-200"}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${dark ? "translate-x-5" : "translate-x-0"}`}>{dark ? <Moon size={12} className="text-slate-700" aria-hidden="true" /> : <Sun size={12} className="text-amber-500" aria-hidden="true" />}</span>
    </span>
  </button>;
}

export default function Page({ title, children }: { title: string; children?: React.ReactNode }) {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const saved = localStorage.getItem("pes_theme");
    const enabled = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(enabled);
    document.documentElement.classList.toggle("dark", enabled);
  }, []);
  const toggleTheme = () => { const enabled = !dark; setDark(enabled); localStorage.setItem("pes_theme", enabled ? "dark" : "light"); document.documentElement.classList.toggle("dark", enabled); };
  return <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white p-6 dark:border-slate-800 dark:bg-slate-900 md:block">
      <Link to="/" className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">PES<span className="text-indigo-600">.</span></Link>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Performance Evaluation System</p>
      <nav className="mt-10 space-y-1">
        {links.map(([href, label, Icon]) => <NavLink key={href} to={href} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? "bg-slate-900 font-semibold text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}><Icon size={17} strokeWidth={1.8} aria-hidden="true" />{label}</NavLink>)}
      </nav>
      <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between gap-3 border-t pt-5 dark:border-slate-800"><button onClick={() => { localStorage.removeItem("pes_access_token"); window.location.href = "/login"; }} className="min-w-0 flex-1 rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-500 transition-colors hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700">Sign out<br /><strong className="text-slate-700 dark:text-slate-200">Current account</strong></button><ThemeSwitch dark={dark} onToggle={toggleTheme} /></div>
    </aside>
    <main className="md:ml-64">
      <header className="flex items-center justify-between border-b bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900 md:px-10"><div><p className="text-sm text-slate-500 dark:text-slate-400">Performance Evaluation System</p><h1 className="text-2xl font-bold tracking-tight">{title}</h1></div><div className="md:hidden"><ThemeSwitch dark={dark} onToggle={toggleTheme} mobile /></div></header>
      <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-b bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900 md:hidden">{links.map(([href, label]) => <NavLink key={href} to={href} className={({ isActive }) => `whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium ${isActive ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500"}`}>{label}</NavLink>)}</nav>
      <div className="p-6 md:p-10">{children ?? <p className="text-slate-500">No records yet.</p>}</div>
    </main>
  </div>;
}
