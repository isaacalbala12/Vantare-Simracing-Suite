import type { StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import type { RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import type { functionalLabels } from "./labels";

type Labels = (typeof functionalLabels)["en"];

export type FooterSlotCell = { id: string; label: string; value: string };

/** Resuelve el vocabulario de huecos del pie sobre los VMs de standings y
 * relative. Lo que el VM no transporta se pinta "—": nunca se inventa. */
export function resolveFunctionalFooterSlots(
  model: StandingsViewModel | RelativeViewModel,
  slotIds: readonly string[],
  labels: Labels,
): FooterSlotCell[] {
  const player = model.rows.find((row) => row.isPlayer);
  const lapText = model.type === "standings" ? model.lapText : undefined;
  const values: Record<string, string | undefined> = {
    time: model.remainingText,
    lap: lapText,
    position: player ? String(player.position) : undefined,
    gap: player?.gapText,
    bestLap: player?.bestLapText,
    lastLap: player?.lastLapText,
    track: model.trackTempText,
    ambient: model.ambientTempText,
    wind: model.windText,
  };
  const labelFor: Record<string, string> = {
    time: labels.remaining,
    lap: labels.currentLap,
    position: labels.position,
    gap: labels.gap,
    bestLap: labels.bestLap,
    lastLap: labels.lastLap,
    track: labels.trackTemp,
    ambient: labels.ambientTemp,
    wind: labels.wind,
  };
  return slotIds.map((id) => ({
    id,
    label: labelFor[id] ?? id.toUpperCase(),
    value: values[id] ?? "—",
  }));
}
