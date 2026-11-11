import type { LauncherProfile } from "../../../contract/generated/contract";

// Match the frozen GPUI's presentation order (favorite, then Rust string order).
// This only selects a read-only thumbnail; it never chooses a launch request.
function compareNames(a: string, b: string): number {
  const left = Array.from(a, (letter) => letter.codePointAt(0) ?? 0);
  const right = Array.from(b, (letter) => letter.codePointAt(0) ?? 0);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}
export function previewProfile(profiles: readonly LauncherProfile[]) {
  return profiles.reduce<LauncherProfile | undefined>((best, next) => {
    if (!best) return next;
    const order =
      Number(best.favorite) - Number(next.favorite) ||
      compareNames(next.name, best.name);
    return order < 0 ? next : best;
  }, undefined);
}
