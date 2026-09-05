export type RelativeSide = "ahead" | "player" | "behind";

export function resolveRelativeTone(gap: number | undefined, isPlayer: boolean): "ahead" | "behind" | "player" | "neutral" {
  if (isPlayer) {
    return "player";
  }
  if (gap == null || gap === 0) {
    return "neutral";
  }
  return gap > 0 ? "ahead" : "behind";
}
