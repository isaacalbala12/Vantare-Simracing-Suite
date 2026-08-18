/**
 * Modelo de la vista Roadmap de Command Orbit (briefing 10).
 *
 * La pantalla no tiene datos propios: todo sale de `docs/roadmap-source.json`
 * por el cargador que ya usaba `RoadmapPage` (`hub/roadmap/roadmap-data.ts`).
 * Aquí solo viven las derivaciones de presentación —estado visual, recuentos y
 * el estado honesto de la fuente— para que la página se limite a pintar.
 */

import {
  fetchRoadmapDataset,
  ROADMAP_FALLBACK,
  resolveAreaProgress,
  type RoadmapArea,
  type RoadmapDataset,
  type RoadmapMilestone,
  type RoadmapPhase,
  type RoadmapStatus,
} from "../roadmap/roadmap-data";

/** Estados visuales de la referencia (`.rm-phase[data-state]`). */
export type RoadmapVisualState = "done" | "active" | "planned" | "future";

/** Estado de la carga de la fuente manual. */
export type RoadmapSourceState = "loading" | "remote" | "fallback";

export interface RoadmapSourceResult {
  dataset: RoadmapDataset;
  state: Exclude<RoadmapSourceState, "loading">;
}

/**
 * Trae la fuente y dice **de dónde** salió.
 *
 * `fetchRoadmapDataset` nunca lanza: si la red falla devuelve exactamente el
 * objeto `ROADMAP_FALLBACK`, así que la identidad basta para distinguir la
 * copia empaquetada de la fuente remota y la cabecera puede decir la verdad en
 * vez de anunciar «fuente disponible» siempre.
 */
export async function loadRoadmapSource(signal?: AbortSignal): Promise<RoadmapSourceResult> {
  const dataset = await fetchRoadmapDataset(signal);
  return { dataset, state: dataset === ROADMAP_FALLBACK ? "fallback" : "remote" };
}

/** `in-progress` se pinta como `active` (la referencia usa ese nombre). */
export function visualState(status: RoadmapStatus): RoadmapVisualState {
  return status === "in-progress" ? "active" : status;
}

/**
 * Estado del hito. El JSON no declara uno: declara un `type`, y ése es el
 * único dato real disponible. Una release ya publicada está hecha, un plan
 * está por planear y lo demás está en curso.
 */
export function milestoneState(milestone: RoadmapMilestone): RoadmapVisualState {
  if (milestone.type === "release") return "done";
  if (milestone.type === "plan") return "planned";
  return "active";
}

export interface AreaCounts {
  total: number;
  active: number;
  planned: number;
}

export function countAreas(areas: ReadonlyArray<RoadmapArea>): AreaCounts {
  let active = 0;
  let planned = 0;
  for (const area of areas) {
    if (area.status === "in-progress") active += 1;
    if (area.status === "planned") planned += 1;
  }
  return { total: areas.length, active, planned };
}

/** Porcentaje del área, contado desde los proyectos cuando estén enlazados. */
export function areaProgress(
  area: RoadmapArea,
  projects: ReadonlyMap<string, { done: number; total: number }> | null,
): number {
  return resolveAreaProgress(area, projects);
}

/** Frentes abiertos de la fase: los highlights que declara la propia fuente. */
export function phaseFronts(phase: RoadmapPhase): number {
  return phase.highlights.length;
}
