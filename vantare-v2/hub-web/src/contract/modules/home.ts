import {
  homeCanvasMin,
  homeCoordinateLimit,
  homeDateLimit,
  homeOpacityMax,
  homeProgressLimit,
  homeRevisionPattern,
  homeVersionLimit,
  homeWidgetKinds,
  homeWidgetLimit,
} from "../generated/home";
import { launcherLimits, profileLimits } from "../generated/launcher";
import { exact, integer, oneOf, record } from "../validation-common";

export { homeMethods as methods } from "../generated/home";

const text = (v: unknown, max: number): v is string =>
  typeof v === "string" &&
  new TextEncoder().encode(v).length <= max &&
  Array.from(v).every((c) => {
    const code = c.codePointAt(0) ?? 0;
    return code >= 32 && code !== 127;
  });
export function isHome(v: unknown): boolean {
  if (
    !record(v) ||
    !exact(v, [
      "sim",
      "profiles",
      "favorite",
      "revision",
      "protected",
      "launch",
      "layout",
      "version",
    ]) ||
    !record(v.sim) ||
    !exact(v.sim, ["connected", "track"]) ||
    typeof v.sim.connected !== "boolean" ||
    !(v.sim.track === null || text(v.sim.track, homeProgressLimit * 4)) ||
    typeof v.protected !== "boolean" ||
    typeof v.revision !== "string" ||
    !new RegExp(homeRevisionPattern).test(v.revision) ||
    !text(v.version, homeVersionLimit) ||
    !Array.isArray(v.profiles) ||
    v.profiles.length > launcherLimits.profiles
  )
    return false;
  const ids = new Set<string>();
  for (const p of v.profiles) {
    if (
      !record(p) ||
      !exact(p, ["id", "name", "steps", "favorite", "lastLaunchedAt"]) ||
      !(
        typeof p.id === "string" &&
        new TextEncoder().encode(p.id).length <= launcherLimits.id &&
        !p.id.includes("\0")
      ) ||
      !p.id.trim() ||
      ids.has(p.id) ||
      !(
        typeof p.name === "string" &&
        new TextEncoder().encode(p.name).length <= profileLimits.name &&
        !p.name.includes("\0")
      ) ||
      !p.name.trim() ||
      !integer(p.steps) ||
      p.steps > profileLimits.steps ||
      typeof p.favorite !== "boolean" ||
      !(p.lastLaunchedAt === null || text(p.lastLaunchedAt, homeDateLimit * 4))
    )
      return false;
    ids.add(p.id);
  }
  if (
    !(
      v.favorite === null ||
      (typeof v.favorite === "string" && ids.has(v.favorite))
    )
  )
    return false;
  const l = v.launch;
  if (
    !record(l) ||
    !(l.kind === "idle"
      ? exact(l, ["kind"])
      : l.kind === "running" &&
        exact(l, ["kind", "text"]) &&
        text(l.text, homeProgressLimit * 4))
  )
    return false;
  const a = v.layout;
  return (
    record(a) &&
    exact(a, ["state", "width", "height", "widgets"]) &&
    oneOf(a.state, ["missing", "protected", "ready"]) &&
    integer(a.width) &&
    a.width >= homeCanvasMin &&
    a.width <= homeCoordinateLimit &&
    integer(a.height) &&
    a.height >= homeCanvasMin &&
    a.height <= homeCoordinateLimit &&
    Array.isArray(a.widgets) &&
    a.widgets.length <= homeWidgetLimit &&
    (a.state === "ready" || a.widgets.length === 0) &&
    a.widgets.every(
      (w) =>
        record(w) &&
        exact(w, ["kind", "x", "y", "w", "h", "opacity"]) &&
        oneOf(w.kind, homeWidgetKinds) &&
        [w.x, w.y].every(
          (c) =>
            typeof c === "number" &&
            Number.isInteger(c) &&
            Math.abs(c) <= homeCoordinateLimit,
        ) &&
        [w.w, w.h].every(
          (c) => integer(c) && c > 0 && c <= homeCoordinateLimit,
        ) &&
        integer(w.opacity) &&
        w.opacity <= homeOpacityMax,
    )
  );
}
export const isRequest = (v: Record<string, unknown>) =>
  v.method === "home.get" && exact(v, ["method"]);
export const isReply = (v: Record<string, unknown>) =>
  v.method === "home.get" && exact(v, ["method", "value"]) && isHome(v.value);
export const isEvent = (v: Record<string, unknown>) =>
  v.topic === "home" && exact(v, ["topic", "value"]) && isHome(v.value);
export const isError = (_v: Record<string, unknown>) => false;
