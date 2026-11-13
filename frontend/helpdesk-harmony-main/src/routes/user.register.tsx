import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";
import { Alert } from "../components/Alert";
import { validatePhone, validateUsername } from "../lib/validation";
import { useLanguage } from "../i18n/useLanguage";

export const Route = createFileRoute("/user/register")({
  component: UserRegister,
});

function UserRegister() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", phone: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ name: "", phone: "" });
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string }>({ kind: "success", text: "" });

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    if (k === "name" || k === "phone") setErrors((current) => ({ ...current, [k]: "" }));
  };

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
      await api("/user/register", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone, password: form.password }),
      });
      setMsg({ kind: "success", text: t("registrationSuccess") });
      setTimeout(() => navigate({ to: "/user/login" }), 900);
    } catch (err: any) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-16">
      <div className="crs-card">
        <h1 className="text-2xl font-bold">{t("createAccount")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("registerCitizen")}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="crs-label">{t("fullName")}</label>
            <input className="crs-input" required value={form.name} onChange={update("name")} />
            {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name}</p>}
          </div>
          <div>
            <label className="crs-label">{t("phoneNumber")}</label>
            <input className="crs-input" required value={form.phone} onChange={update("phone")} />
            {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone}</p>}
          </div>
          <div>
            <label className="crs-label">{t("password")}</label>
            <input className="crs-input" type="password" required value={form.password} onChange={update("password")} />
          </div>
          <div>
            <label className="crs-label">{t("confirmPassword")}</label>
            <input className="crs-input" type="password" required value={form.confirm} onChange={update("confirm")} />
          </div>
          <Alert kind={msg.kind} message={msg.text} />
          <button type="submit" disabled={loading} className="crs-btn w-full">
            {loading ? t("registering") : t("register")}
          </button>
          <p className="text-sm text-center text-muted-foreground">
            {t("alreadyAccount")} <Link to="/user/login" className="text-primary font-medium">{t("login")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
