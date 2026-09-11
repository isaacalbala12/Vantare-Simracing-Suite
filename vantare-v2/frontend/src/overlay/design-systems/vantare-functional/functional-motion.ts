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
  for (const row of nextRows) {
    const before = prevIndex.get(row.id);
    if (before === undefined) continue;
    const after = nextRows.indexOf(row);
    if (after < before) gained.push(row.id);
    else if (after > before) lost.push(row.id);
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
