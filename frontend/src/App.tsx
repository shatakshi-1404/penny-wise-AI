import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Assistant from "./pages/Assistant";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Savings from "./pages/Savings";
import Transactions from "./pages/Transactions";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Warming up" />;
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

function Public({ mode }: { mode: "login" | "register" }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Warming up" />;
  return user ? <Navigate to="/" replace /> : <Auth mode={mode} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Public mode="login" />} />
          <Route path="/register" element={<Public mode="register" />} />
          <Route element={<Protected />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/savings" element={<Savings />} />
            <Route path="/assistant" element={<Assistant />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
