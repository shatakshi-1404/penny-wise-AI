import { motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ErrorNote, PageHeader, ProgressBar, Spinner } from "../components/ui";
import { inr } from "../lib/format";
import { api, errMsg, Savings as SavingsData } from "../services/api";

export default function Savings() {
  const [data, setData] = useState<SavingsData | null>(null);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.savings().then((d) => { setData(d); setError(""); }).catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createGoal(title, target.trim());
      setTitle(""); setTarget("");
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, name: string) {
    if (!window.confirm(`Delete the goal "${name}"? Your savings stay in the vault.`)) return;
    try { await api.deleteGoal(id); load(); } catch (e) { setError(errMsg(e)); }
  }

  if (!data && !error) return <Spinner label="Opening the vault" />;

  return (
    <>
      <PageHeader title="Savings Vault" subtitle="Small round-ups, quietly adding up." />
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      {data && (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="card flex flex-col justify-between bg-forest text-white lg:col-span-2">
            <div>
              <motion.p initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", damping: 9 }} className="text-5xl" aria-hidden>🫙</motion.p>
              <p className="mt-4 text-white/70">Total virtual savings</p>
              <p className="font-display text-6xl font-black">{inr(data.total_savings_paise)}</p>
              <p className="mt-2 text-white/80">{inr(data.month_savings_paise)} added this month, rounding to ₹{data.rounding_increment_paise / 100}.</p>
            </div>
            <p className="mt-6 rounded-2xl bg-white/10 p-3 text-xs text-white/80">This is a virtual tally of your round-ups. No money is moved from or to any bank or UPI account.</p>
          </div>

          <div className="card lg:col-span-3">
            <h2 className="text-xl font-bold">New goal</h2>
            <form onSubmit={add} className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
              <div>
                <label className="label" htmlFor="gt">What are you saving for?</label>
                <input id="gt" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New headphones" required maxLength={120} />
              </div>
              <div>
                <label className="label" htmlFor="ga">Target (₹)</label>
                <input id="ga" className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="2500" required />
              </div>
              <button className="btn-green self-end" disabled={busy}><Plus className="h-4 w-4" /> Add goal</button>
            </form>
            <p className="mt-2 text-xs text-ink-soft">Savings fill your goals in the order you created them.</p>
          </div>

          <div className="lg:col-span-5">
            <h2 className="mb-3 text-xl font-bold">Your goals</h2>
            {data.goals.length === 0 ? (
              <div className="card py-12 text-center">
                <p className="text-5xl" aria-hidden>🎯</p>
                <p className="mt-3 text-lg font-bold">No goals yet</p>
                <p className="text-ink-soft">Give your round-ups a purpose. Add a goal above.</p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.goals.map((g) => {
                  const pct = (g.saved_amount_paise * 100) / g.target_amount_paise;
                  const done = g.saved_amount_paise >= g.target_amount_paise;
                  return (
                    <li key={g.id} className="card">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-bold">{done ? "🎉 " : ""}{g.title}</h3>
                        <button className="rounded-full p-1.5 text-tomato hover:bg-tomato-soft" aria-label={`Delete goal ${g.title}`} onClick={() => remove(g.id, g.title)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="my-3"><ProgressBar percent={pct} color={done ? "bg-forest" : "bg-mustard"} /></div>
                      <p className="text-sm"><b>{inr(g.saved_amount_paise)}</b> of {inr(g.target_amount_paise)}</p>
                      <p className="text-xs text-ink-soft">{done ? "Goal reached!" : `${inr(g.target_amount_paise - g.saved_amount_paise)} to go`}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
