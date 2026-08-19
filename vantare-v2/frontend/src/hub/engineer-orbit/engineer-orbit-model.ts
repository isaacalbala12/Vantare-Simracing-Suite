/**
 * Modelo de la vista Ingeniero de Orbit (briefing 08).
 *
 * Aquí vive lo que la pantalla deriva del estado real: el orden y el color de
 * las categorías, la traducción entre el modo de salida del contrato y la
 * insignia `A·V`, el filtrado del feed por origen y la preferencia local de
 * voz. Ningún dato de telemetría se inventa en este archivo.
 */

import type {
  EngineerNotification,
  EngineerOutputMode,
} from "../../engineer/engineer-types";

/** Categorías del contrato (`engineer_service.go`) en el orden del prototipo. */
export const ENGINEER_CATEGORIES = [
  { id: "spotter", labelKey: "engineer.outputs.spotter", color: "var(--orbit-coral)" },
  { id: "fuel", labelKey: "engineer.outputs.fuel", color: "var(--orbit-ember)" },
  { id: "penalties", labelKey: "engineer.outputs.penalties", color: "var(--orbit-red)" },
  { id: "laps", labelKey: "engineer.outputs.laps", color: "var(--orbit-cyan-soft)" },
  { id: "timings", labelKey: "engineer.outputs.gaps", color: "var(--orbit-green)" },
  { id: "pitstops", labelKey: "engineer.outputs.pits", color: "#c9a2ff" },
] as const;

export type EngineerCategoryId = (typeof ENGINEER_CATEGORIES)[number]["id"];

/** Los cuatro modos del `Seg` de salidas, en el orden `A+V · V · A · Off`. */
export const ENGINEER_OUTPUT_MODES: readonly EngineerOutputMode[] = [
  "both",
  "visual",
  "audio",
  "disabled",
];

export const OUTPUT_MODE_LABEL_KEY: Record<EngineerOutputMode, string> = {
  both: "engineer.outputs.av",
  visual: "engineer.outputs.v",
  audio: "engineer.outputs.a",
  disabled: "engineer.outputs.off",
};

export const SENSITIVITIES = ["conservative", "normal", "aggressive"] as const;
export type EngineerSensitivity = (typeof SENSITIVITIES)[number];

export function normalizeSensitivity(value: string | undefined): EngineerSensitivity {
  return (SENSITIVITIES as readonly string[]).includes(value ?? "")
    ? (value as EngineerSensitivity)
    : "normal";
}

/** Modo real de una categoría; `both` es el valor por defecto del servicio. */
export function modeOf(
  modes: Record<string, EngineerOutputMode> | undefined,
  category: string,
): EngineerOutputMode {
  const mode = modes?.[category];
  return mode && mode in OUTPUT_MODE_LABEL_KEY ? mode : "both";
}

/** Insignia de la fila del feed: la salida efectiva de ese mensaje. */
export function outputBadge(mode: EngineerOutputMode): string {
  if (mode === "both") return "A·V";
  if (mode === "visual") return "V";
  if (mode === "audio") return "A";
  return "—";
}

export type RadioFilter = "all" | "spotter" | "engineer";

/**
 * Feed del panel de radio: más reciente arriba y filtrado por origen.
 * No recorta ni reordena por prioridad: es el orden real de emisión.
 */
export function radioFeed(
  messages: readonly EngineerNotification[],
  filter: RadioFilter,
): EngineerNotification[] {
  const visible = filter === "all" ? [...messages] : messages.filter((m) => m.role === filter);
  return visible.sort((a, b) => b.createdAt - a.createdAt);
}

/** Une el estado y las notificaciones sueltas sin duplicar ids. */
export function mergeMessages(
  current: readonly EngineerNotification[],
  incoming: readonly EngineerNotification[],
  limit = 50,
): EngineerNotification[] {
  const seen = new Set<string>();
  const merged: EngineerNotification[] = [];
  for (const message of [...incoming, ...current]) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }
  return merged.slice(0, limit);
}

/** Hora mono del feed (`18:44:12`), en la zona local. */
export function clockOf(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ── preferencia local de voz ────────────────────────────────────────────────

export const VOICE_STORAGE_KEY = "vantare.v03orbit.engineer.voice";

export interface VoicePrefs {
  voiceId: string;
  volume: number;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = { voiceId: "", volume: 0.72 };

export function readVoicePrefs(): VoicePrefs {
  try {
    const raw = window.localStorage?.getItem(VOICE_STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_PREFS;
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      voiceId: typeof parsed.voiceId === "string" ? parsed.voiceId : "",
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? Math.min(1, Math.max(0, parsed.volume))
          : DEFAULT_VOICE_PREFS.volume,
    };
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
}

export function writeVoicePrefs(prefs: VoicePrefs): void {
  try {
    window.localStorage?.setItem(VOICE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento la preferencia solo vive en memoria.
  }
}
