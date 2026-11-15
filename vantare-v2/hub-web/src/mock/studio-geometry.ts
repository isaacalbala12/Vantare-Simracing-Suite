import type {
  CanvasChoice,
  GeometryChange,
  StudioView,
} from "../contract/generated/studio";
import { studioGeometryLimits as limits } from "../contract/generated/studio";
import {
  project,
  sameGeometry,
} from "../renderer/screens/studio/canvas-writer";
import { boundedSize, near } from "../renderer/screens/studio/geometry";
export function applyGeometry(
  view: StudioView,
  id: string,
  change: GeometryChange,
): "changed" | "same" | "denied" | "rejected" | "protected" {
  if (!view.canvas) return "protected";
  const item = view.instances.find((i) => i.id === id);
  if (!item || item.locked) return "denied";
  if (
    (change.kind === "move" || change.kind === "resize") &&
    ![change.x, change.y].every(
      (n) => Number.isFinite(n) && Math.abs(n) <= limits.nudgeLimit,
    )
  )
    return "rejected";
  if (change.kind === "resize") {
    if (
      change.width < limits.minSize[0] ||
      change.height < limits.minSize[1] ||
      change.width > limits.maxSize[0] ||
      change.height > limits.maxSize[1]
    )
      return "rejected";
    const same = (a: number, b: number) =>
      near(a, b) ||
      Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 2 ** -24; // IEEE-754 f32::EPSILON / 2, native round-trip rule.
    const requested: readonly [number, number] =
      same(item.size.width, change.width) &&
      same(item.size.height, change.height)
        ? [item.size.width, item.size.height]
        : [change.width, change.height];
    const next = boundedSize(
      [item.size.width, item.size.height],
      requested,
      item.aspectLocked,
      false,
    );
    if (!next || !near(next[0], requested[0]) || !near(next[1], requested[1]))
      return "rejected";
    change = { ...change, width: next[0], height: next[1] };
  }
  const next = project(item, change, view);
  if (!next) return "rejected";
  if (sameGeometry(item, next)) return "same";
  Object.assign(item, next);
  placement(view);
  return "changed";
}
export function applyCanvas(
  view: StudioView,
  choice: CanvasChoice,
): "changed" | "same" | "rejected" | "protected" {
  if (!view.canvas) return "protected";
  if (
    choice.kind === "custom" &&
    ![choice.width, choice.height].every(
      (n) =>
        Number.isFinite(n) && n >= limits.canvasMin && n <= limits.canvasMax,
    )
  )
    return "rejected";
  const next =
    choice.kind === "monitor"
      ? { source: "monitor" as const, width: 1920, height: 1080 }
      : {
          source: "custom" as const,
          width: choice.width,
          height: choice.height,
        }; // Fixed local QA monitor, not a renderer-derived real monitor.
  if (JSON.stringify(view.canvas) === JSON.stringify(next)) return "same";
  view.canvas = next;
  placement(view);
  return "changed";
}
function placement(view: StudioView) {
  const canvas = view.canvas;
  if (!canvas) return;
  for (const item of view.instances)
    item.canvasPlacement =
      item.x < 0 ||
      item.y < 0 ||
      item.x + item.size.width > canvas.width ||
      item.y + item.size.height > canvas.height
        ? "outside"
        : "inside";
}
