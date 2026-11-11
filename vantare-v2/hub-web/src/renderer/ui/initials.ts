/** Same two-word demo initials and anonymous fallback as native shell/chrome.rs. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  return words.length
    ? words
        .slice(0, 2)
        .map((word) => Array.from(word)[0])
        .join("")
        .toUpperCase()
    : "·";
}
