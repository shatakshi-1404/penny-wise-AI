const inrFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Format integer paise as ₹ with Indian digit grouping. */
export function inr(paise: number): string {
  const neg = paise < 0;
  return `${neg ? "-" : ""}₹${inrFmt.format(Math.abs(paise) / 100)}`;
}

export const CATEGORIES = [
  "Food & Drinks", "Shopping", "Transport", "Housing", "Bills & Utilities",
  "Health", "Entertainment", "Education", "Travel", "Other",
] as const;

export const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  "Food & Drinks": { emoji: "🍕", color: "#E65B45" },
  Shopping: { emoji: "🛍️", color: "#E9B44C" },
  Transport: { emoji: "🛺", color: "#34785B" },
  Housing: { emoji: "🏠", color: "#8A6B4F" },
  "Bills & Utilities": { emoji: "💡", color: "#5B8FB9" },
  Health: { emoji: "💊", color: "#C96B8A" },
  Entertainment: { emoji: "🎬", color: "#8B6BC9" },
  Education: { emoji: "📚", color: "#2F9E9E" },
  Travel: { emoji: "✈️", color: "#F08A5D" },
  Other: { emoji: "🧺", color: "#9A9189" },
};

export const meta = (c: string) => CATEGORY_META[c] ?? CATEGORY_META.Other;

export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function prettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
