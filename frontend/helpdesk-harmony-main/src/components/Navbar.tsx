import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LanguageSelector } from "./LanguageSelector";
import { useLanguage } from "../i18n/useLanguage";
import { translations, type TranslationKey } from "../i18n/translations";

export function Navbar() {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const { t } = useLanguage();
  const isAdmin = location.pathname.startsWith("/admin");
  const label = (key: TranslationKey) => isAdmin ? translations.en[key] : t(key);
  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
  const department = typeof window !== "undefined" ? localStorage.getItem("department") : null;
  const admin = typeof window !== "undefined" ? localStorage.getItem("admin_id") : null;

  const logout = () => {
    localStorage.removeItem("user_id");
    localStorage.removeItem("department");
    localStorage.removeItem("admin_id");
    localStorage.removeItem("session_token");
    navigate({ to: "/" });
  };

  const linkCls = (path: string) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      location.pathname === path
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    }`;

  return (
    <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="w-7 h-7 rounded-md bg-primary text-primary-foreground inline-flex items-center justify-center text-sm">
            CR
          </span>
          <span className="hidden sm:inline">{label("brand")}</span>
        </Link>
        <nav className="flex items-center gap-1 flex-wrap">
          {!userId && !department && !admin && (
            <>
              <Link to="/user/login" className={linkCls("/user/login")}>{label("userLogin")}</Link>
              <Link to="/user/register" className={linkCls("/user/register")}>{label("userRegister")}</Link>
              <Link to="/authority/login" className={linkCls("/authority/login")}>{label("authorityLogin")}</Link>
              <Link to="/authority/register" className={linkCls("/authority/register")}>{label("authorityRegister")}</Link>
              <Link to="/admin/login" className={linkCls("/admin/login")}>Master Agent</Link>
            </>
          )}
          {userId && (
            <>
              <Link to="/user/dashboard" className={linkCls("/user/dashboard")}>{label("dashboard")}</Link>
              <button onClick={logout} className="crs-btn crs-btn-ghost text-sm">{label("logout")}</button>
            </>
          )}
          {department && (
            <>
              <Link to="/authority/dashboard" className={linkCls("/authority/dashboard")}>{label("dashboard")}</Link>
              <button onClick={logout} className="crs-btn crs-btn-ghost text-sm">{label("logout")}</button>
            </>
          )}
          {admin && (
            <>
              <Link to="/admin/dashboard" className={linkCls("/admin/dashboard")}>Admin Dashboard</Link>
              <button onClick={logout} className="crs-btn crs-btn-ghost text-sm">Logout</button>
            </>
          )}
          {!location.pathname.startsWith("/admin") && <LanguageSelector />}
        </nav>
      </div>
    </header>
  );
}
