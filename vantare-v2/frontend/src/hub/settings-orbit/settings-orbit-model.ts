import { HOTKEY_KEYS } from "../settings/settings-contract";
import { ORBIT_KEYS, orbitStore } from "../orbit/orbit-store";
import { isSettingsSection, type SettingsSection } from "../orbit/views";

/**
 * Modelo puro de la pantalla Ajustes de Command Orbit (briefing 11).
 *
 * Aquí no vive ningún dato: solo las reglas que la vista necesita y que
 * conviene poder probar sin montar React (sección activa, agrupación de
 * atajos, conflictos y presentación de una combinación como keycaps).
 */

/** Sección a la que llevan el rail y la paleta cuando nadie pide otra. */
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "application";

/**
 * Sección activa: manda lo que pida quien navega (rail, paleta o `?settings=`),
 * después la última sección visitada y por último `application`.
 */
export function resolveSettingsSection(
  requested?: string | null,
  stored: string | null = orbitStore.get(ORBIT_KEYS.settingsSection),
): SettingsSection {
  if (isSettingsSection(requested)) return requested;
  if (isSettingsSection(stored)) return stored;
  return DEFAULT_SETTINGS_SECTION;
}

export function persistSettingsSection(section: SettingsSection): void {
  orbitStore.set(ORBIT_KEYS.settingsSection, section);
}

/* ────────────────────────────────────────────────────────────── ATAJOS ── */

/** Id de un atajo del contrato real (`settings-contract.ts`). */
export type HotkeyKey = (typeof HOTKEY_KEYS)[number];

export interface HotkeyGroup {
  id: string;
  keys: HotkeyKey[];
}

/**
 * Agrupación de los atajos **reales**.
 *
 * El prototipo dibuja cuatro grupos (Overlay 4 · Launcher y carrera 3 · Studio
 * 4 · Global 2), pero el contrato de la app declara cuatro combinaciones y
 * todas son del overlay: `HOTKEY_KEYS`. Inventar los otros nueve sería pintar
 * atajos que no existen, así que la pantalla muestra el grupo real y lo dice
 * en una nota. Cuando el backend registre más, basta con añadirlos aquí.
 */
export const HOTKEY_GROUPS: HotkeyGroup[] = [
  { id: "overlay", keys: ["toggleOverlay", "nextProfile", "prevProfile", "cycleDeltaReference"] },
];

const KEY_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  meta: "Win",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  space: "Espacio",
};

/**
 * Una combinación guardada (`ctrl+shift+v`) como keycaps.
 *
 * Devuelve la lista vacía cuando el atajo no está asignado: la fila lo pinta
 * en punteado en vez de inventar una tecla.
 */
export function keycapsOf(combo: string | undefined | null): string[] {
  if (!combo || !combo.trim()) return [];
  return combo
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part));
}

/**
 * Atajos que comparten combinación.
 *
 * Un atajo sin asignar nunca entra en conflicto: la ausencia no colisiona con
 * la ausencia.
 */
export function conflictingHotkeys(hotkeys: Record<string, string>): Set<string> {
  const byCombo = new Map<string, string[]>();
  for (const key of HOTKEY_KEYS) {
    const combo = (hotkeys[key] ?? "").trim().toLowerCase();
    if (!combo) continue;
    const list = byCombo.get(combo);
    if (list) list.push(key);
    else byCombo.set(combo, [key]);
  }
  const conflicting = new Set<string>();
  for (const keys of byCombo.values()) {
    if (keys.length < 2) continue;
    for (const key of keys) conflicting.add(key);
  }
  return conflicting;
}

/* ─────────────────────────────────────────────────────────── BÚSQUEDA ── */

/** Una entrada buscable: la fila vive en una sección y su título es una clave i18n. */
export interface SettingsSearchEntry {
  section: SettingsSection;
  key: string;
}

/**
 * Índice de búsqueda de Ajustes.
 *
 * Solo contiene claves que la pantalla pinta de verdad: cada entrada es el
 * título de una fila o superficie existente (o el nombre de la sección en la
 * columna). Añadir aquí una clave que ninguna sección renderiza sería ofrecer
 * un resultado que no lleva a ningún sitio.
 */
