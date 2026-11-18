import { motion } from "framer-motion";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorNote } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { errMsg } from "../services/api";

export default function Auth({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => (isLogin ? login(email, password) : register(name, email, password)));
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-forest p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2"><span className="text-3xl" aria-hidden>🪙</span><span className="font-display text-2xl font-black">PennyWise</span></div>
        <div>
          <h2 className="font-display text-6xl font-black leading-[1.05]">Spend mindfully.<br />Save effortlessly.</h2>
          <p className="mt-6 max-w-md text-lg text-white/80">Every ₹142 coffee run rounds up to ₹150. The ₹8 difference quietly lands in your vault.</p>
        </div>
        <div className="flex gap-3" aria-hidden>
          {[["₹75", "₹80", "+₹5"], ["₹142", "₹150", "+₹8"], ["₹299", "₹300", "+₹1"]].map(([a, b, c], i) => (
            <motion.div key={a} initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.25, type: "spring", damping: 12 }}
              className="rounded-3xl bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-sm text-white/70">{a} becomes {b}</p>
              <p className="font-display text-2xl font-black text-mustard">{c}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="mb-2 flex items-center gap-2 lg:hidden"><span className="text-3xl" aria-hidden>🪙</span><span className="font-display text-2xl font-black">PennyWise</span></div>
          <h1 className="text-4xl font-black">{isLogin ? "Welcome back" : "Start saving"}</h1>
          <p className="text-ink-soft">{isLogin ? "Log in to see where your money went." : "Create an account. It takes under a minute."}</p>
          {!isLogin && (
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password {!isLogin && <span className="font-normal">(8+ characters)</span>}</label>
            <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isLogin ? 1 : 8} autoComplete={isLogin ? "current-password" : "new-password"} />
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "One moment…" : isLogin ? "Log in" : "Create account"}</button>
          {isLogin && (
            <button type="button" className="btn-ghost w-full" disabled={busy} onClick={() => run(() => login("demo@pennywise.ai", "Demo@1234"))}>
              Try the demo account
            </button>
          )}
          <p className="text-center text-sm text-ink-soft">
            {isLogin ? "New here? " : "Already have an account? "}
            <Link className="font-bold text-forest underline" to={isLogin ? "/register" : "/login"}>{isLogin ? "Create an account" : "Log in"}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
