// Shared, pure helpers for the calendar views.
// Consolidates tier styling/label logic and timezone-aware formatting that
// used to be copy-pasted across Month/Week/Day views and the detail/rail panels.

export type TierKey = "beginner" | "intermediate" | "advanced" | "weekly" | "special";

export const TIER_LABELS: Record<string, string> = {
  beginner: "Bronce",
  intermediate: "Plata",
  advanced: "Oro",
  weekly: "Semanal",
  special: "Especial",
};

export function tierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? tier;
}

export type TierStyle = {
  text: string;
  bg: string;
  border: string;
  /** Solid accent used for bars/badges where an opaque color reads better. */
  accent: string;
};

export const TIER_STYLES: Record<string, TierStyle> = {
  beginner: { text: "#CD7F32", bg: "rgba(205,127,50,.12)", border: "rgba(205,127,50,.5)", accent: "#CD7F32" },
  intermediate: { text: "#B8BFC8", bg: "rgba(184,191,200,.12)", border: "rgba(184,191,200,.5)", accent: "#B8BFC8" },
  advanced: { text: "#D4A017", bg: "rgba(212,160,23,.12)", border: "rgba(212,160,23,.5)", accent: "#D4A017" },
  weekly: { text: "#ff3b3b", bg: "rgba(255,59,59,.12)", border: "rgba(255,59,59,.5)", accent: "#ff3b3b" },
  special: { text: "#f59e0b", bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.5)", accent: "#f59e0b" },
};

export function tierStyle(tier: string): TierStyle {
  return TIER_STYLES[tier] ?? { text: "#f5f5f5", bg: "rgba(245,245,245,.05)", border: "rgba(245,245,245,.1)", accent: "#f5f5f5" };
}

/**
 * Formats a Date in the calendar's declared timezone via Intl. This is the
 * single source of truth for time rendering so the calendar never silently
 * shows the browser's local timezone (the app ships with UTC official data).
 */
export function formatInZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone, ...options }).format(date);
}

export function formatTimeInZone(date: Date, timeZone: string): string {
  return formatInZone(date, timeZone, { hour: "2-digit", minute: "2-digit" });
}

export function formatDateInZone(date: Date, timeZone: string): string {
  return formatInZone(date, timeZone, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTimeInZone(date: Date, timeZone: string): string {
  return `${formatDateInZone(date, timeZone)} · ${formatTimeInZone(date, timeZone)}`;
}

const SPANISH_WEEKDAYS_FULL = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

export function weekdayNameInZone(date: Date, timeZone: string): string {
  // Resolve the weekday in the target zone by formatting a single field.
  const weekday = formatInZone(date, timeZone, { weekday: "short" });
  return weekday;
}

export { SPANISH_WEEKDAYS_FULL };

/**
 * Human summary of an interval-series cadence, e.g. "Cada 15 min".
 * Shared so every view describes preparation frequency identically.
 */
export function cadenceLabel(intervalMinutes?: number): string {
  if (typeof intervalMinutes === "number" && intervalMinutes > 0) {
    return `Cada ${intervalMinutes} min`;
  }
  return "Horario pendiente";
}
