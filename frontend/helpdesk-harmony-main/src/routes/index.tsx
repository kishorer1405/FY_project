import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "../i18n/useLanguage";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { t } = useLanguage();
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-20">
      <section className="text-center">
        <span className="crs-badge mb-4">{t("aiPowered")}</span>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">{t("complaintResolutionSystem")}</h1>
        <p className="mt-4 text-muted-foreground max-w-xl mx-auto">{t("homeDescription")}</p>
      </section>

      <section className="mt-12 grid sm:grid-cols-2 gap-5">
        <div className="crs-card">
          <h2 className="text-lg font-semibold">{t("forCitizens")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("citizenDescription")}</p>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Link to="/user/login" className="crs-btn">{t("login")}</Link>
            <Link to="/user/register" className="crs-btn crs-btn-ghost">{t("register")}</Link>
          </div>
        </div>
        <div className="crs-card">
          <h2 className="text-lg font-semibold">{t("forAuthorities")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("authorityDescription")}</p>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Link to="/authority/login" className="crs-btn">{t("login")}</Link>
            <Link to="/authority/register" className="crs-btn crs-btn-ghost">{t("register")}</Link>
          </div>
        </div>
      </section>

      <section className="mt-12 grid sm:grid-cols-3 gap-5">
        {[
          { t: t("submit"), d: t("submitDescription") },
          { t: t("aiRoutes"), d: t("routesDescription") },
          { t: t("track"), d: t("trackDescription") },
        ].map((s, i) => (
          <div key={i} className="crs-card">
            <div className="text-primary font-semibold">Step {i + 1}</div>
            <div className="font-medium mt-1">{s.t}</div>
            <p className="text-sm text-muted-foreground mt-1">{s.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
