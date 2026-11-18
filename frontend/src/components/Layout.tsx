import { Bot, LayoutDashboard, LogOut, PiggyBank, Receipt } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/savings", label: "Savings Vault", icon: PiggyBank },
  { to: "/assistant", label: "AI Assistant", icon: Bot },
];

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-crumb bg-cream p-6 lg:flex">
        <div>
          <div className="mb-10 flex items-center gap-2">
            <span className="text-3xl" aria-hidden>🪙</span>
            <span className="font-display text-2xl font-black">PennyWise</span>
          </div>
          <nav className="space-y-1" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${isActive ? "bg-forest text-white" : "text-ink-soft hover:bg-crumb/60"}`}>
                <Icon className="h-5 w-5" aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div>
          <p className="mb-3 text-sm text-ink-soft">Spend mindfully.<br />Save effortlessly.</p>
          <div className="rounded-2xl bg-white p-3 shadow-card">
            <p className="truncate text-sm font-bold">{user?.name}</p>
            <p className="truncate text-xs text-ink-soft">{user?.email}</p>
            <button onClick={logout} className="mt-2 flex items-center gap-2 text-sm font-bold text-tomato hover:text-tomato-dark"><LogOut className="h-4 w-4" /> Log out</button>
          </div>
        </div>
      </aside>

      <div className="flex-1 pb-24 lg:pb-0">
        <header className="flex items-center justify-between px-5 pt-5 lg:hidden">
          <div className="flex items-center gap-2"><span className="text-2xl" aria-hidden>🪙</span><span className="font-display text-xl font-black">PennyWise</span></div>
          <button onClick={logout} className="rounded-full bg-white p-2.5 shadow-card" aria-label="Log out"><LogOut className="h-4 w-4" /></button>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-6 lg:px-10 lg:py-10"><Outlet /></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-crumb bg-white/95 px-2 py-2 backdrop-blur lg:hidden" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold ${isActive ? "text-forest" : "text-ink-soft"}`}>
            <Icon className="h-5 w-5" aria-hidden /> {label.split(" ")[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
