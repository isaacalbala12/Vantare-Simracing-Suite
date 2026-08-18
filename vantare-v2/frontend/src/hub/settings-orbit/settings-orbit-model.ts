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
