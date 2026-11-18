import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { meta } from "../lib/format";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-ink-soft" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> <span className="text-sm">{label}…</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl bg-tomato-soft px-4 py-3 text-sm text-tomato-dark">
      {children}
    </div>
  );
}

export function CategoryPill({ category }: { category: string }) {
  const m = meta(category);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1 text-xs font-medium whitespace-nowrap">
      <span aria-hidden>{m.emoji}</span>
      {category}
    </span>
  );
}

export function ProgressBar({ percent, color = "bg-forest" }: { percent: number; color?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-3 overflow-hidden rounded-full bg-crumb" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-4xl bg-white p-6 shadow-pop sm:rounded-4xl"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">{title}</h2>
              <button onClick={onClose} className="rounded-full p-2 hover:bg-crumb" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
