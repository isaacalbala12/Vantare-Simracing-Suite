import type { WidgetLayoutV3 } from "../../../overlay/core/profile-document";

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type ResizeInput = {
  startLayout: WidgetLayoutV3;
  handle: ResizeHandle;
  pointerDelta: { dx: number; dy: number };
  minSize: { width: number; height: number };
  supportsAspectUnlock: boolean;
};

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function applyMinSize(
  width: number,
  height: number,
  minSize: { width: number; height: number },
): { width: number; height: number } {
  return {
    width: Math.max(minSize.width, width),
    height: Math.max(minSize.height, height),
  };
}

function shouldLockAspect(layout: WidgetLayoutV3, supportsAspectUnlock: boolean): boolean {
  return layout.aspectLocked || !supportsAspectUnlock;
}

function resizeLockedFromWidth(
  start: WidgetLayoutV3,
  width: number,
  minSize: { width: number; height: number },
): { width: number; height: number } {
  const aspect = start.w / start.h;
  let nextW = Math.max(minSize.width, width);
  let nextH = Math.max(minSize.height, Math.round(nextW / aspect));
  nextW = Math.round(nextH * aspect);
  return applyMinSize(nextW, nextH, minSize);
}

function resizeLockedFromHeight(
  start: WidgetLayoutV3,
  height: number,
  minSize: { width: number; height: number },
): { width: number; height: number } {
  const aspect = start.w / start.h;
  let nextH = Math.max(minSize.height, height);
  let nextW = Math.max(minSize.width, Math.round(nextH * aspect));
  nextH = Math.round(nextW / aspect);
  return applyMinSize(nextW, nextH, minSize);
}

export function resizeWidgetLayout(input: ResizeInput): WidgetLayoutV3 {
  const start = input.startLayout;
  const dx = finite(input.pointerDelta.dx);
  const dy = finite(input.pointerDelta.dy);
  const lockAspect = shouldLockAspect(start, input.supportsAspectUnlock);

  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;

  switch (input.handle) {
    case "e":
      w = start.w + dx;
      if (lockAspect) {
        ({ width: w, height: h } = resizeLockedFromWidth(start, w, input.minSize));
      } else {
        ({ width: w, height: h } = applyMinSize(w, h, input.minSize));
      }
      break;
    case "s":
      h = start.h + dy;
      if (lockAspect) {
        ({ width: w, height: h } = resizeLockedFromHeight(start, h, input.minSize));
      } else {
        ({ width: w, height: h } = applyMinSize(w, h, input.minSize));
      }
      break;
    case "w":
      x = start.x + dx;
      w = start.w - dx;
      if (lockAspect) {
        ({ width: w, height: h } = resizeLockedFromWidth(start, w, input.minSize));
      } else {
        ({ width: w, height: h } = applyMinSize(w, h, input.minSize));
      }
      break;
    case "n":
      y = start.y + dy;
      h = start.h - dy;
      if (lockAspect) {
        ({ width: w, height: h } = resizeLockedFromHeight(start, h, input.minSize));
      } else {
        ({ width: w, height: h } = applyMinSize(w, h, input.minSize));
      }
      break;
    case "se": {
      const nextW = start.w + dx;
      if (lockAspect) {
        ({ width: w, height: h } = resizeLockedFromWidth(start, nextW, input.minSize));
      } else {
        ({ width: w, height: h } = applyMinSize(nextW, start.h + dy, input.minSize));
      }
      break;
    }
    case "nw": {
      x = start.x + dx;
      y = start.y + dy;
      const nextW = start.w - dx;
      if (lockAspect) {
        ({ width: w, height: h } = resizeLockedFromWidth(start, nextW, input.minSize));
        x = start.x + (start.w - w);
        y = start.y + (start.h - h);
      } else {
        ({ width: w, height: h } = applyMinSize(nextW, start.h - dy, input.minSize));
      }
      break;
    }
    case "ne": {
      y = start.y + dy;
      const nextW = start.w + dx;
      if (lockAspect) {
        ({ width: w, height: h } = resizeLockedFromWidth(start, nextW, input.minSize));
        y = start.y + (start.h - h);
      } else {
        ({ width: w, height: h } = applyMinSize(nextW, start.h - dy, input.minSize));
      }
      break;
    }
    case "sw": {
      x = start.x + dx;
      const nextW = start.w - dx;
      if (lockAspect) {
        ({ width: w, height: h } = resizeLockedFromWidth(start, nextW, input.minSize));
        x = start.x + (start.w - w);
      } else {
        ({ width: w, height: h } = applyMinSize(nextW, start.h + dy, input.minSize));
      }
      break;
    }
  }

  return {
    ...start,
    x: finite(x, start.x),
    y: finite(y, start.y),
    w: finite(w, start.w),
    h: finite(h, start.h),
  };
}