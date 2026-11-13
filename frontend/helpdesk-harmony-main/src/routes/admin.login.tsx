import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";
import { Alert } from "../components/Alert";
import { validatePhone } from "../lib/validation";

export const Route = createFileRoute("/admin/login")({ component: AdminLogin });

function AdminLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validatePhone(form.phone);
    setPhoneError(validationError);
    if (validationError) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await api<{ admin: { id: number }; token: string }>("/admin/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      localStorage.setItem("admin_id", String(data.admin.id));
      localStorage.setItem("session_token", data.token);
      navigate({ to: "/admin/dashboard" });
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-16">
      <div className="crs-card">
        <h1 className="text-2xl font-bold">Master Agent login</h1>
        <p className="text-sm text-muted-foreground mt-1">Access system-wide complaint monitoring.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="crs-label">Admin phone</label>
            <input className="crs-input" required value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setPhoneError(""); }} />
            {phoneError && <p className="mt-1 text-sm text-destructive">{phoneError}</p>}
          </div>
          <div>
            <label className="crs-label">Password</label>
            <input className="crs-input" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <Alert kind="error" message={message} />
          <button className="crs-btn w-full" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          <p className="text-sm text-center text-muted-foreground"><Link to="/" className="text-primary font-medium">Return home</Link></p>
        </form>
      </div>
    </div>
  );
}
