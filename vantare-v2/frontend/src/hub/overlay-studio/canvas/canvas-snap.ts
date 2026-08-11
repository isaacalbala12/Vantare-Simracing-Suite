import type { LayoutViewport } from "../../../overlay/core/layout-viewport";
import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";
import {
  SNAP_TOLERANCE,
  snapToGrid,
  type Point,
} from "./canvas-geometry";

export type SnapGuide = {
  orientation: "horizontal" | "vertical";
  position: number;
  kind: "grid" | "edge" | "center";
};

export type SnapInput = {
  layout: WidgetLayoutV3;
  siblings: readonly WidgetLayoutV3[];
  layoutViewport: LayoutViewport;
  disableSnap?: boolean;
};

export type SnapResult = {
  layout: WidgetLayoutV3;
  guides: SnapGuide[];
};

type AxisSnap = {
  value: number;
  guide: SnapGuide | null;
};

const SNAP_KIND_PRIORITY: Record<SnapGuide["kind"], number> = {
  edge: 3,
  center: 2,
  grid: 1,
};

type SnapTarget = {
  position: number;
  kind: SnapGuide["kind"];
  guidePosition?: number;
};

function bestAxisSnap(
  current: number,
  targets: readonly SnapTarget[],
  orientation: SnapGuide["orientation"],
  tolerance = SNAP_TOLERANCE,
): AxisSnap {
  let best: AxisSnap = { value: current, guide: null };
  for (const target of targets) {
    const delta = Math.abs(current - target.position);
    if (delta > tolerance) {
      continue;
    }
    const bestDelta = best.guide === null ? Number.POSITIVE_INFINITY : Math.abs(current - best.value);
    const kindPriority = SNAP_KIND_PRIORITY[target.kind];
    const bestKindPriority = best.guide ? SNAP_KIND_PRIORITY[best.guide.kind] : 0;
    if (
      best.guide === null
      || delta < bestDelta
      || (delta === bestDelta && kindPriority > bestKindPriority)
    ) {
      best = {
        value: target.position,
        guide: {
          orientation,
          position: target.guidePosition ?? target.position,
          kind: target.kind,
        },
      };
    }
  }
  return best;
}

function buildXTargets(
  layout: WidgetLayoutV3,
  siblings: readonly WidgetLayoutV3[],
  layoutViewport: LayoutViewport,
): SnapTarget[] {
  const targets: SnapTarget[] = [
    { position: snapToGrid(layout.x), kind: "grid" },
    { position: 0, kind: "edge" },
    {
      position: layoutViewport.width - layout.w,
      kind: "edge",
      guidePosition: layoutViewport.width,
    },
    {
      position: (layoutViewport.width - layout.w) / 2,
      kind: "center",
      guidePosition: layoutViewport.width / 2,
    },
  ];
  for (const sibling of siblings) {
    targets.push({ position: sibling.x, kind: "edge" });
    targets.push({
      position: sibling.x + sibling.w - layout.w,
      kind: "edge",
      guidePosition: sibling.x + sibling.w,
    });
    targets.push({
      position: sibling.x + sibling.w / 2 - layout.w / 2,
      kind: "center",
      guidePosition: sibling.x + sibling.w / 2,
    });
  }
  return targets;
}

function buildYTargets(
  layout: WidgetLayoutV3,
  siblings: readonly WidgetLayoutV3[],
  layoutViewport: LayoutViewport,
): SnapTarget[] {
  const targets: SnapTarget[] = [
    { position: snapToGrid(layout.y), kind: "grid" },
    { position: 0, kind: "edge" },
    {
      position: layoutViewport.height - layout.h,
      kind: "edge",
      guidePosition: layoutViewport.height,
    },
    {
      position: (layoutViewport.height - layout.h) / 2,
      kind: "center",
      guidePosition: layoutViewport.height / 2,
    },
  ];
  for (const sibling of siblings) {
    targets.push({ position: sibling.y, kind: "edge" });
    targets.push({
      position: sibling.y + sibling.h - layout.h,
      kind: "edge",
      guidePosition: sibling.y + sibling.h,
    });
    targets.push({
      position: sibling.y + sibling.h / 2 - layout.h / 2,
      kind: "center",
      guidePosition: sibling.y + sibling.h / 2,
    });
  }
  return targets;
}

export function snapWidgetLayout(input: SnapInput): SnapResult {
  const layout = {
    ...input.layout,
    x: Number.isFinite(input.layout.x) ? input.layout.x : 0,
    y: Number.isFinite(input.layout.y) ? input.layout.y : 0,
    w: Number.isFinite(input.layout.w) ? input.layout.w : 1,
    h: Number.isFinite(input.layout.h) ? input.layout.h : 1,
  };

  if (input.disableSnap) {
    return { layout, guides: [] };
  }

  const xSnap = bestAxisSnap(
    layout.x,
    buildXTargets(layout, input.siblings, input.layoutViewport),
    "vertical",
  );
  const ySnap = bestAxisSnap(
    layout.y,
    buildYTargets(layout, input.siblings, input.layoutViewport),
    "horizontal",
  );

  const guides = [xSnap.guide, ySnap.guide].filter((guide): guide is SnapGuide => guide !== null);

  return {
    layout: {
      ...layout,
      x: xSnap.value,
      y: ySnap.value,
    },
    guides,
  };
}

export function snapPoint(point: Point, input: Omit<SnapInput, "layout"> & { size: Pick<WidgetLayoutV3, "w" | "h"> }): SnapResult {
  return snapWidgetLayout({
    ...input,
    layout: {
      x: point.x,
      y: point.y,
      w: input.size.w,
      h: input.size.h,
      zIndex: 0,
      aspectLocked: true,
    },
  });
}
