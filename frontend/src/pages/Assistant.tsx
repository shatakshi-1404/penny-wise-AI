import { Bot, Check, SendHorizonal, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ErrorNote, PageHeader } from "../components/ui";
import { CATEGORIES, todayISO } from "../lib/format";
import { api, errMsg, Extraction, MlMetrics } from "../services/api";

const SUGGESTIONS = ["Where did I spend the most?", "How much did I save?", "How much budget is left?", "What is my biggest spending category?"];

export default function Assistant() {
  return (
    <>
      <PageHeader title="AI Assistant" subtitle="Type an expense in plain words, or ask about your money." />
      <div className="grid gap-5 lg:grid-cols-2">
        <QuickAdd />
        <div className="space-y-5">
          <Chat />
          <Insights />
          <ModelCard />
        </div>
      </div>
    </>
  );
}

function QuickAdd() {
  const [text, setText] = useState("");
  const [ex, setEx] = useState<Extraction | null>(null);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function parse(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setSaved(""); setEx(null);
    try {
      const r = await api.extract(text);
      setEx(r);
      setMerchant(r.extracted.merchant);
      setAmount(r.extracted.amount);
      setDate(r.extracted.date);
      setDescription(r.extracted.description);
      // If the LLM and our model disagree, the user must choose, so don't pre-select.
      setCategory(r.categories_disagree ? "" : r.extracted.category ?? r.ml.category);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true); setError("");
    try {
      await api.createTx({ merchant, amount: amount.trim(), transaction_date: date, description, category });
      setSaved(`Saved ${merchant} for ₹${amount}.`);
      setEx(null); setText("");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="h-5 w-5 text-tomato" aria-hidden /> Say it, don't type it in a form</h2>
      <p className="mt-1 text-sm text-ink-soft">Groq reads your sentence. Nothing is saved until you confirm the preview.</p>
      <form onSubmit={parse} className="mt-4 flex gap-2">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="I spent 350 rupees at Domino's yesterday" aria-label="Describe an expense" required minLength={3} maxLength={500} />
        <button className="btn-primary" disabled={busy} aria-label="Extract expense"><SendHorizonal className="h-4 w-4" /></button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {["Paid 300 for an Uber ride", "Netflix 649 yesterday", "Bought headphones for 2500"].map((s) => (
          <button key={s} type="button" onClick={() => setText(s)} className="rounded-full bg-cream px-3 py-1 text-xs hover:bg-crumb">{s}</button>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
      {saved && <p className="mt-4 flex items-center gap-2 rounded-2xl bg-forest-soft px-4 py-3 text-sm font-bold text-forest"><Check className="h-4 w-4" /> {saved}</p>}

      {ex && (
        <div className="mt-5 space-y-3 rounded-3xl border-2 border-dashed border-crumb p-4">
          <p className="font-bold">Preview. Check it, then confirm.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="pm">Merchant</label><input id="pm" className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} /></div>
            <div><label className="label" htmlFor="pa">Amount (₹)</label><input id="pa" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><label className="label" htmlFor="pd">Date</label><input id="pd" type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className="label" htmlFor="pn">Description</label><input id="pn" className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>

          {ex.categories_disagree ? (
            <fieldset className="rounded-2xl bg-mustard-soft p-3">
              <legend className="px-1 text-sm font-bold">The two models disagree. Pick a category:</legend>
              {[
                { label: "Groq (LLM) said", value: ex.extracted.category! },
                { label: `Our model said (${Math.round(ex.ml.confidence * 100)}% sure)`, value: ex.ml.category },
              ].map((o) => (
                <label key={o.label} className="mt-1 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="cat" className="accent-forest" checked={category === o.value} onChange={() => setCategory(o.value)} />
                  {o.label}: <b>{o.value}</b>
                </label>
              ))}
              <label className="mt-1 block text-sm">Or another: <select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}><option value="" disabled>Choose…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            </fieldset>
          ) : (
            <div>
              <label className="label" htmlFor="pc">Category <span className="font-normal">(both models agree{ex.ml.uncertain ? ", but with low confidence" : ""})</span></label>
              <select id="pc" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setEx(null)}>Discard</button>
            <button className="btn-green" onClick={confirm} disabled={busy || !category || !merchant.trim() || !amount.trim()}>Confirm and save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chat() {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a: string; source: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(question: string) {
    if (question.trim().length < 2) return;
    setBusy(true); setError("");
    try {
      const r = await api.chat(question);
      setLog((l) => [{ q: question, a: r.answer, source: r.source }, ...l]);
      setQ("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Bot className="h-5 w-5 text-forest" aria-hidden /> Ask about your money</h2>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="mt-3 flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="How much budget is left?" aria-label="Ask a question" maxLength={500} />
        <button className="btn-green" disabled={busy} aria-label="Ask"><SendHorizonal className="h-4 w-4" /></button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} disabled={busy} className="rounded-full bg-cream px-3 py-1 text-xs hover:bg-crumb disabled:opacity-50">{s}</button>)}
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      <ul className="mt-4 space-y-3">
        {log.map((m, i) => (
          <li key={i} className="space-y-1.5">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-forest px-4 py-2 text-sm text-white">{m.q}</p>
            <p className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-cream px-4 py-2.5 text-sm leading-relaxed">{m.a}
              <span className="mt-1 block text-[11px] text-ink-soft">{m.source === "groq" ? "Explained by Groq, numbers from your records" : "Built-in answer from your records (Groq not used)"}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Insights() {
  const [items, setItems] = useState<string[] | null>(null);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function get() {
    setBusy(true); setError("");
    try { const r = await api.insights(); setItems(r.insights); setSource(r.source); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Spending insights</h2>
        <button className="btn-ghost" onClick={get} disabled={busy}>{busy ? "Thinking…" : items ? "Refresh" : "Generate"}</button>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {items && (
        <>
          <ul className="mt-3 space-y-2">{items.map((t, i) => <li key={i} className="rounded-2xl bg-cream px-4 py-2.5 text-sm">💡 {t}</li>)}</ul>
          <p className="mt-2 text-[11px] text-ink-soft">{source === "groq" ? "Written by Groq from statistics calculated in Python." : "Built-in insights from statistics calculated in Python."}</p>
        </>
      )}
    </div>
  );
}

function ModelCard() {
  const [m, setM] = useState<MlMetrics | null>(null);
  useEffect(() => { api.metrics().then(setM).catch(() => setM(null)); }, []);
  if (!m) return null;
  return (
    <div className="card bg-mustard-soft">
      <h2 className="text-xl font-bold">Your category model</h2>
      <p className="mt-1 text-sm">A TF-IDF + Logistic Regression classifier trained on this project's own dataset. It runs locally with no API key.</p>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-2xl bg-white p-3"><dt className="text-xs text-ink-soft">Accuracy</dt><dd className="font-display text-2xl font-black">{Math.round(m.accuracy * 100)}%</dd></div>
        <div className="rounded-2xl bg-white p-3"><dt className="text-xs text-ink-soft">Macro-F1</dt><dd className="font-display text-2xl font-black">{m.macro_f1.toFixed(2)}</dd></div>
        <div className="rounded-2xl bg-white p-3"><dt className="text-xs text-ink-soft">Test examples</dt><dd className="font-display text-2xl font-black">{m.n_test}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-ink-soft">{m.note}</p>
    </div>
  );
}
