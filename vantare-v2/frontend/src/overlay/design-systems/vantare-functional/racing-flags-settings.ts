export const RACING_FLAGS_DEFAULT_TEXT_COLOR = "#000000";
const RACING_FLAGS_BLACK_FLAG_TEXT_COLOR = "#ffffff";

const RACING_FLAGS_TEXT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isRacingFlagsTextColor(value: unknown): value is string {
  return typeof value === "string" && RACING_FLAGS_TEXT_COLOR_PATTERN.test(value);
}

export function normalizeRacingFlagsTextColor(value: unknown): string {
  return isRacingFlagsTextColor(value) ? value.toLowerCase() : RACING_FLAGS_DEFAULT_TEXT_COLOR;
}

export function resolveRacingFlagsTextColor(flag: unknown, value: unknown): string {
  const selected = normalizeRacingFlagsTextColor(value);
  // The default black lettering must never disappear on a real black flag.
  if (flag === "black" && selected === RACING_FLAGS_DEFAULT_TEXT_COLOR) return RACING_FLAGS_BLACK_FLAG_TEXT_COLOR;
  return selected;
}
