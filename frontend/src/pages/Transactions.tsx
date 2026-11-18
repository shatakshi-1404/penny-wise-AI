import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import TransactionModal from "../components/TransactionModal";
import { CategoryPill, ErrorNote, PageHeader, Spinner } from "../components/ui";
import { CATEGORIES, inr, meta, prettyDate } from "../lib/format";
import { api, errMsg, Tx } from "../services/api";

export default function Transactions() {
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [increment, setIncrement] = useState(1000);

  const load = useCallback(() => {
    api.transactions({ q: q.trim() || undefined, category: category || undefined })
      .then((r) => { setTxs(r); setError(""); })
      .catch((e) => setError(errMsg(e)));
  }, [q, category]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api.budget().then((b) => setIncrement(b.rounding_increment_paise)).catch(() => undefined); }, []);

  async function remove(t: Tx) {
    if (!window.confirm(`Delete ${t.merchant} (${inr(t.amount_paise)})? This also removes its round-up savings.`)) return;
    try { await api.deleteTx(t.id); load(); } catch (e) { setError(errMsg(e)); }
  }

  const totalSaved = (txs ?? []).reduce((a, t) => a + t.savings_paise, 0);
  const filtered = q.trim() !== "" || category !== "";

  return (
    <>
      <PageHeader title="Transactions" subtitle="Every expense, with its round-up and the category our model picked."
        action={<button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="h-4 w-4" /> Add expense</button>} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
          <input className="input !pl-11" placeholder="Search merchant or description" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
        </div>
        <select className="input sm:w-56" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!txs && !error && <Spinner label="Fetching receipts" />}
      {txs && txs.length === 0 && (
        <div className="card py-14 text-center">
          <p className="text-5xl" aria-hidden>🧾</p>
          <p className="mt-3 text-lg font-bold">{filtered ? "Nothing matches that search" : "No expenses yet"}</p>
          <p className="text-ink-soft">{filtered ? "Try a different word or clear the filter." : "Add your first expense and watch the pennies pile up."}</p>
        </div>
      )}

      {txs && txs.length > 0 && (
        <>
          <p className="mb-2 text-sm text-ink-soft">{txs.length} expenses showing, <b className="text-forest">{inr(totalSaved)}</b> rounded up into savings.</p>
          <ul className="space-y-2.5">
            {txs.map((t) => {
              const overridden = t.predicted_category && t.predicted_category !== t.category;
              return (
                <li key={t.id} className="card flex flex-wrap items-center gap-x-4 gap-y-3 !p-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ background: meta(t.category).color + "22" }} aria-hidden>{meta(t.category).emoji}</span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-base font-bold">{t.merchant}</p>
                    <p className="truncate text-sm text-ink-soft">{t.description || "No description"} · {prettyDate(t.transaction_date)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <CategoryPill category={t.category} />
                      {t.predicted_category && (
                        <span className="text-xs text-ink-soft" title="Prediction from the custom TF-IDF + Logistic Regression model">
                          🤖 Model: {t.predicted_category}{t.ml_confidence != null && ` (${Math.round(t.ml_confidence * 100)}%)`}
                          {overridden ? ", you changed it" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black">{inr(t.amount_paise)}</p>
                    <p className="text-xs text-ink-soft">rounds to {inr(t.rounded_amount_paise)}</p>
                    <p className={`text-xs font-bold ${t.savings_paise ? "text-forest" : "text-ink-soft"}`}>{t.savings_paise ? `+${inr(t.savings_paise)} saved` : "nothing to round"}</p>
                  </div>
                  <div className="flex gap-1">
                    <button className="rounded-full p-2 hover:bg-crumb" aria-label={`Edit ${t.merchant}`} onClick={() => { setEditing(t); setModalOpen(true); }}><Pencil className="h-4 w-4" /></button>
                    <button className="rounded-full p-2 text-tomato hover:bg-tomato-soft" aria-label={`Delete ${t.merchant}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <TransactionModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} editing={editing} incrementPaise={increment} />
    </>
  );
}
