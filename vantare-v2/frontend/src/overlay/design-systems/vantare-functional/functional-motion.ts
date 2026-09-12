/**
 * Derivaciones de movimiento para el sistema Eficiencia. Puras — sin DOM,
 * sin timers — para que la regla se pueda probar sola. La estética es la
 * del sistema: movimiento que informa (una fila se desliza a su sitio) y
 * flashes discretos que marcan el evento, nada ornamental.
 */

export type MotionRow = { readonly id: string };

/**
 * Cambio de índice renderizado por fila entre dos modelos. El FLIP desliza
 * cada fila desde su posición anterior hasta la actual.
 */
export function deriveIndexOffsets(
  prevRows: readonly MotionRow[],
  nextRows: readonly MotionRow[],
): Map<string, number> {
  const offsets = new Map<string, number>();
  const prevIndex = new Map(prevRows.map((row, index) => [row.id, index]));
  nextRows.forEach((row, index) => {
    const before = prevIndex.get(row.id);
    if (before !== undefined && before !== index) {
      offsets.set(row.id, before - index);
    }
  });
  return offsets;
}

/**
 * Adelantamientos en el orden renderizado: una fila que sube posiciones
 * frente a otra que baja. Devuelve los ids por dirección — el renderer
 * decide cómo marcarlo.
 */
export function deriveOvertakes(
  prevRows: readonly MotionRow[],
  nextRows: readonly MotionRow[],
): { gained: string[]; lost: string[] } {
  const prevIndex = new Map(prevRows.map((row, index) => [row.id, index]));
  const gained: string[] = [];
  const lost: string[] = [];
  nextRows.forEach((row, after) => {
    const before = prevIndex.get(row.id);
    if (before === undefined) return;
    if (after < before) gained.push(row.id);
    else if (after > before) lost.push(row.id);
  });
  return { gained, lost };
}

export type RelativeMotionRow = { readonly id: string; readonly side?: string };

/**
 * Cruces reales en relative: una fila cambia de lado respecto al jugador
 * (delante↔detrás). El delta de índice NO basta — una fila que entra en la
 * ventana sin cruzar al jugador no es un adelantamiento, y marcaba cruces
 * inexistentes. La dirección es el resultado para el jugador: un rival que
 * pasa de detrás a delante te ha adelantado → "lost" (rojo), no verde.
 */
export function deriveSideCrosses(
  prevRows: readonly RelativeMotionRow[],
  nextRows: readonly RelativeMotionRow[],
): { gained: string[]; lost: string[] } {
  const prevSide = new Map(prevRows.map((row) => [row.id, row.side]));
  const gained: string[] = [];
  const lost: string[] = [];
  for (const row of nextRows) {
    const before = prevSide.get(row.id);
    if (before === undefined || before === row.side || row.side === "player") continue;
    if (before === "ahead" && row.side === "behind") gained.push(row.id);
    else if (before === "behind" && row.side === "ahead") lost.push(row.id);
  }
  return { gained, lost };
}

/** Cruce de cero del delta: la vuelta pasa de perder a ganar o al revés. */
export function deriveDeltaCross(
  prev: { tone: string } | null,
  next: { tone: string },
): "gaining" | "losing" | null {
  const side = (tone: string) => (tone === "gaining" || tone === "losing" ? tone : null);
  const from = prev ? side(prev.tone) : null;
  const to = side(next.tone);
  return from && to && from !== to ? to : null;
}
