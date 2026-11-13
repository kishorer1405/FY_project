import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";
import { Alert } from "../components/Alert";
import { validatePhone, validateUsername } from "../lib/validation";
import { useLanguage } from "../i18n/useLanguage";

export const Route = createFileRoute("/authority/register")({
  component: AuthorityRegister,
});

const DEPARTMENTS = ["fire", "water", "electricity", "road", "garbage"] as const;

function AuthorityRegister() {
  const { t, language } = useLanguage();
  const departmentLabel = (department: string) => ({ fire: t("fire"), water: t("water"), electricity: t("electrical"), road: t("road"), garbage: t("garbage") }[department] || department);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    department: "fire",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ name: "", phone: "" });
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string }>({ kind: "success", text: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ kind: "success", text: "" });
    const nextErrors = { name: validateUsername(form.name, language), phone: validatePhone(form.phone, language) };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.phone) return;
    if (form.password !== form.confirm) {
      setMsg({ kind: "error", text: t("passwordMismatch") });
      return;
    }
    setLoading(true);
    try {
      await api("/authority/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          department: form.department,
          password: form.password,
        }),
      });
      setMsg({ kind: "success", text: t("registrationRedirect") });
      setTimeout(() => navigate({ to: "/authority/login" }), 900);
    } catch (err: any) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-16">
      <div className="crs-card">
        <h1 className="text-2xl font-bold">{t("authorityRegisterTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("joinTeam")}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="crs-label">{t("fullName")}</label>
            <input className="crs-input" required value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors((current) => ({ ...current, name: "" })); }} />
            {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name}</p>}
          </div>
          <div>
            <label className="crs-label">{t("phone")}</label>
            <input className="crs-input" required value={form.phone}
              onChange={(e) => { setForm({ ...form, phone: e.target.value }); setErrors((current) => ({ ...current, phone: "" })); }} />
            {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone}</p>}
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
          <div>
            <label className="crs-label">{t("password")}</label>
            <input className="crs-input" type="password" required value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="crs-label">{t("confirmPassword")}</label>
            <input className="crs-input" type="password" required value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </div>
          <Alert kind={msg.kind} message={msg.text} />
          <button disabled={loading} className="crs-btn w-full">
            {loading ? t("registering") : t("register")}
          </button>
          <p className="text-sm text-center text-muted-foreground">
            {t("alreadyRegistered")} <Link to="/authority/login" className="text-primary font-medium">{t("login")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
