export const STANDINGS_WINDOW_AROUND_OPTIONS = [0, 2, 4, 6, 8] as const;
export type StandingsWindowAround = (typeof STANDINGS_WINDOW_AROUND_OPTIONS)[number];

export const STANDINGS_WINDOW_DEFAULT_AROUND: StandingsWindowAround = 4;

export type StandingsWindowRuntime = Readonly<{
  /** Shared Workshop row projection; this is not a visual study/style id. */
  mode: "podium-around-player";
  around: StandingsWindowAround;
}>;


/**
 * Keeps the first three positions visible and adds a player-centered window.
 * `around` counts neighbouring rows only; the player is included separately.
 * The returned objects are the original objects in their original order.
 */
export function selectDefaultStandingsWindow<T extends { isPlayer: boolean }>(
  rows: readonly T[],
  around: StandingsWindowAround = STANDINGS_WINDOW_DEFAULT_AROUND,
): T[] {
  if (rows.length === 0) return [];

  const fixedCount = Math.min(3, rows.length);
  const playerIndex = rows.findIndex((row) => row.isPlayer);
  const fixed = rows.slice(0, fixedCount);

  if (playerIndex < 0) {
    return rows.slice(0, Math.min(rows.length, fixedCount + around));
  }

  if (playerIndex < fixedCount) {
    return rows.slice(0, Math.min(rows.length, fixedCount + around));
  }

  const windowSize = around + 1;
  let start = Math.max(fixedCount, playerIndex - Math.floor(around / 2));
  const end = Math.min(rows.length, start + windowSize);

  // At the end of the grid, shift the window back so it still fills the
  // requested number of rows whenever the grid has enough entries.
  if (end - start < windowSize) {
    start = Math.max(fixedCount, end - windowSize);
  }

  const selectedIds = new Set([
    ...fixed,
    ...rows.slice(start, end),
  ]);
  return rows.filter((row) => selectedIds.has(row));
}
