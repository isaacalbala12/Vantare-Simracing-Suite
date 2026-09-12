/**
 * Derivaciones de movimiento para el sistema Eficiencia. Puras — sin DOM,
 * sin timers — para que la regla se pueda probar sola. La estética es la
 * del sistema: movimiento que informa (una fila se desliza a su sitio) y
 * flashes discretos que marcan el evento, nada ornamental.
 */

export type MotionRow = { readonly id: string };

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

/** Lado del cero al que pertenece un tono; neutral no es lado. */
export function deltaSide(tone: string): "gaining" | "losing" | null {
  return tone === "gaining" || tone === "losing" ? tone : null;
}

/**
 * Cruce de cero del delta: la vuelta pasa de perder a ganar o al revés.
 * Dos snapshots no bastan — con perder→neutro→ganar el par (neutro, ganar)
 * es idéntico a arrancar en neutro, pero el evento difiere. `lastSide` es
 * la memoria del último lado no neutro, mantenida por el renderer y
 * reiniciada cuando la fuente pierde continuidad.
 */
export function deriveDeltaCross(
  prev: { tone: string } | null,
  next: { tone: string },
  lastSide: "gaining" | "losing" | null = null,
): "gaining" | "losing" | null {
  const from = (prev ? deltaSide(prev.tone) : null) ?? lastSide;
  const to = deltaSide(next.tone);
  return from && to && from !== to ? to : null;
}
