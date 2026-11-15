import {
  type StudioRequest,
  type StudioView,
  studioGeometryLimits,
  studioSizes,
  type WidgetKind,
} from "../../../contract/generated/studio";
import { catalogBlock } from "../../ui/studio/catalog-model";
import { type Pair, type Rect, snap } from "./geometry";

export type DropAccess = { enabled: boolean; pending: boolean };
export type DropSurface = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type CatalogGesture = Readonly<{ kind: WidgetKind; canvas: Pair }>;
export type CatalogPreview = {
  at: Pair;
  size: Pair;
  guides: readonly (number | null)[];
};

const available = (view: StudioView, kind: WidgetKind, access: DropAccess) => {
  const widget = view.catalog.find((item) => item.kind === kind);
  return (
    access.enabled &&
    view.plan !== "unverified" &&
    widget &&
    !catalogBlock(view, widget, access.pending) &&
    view.canvas !== null
  );
};

/** No DOM or writes: the future catalogue handle owns pointer capture/cancellation. */
export function beginCatalogDrop(
  view: StudioView,
  kind: WidgetKind,
  access: DropAccess,
): CatalogGesture | null {
  if (!available(view, kind, access) || !view.canvas) return null;
  return { kind, canvas: [view.canvas.width, view.canvas.height] };
}

/** Pointer is the silhouette centre; `at` is its snapped top-left, as Rust expects. */
export function previewCatalogDrop(
  gesture: CatalogGesture,
  view: StudioView,
  pointer: Pair,
  surface: DropSurface,
  access: DropAccess,
): CatalogPreview | null {
  if (
    !available(view, gesture.kind, access) ||
    !view.canvas ||
    view.canvas.width !== gesture.canvas[0] ||
    view.canvas.height !== gesture.canvas[1] ||
    ![
      ...pointer,
      surface.left,
      surface.top,
      surface.width,
      surface.height,
    ].every(Number.isFinite) ||
    surface.width <= 0 ||
    surface.height <= 0 ||
    pointer[0] < surface.left ||
    pointer[1] < surface.top ||
    pointer[0] >= surface.left + surface.width ||
    pointer[1] >= surface.top + surface.height
  )
    return null;
  const scale = surface.width / gesture.canvas[0];
  // DOM rectangles can round subpixels. Allow at most half a CSS pixel of
  // aspect mismatch; this is not the epsilon used for Rust geometry results.
  // Real stretching/stale surfaces still fail instead of guessing a point.
  if (Math.abs(surface.height - gesture.canvas[1] * scale) > 0.5) return null;
  const center: Pair = [
    (pointer[0] - surface.left) / scale,
    (pointer[1] - surface.top) / (surface.height / gesture.canvas[1]),
  ];
  const defaults = studioSizes[gesture.kind];
  const size: Pair = [defaults.width, defaults.height];
  const others: Rect[] = view.instances.map((item) => [
    item.x,
    item.y,
    item.size.width,
    item.size.height,
  ]);
  const result = snap(
    center,
    size,
    gesture.canvas,
    others,
    studioGeometryLimits.snapScreenPx / scale,
  );
  // studio.add accepts an origin inside the canvas; unlike a move, it rejects
  // a negative origin. Do not advertise a valid drop the host cannot accept.
  return result &&
    result.position[0] >= 0 &&
    result.position[1] >= 0 &&
    result.position[0] < gesture.canvas[0] &&
    result.position[1] < gesture.canvas[1]
    ? { at: result.position, size, guides: result.guides }
    : null;
}

/** One-use gesture, consumed even on an invalid release. Never queues/retries an add. */
export function catalogDropController() {
  let gesture: CatalogGesture | null = null;
  return {
    begin(view: StudioView, kind: WidgetKind, access: DropAccess) {
      if (gesture) return false;
      gesture = beginCatalogDrop(view, kind, access);
      return gesture !== null;
    },
    preview(
      view: StudioView,
      pointer: Pair,
      surface: DropSurface,
      access: DropAccess,
    ) {
      return gesture
        ? previewCatalogDrop(gesture, view, pointer, surface, access)
        : null;
    },
    cancel() {
      gesture = null;
    },
    release(
      view: StudioView,
      pointer: Pair,
      surface: DropSurface,
      access: DropAccess,
    ): Extract<StudioRequest, { method: "studio.add" }> | null {
      const held = gesture;
      gesture = null;
      if (!held) return null;
      const preview = previewCatalogDrop(held, view, pointer, surface, access);
      return preview
        ? {
            method: "studio.add",
            kind: held.kind,
            baseRevision: view.revision,
            at: { x: preview.at[0], y: preview.at[1] },
          }
        : null;
    },
  };
}
