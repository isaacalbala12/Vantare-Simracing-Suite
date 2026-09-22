import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Events } from "@wailsio/runtime";
import {
  DEFAULT_LOCALE,
  getDictionary,
  isDictionaryLoaded,
  loadDictionary,
  normalizeLocale,
  translate,
  type Locale,
  isLocale,
} from "./i18n";
import { I18nContext, LANGUAGE_OPTIONS } from "./i18n-context";

const STORAGE_KEY = "vantare.locale";
let requestSerial = 0;

function dispatchLocaleRequest(
  desired: { current: Locale | null },
  inFlight: { current: { id: string; locale: Locale } | null },
  prefix: { current: string | null },
): void {
  if (inFlight.current || !desired.current) return;
  prefix.current ??= globalThis.crypto?.randomUUID?.() ?? String(Math.random());
  const request = { id: `${prefix.current}:${++requestSerial}`, locale: desired.current };
  inFlight.current = request;
  const failed = () => {
    if (inFlight.current?.id !== request.id) return;
    inFlight.current = null;
    if (desired.current === request.locale) desired.current = null;
    dispatchLocaleRequest(desired, inFlight, prefix);
  };
  try {
    void Promise.resolve(Events.Emit("ui-locale:set", { locale: request.locale, requestId: request.id })).catch(failed);
  } catch { failed(); }
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalizeLocale(stored);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export type UILocaleMode = "browser" | "native-hub" | "native-consumer" | "obs";

export function I18nProvider({ children, mode = "browser" }: { children: ReactNode; mode?: UILocaleMode }) {
  const parent = useContext(I18nContext);
  // Si ya existe un I18nProvider padre (p.ej. el provider global en HubApp),
  // este provider es transparente: delega al contexto existente para que
  // toda la app comparta una sola fuente de verdad de idioma.
  if (parent) {
    return <>{children}</>;
  }

  return <I18nProviderInner mode={mode}>{children}</I18nProviderInner>;
}

type LocaleSnapshot = { locale: Locale | ""; revision: number };

function parseSnapshot(value: unknown): LocaleSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<LocaleSnapshot>;
  if (item.locale !== "" && !isLocale(item.locale)) return null;
  if (!Number.isSafeInteger(item.revision) || (item.revision ?? -1) < 0) return null;
  return item as LocaleSnapshot;
}

function I18nProviderInner({ children, mode }: { children: ReactNode; mode: UILocaleMode }) {
  const requestPrefix = useRef<string | null>(null);
  const desiredLocale = useRef<Locale | null>(null);
  const inFlight = useRef<{ id: string; locale: Locale } | null>(null);
  const dispatch = useCallback(() => dispatchLocaleRequest(desiredLocale, inFlight, requestPrefix), []);
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  // El diccionario activo se conserva mientras carga el siguiente: al
  // cambiar de idioma la UI sigue en el anterior un frame en vez de caer
  // al fallback de golpe.
  const [activeDict, setActiveDict] = useState(() => getDictionary(readStoredLocale()));
  // El idioma por defecto viene eager; si el guardado es otro, el primer
  // render espera al chunk del diccionario en vez de montar en español.
  const [ready, setReady] = useState(() => isDictionaryLoaded(readStoredLocale()));

  useEffect(() => {
    if (mode === "browser") {
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY && isLocale(event.newValue)) setLocaleState(event.newValue);
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    let active = true;
    let currentRevision = -1;
    let initialized = false;
    let initializationRequested = false;
    const legacy = readStoredLocale();
    const apply = (raw: unknown, snapshotEvent: boolean) => {
      if (!active) return;
      const snapshot = parseSnapshot(raw);
      if (!snapshot || (initialized && snapshot.revision < currentRevision)) return;
      initialized = true;
      currentRevision = snapshot.revision;
      if (snapshot.locale === "") {
        if (mode === "native-hub" && !initializationRequested) {
          initializationRequested = true;
          Events.Emit("ui-locale:initialize", { locale: legacy });
        }
        return;
      }
      // The first SSE snapshot is authoritative after a native restart.
      if (snapshotEvent || snapshot.revision >= currentRevision) {
        setLocaleState(snapshot.locale);
        try { localStorage.setItem(STORAGE_KEY, snapshot.locale); } catch { /* restricted storage */ }
      }
    };
    if (mode === "obs") {
      let generation = 0;
      const source = new EventSource("/api/ui-locale/stream");
      const mine = ++generation;
      const onSnapshot = (event: MessageEvent<string>) => {
        if (!active || mine !== generation) return;
        try {
          const snapshot = parseSnapshot(JSON.parse(event.data));
          if (!snapshot) return;
          currentRevision = -1;
          initialized = false;
          apply(snapshot, true);
        } catch { /* invalid event */ }
      };
      const onChanged = (event: MessageEvent<string>) => {
        if (!active || mine !== generation) return;
        try { apply(JSON.parse(event.data), false); } catch { /* invalid event */ }
      };
      source.addEventListener("ui-locale:snapshot", onSnapshot as EventListener);
      source.addEventListener("ui-locale:changed", onChanged as EventListener);
      return () => { active = false; generation++; source.close(); };
    }
    const unwrap = (event: unknown): unknown => {
      const data = event && typeof event === "object" && "data" in event ? (event as { data: unknown }).data : event;
      return Array.isArray(data) ? data[0] : data;
    };
    const snapshotOff = Events.On("ui-locale:snapshot", (event: unknown) => apply(unwrap(event), true));
    const changedOff = Events.On("ui-locale:changed", (event: unknown) => apply(unwrap(event), false));
    const confirmedOff = Events.On("ui-locale:confirmed", (event: unknown) => {
      const data = unwrap(event) as { requestId?: unknown; locale?: unknown };
      if (!active || !inFlight.current || data?.requestId !== inFlight.current.id) return;
      inFlight.current = null;
      if (desiredLocale.current === data.locale) desiredLocale.current = null;
      dispatch();
    });
    const errorOff = Events.On("ui-locale:error", (event: unknown) => {
      const data = unwrap(event) as { requestId?: unknown };
      if (!active || !inFlight.current || data?.requestId !== inFlight.current.id) return;
      const failed = inFlight.current.locale;
      inFlight.current = null;
      if (desiredLocale.current === failed) desiredLocale.current = null;
      dispatch();
    });
    Events.Emit("ui-locale:get");
    return () => { active = false; snapshotOff?.(); changedOff?.(); confirmedOff?.(); errorOff?.(); inFlight.current = null; desiredLocale.current = null; };
  }, [mode, dispatch]);

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
    if (!isLocale(newLocale)) return;
    if (mode !== "browser") {
      if (mode !== "obs") { desiredLocale.current = newLocale; dispatch(); }
      return;
    }
    setLocaleState(newLocale);
    try { localStorage.setItem(STORAGE_KEY, newLocale); } catch { /* restricted storage */ }
  }, [mode, dispatch]);

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
