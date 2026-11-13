import { useLanguage } from "../i18n/useLanguage";

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="flex items-center rounded-md border border-border bg-background p-0.5 text-xs" aria-label="Language selector">
      <button
        type="button"
        className={`rounded px-2 py-1 font-medium ${language === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
      >
        {t("languageEnglish")}
      </button>
      <button
        type="button"
        className={`rounded px-2 py-1 font-medium ${language === "kn" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        onClick={() => setLanguage("kn")}
        aria-pressed={language === "kn"}
      >
        {t("languageKannada")}
      </button>
    </div>
  );
}
