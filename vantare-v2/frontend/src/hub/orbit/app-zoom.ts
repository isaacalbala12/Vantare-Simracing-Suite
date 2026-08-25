import { ORBIT_KEYS, orbitStore } from "./orbit-store";

export const APP_ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export type AppZoom = (typeof APP_ZOOM_STEPS)[number];

export const DEFAULT_APP_ZOOM: AppZoom = 1;
export const APP_ZOOM_EVENT = "vantare:app-zoom-change";

export type AppZoomDirection = -1 | 1;
export type AppZoomShortcut = "decrease" | "increase" | "reset";

export function normalizeAppZoom(value: string | number | null | undefined): AppZoom {
  const parsed = typeof value === "number" ? value : Number(value);
  return APP_ZOOM_STEPS.includes(parsed as AppZoom)
    ? (parsed as AppZoom)
    : DEFAULT_APP_ZOOM;
}

export function getStoredAppZoom(storage?: Storage): AppZoom {
  return normalizeAppZoom(orbitStore.get(ORBIT_KEYS.appZoom, storage));
}

export function nextAppZoom(current: AppZoom, direction: AppZoomDirection): AppZoom {
  const index = APP_ZOOM_STEPS.indexOf(normalizeAppZoom(current));
  const nextIndex = Math.max(0, Math.min(APP_ZOOM_STEPS.length - 1, index + direction));
  return APP_ZOOM_STEPS[nextIndex];
}

/**
 * Guarda y publica una sola preferencia para Ajustes, atajos y shell.
 *
 * El evento mantiene sincronizadas las superficies ya montadas. Si el
 * almacenamiento no está disponible, el cambio sigue vivo durante la sesión.
 */
export function setAppZoom(
  value: AppZoom,
  options: { storage?: Storage; target?: Window } = {},
): AppZoom {
  const next = normalizeAppZoom(value);
  orbitStore.set(ORBIT_KEYS.appZoom, String(next), options.storage);
  const target = options.target ?? (typeof window === "undefined" ? undefined : window);
  target?.dispatchEvent(new CustomEvent<AppZoom>(APP_ZOOM_EVENT, { detail: next }));
  return next;
}

export function subscribeAppZoom(
  listener: (zoom: AppZoom) => void,
  target: Window = window,
): () => void {
  const onChange = (event: Event) => {
    listener(normalizeAppZoom((event as CustomEvent<AppZoom>).detail));
  };
  target.addEventListener(APP_ZOOM_EVENT, onChange);
  return () => target.removeEventListener(APP_ZOOM_EVENT, onChange);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

/** Chrome-like shortcuts, kept out of fields and hotkey capture controls. */
export function appZoomShortcut(event: KeyboardEvent): AppZoomShortcut | null {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey || isEditableTarget(event.target)) {
    return null;
  }
  if (event.key === "0" || event.code === "Numpad0") return "reset";
  if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") return "increase";
  if (event.key === "-" || event.code === "NumpadSubtract") return "decrease";
  return null;
}

export function appZoomPercent(zoom: AppZoom): number {
  return Math.round(zoom * 100);
}
