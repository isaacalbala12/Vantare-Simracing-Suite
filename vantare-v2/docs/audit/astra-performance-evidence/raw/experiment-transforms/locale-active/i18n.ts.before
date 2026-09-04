import { es } from "./locales/es";
import { en } from "./locales/en";
import { pt } from "./locales/pt";
import { it } from "./locales/it";

export type Locale = "es" | "en" | "pt" | "it";

export const SUPPORTED_LOCALES: readonly Locale[] = ["es", "en", "pt", "it"];

export const DEFAULT_LOCALE: Locale = "es";

const dictionaries: Record<Locale, Record<string, string>> = { es, en, pt, it };

export function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  return DEFAULT_LOCALE;
}

export function translate(locale: Locale, key: string): string {
  const dict = dictionaries[normalizeLocale(locale)];
  return dict[key] ?? key;
}
