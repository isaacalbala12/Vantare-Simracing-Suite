import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { studioGeometryLimits as limits } from "../../../contract/generated/studio";
import type { useCanvas } from "./canvas";
import { heldNudgeDistance, type Pair, resize, snap } from "./geometry";
import { type Box, sameBox } from "./gesture-state";

type Model = ReturnType<typeof useCanvas>;
type Held = {
  key: string;
  shift: boolean;
  started: number;
  base: Box;
  direction: Pair;
  handle?: Pair;
};
type Pointer = {
  id: number;
  target: HTMLElement;
  x: number;
  y: number;
  scale: number;
  scroll: Pair;
  area: Pair;
  handle?: Pair;
};
const directions: Record<string, Pair> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
const bounded = (v: number) =>
  Math.max(-limits.nudgeLimit, Math.min(limits.nudgeLimit, v));
export function useCanvasInputs(
  model: Model,
  viewport: RefObject<HTMLDivElement | null>,
  scale: number,
  onSelect: (id: string) => void,
  onGuides: (guides: readonly [number | null, number | null]) => void,
) {
  const latest = useRef({ model, scale, onSelect, onGuides });
  const previousScale = useRef(scale);
  latest.current = { model, scale, onSelect, onGuides };
  const pointer = useRef<Pointer | undefined>(undefined),
    held = useRef<Held | undefined>(undefined),
    frame = useRef(0);
  const state = useCallback(() => latest.current.model.current.current, []);
  const stopLocal = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    held.current = undefined;
    const p = pointer.current;
    pointer.current = undefined;
    if (p?.target.hasPointerCapture?.(p.id))
      p.target.releasePointerCapture(p.id);
  }, []);
  const cancel = useCallback(() => {
    stopLocal();
    latest.current.model.dispatch({ type: "cancel" });
    latest.current.onGuides([null, null]);
  }, [stopLocal]);
  const preview = useCallback(
    (box: Box) => {
      const current = state().gesture;
      if (current && !sameBox(current.draft, box))
        latest.current.model.dispatch({ type: "preview", box });
    },
    [state],
  );
  function pointerDown(
    event: PointerEvent<HTMLElement>,
    id: string,
    handle?: Pair,
  ) {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      pointer.current ||
      held.current
    )
      return;
    const root = viewport.current;
    if (!root) return;
    latest.current.onSelect(id);
    if (!latest.current.model.begin(id, handle ? "resize" : "move")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    pointer.current = {
      id: event.pointerId,
      target: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      scale:
        (latest.current.scale * root.getBoundingClientRect().width) /
        root.offsetWidth,
      scroll: [root.scrollLeft, root.scrollTop],
      area: [root.clientWidth, root.clientHeight],
      handle,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLElement>) {
    const p = pointer.current,
      g = state().gesture,
      root = viewport.current;
    if (!p || p.id !== event.pointerId || !g || !root) return;
    if (root.clientWidth !== p.area[0] || root.clientHeight !== p.area[1]) {
      cancel();
      return;
    }
    if (!Number.isFinite(p.scale) || p.scale <= 0) {
      cancel();
      return;
    }
    if (
      Math.hypot(event.clientX - p.x, event.clientY - p.y) < 3 &&
      sameBox(g.origin, g.draft)
    )
      return;
    const dx =
      (event.clientX - p.x) / p.scale +
      (root.scrollLeft - p.scroll[0]) / latest.current.scale;
    const dy =
      (event.clientY - p.y) / p.scale +
      (root.scrollTop - p.scroll[1]) / latest.current.scale;
    if (p.handle) {
      const result = resize(
        [g.origin.x, g.origin.y],
        [g.origin.size.width, g.origin.size.height],
        p.handle,
        [dx, dy],
        g.origin.aspectLocked,
      );
      if (result)
        preview({
          ...g.origin,
          x: result[0][0],
          y: result[0][1],
          size: { width: result[1][0], height: result[1][1] },
          sizeMode: "explicit",
        });
    } else {
      const canvas = state().view.canvas;
      if (!canvas) {
        cancel();
        return;
      }
      const others = state()
        .view.instances.filter((item) => item.id !== g.id && item.visible)
        .map(
          (item) =>
            [item.x, item.y, item.size.width, item.size.height] as const,
        );
      const result = snap(
        [
          g.origin.x + dx + g.origin.size.width / 2,
          g.origin.y + dy + g.origin.size.height / 2,
        ],
        [g.origin.size.width, g.origin.size.height],
        [canvas.width, canvas.height],
        others,
        limits.snapScreenPx / p.scale,
      );
      if (result) {
        preview({ ...g.origin, x: result.position[0], y: result.position[1] });
        latest.current.onGuides(result.guides);
      }
    }
  }
  function pointerUp(event: PointerEvent<HTMLElement>) {
    if (pointer.current?.id !== event.pointerId) return;
    pointerMove(event);
    stopLocal();
    latest.current.model.dispatch({ type: "finish" });
    latest.current.onGuides([null, null]);
  }
  function pointerLost(event: PointerEvent<HTMLElement>) {
    if (pointer.current?.id === event.pointerId) cancel();
  }
  const tickHeld = useCallback(() => {
    const h = held.current,
      g = state().gesture;
    if (!h || !g) return;
    const d = heldNudgeDistance(
      Math.max(0, Math.floor(performance.now() - h.started)),
      h.shift,
    );
    if (h.handle) {
      const result = resize(
        [h.base.x, h.base.y],
        [h.base.size.width, h.base.size.height],
        h.handle,
        [h.direction[0] * d, h.direction[1] * d],
        h.base.aspectLocked,
      );
      if (result)
        preview({
          ...h.base,
          x: result[0][0],
          y: result[0][1],
          size: { width: result[1][0], height: result[1][1] },
          sizeMode: "explicit",
        });
    } else
      preview({
        ...h.base,
        x: bounded(h.base.x + h.direction[0] * d),
        y: bounded(h.base.y + h.direction[1] * d),
      });
  }, [state, preview]);
  function repeat() {
    tickHeld();
    if (held.current) frame.current = requestAnimationFrame(repeat);
  }
  function keyDown(
    event: KeyboardEvent<HTMLElement>,
    id: string,
    handle?: Pair,
  ) {
    if (
      event.nativeEvent.isComposing ||
      event.getModifierState("AltGraph") ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    if (event.key === "Escape" && state().gesture) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const active = held.current;
    if (active) {
      if (active.key === event.key) {
        const gesture = state().gesture;
        if (active.shift !== event.shiftKey && gesture) {
          active.base = gesture.draft;
          active.started = performance.now();
          active.shift = event.shiftKey;
        }
        return;
      }
      tickHeld();
      stopLocal();
      latest.current.model.dispatch({ type: "finish" });
    }
    latest.current.onSelect(id);
    const resizeHandle =
      handle ?? (event.altKey ? ([1, 1] as const) : undefined);
    if (!latest.current.model.begin(id, resizeHandle ? "resize" : "move"))
      return;
    const g = state().gesture;
    if (!g) return;
    held.current = {
      key: event.key,
      shift: event.shiftKey,
      started: performance.now(),
      base: g.origin,
      direction,
      handle: resizeHandle,
    };
    repeat();
  }
  useEffect(() => {
    const release = (event: globalThis.KeyboardEvent) => {
      if (held.current?.key !== event.key || event.isComposing) return;
      tickHeld();
      stopLocal();
      latest.current.model.dispatch({ type: "finish" });
    };
    window.addEventListener("keyup", release);
    window.addEventListener("blur", cancel);
    return () => {
      stopLocal();
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", cancel);
    };
  }, [tickHeld, stopLocal, cancel]);
  useEffect(() => {
    if (!model.snapshot.gesture) {
      stopLocal();
      latest.current.onGuides([null, null]);
    }
  }, [model.snapshot.gesture, stopLocal]);
  useEffect(() => {
    const previous = previousScale.current;
    previousScale.current = scale;
    if (previous !== scale || !model.enabled) cancel();
  }, [scale, model.enabled, cancel]);
  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerLost,
    keyDown,
    cancel,
    blur: () => {
      if (held.current || pointer.current) cancel();
    },
  };
}
