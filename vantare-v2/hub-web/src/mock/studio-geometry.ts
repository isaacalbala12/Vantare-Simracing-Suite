import type {
  GeometryChange,
  OverlayInstance,
} from "../contract/generated/studio";
import {
  studioGeometryLimits as limits,
  studioSizes,
} from "../contract/generated/studio";
import {
  anchor,
  boundedSize,
  near,
  type Pair,
} from "../renderer/screens/studio/geometry";
import { boxOf, sameBox } from "../renderer/screens/studio/gesture-state";

/** QA host only. Uses the same Rust-vector-verified primitives, never disk. */
export function applyGeometry(
  item: OverlayInstance,
  change: GeometryChange,
  canvas: Pair,
): boolean | "rejected" {
  const before = boxOf(item);
  if (
    (change.kind === "move" || change.kind === "resize") &&
    (!Number.isFinite(change.x) ||
      !Number.isFinite(change.y) ||
      Math.abs(change.x) > limits.nudgeLimit ||
      Math.abs(change.y) > limits.nudgeLimit)
  )
    return "rejected";
  switch (change.kind) {
    case "move":
      item.x = change.x;
      item.y = change.y;
      break;
    case "resize": {
      const size = boundedSize(
        [item.size.width, item.size.height],
        [change.width, change.height],
        item.aspectLocked,
        false,
      );
      if (
        !size ||
        !near(size[0], change.width) ||
        !near(size[1], change.height)
      )
        return "rejected";
      item.x = change.x;
      item.y = change.y;
      item.size = { width: size[0], height: size[1] };
      item.sizeMode = "explicit";
      break;
    }
    case "anchor": {
      const p = anchor(
        [item.size.width, item.size.height],
        canvas,
        change.column,
        change.row,
      );
      if (!p) return "rejected";
      item.x = p[0];
      item.y = p[1];
      break;
    }
    case "aspectLocked":
      item.aspectLocked = change.value;
      break;
    case "autoSize":
      if (item.sizeMode === "auto") return false;
      item.sizeMode = "auto";
      item.size = { ...studioSizes[item.kind] };
      break;
  }
  item.canvasPlacement =
    item.x < 0 ||
    item.y < 0 ||
    item.x + item.size.width > canvas[0] ||
    item.y + item.size.height > canvas[1]
      ? "outside"
      : "inside";
  return !sameBox(before, boxOf(item));
}
