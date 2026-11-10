/** Same first/last-word fallback as the native profile avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return "·";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words.at(-1) ?? "")[0] : "";
  return `${first}${last}`.toUpperCase();
}
