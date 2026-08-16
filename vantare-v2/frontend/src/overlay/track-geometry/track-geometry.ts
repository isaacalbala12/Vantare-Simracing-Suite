/**
 * Static circuit geometry: resolution and projection.
 *
 * The pack is a build-time asset, not telemetry, so nothing here reads from
 * transport, storage or vehicle state. Coordinates are LMU world metres on the
 * ground plane (X, Z); world +Z maps to screen +Y, which fixes a single
 * top-down convention for the outline and for any future vehicle marker.
 */

export type TrackPoint = Readonly<{ x: number; z: number }>;

export type TrackGeometry = Readonly<{
  id: string;
  label: string;
  /** True when the outline does not come from a real capture. */
  synthetic: boolean;
  aliases: readonly string[];
  points: readonly TrackPoint[];
}>;

export type TrackViewport = Readonly<{ width: number; height: number; padding: number }>;

export type TrackProjection = Readonly<{ scale: number; offsetX: number; offsetY: number }>;

/** Fewer points than this cannot describe a closed outline. */
const MINIMUM_OUTLINE_POINTS = 3;

const PATH_DECIMALS = 2;

/**
 * Reduces a track name to a comparison key: lowercase, unaccented, with every
 * run of non-alphanumeric characters collapsed into a single space.
 */
export function normalizeTrackName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Returns the single geometry whose id or alias matches the name exactly after
 * normalization.
 *
 * Resolution is deliberately fail-closed. There is no prefix, substring or
 * nearest-match rule: showing a circuit that merely resembles the real one is
 * the failure this selector exists to prevent, and it would be invisible to the
 * driver. Absent, blank and ambiguous names all resolve to nothing.
 */
export function resolveTrackGeometry(
  trackName: string | undefined,
  pack: readonly TrackGeometry[],
): TrackGeometry | undefined {
  if (trackName === undefined) {
    return undefined;
  }
  const key = normalizeTrackName(trackName);
  if (key === "") {
    return undefined;
  }

  const matches = pack.filter((geometry) =>
    [geometry.id, ...geometry.aliases].some((candidate) => normalizeTrackName(candidate) === key),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Builds the transform that fits an outline inside the padded viewport.
 *
 * A single scale factor is shared by both axes so the circuit keeps its real
 * proportions, and the same transform is meant to place vehicle markers later,
 * so outline and markers cannot drift apart.
 */
export function createTrackProjection(
  points: readonly TrackPoint[],
  viewport: TrackViewport,
): TrackProjection | undefined {
  if (points.length < MINIMUM_OUTLINE_POINTS) {
    return undefined;
  }

  const availableWidth = viewport.width - viewport.padding * 2;
  const availableHeight = viewport.height - viewport.padding * 2;
  if (!(availableWidth > 0) || !(availableHeight > 0)) {
    return undefined;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      return undefined;
    }
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  // A straight line has no extent on one axis; only a single collapsed point
  // has none on both, and that cannot be scaled at all.
  const scale = Math.min(
    spanX > 0 ? availableWidth / spanX : Number.POSITIVE_INFINITY,
    spanZ > 0 ? availableHeight / spanZ : Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(scale) || scale <= 0) {
    return undefined;
  }

  return {
    scale,
    offsetX: viewport.padding + (availableWidth - spanX * scale) / 2 - minX * scale,
    offsetY: viewport.padding + (availableHeight - spanZ * scale) / 2 - minZ * scale,
  };
}

export function projectTrackPoint(
  point: TrackPoint,
  projection: TrackProjection,
): { x: number; y: number } {
  return {
    x: point.x * projection.scale + projection.offsetX,
    y: point.z * projection.scale + projection.offsetY,
  };
}

export function buildTrackOutlinePath(
  points: readonly TrackPoint[],
  projection: TrackProjection,
): string {
  const commands = points.map((point, index) => {
    const projected = projectTrackPoint(point, projection);
    const command = index === 0 ? "M" : "L";
    return `${command} ${projected.x.toFixed(PATH_DECIMALS)} ${projected.y.toFixed(PATH_DECIMALS)}`;
  });
  return `${commands.join(" ")} Z`;
}
