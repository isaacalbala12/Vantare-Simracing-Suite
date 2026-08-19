/**
 * Modelo de la vista Roadmap de Command Orbit (briefing 10, rework «Qué viene»).
 *
 * La pantalla no tiene datos propios: todo sale de `docs/roadmap-source.json`
 * por el cargador que ya usaba `RoadmapPage` (`hub/roadmap/roadmap-data.ts`).
 * Aquí solo viven las derivaciones de presentación —el reparto en AHORA /
 * PRÓXIMO / HECHO y el estado honesto de la fuente— para que la página se
 * limite a pintar. Nada de lo que se deriva se presenta como declarado: la
 * pantalla marca «derivado» lo que sale de una regla y no del JSON.
 */

import {
  fetchRoadmapDataset,
  ROADMAP_FALLBACK,
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
 * está por planear y lo demás está en curso. Es una **derivación**, y la
 * pantalla la marca como tal.
 */
export function milestoneState(milestone: RoadmapMilestone): RoadmapVisualState {
  if (milestone.type === "release") return "done";
  if (milestone.type === "plan") return "planned";
  return "active";
}

/** Las tres secciones de la columna narrativa, en orden de lectura. */
export type RoadmapSection = "now" | "next" | "done";

export const ROADMAP_SECTIONS: ReadonlyArray<RoadmapSection> = ["now", "next", "done"];

export interface RoadmapNarrative {
  /** Fase en curso declarada por la fuente. `null` si no hay ninguna. */
  now: RoadmapPhase | null;
  /** Posición 1-based de la fase en curso dentro del orden declarado; 0 si no hay. */
  nowIndex: number;
  /** Total de fases declaradas. */
  total: number;
  /** Fases por planear y futuras, en el orden que declara la fuente. */
  next: ReadonlyArray<RoadmapPhase>;
  /** Fases completadas, en el orden que declara la fuente. */
  done: ReadonlyArray<RoadmapPhase>;
  /** Hitos en curso (`feature`/`fix`). DERIVADO del tipo. */
  nowMilestones: ReadonlyArray<RoadmapMilestone>;
  /** Hitos de tipo `plan`. DERIVADO del tipo. */
  nextMilestones: ReadonlyArray<RoadmapMilestone>;
  /** Hitos ya publicados (`release`). DERIVADO del tipo. */
  doneMilestones: ReadonlyArray<RoadmapMilestone>;
}

/**
 * Reparte fases e hitos en las tres secciones de la vista.
 *
 * Las fases se reparten por su `status`, que la fuente sí declara. Los hitos
 * no dicen a qué fase pertenecen ni en qué estado están: lo único declarado es
 * su `type`, así que su sección sale de `milestoneState` y la pantalla lo
 * anuncia como derivado en lugar de fingir una relación que el JSON no tiene.
 */
export function buildNarrative(data: RoadmapDataset): RoadmapNarrative {
  const phases = data.phases;
  const index = phases.findIndex((phase) => phase.status === "in-progress");
  const milestones = data.milestones;

  return {
    now: index >= 0 ? phases[index] : null,
    nowIndex: index >= 0 ? index + 1 : 0,
    total: phases.length,
    next: phases.filter((phase) => phase.status === "planned" || phase.status === "future"),
    done: phases.filter((phase) => phase.status === "done"),
    nowMilestones: milestones.filter((m) => milestoneState(m) === "active"),
    nextMilestones: milestones.filter((m) => milestoneState(m) === "planned"),
    doneMilestones: milestones.filter((m) => milestoneState(m) === "done"),
  };
}

/** Recuento visible en la columna contextual de cada sección. */
export function sectionCount(narrative: RoadmapNarrative, section: RoadmapSection): number {
  if (section === "now") return narrative.now ? 1 : 0;
  if (section === "next") return narrative.next.length;
  return narrative.done.length;
}
