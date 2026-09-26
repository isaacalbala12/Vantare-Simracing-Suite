import type { RelativeRowViewModel, RelativeViewModel } from "../../widget-types/relative/relative-view-model";

/** Empty slots belong to presentation only; they never enter the telemetry model. */
export function relativeVisibleSlots(model: RelativeViewModel, rowsFit: number): (RelativeRowViewModel | null)[] {
  const limit = Number.isFinite(rowsFit) ? Math.max(0, rowsFit) : Number.POSITIVE_INFINITY;
  if (limit === 0) return [];
  const playerIndex = model.rows.findIndex((row) => row.isPlayer);
  if (playerIndex < 0) return model.rows.slice(0, limit);

  const aheadSlots = Math.max(0, Math.min(model.rangeAhead ?? playerIndex, limit - 1));
  // V2 entrega los rivales delante de cerca a lejos. Elegimos los cercanos
  // antes de invertirlos para que el más próximo quede junto al jugador.
  const ahead = aheadSlots > 0 ? model.rows.slice(0, playerIndex).slice(0, aheadSlots).reverse() : [];
  const behindSlots = Math.max(0, Math.min(model.rangeBehind ?? model.rows.length - playerIndex - 1, limit - aheadSlots - 1));
  const behind = model.rows.slice(playerIndex + 1, playerIndex + 1 + behindSlots);
  return [
    ...Array<null>(Math.max(0, aheadSlots - ahead.length)).fill(null),
    ...ahead,
    model.rows[playerIndex]!,
    ...behind,
    ...Array<null>(Math.max(0, behindSlots - behind.length)).fill(null),
  ];
}

export function relativeStructureKey(slots: readonly (RelativeRowViewModel | null)[]): string {
  return slots.map((row) => row ? `${row.id}:${row.side}` : "_").join("|");
}
