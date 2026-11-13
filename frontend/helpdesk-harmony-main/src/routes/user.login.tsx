import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../lib/api";
import { Alert } from "../components/Alert";
import { validatePhone } from "../lib/validation";
import { useLanguage } from "../i18n/useLanguage";

export const Route = createFileRoute("/user/login")({
  component: UserLogin,
});

function UserLogin() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "" });
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
      const data = await api<{ user_id?: string; id?: string; user?: { id?: string | number } }>("/user/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const id = data?.user_id ?? data?.id ?? data?.user?.id;
      if (!id) throw new Error(t("missingUserId"));
      localStorage.setItem("user_id", String(id));
      if (data.token) localStorage.setItem("session_token", data.token);
      navigate({ to: "/user/dashboard" });
    } catch (err: any) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-16">
      <div className="crs-card">
        <h1 className="text-2xl font-bold">{t("welcomeBack")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("loginToManage")}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="crs-label">{t("phoneNumber")}</label>
            <input className="crs-input" required value={form.phone}
              onChange={(e) => { setForm({ ...form, phone: e.target.value }); setPhoneError(""); }} />
            {phoneError && <p className="mt-1 text-sm text-destructive">{phoneError}</p>}
          </div>
          <div>
            <label className="crs-label">{t("password")}</label>
            <input className="crs-input" type="password" required value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <Alert kind={msg.kind} message={msg.text} />
          <button type="submit" disabled={loading} className="crs-btn w-full">
            {loading ? t("loggingIn") : t("login")}
          </button>
          <p className="text-sm text-center text-muted-foreground">
            {t("newHere")} <Link to="/user/register" className="text-primary font-medium">{t("register")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
