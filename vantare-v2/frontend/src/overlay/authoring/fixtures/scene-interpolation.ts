import type { AnimationScene, SceneFrame, SceneOverride, ScenePlayerOverride } from "./animation-scenes";

/**
 * Scene frames are keyframes, not video frames. Continuous quantities — a gap
 * closing, a delta crossing zero, a pedal going down — are interpolated between
 * them so the widget moves the way it moves in a race, instead of stepping.
 *
 * Discrete facts are not interpolated. A car is in the pits or it is not; a
 * position is 9 or 10; a compound is S or M. Those snap, and snapping is what
 * makes the motion engines fire, since they detect events by diffing
 * consecutive ViewModels.
 */

/** Fields that move continuously and are worth interpolating. */
const CONTINUOUS_CAR_FIELDS = ["timeBehindLeader", "timeGapToPlayer"] as const;
const CONTINUOUS_PLAYER_FIELDS = ["deltaSeconds", "throttle", "brake", "clutch"] as const;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Smooths the ends so a keyframe does not arrive at constant velocity. */
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function blendCar(from: SceneOverride | undefined, to: SceneOverride | undefined, t: number): SceneOverride | undefined {
  if (!from) {
    return to;
  }
  if (!to) {
    return from;
  }
  // Discrete facts hold the keyframe being left until the playhead actually
  // reaches the next one. Taking them from `to` made the event land at the
  // START of the approach: the cars swapped places and only then did the gap
  // close, which is backwards. The swap has to be what the approach arrives at.
  const blended: SceneOverride = { ...from };
  for (const field of CONTINUOUS_CAR_FIELDS) {
    const a = from[field];
    const b = to[field];
    if (typeof a === "number" && typeof b === "number") {
      blended[field] = lerp(a, b, t);
    }
  }
  return blended;
}

function blendPlayer(
  from: ScenePlayerOverride | undefined,
  to: ScenePlayerOverride | undefined,
  t: number,
): ScenePlayerOverride | undefined {
  if (!from) return to;
  if (!to) return from;
  const blended: ScenePlayerOverride = { ...from };
  for (const field of CONTINUOUS_PLAYER_FIELDS) {
    const a = from[field];
    const b = to[field];
    if (typeof a === "number" && typeof b === "number") {
      blended[field] = lerp(a, b, t);
    }
  }
  return blended;
}

export type InterpolatedScene = {
  /** Keyframe index this playhead sits in, for the caption and the scrubber. */
  keyframe: number;
  frame: SceneFrame;
};

/**
 * State of a scene at a point in time, in milliseconds from its start.
 * `frame.caption` belongs to the keyframe being approached, so the caption
 * describes what is happening rather than what already happened.
 */
export function interpolateSceneAt(scene: AnimationScene, elapsedMs: number, loop: boolean): InterpolatedScene {
  const count = scene.frames.length;
  const totalMs = scene.frameMs * (count - 1);

  if (count === 1) {
    return { keyframe: 0, frame: scene.frames[0] };
  }

  let clamped = elapsedMs;
  if (loop) {
    const cycle = scene.frameMs * count;
    clamped = ((elapsedMs % cycle) + cycle) % cycle;
  } else if (elapsedMs >= totalMs) {
    return { keyframe: count - 1, frame: scene.frames[count - 1] };
  }
  if (clamped <= 0) {
    return { keyframe: 0, frame: scene.frames[0] };
  }

  const index = Math.min(count - 1, Math.floor(clamped / scene.frameMs));
  const nextIndex = (index + 1) % count;
  const from = scene.frames[index];
  const to = scene.frames[nextIndex];
  const t = ease(Math.min(1, (clamped - index * scene.frameMs) / scene.frameMs));

  const names = new Set([...Object.keys(from.cars ?? {}), ...Object.keys(to.cars ?? {})]);
  const cars: Record<string, SceneOverride> = {};
  for (const name of names) {
    const blended = blendCar(from.cars?.[name], to.cars?.[name], t);
    if (blended) {
      cars[name] = blended;
    }
  }

  const remainingSeconds =
    typeof from.remainingSeconds === "number" && typeof to.remainingSeconds === "number"
      ? lerp(from.remainingSeconds, to.remainingSeconds, t)
      : (to.remainingSeconds ?? from.remainingSeconds);

  return {
    // The caption belongs to the keyframe being approached once past halfway.
    keyframe: t >= 0.5 ? nextIndex : index,
    frame: {
      caption: (t >= 0.5 ? to : from).caption,
      ...(Object.keys(cars).length > 0 ? { cars } : {}),
      ...(blendPlayer(from.player, to.player, t) ? { player: blendPlayer(from.player, to.player, t) } : {}),
      ...(remainingSeconds !== undefined ? { remainingSeconds } : {}),
    },
  };
}

/** Total run time of one pass, in milliseconds. */
export function sceneDurationMs(scene: AnimationScene): number {
  return scene.frameMs * Math.max(1, scene.frames.length - 1);
}
