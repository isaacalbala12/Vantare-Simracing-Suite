import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  normalizeLocale,
  translate,
  type Locale,
} from "./i18n";

const STORAGE_KEY = "vantare.locale";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  options: { value: Locale; label: string }[];
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalizeLocale(stored);
  } catch {
    return DEFAULT_LOCALE;
  }
}

const LANGUAGE_OPTIONS: { value: Locale; label: string }[] = SUPPORTED_LOCALES.map(
  (loc) => ({
    value: loc,
    label: translate(loc, `language.${loc}`),
  }),
);

export function I18nProvider({ children }: { children: ReactNode }) {
  const parent = useContext(I18nContext);
  // Si ya existe un I18nProvider padre (p.ej. el provider global en HubApp),
  // este provider es transparente: delega al contexto existente para que
  // toda la app comparta una sola fuente de verdad de idioma.
  if (parent) {
    return <>{children}</>;
  }

  return <I18nProviderInner>{children}</I18nProviderInner>;
}

function I18nProviderInner({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    const safe = normalizeLocale(newLocale);
    setLocaleState(safe);
    try {
      localStorage.setItem(STORAGE_KEY, safe);
    } catch {
      // SSR or restricted environment — ignore
    }
  }, []);

  const t = useCallback(
    (key: string) => translate(locale, key),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, options: LANGUAGE_OPTIONS }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  const fallback = useMemo(
    () => ({
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key: string) => translate(DEFAULT_LOCALE, key),
      options: LANGUAGE_OPTIONS,
    }),
    [],
  );
  return ctx ?? fallback;
}
