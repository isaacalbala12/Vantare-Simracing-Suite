import { buildTrackOutlinePath, createTrackProjection, resolveTrackGeometry } from "../../overlay/track-geometry/track-geometry";
import { TRACK_GEOMETRY_PACK } from "../../overlay/track-geometry/track-geometry-pack";
import type { RecordedCombination } from "./strategy-recorded-wizard";

type Identity = Pick<RecordedCombination, "simId" | "trackName" | "trackLayout">;
const viewport = { width: 260, height: 160, padding: 13 } as const;

/** Static LMU catalog outline, never a trace generated from this race's laps. */
export function StrategyRecordedCircuit({ combination, t }: { readonly combination?: Identity; readonly t: (key: string) => string }) {
  if (!combination) return null;
  const named = combination.simId === "lmu" ? resolveTrackGeometry(combination.trackName, TRACK_GEOMETRY_PACK) : undefined;
  const layout = combination.simId === "lmu" ? resolveTrackGeometry(combination.trackLayout, TRACK_GEOMETRY_PACK) : undefined;
  const geometry = named && layout?.id === named.id && !named.synthetic && !layout.synthetic ? named : undefined;
  const projection = geometry ? createTrackProjection(geometry.points, viewport) : undefined;
  return <figure className="strategy-preparation__catalog-map">
    {geometry && projection ? <svg role="img" aria-label={t("strategy.entry.catalogMap")} viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="xMidYMid meet">
      <path d={buildTrackOutlinePath(geometry.points, projection)} />
    </svg> : <span>{t("strategy.entry.mapUnavailable")}</span>}
    {geometry && projection ? <figcaption>{t("strategy.entry.catalogMapSource")}</figcaption> : null}
  </figure>;
}
