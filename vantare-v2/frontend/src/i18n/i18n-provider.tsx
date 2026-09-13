import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  getDictionary,
  isDictionaryLoaded,
  loadDictionary,
  normalizeLocale,
  translate,
  type Locale,
} from "./i18n";
import { I18nContext, LANGUAGE_OPTIONS } from "./i18n-context";

const STORAGE_KEY = "vantare.locale";

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalizeLocale(stored);
  } catch {
    return DEFAULT_LOCALE;
  }
}

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
  // El diccionario activo se conserva mientras carga el siguiente: al
  // cambiar de idioma la UI sigue en el anterior un frame en vez de caer
  // al fallback de golpe.
  const [activeDict, setActiveDict] = useState(() => getDictionary(readStoredLocale()));
  // El idioma por defecto viene eager; si el guardado es otro, el primer
  // render espera al chunk del diccionario en vez de montar en español.
  const [ready, setReady] = useState(() => isDictionaryLoaded(readStoredLocale()));

  useEffect(() => {
    let active = true;
    // loadDictionary resuelve en microtask aunque el dict ya esté cargado:
    // una sola ruta async, sin setState síncrono en el cuerpo del efecto.
    void loadDictionary(locale).then(() => {
      if (!active) return;
      setActiveDict(getDictionary(locale));
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [locale]);

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
    (key: string) => activeDict?.[key] ?? translate(DEFAULT_LOCALE, key),
    [activeDict],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, options: LANGUAGE_OPTIONS }),
    [locale, setLocale, t],
  );

  if (!ready) {
    return null;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