export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // Secciones, para que «cuenta» o «datos» lleven al sitio aunque el ajuste
  // buscado no tenga fila propia.
  { section: "account", key: "settings.nav.account" },
  { section: "application", key: "settings.nav.application" },
  { section: "updates", key: "settings.nav.updates" },
  { section: "hotkeys", key: "settings.nav.hotkeys" },
  { section: "diagnostics", key: "settings.nav.diagnostics" },

  // Cuenta
  { section: "account", key: "settings.account.session" },
  { section: "account", key: "settings.account.devices" },
  { section: "account", key: "settings.account.planEyebrow" },

  // Aplicación · interfaz
  { section: "application", key: "settings.app.language" },
  { section: "application", key: "settings.app.density" },
  { section: "application", key: "settings.app.theme" },
  { section: "application", key: "settings.app.reduceMotion" },

  // Aplicación · sistema
  { section: "application", key: "settings.app.startup" },
  { section: "application", key: "settings.app.startupMinimised" },
  { section: "application", key: "settings.app.notifyUpdates" },
  { section: "application", key: "settings.app.notifyLauncher" },
  { section: "application", key: "settings.app.notifySystem" },

  // Actualizaciones
  { section: "updates", key: "settings.upd.installed" },
  { section: "updates", key: "settings.upd.channels" },
  { section: "updates", key: "settings.upd.news" },

  // Atajos
  { section: "hotkeys", key: "settings.hotkeys.toggleOverlay" },
  { section: "hotkeys", key: "settings.hotkeys.nextProfile" },
  { section: "hotkeys", key: "settings.hotkeys.prevProfile" },
  { section: "hotkeys", key: "settings.hotkeys.cycleDeltaReference" },

  // Diagnóstico
  { section: "diagnostics", key: "settings.diag.core" },
  { section: "diagnostics", key: "settings.diag.overlay" },
  { section: "diagnostics", key: "settings.diag.cpu" },
  { section: "diagnostics", key: "settings.diag.storage" },
  { section: "diagnostics", key: "settings.diag.folder" },
  { section: "diagnostics", key: "settings.diag.logs" },
  { section: "diagnostics", key: "settings.diag.sampling" },
  { section: "diagnostics", key: "settings.diag.report" },
  { section: "diagnostics", key: "settings.diag.events" },
];

/**
 * Comparación tolerante: minúsculas y sin diacríticos, para que «telemetry»
 * encuentre «Telemetría» y «version» encuentre «Versión instalada».
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "");
}

/**
 * Resultados de búsqueda sobre el índice.
 *
 * El traductor entra como función para que el modelo siga siendo puro y
 * probable sin montar React. Cada entrada se compara con su título y con su
 * texto auxiliar (`<key>Sub`), que describe la fila mejor que el título.
 */
export function searchSettings(
  query: string,
  translateKey: (key: string) => string,
): SettingsSearchEntry[] {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return [];
  return SETTINGS_SEARCH_INDEX.filter((entry) => {
    const title = normalizeForSearch(translateKey(entry.key));
    const hint = normalizeForSearch(translateKey(`${entry.key}Sub`));
    return title.includes(needle) || hint.includes(needle);
  });
}

/* ────────────────────────────────────────────────── REDUCIR ANIMACIONES ── */

/**
 * Preferencia local de movimiento reducido.
 *
 * No hay contrato en Go para esto, así que es exactamente lo que dice ser: una
 * preferencia del cliente que marca `data-reduce-motion` en el `body` y que el
 * CSS de Orbit respeta, igual que la densidad. No se inventa ningún ajuste del
 * sistema: la casilla del sistema operativo sigue mandando por su cuenta con
 * `prefers-reduced-motion`.
 */
export function getStoredReduceMotion(): boolean {
  return orbitStore.get(ORBIT_KEYS.reduceMotion) === "1";
}

export function applyReduceMotion(reduce: boolean, body: HTMLElement = document.body): void {
  if (reduce) body.dataset.reduceMotion = "true";
  else delete body.dataset.reduceMotion;
}

export function persistReduceMotion(reduce: boolean): void {
  orbitStore.set(ORBIT_KEYS.reduceMotion, reduce ? "1" : "0");
}

/* ─────────────────────────────────────────────────────────────── CORREO ── */

/**
 * Correo enmascarado tal y como lo pinta la referencia (`isaac•••@gmail.com`).
 * No es anonimización: es la misma dirección con el centro del usuario tapado,
 * para que la tarjeta de identidad no sea una captura de pantalla peligrosa.
 */
export function maskEmail(email: string | undefined | null): string {
  const value = (email ?? "").trim();
  if (!value.includes("@")) return value;
  const [user, domain] = value.split("@");
  if (user.length <= 3) return `${user}•••@${domain}`;
  return `${user.slice(0, Math.min(5, user.length - 1))}•••@${domain}`;
}
