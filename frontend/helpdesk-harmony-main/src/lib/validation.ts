export const USERNAME_REGEX = /^[a-zA-Z]{3,30}$/;
export const PHONE_REGEX = /^\d{10}$/;

import { translations, type Language } from "../i18n/translations";

export function validateUsername(value: string, language: Language = "en"): string {
  const messages = translations[language];
  const trimmed = value.trim();

  if (!trimmed) return messages.usernameRequired;
  if (trimmed.length < 3 || trimmed.length > 30) {
    return messages.usernameLength;
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return messages.usernameLetters;
  }

  return "";
}

export function validatePhone(value: string, language: Language = "en"): string {
  const messages = translations[language];
  if (!value) return messages.phoneRequired;
  if (!PHONE_REGEX.test(value)) {
    if (!/^\d+$/.test(value)) {
      return messages.phoneDigits;
    }
    return messages.phoneLength;
  }

  return "";
}
