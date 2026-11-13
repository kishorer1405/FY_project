import { createContext, useEffect, useMemo, useState } from "react";
import { translations, type Language, type TranslationKey } from "./translations";

const STORAGE_KEY = "complaint_resolver_language";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
};

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(STORAGE_KEY) === "kn" ? "kn" : "en";
  });

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) return;
    document.documentElement.lang = language === "kn" ? "kn" : "en";
    document.title = language === "kn" ? "ಕೃತಕ ಬುದ್ಧಿಮತ್ತೆ ದೂರು ಪರಿಹಾರ ವ್ಯವಸ್ಥೆ" : "AI Complaint Resolution System";
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key: TranslationKey) => translations[language][key] || translations.en[key],
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
