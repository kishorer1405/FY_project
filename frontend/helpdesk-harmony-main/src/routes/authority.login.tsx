import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";
import { Alert } from "../components/Alert";
import { validatePhone } from "../lib/validation";
import { useLanguage } from "../i18n/useLanguage";

export const Route = createFileRoute("/authority/login")({
  component: AuthorityLogin,
});

const DEPARTMENTS = ["fire", "water", "electricity", "road", "garbage"] as const;

function AuthorityLogin() {
  const { t, language } = useLanguage();
  const departmentLabel = (department: string) => ({ fire: t("fire"), water: t("water"), electricity: t("electrical"), road: t("road"), garbage: t("garbage") }[department] || department);
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "", department: "fire" });
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string }>({ kind: "success", text: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePhone(form.phone, language);
    setPhoneError(validationError);
    if (validationError) return;
    setLoading(true);
    setMsg({ kind: "success", text: "" });
    try {
      const data = await api<{ token?: string }>("/authority/login", { method: "POST", body: JSON.stringify(form) });
      localStorage.setItem("department", form.department);
      if (data.token) localStorage.setItem("session_token", data.token);
      navigate({ to: "/authority/dashboard" });
    } catch (err: any) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-16">
      <div className="crs-card">
        <h1 className="text-2xl font-bold">{t("authorityLoginTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("accessQueue")}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="crs-label">{t("phone")}</label>
            <input className="crs-input" required value={form.phone}
              onChange={(e) => { setForm({ ...form, phone: e.target.value }); setPhoneError(""); }} />
            {phoneError && <p className="mt-1 text-sm text-destructive">{phoneError}</p>}
          </div>
          <div>
            <label className="crs-label">{t("password")}</label>
            <input className="crs-input" type="password" required value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="crs-label">{t("department")}</label>
            <select className="crs-input" value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{departmentLabel(d)}</option>
              ))}
            </select>
          </div>
          <Alert kind={msg.kind} message={msg.text} />
          <button disabled={loading} className="crs-btn w-full">
            {loading ? t("loggingIn") : t("login")}
          </button>
          <p className="text-sm text-center text-muted-foreground">
            {t("newAuthority")} <Link to="/authority/register" className="text-primary font-medium">{t("register")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
