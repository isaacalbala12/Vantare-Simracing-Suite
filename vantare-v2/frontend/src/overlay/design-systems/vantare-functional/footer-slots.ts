import type { StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import type { RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { localizeStandingsValue, type functionalLabels } from "./labels";

type Labels = (typeof functionalLabels)["en"];

export type FooterSlotCell = { id: string; label: string; value: string };

function footerSlotLabel(id: string, labels: Labels, paceSession = false): string {
  const labelFor: Record<string, string> = {
    time: labels.remaining,
    lap: labels.currentLap,
    position: labels.position,
    gap: paceSession ? labels.paceGap : labels.gap,
    bestLap: labels.bestLap,
    lastLap: labels.lastLap,
    track: labels.trackTemp,
    ambient: labels.ambientTemp,
    wind: labels.wind,
  };
  return labelFor[id] ?? id.toUpperCase();
}

/** Resuelve el vocabulario de huecos del pie sobre los VMs de standings y
 * relative. Lo que el VM no transporta se pinta "—": nunca se inventa. */
export function resolveFunctionalFooterSlots(
  model: StandingsViewModel | RelativeViewModel,
  slotIds: readonly string[],
  labels: Labels,
): FooterSlotCell[] {
  const player = model.type === "standings" ? model.playerRow ?? model.rows.find(row => row.isPlayer) : model.rows.find(row => row.isPlayer);
  const lapText = model.type === "standings" ? model.lapText : undefined;
  // Misma regla que la cabecera de columna: fuera de carrera la diferencia se
  // mide contra la mejor vuelta, no contra el líder.
  const session = model.sessionLabel?.toLowerCase();
  const paceSession = session === "practice" || session === "qualifying";
  const values: Record<string, string | undefined> = {
    time: model.remainingText,
    lap: lapText,
    position: player && player.position > 0 ? String(player.position) : undefined,
    gap: player?.gapText,
    bestLap: player?.bestLapText,
    lastLap: player?.lastLapText,
    track: model.trackTempText,
    ambient: model.ambientTempText,
    wind: model.windText,
  };
  return slotIds.map((id) => ({
    id,
    label: footerSlotLabel(id, labels, paceSession),
    value: localizeStandingsValue(values[id] ?? "—", labels),
  }));
}

export const FOOTER_SLOT_ROW_PX = 14;
export const FOOTER_SLOT_PAD_PX = 15;
export const FOOTER_SLOT_GAP_PX = 14;

/** Ancho estimado de un hueco: etiqueta en caps fina + valor bold + aire. */
export const footerSlotItemWidth = (label: string, value: string) =>
  label.length * 5.5 + value.length * 7.5 + 12;

// Valores representativos por hueco para estimar el ancho de la fila sin un
// modelo vivo (el renderer escala el conjunto cuando no cabe).
const SLOT_VALUE_SAMPLE: Record<string, string> = {
  time: "0:00:00",
  lap: "V 999",
  position: "99",
  gap: "+9.999",
  bestLap: "9:99.999",
  lastLap: "9:99.999",
  track: "99°",
  ambient: "99°",
  wind: "99 km/h",
};

/** Ancho que ocuparía la fila de huecos sin encoger: etiqueta real del
 * idioma + el valor más ancho plausible, con los huecos entre fichas. */
export function estimateFooterSlotsWidth(
  slotIds: readonly string[],
  labels: Labels,
): number {
  const cells = slotIds.map((id) =>
    footerSlotItemWidth(footerSlotLabel(id, labels), SLOT_VALUE_SAMPLE[id] ?? "——"));
  return cells.reduce((sum, width) => sum + width, 0)
    + Math.max(0, slotIds.length - 1) * FOOTER_SLOT_GAP_PX;
}
