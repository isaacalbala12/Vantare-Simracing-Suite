import { studioKinds } from "../contract/generated/studio";

export const studioFieldVisual =
  /^visual-(dark|light):(studio-fields-(?:broadcast-tower|car-damage-numbers|car-damage-visual|delta-trace|fastest-lap|head-to-head|input-telemetry|track-map|multiclass-relative|pedals-telemetry|radar|racing-flags|track-weather|session-alerts))$/;
export function studioFieldKind(scene: string) {
  return studioKinds.find((kind) => scene === `studio-fields-${kind}`);
}
