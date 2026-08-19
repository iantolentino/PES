import { useEffect, useState } from "react";
import { Link } from "react-router";
import Page from "./_Page";

const defaultCriteria = ["Communication", "Quality of work", "Responsiveness", "Professionalism"];
const bands = [["90–100", "A"], ["80–89", "B"], ["70–79", "C"], ["60–69", "D"], ["Below 60", "F"]];

function grade(score: number) { return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F"; }

export default function EvaluationPreview() {
  const [criteria, setCriteria] = useState<string[]>(defaultCriteria);
  const [scores, setScores] = useState<number[]>(defaultCriteria.map(() => 80));
  const [increase, setIncrease] = useState(5);
  const [newCriterion, setNewCriterion] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("pes_evaluation_criteria");
    if (saved) { try { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length) { setCriteria(parsed); setScores(parsed.map(() => 80)); } } catch { /* use defaults */ } }
  }, []);

  const saveCriteria = (next: string[]) => { setCriteria(next); setScores(next.map((_, index) => scores[index] ?? 80)); localStorage.setItem("pes_evaluation_criteria", JSON.stringify(next)); };
  const addCriterion = () => { const value = newCriterion.trim(); if (value && !criteria.includes(value)) { saveCriteria([...criteria, value]); setNewCriterion(""); } };
  const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1));

  return <Page title="Evaluation preview">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-500">Preview the client-facing form and adjust its criteria before creating a session.</p></div><Link to="/evaluations/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Back to create evaluation</Link></div>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="border-b pb-5"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Client evaluation form</p><h2 className="mt-2 text-2xl font-bold">Performance evaluation</h2><p className="mt-1 text-sm text-slate-500">This form is completed by the client. No client login is required when it is shared through a secure tokenized link.</p></div>
        <div className="mt-6 rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">Employee</p><p className="mt-1 font-semibold">Jane Dela Cruz <span className="font-normal text-slate-500">· Preview employee</span></p></div>
        <div className="mt-6 space-y-5">{criteria.map((criterion, index) => <label key={criterion} className="block"><div className="flex justify-between gap-4 text-sm font-medium"><span>{criterion}</span><span className="text-indigo-700">{scores[index]}/100</span></div><input aria-label={`${criterion} score`} type="range" min="0" max="100" value={scores[index] ?? 80} onChange={e => { const next = [...scores]; next[index] = Number(e.target.value); setScores(next); }} className="mt-2 w-full accent-indigo-600" /></label>)}</div>
        <div className="mt-6 grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><div><p className="text-sm text-slate-500">Reference grade</p><p className="mt-1 text-2xl font-bold text-indigo-700">{grade(average)} <span className="text-base font-normal text-slate-500">({average}/100)</span></p></div><label className="text-sm font-medium">Requested salary increase %<input type="number" min="0" step="0.1" value={increase} onChange={e => setIncrease(Number(e.target.value))} className="mt-2 w-full rounded-lg border p-2.5" /><span className="mt-1 block text-xs font-normal text-slate-500">Free client input; the grade does not cap or calculate this value.</span></label></div>
        <button type="button" className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white opacity-60">Submit evaluation (preview)</button>
      </section>
      <div className="space-y-6">
        <section className="rounded-xl border bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Customize criteria</h2><p className="mt-1 text-sm text-slate-500">These labels appear on the client form.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Saved locally</span></div><div className="mt-5 space-y-2">{criteria.map(criterion => <div key={criterion} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span>{criterion}</span><button type="button" onClick={() => criteria.length > 1 && saveCriteria(criteria.filter(item => item !== criterion))} className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${criterion}`}>Remove</button></div>)}</div><div className="mt-4 flex gap-2"><input value={newCriterion} onChange={e => setNewCriterion(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCriterion())} className="min-w-0 flex-1 rounded-lg border p-2.5 text-sm" placeholder="Add criterion" /><button type="button" onClick={addCriterion} className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">Add</button></div></section>
        <section className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Reference grade bands</h2><p className="mt-1 text-sm text-slate-500">Informational only. The client enters the increase percentage freely.</p><div className="mt-4 overflow-hidden rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Score</th><th className="p-3">Grade</th><th className="p-3">Increase</th></tr></thead><tbody className="divide-y">{bands.map(([range, letter]) => <tr key={letter}><td className="p-3">{range}</td><td className="p-3 font-semibold text-indigo-700">{letter}</td><td className="p-3 text-slate-500">Client enters freely</td></tr>)}</tbody></table></div></section>
        <section className="rounded-xl border bg-indigo-700 p-6 text-white shadow-sm"><h2 className="text-lg font-semibold">Approval workflow</h2><ol className="mt-4 space-y-3 text-sm text-indigo-100"><li><span className="font-semibold text-white">1. Client submits</span> — score, reference grade, and requested % are locked.</li><li><span className="font-semibold text-white">2. Manager reviews</span> — approve, reject, or adjust the requested %.</li><li><span className="font-semibold text-white">3. HR / Department Head</span> — final approval or rejection.</li><li><span className="font-semibold text-white">4. Finalized</span> — log the increase and notify the employee.</li></ol></section>
      </div>
    </div>
  </Page>;
}
