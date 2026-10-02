import { es } from "./locales/es";

export type Locale = "es" | "en" | "pt" | "it";

export const SUPPORTED_LOCALES: readonly Locale[] = ["es", "en", "pt", "it"];

export const DEFAULT_LOCALE: Locale = "es";

// El idioma por defecto queda eager: cualquier clave siempre resuelve a
// español como fallback inmediato. Los demás diccionarios se cargan bajo
// demanda con loadDictionary; hasta que llegan, translate cae al default.
const dictionaries: Partial<Record<Locale, Record<string, string>>> = { es };

const loaders: Record<Exclude<Locale, "es">, () => Promise<Record<string, string>>> = {
  en: () => import("./locales/en").then((m) => m.en),
  pt: () => import("./locales/pt").then((m) => m.pt),
  it: () => import("./locales/it").then((m) => m.it),
};

export function isDictionaryLoaded(locale: Locale): boolean {
  return dictionaries[normalizeLocale(locale)] !== undefined;
}

export function getDictionary(locale: Locale): Record<string, string> | undefined {
  return dictionaries[normalizeLocale(locale)];
}

export async function loadDictionary(locale: Locale): Promise<void> {
  const safe = normalizeLocale(locale);
  if (safe === "es" || dictionaries[safe]) return;
  dictionaries[safe] = await loaders[safe]();
}

export function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  return DEFAULT_LOCALE;
}

export function translate(locale: Locale, key: string): string {
  const safe = normalizeLocale(locale);
  const dict = dictionaries[safe] ?? dictionaries[DEFAULT_LOCALE];
  return dict?.[key] ?? key;
}
