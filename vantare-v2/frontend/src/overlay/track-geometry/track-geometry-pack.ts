import type { TrackGeometry, TrackPoint } from "./track-geometry";

/** Identifies the authoring placeholder used by Studio and Workshop previews. */
export const REFERENCE_LOOP_ID = "vantare-reference-loop";

/**
 * Static circuit geometry shipped with the build.
 *
 * No real circuit is present yet, and none is invented here. Producing real
 * outlines needs a capture containing a full lap of world positions, which the
 * repository does not currently hold: the binary fixtures are single frames and
 * the recorded delta trace carries lap distance and speed but no X/Z. Until
 * such a capture exists, a live session resolves to no geometry and the widget
 * says so.
 */
export const TRACK_GEOMETRY_PACK: readonly TrackGeometry[] = [referenceLoop()];

/**
 * A deterministic closed curve, in metres, used only so the widget can be laid
 * out and styled before real circuits land. It is marked synthetic, and its
 * name matches no real circuit, so it can never be resolved by a live session
 * by accident.
 */
function referenceLoop(): TrackGeometry {
  return {
    id: REFERENCE_LOOP_ID,
    label: "Vantare Reference Loop",
    synthetic: true,
    aliases: [],
    points: buildReferenceLoopPoints(),
  };
}

function buildReferenceLoopPoints(): readonly TrackPoint[] {
  const sampleCount = 96;
  const points: TrackPoint[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const angle = (index / sampleCount) * Math.PI * 2;
    const radius = 620 + 180 * Math.sin(angle * 2) + 90 * Math.cos(angle * 3);
    points.push({ x: radius * Math.cos(angle), z: radius * Math.sin(angle) * 0.72 });
  }
  return points;
}
