import axios from "axios";

export const TOKEN_KEY = "pennywise_token";

const http = axios.create({ baseURL: `${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/api` });

http.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const url: string = err.config?.url ?? "";
    if (err.response?.status === 401 && !url.startsWith("/auth/login") && !url.startsWith("/auth/register")) {
      localStorage.removeItem(TOKEN_KEY);
      if (!location.pathname.startsWith("/login")) location.assign("/login");
    }
    return Promise.reject(err);
  },
);

/** Turn any API/network error into a short message a person can read. */
export function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) return "Can't reach the server. Is the backend running?";
    const d = e.response.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length) {
      const first = d[0];
      const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
      return `${field ? field + ": " : ""}${String(first.msg).replace(/^Value error, /, "")}`;
    }
  }
  return "Something went wrong. Please try again.";
}

export interface User { id: number; name: string; email: string; is_demo: boolean; created_at: string }
export interface Tx {
  id: number; merchant: string; amount_paise: number; rounded_amount_paise: number; savings_paise: number;
  category: string; predicted_category: string | null; ml_confidence: number | null;
  description: string; transaction_date: string; created_at: string;
}
export interface TxInput { merchant: string; amount: string; transaction_date: string; description: string; category: string | null }
export interface Goal { id: number; title: string; target_amount_paise: number; saved_amount_paise: number; created_at: string }
export interface Summary {
  month: number; year: number; monthly_limit_paise: number; rounding_increment_paise: number;
  total_expenses_paise: number; remaining_paise: number; budget_used_percent: number; transaction_count: number;
  month_savings_paise: number; total_savings_paise: number;
  goal: { id: number; title: string; target_amount_paise: number; saved_amount_paise: number } | null;
}
export interface WeekDay { date: string; label: string; total_paise: number }
export interface CatSlice { category: string; total_paise: number; percent: number }
export interface Savings { total_savings_paise: number; month_savings_paise: number; rounding_increment_paise: number; goals: Goal[] }
export interface Prediction { category: string; confidence: number; uncertain: boolean; top3: { category: string; confidence: number }[] }
export interface Extraction {
  extracted: { merchant: string; amount: string; category: string | null; date: string; description: string };
  ml: Prediction; categories_disagree: boolean;
}
export interface MlMetrics { accuracy: number; macro_f1: number; n_train: number; n_test: number; n_classes: number; trained_at: string; note: string }

export const api = {
  login: (email: string, password: string) => http.post<{ access_token: string; user: User }>("/auth/login", { email, password }).then((r) => r.data),
  register: (name: string, email: string, password: string) => http.post<{ access_token: string; user: User }>("/auth/register", { name, email, password }).then((r) => r.data),
  me: () => http.get<User>("/auth/me").then((r) => r.data),

  transactions: (p: { q?: string; category?: string; limit?: number } = {}) => http.get<Tx[]>("/transactions", { params: p }).then((r) => r.data),
  createTx: (b: TxInput) => http.post<Tx>("/transactions", b).then((r) => r.data),
  updateTx: (id: number, b: TxInput) => http.put<Tx>(`/transactions/${id}`, b).then((r) => r.data),
  deleteTx: (id: number) => http.delete(`/transactions/${id}`),

  summary: () => http.get<Summary>("/dashboard/summary").then((r) => r.data),
  weekly: () => http.get<WeekDay[]>("/dashboard/weekly").then((r) => r.data),
  categories: () => http.get<CatSlice[]>("/dashboard/categories").then((r) => r.data),

  budget: () => http.get<{ monthly_limit_paise: number; rounding_increment_paise: number }>("/budget").then((r) => r.data),
  saveBudget: (monthly_limit: string, rounding_increment: number) => http.put("/budget", { monthly_limit, rounding_increment }).then((r) => r.data),

  savings: () => http.get<Savings>("/savings").then((r) => r.data),
  createGoal: (title: string, target_amount: string) => http.post<Goal>("/savings/goals", { title, target_amount }).then((r) => r.data),
  deleteGoal: (id: number) => http.delete(`/savings/goals/${id}`),

  predict: (text: string) => http.post<Prediction>("/ml/predict-category", { text }).then((r) => r.data),
  metrics: () => http.get<MlMetrics>("/ml/metrics").then((r) => r.data),

  extract: (text: string) => http.post<Extraction>("/ai/extract-transaction", { text }).then((r) => r.data),
  insights: () => http.post<{ insights: string[]; source: string }>("/ai/insights").then((r) => r.data),
  chat: (question: string) => http.post<{ answer: string; source: string }>("/ai/chat", { question }).then((r) => r.data),
};
