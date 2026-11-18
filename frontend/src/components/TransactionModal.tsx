import { Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api, errMsg, Prediction, Tx } from "../services/api";
import { CATEGORIES, inr, todayISO } from "../lib/format";
import { ErrorNote, Modal } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Tx | null;
  incrementPaise: number;
}

export default function TransactionModal({ open, onClose, onSaved, editing, incrementPaise }: Props) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(""); // "" = let the ML model decide
  const [pred, setPred] = useState<Prediction | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMerchant(editing?.merchant ?? "");
    setAmount(editing ? String(editing.amount_paise / 100) : "");
    setDate(editing?.transaction_date ?? todayISO());
    setDescription(editing?.description ?? "");
    setCategory(editing?.category ?? "");
    setPred(null);
    setError("");
  }, [open, editing]);

  // Ask our own ML model for a live suggestion (debounced)
  useEffect(() => {
    const text = `${merchant} ${description}`.trim();
    if (!open || text.length < 3) { setPred(null); return; }
    const t = setTimeout(() => api.predict(text).then(setPred).catch(() => setPred(null)), 350);
    return () => clearTimeout(t);
  }, [merchant, description, open]);

  const amt = Number(amount);
  const paise = Number.isFinite(amt) && amt > 0 ? Math.round(amt * 100) : 0;
  const saving = paise && incrementPaise ? (incrementPaise - (paise % incrementPaise)) % incrementPaise : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = { merchant, amount: amount.trim(), transaction_date: date, description, category: category || null };
      if (editing) await api.updateTx(editing.id, body);
      else await api.createTx(body);
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit expense" : "Add an expense"}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="merchant">Merchant</label>
          <input id="merchant" className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Swiggy, Uber, Landlord…" required maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="amount">Amount (₹)</label>
            <input id="amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="142" required />
          </div>
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input id="date" type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="desc">Description <span className="font-normal">(optional)</span></label>
          <input id="desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Biryani with friends" maxLength={500} />
        </div>
        <div>
          <label className="label" htmlFor="cat">Category</label>
          <select id="cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Let PennyWise's model decide</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          {pred && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
              <Sparkles className="h-4 w-4 text-mustard" aria-hidden />
              Model suggests <b className="text-ink">{pred.category}</b> ({Math.round(pred.confidence * 100)}% sure)
              {pred.uncertain && <span className="rounded-full bg-mustard-soft px-2 py-0.5 text-xs">not very sure, double-check</span>}
              {category !== pred.category && <button type="button" onClick={() => setCategory(pred.category)} className="font-bold text-forest underline">Use it</button>}
            </p>
          )}
        </div>
        {saving > 0 && (
          <p className="rounded-2xl bg-mustard-soft px-4 py-2.5 text-sm">🪙 Rounds up to <b>{inr(paise + saving)}</b>, so <b>{inr(saving)}</b> goes to your vault.</p>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add expense"}</button>
        </div>
      </form>
    </Modal>
  );
}
