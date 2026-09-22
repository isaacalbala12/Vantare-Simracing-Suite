export const RACING_FLAGS_DEFAULT_TEXT_COLOR = "#ffffff";
export const RACING_FLAGS_WHITE_FLAG_TEXT_COLOR = "#141517";

const RACING_FLAGS_TEXT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isRacingFlagsTextColor(value: unknown): value is string {
  return typeof value === "string" && RACING_FLAGS_TEXT_COLOR_PATTERN.test(value);
}

export function normalizeRacingFlagsTextColor(value: unknown): string {
  return isRacingFlagsTextColor(value) ? value.toLowerCase() : RACING_FLAGS_DEFAULT_TEXT_COLOR;
}

export function resolveRacingFlagsTextColor(flag: unknown, value: unknown): string {
  if (isRacingFlagsTextColor(value)) return value.toLowerCase();
  return flag === "white"
    ? RACING_FLAGS_WHITE_FLAG_TEXT_COLOR
    : RACING_FLAGS_DEFAULT_TEXT_COLOR;
}
