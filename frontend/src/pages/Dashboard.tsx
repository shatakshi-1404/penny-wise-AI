import { motion } from "framer-motion";
import { Pencil, Plus, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import TransactionModal from "../components/TransactionModal";
import { CategoryPill, ErrorNote, Modal, PageHeader, ProgressBar, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { greeting, inr, meta, prettyDate } from "../lib/format";
import { api, CatSlice, errMsg, Summary, Tx, WeekDay } from "../services/api";

export default function Dashboard() {
  const { user } = useAuth();
  const [sum, setSum] = useState<Summary | null>(null);
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [cats, setCats] = useState<CatSlice[]>([]);
  const [recent, setRecent] = useState<Tx[]>([]);
  const [insight, setInsight] = useState<{ text: string; source: string } | null>(null);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.summary(), api.weekly(), api.categories(), api.transactions({ limit: 6 })])
      .then(([s, w, c, r]) => { setSum(s); setWeek(w); setCats(c); setRecent(r); setError(""); })
      .catch((e) => setError(errMsg(e)));
    api.insights().then((r) => setInsight({ text: r.insights[0], source: r.source })).catch(() => setInsight(null));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!sum) return <Spinner label="Counting your coins" />;

  const over = sum.remaining_paise < 0;
  const monthName = new Date(sum.year, sum.month - 1).toLocaleString("en-IN", { month: "long" });
  const goalPct = sum.goal ? (sum.goal.saved_amount_paise * 100) / sum.goal.target_amount_paise : 0;

  return (
    <>
      {user?.is_demo && (
        <div className="mb-5 rounded-2xl bg-mustard-soft px-4 py-3 text-sm">🧪 You're using the <b>demo account</b>. Every transaction here is synthetic sample data.</div>
      )}
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0]}`}
        subtitle="Here's how your month is going."
        action={<button className="btn-primary" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add expense</button>}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* The receipt: the one memorable thing on this page */}
        <div className="lg:col-span-3" style={{ filter: "drop-shadow(0 10px 18px rgba(43,38,34,.12))" }}>
          <div className="receipt-edge bg-white px-6 pb-9 pt-6 sm:px-8">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black">{monthName}'s tab</h2>
                <p className="text-sm text-ink-soft">{sum.transaction_count} expenses so far</p>
              </div>
              <button onClick={() => setBudgetOpen(true)} className="btn-ghost !px-3 !py-1.5 text-xs"><Pencil className="h-3.5 w-3.5" /> Budget settings</button>
            </div>
            <dl className="mt-5 space-y-2.5 border-y-2 border-dashed border-crumb py-4">
              <div className="flex justify-between"><dt className="text-ink-soft">Monthly budget</dt><dd className="font-bold">{inr(sum.monthly_limit_paise)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Total expenses</dt><dd className="font-bold text-tomato">{inr(sum.total_expenses_paise)}</dd></div>
            </dl>
            <div className="flex items-end justify-between py-4">
              <p className="font-bold">{over ? "Over budget by" : "Left to spend"}</p>
              <p className={`font-display text-5xl font-black ${over ? "text-tomato" : "text-forest"}`}>{inr(Math.abs(sum.remaining_paise))}</p>
            </div>
            <ProgressBar percent={sum.budget_used_percent} color={over ? "bg-tomato" : sum.budget_used_percent > 80 ? "bg-mustard" : "bg-forest"} />
            <p className="mt-1.5 text-xs text-ink-soft">{sum.budget_used_percent}% of budget used</p>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-mustard-soft px-4 py-3">
              <div className="flex items-center gap-3">
                <motion.span initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", damping: 8, delay: 0.5 }} className="text-3xl" aria-hidden>🪙</motion.span>
                <div>
                  <p className="font-bold">Round-up savings</p>
                  <p className="text-xs text-ink-soft">to the nearest ₹{sum.rounding_increment_paise / 100}, virtual only</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-black text-forest">{inr(sum.month_savings_paise)}</p>
                <p className="text-xs text-ink-soft">{inr(sum.total_savings_paise)} all time</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="card">
            <h3 className="text-lg font-bold">Savings goal</h3>
            {sum.goal ? (
              <>
                <p className="mt-1 text-ink-soft">{sum.goal.title}</p>
                <div className="my-3"><ProgressBar percent={goalPct} color="bg-mustard" /></div>
                <p className="text-sm"><b>{inr(sum.goal.saved_amount_paise)}</b> of {inr(sum.goal.target_amount_paise)} ({Math.floor(goalPct)}%)</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">No goal yet. <Link to="/savings" className="font-bold text-forest underline">Create one in the vault</Link> and your round-ups will start filling it.</p>
            )}
          </div>
          <div className="card bg-forest text-white">
            <h3 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-mustard" aria-hidden /> Insight</h3>
            {insight ? (
              <>
                <p className="mt-2 leading-relaxed">{insight.text}</p>
                <p className="mt-3 text-xs text-white/60">{insight.source === "groq" ? "Written by Groq from your real numbers" : "Calculated from your numbers"}</p>
              </>
            ) : (
              <p className="mt-2 text-white/70">Thinking about your spending…</p>
            )}
            <Link to="/assistant" className="mt-3 inline-block text-sm font-bold text-mustard underline">Ask the assistant</Link>
          </div>
        </div>

        <div className="card lg:col-span-3">
          <h3 className="mb-4 text-lg font-bold">This week</h3>
          <div className="h-56" aria-label="Spending over the last 7 days">
            <ResponsiveContainer>
              <BarChart data={week} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6F665E" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6F665E" }} tickFormatter={(v) => `₹${v / 100}`} />
                <Tooltip cursor={{ fill: "#FAF8F3" }} formatter={(v: number) => [inr(v), "Spent"]} contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 8px 24px -8px rgba(0,0,0,.2)" }} />
                <Bar dataKey="total_paise" fill="#E65B45" radius={[10, 10, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h3 className="mb-2 text-lg font-bold">Where it went</h3>
          {cats.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-soft">Nothing spent this month yet. 🎉</p>
          ) : (
            <>
              <div className="h-40">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={cats} dataKey="total_paise" nameKey="category" innerRadius={42} outerRadius={70} paddingAngle={3} stroke="none">
                      {cats.map((c) => <Cell key={c.category} fill={meta(c.category).color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [inr(v), n]} contentStyle={{ borderRadius: 16, border: "none" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {cats.slice(0, 5).map((c) => (
                  <li key={c.category} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: meta(c.category).color }} />{meta(c.category).emoji} {c.category}</span>
                    <span className="font-bold">{inr(c.total_paise)} <span className="font-normal text-ink-soft">{c.percent}%</span></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">Recent transactions</h3>
            <Link to="/transactions" className="text-sm font-bold text-forest underline">See all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-ink-soft">No expenses yet. Add your first one to see the round-up magic.</p>
          ) : (
            <ul className="divide-y divide-crumb">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream text-xl" aria-hidden>{meta(t.category).emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{t.merchant}</p>
                    <p className="text-xs text-ink-soft">{prettyDate(t.transaction_date)}</p>
                  </div>
                  <div className="hidden sm:block"><CategoryPill category={t.category} /></div>
                  <div className="text-right">
                    <p className="font-bold">{inr(t.amount_paise)}</p>
                    {t.savings_paise > 0 && <p className="text-xs font-bold text-forest">+{inr(t.savings_paise)} saved</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <TransactionModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} editing={null} incrementPaise={sum.rounding_increment_paise} />
      <BudgetModal open={budgetOpen} onClose={() => setBudgetOpen(false)} sum={sum} onSaved={load} />
    </>
  );
}

function BudgetModal({ open, onClose, sum, onSaved }: { open: boolean; onClose: () => void; sum: Summary; onSaved: () => void }) {
  const [limit, setLimit] = useState("");
  const [inc, setInc] = useState(10);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setLimit(String(sum.monthly_limit_paise / 100)); setInc(sum.rounding_increment_paise / 100); setError(""); }
  }, [open, sum]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.saveBudget(limit.trim(), inc);
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Budget settings">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="limit">Monthly budget (₹)</label>
          <input id="limit" className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} required />
        </div>
        <fieldset>
          <legend className="label">Round up to the nearest</legend>
          <div className="grid grid-cols-3 gap-2">
            {[10, 50, 100].map((v) => (
              <button type="button" key={v} onClick={() => setInc(v)} aria-pressed={inc === v}
                className={`rounded-2xl border-2 py-3 font-bold transition ${inc === v ? "border-forest bg-forest-soft text-forest" : "border-crumb"}`}>₹{v}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">Changing this recalculates this month's round-ups.</p>
        </fieldset>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-green" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      </form>
    </Modal>
  );
}
