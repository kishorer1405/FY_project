import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Navbar } from "../components/Navbar";
import { LanguageProvider } from "../i18n/LanguageContext";
import { useLanguage } from "../i18n/useLanguage";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("pageNotFound")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("pageNotFoundDescription")}</p>
        <div className="mt-6">
          <Link to="/" className="crs-btn">{t("goHome")}</Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AI Complaint Resolution System" },
      { name: "description", content: "Submit and track complaints, resolved by AI-routed authorities." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <LanguageProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </LanguageProvider>
  );
}
