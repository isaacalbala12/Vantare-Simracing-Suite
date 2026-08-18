/**
 * Derivaciones comunes a las dos direcciones de rework del Roadmap (bloque W5).
 *
 * Ninguna de estas funciones inventa contenido: todas salen de lo que declara
 * `docs/roadmap-source.json`. Cuando una relación no está en la fuente (un hito
 * no dice a qué fase pertenece, un área no dice cuál es su próximo paso) se
 * deriva con una regla explícita y la pantalla la marca como derivada.
 */

import type {
  LocalizedText,
  RoadmapArea,
  RoadmapDataset,
  RoadmapMilestone,
  RoadmapPhase,
} from "../../roadmap/roadmap-data";
import { milestoneState, visualState, type RoadmapVisualState } from "../roadmap-orbit-model";

/** Dirección de rework seleccionada por `?roadmapDir=a|b`. */
export type RoadmapDirection = "a" | "b";

/**
 * Lee la dirección del query. Es una selección de diseño temporal: sin
 * parámetro, la vista actual sigue siendo la que se pinta.
 */
export function readRoadmapDirection(search: string): RoadmapDirection | null {
  const raw = new URLSearchParams(search).get("roadmapDir")?.trim().toLowerCase();
  return raw === "a" || raw === "b" ? raw : null;
}

/** Fase en curso declarada por la fuente. */
export function currentPhase(phases: ReadonlyArray<RoadmapPhase>): RoadmapPhase | null {
  return phases.find((phase) => phase.status === "in-progress") ?? null;
}

/**
 * Fase «siguiente»: la primera por planear y, si no hay ninguna, la primera
 * futura. Es el orden declarado en la fuente, no una fecha inventada.
 */
export function nextPhase(phases: ReadonlyArray<RoadmapPhase>): RoadmapPhase | null {
  return (
    phases.find((phase) => phase.status === "planned") ??
    phases.find((phase) => phase.status === "future") ??
    null
  );
}

/**
 * Fase donde se ancla un hito. El JSON no relaciona hitos con fases: solo
 * declara un `type`, del que ya se deriva un estado (`milestoneState`). El
 * ancla es la primera fase con ese mismo estado visual; si no la hay, la fase
 * en curso, y en último término la primera declarada.
 */
export function milestoneAnchor(
  milestone: RoadmapMilestone,
  phases: ReadonlyArray<RoadmapPhase>,
): RoadmapPhase | null {
  if (phases.length === 0) return null;
  const wanted = milestoneState(milestone);
  return (
    phases.find((phase) => visualState(phase.status) === wanted) ??
    currentPhase(phases) ??
    phases[0]
  );
}

/** Quita acentos y baja a minúsculas para comparar títulos con highlights. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export interface DerivedNextStep {
  /** Texto del highlight, tal cual lo escribe la fuente. */
  text: string;
  /** Fase de la que sale. */
  phase: RoadmapPhase;
}

/**
 * «Próximo paso» de un área. La fuente no lo declara, así que se deriva: el
 * primer highlight de una fase no terminada que mencione alguna palabra
 * significativa del título del área. Si ninguno la menciona, el área no tiene
 * próximo paso derivable y la pantalla lo dice en vez de rellenar el hueco.
 */
export function deriveNextStep(
  area: RoadmapArea,
  phases: ReadonlyArray<RoadmapPhase>,
  pick: (text: LocalizedText) => string,
): DerivedNextStep | null {
  const words = fold(pick(area.title))
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5);
  if (words.length === 0) return null;

  for (const phase of phases) {
    if (phase.status === "done") continue;
    for (const highlight of phase.highlights) {
      const text = pick(highlight);
      const folded = fold(text);
      if (words.some((word) => folded.includes(word))) return { text, phase };
    }
  }
  return null;
}

/**
 * Posición del centro de una estación en la vía, en porcentaje: la vía reparte
 * las fases en columnas iguales. La fuente declara un orden, no fechas, y
 * fingir una escala temporal sería inventar datos.
 */
export function stationOffset(index: number, total: number): number {
  if (total <= 0) return 50;
  return ((index + 0.5) / total) * 100;
}

/** Recuento de fases por estado visual, para el meta de la vía. */
export function phaseCounts(
  phases: ReadonlyArray<RoadmapPhase>,
): Record<RoadmapVisualState, number> {
  const counts: Record<RoadmapVisualState, number> = {
    done: 0,
    active: 0,
    planned: 0,
    future: 0,
  };
  for (const phase of phases) counts[visualState(phase.status)] += 1;
  return counts;
}

/** Props comunes: las dos direcciones leen exactamente el mismo dataset. */
export interface RoadmapDirectionProps {
  data: RoadmapDataset;
  /** Estado honesto de la fuente (`loading` / `remote` / `fallback`). */
  sourceState: "loading" | "remote" | "fallback";
  channel: "stable" | "testers" | "nightly";
  projects: ReadonlyMap<string, { done: number; total: number }> | null;
  /** Nodo de la columna contextual de la shell, si la shell lo expone. */
  contextSlot: HTMLElement | null;
}
