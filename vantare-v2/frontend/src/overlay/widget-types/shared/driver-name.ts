import type { WidgetColumnV3 } from "./widget-column";

export type DriverNameFormat = "full" | "initial" | "surname";

export const DRIVER_NAME_FORMATS: readonly DriverNameFormat[] = ["full", "initial", "surname"];

const DEFAULT_NAME_MAX_CHARS = 16;

/**
 * Formato del nombre de piloto declarado en `column.format.mode`:
 * - `full` (por defecto): el nombre tal como llega.
 * - `truncate`: recorte a `maxChars` con elipsis (modo histórico de v1).
 * - `initial`: "A. Pier Guidi" — inicial del nombre + apellidos.
 * - `surname`: "Pier Guidi" — todo lo que sigue al primer nombre.
 * Los paréntesis (apodos del registro) no cuentan como palabra; un nombre de
 * una sola palabra se devuelve intacto en cualquier modo.
 */
export function formatDriverName(
  name: string | undefined,
  column?: Pick<WidgetColumnV3, "format">,
): string {
  const value = name ?? "?";
  const format = column?.format;
  const mode = typeof format?.mode === "string" ? format.mode : undefined;

  if (mode === "initial" || mode === "surname") {
    const words = value.replace(/\(.*?\)/g, " ").split(/\s+/).filter(Boolean);
    if (words.length < 2) return value;
    const surname = words.slice(1).join(" ");
    return mode === "initial" ? `${words[0]![0]}. ${surname}` : surname;
  }

  if (mode !== "truncate") return value;
  const configuredMax = typeof format?.maxChars === "number" && Number.isFinite(format.maxChars)
    ? format.maxChars
    : undefined;
  if (configuredMax != null && configuredMax < 2) return "…";
  const maxChars = Math.max(2, Math.min(64, Math.round(configuredMax ?? DEFAULT_NAME_MAX_CHARS)));
  if (maxChars <= 1) return "…";
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1)}…`;
}
