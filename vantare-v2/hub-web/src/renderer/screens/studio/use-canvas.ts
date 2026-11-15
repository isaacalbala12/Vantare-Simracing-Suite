import { useQuery } from "@tanstack/react-query";
import type {
  KeyboardEvent as ReactKey,
  PointerEvent as ReactPointer,
} from "react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/studio";
import { studioGeometryLimits as limits } from "../../../contract/generated/studio";
import { coreKey, offline } from "../../app/Host";
import type { ReturnTypeOfStudioFocus } from "../../ui/studio/StudioFocus";
import { CanvasWriter, rectOf } from "./canvas-writer";
import {
  fit as fitCanvas,
  heldNudgeDistance,
  type Pair,
  previewOrigin,
  type Rect,
  resize,
  snap,
} from "./geometry";

const zooms = [null, 0.5, 0.75, 1, 1.25, 1.5] as const; // Frozen GPUI studio.rs::ZOOM_STEPS.
const presets = [
  [1920, 1080],
  [2520, 1080],
  [1920, 1200],
  [3840, 1080],
  [2560, 1440],
  [3840, 2160],
] as const;
type Gesture =
  | {
      pointer: number;
      origin: Pair;
      rect: Rect;
      scale: number;
      moved: boolean;
      handle?: Pair;
    }
  | {
      key: string;
      rect: Rect;
      direction: Pair;
      shift: boolean;
      alt: boolean;
      started: number;
    };
export function useCanvas(
  model: ReturnTypeOfStudioFocus,
  now = () => performance.now(),
) {
  const { state, selected } = model;
  const view = state.view as StudioView;
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const allowed =
    view.state === "ready" &&
    view.plan !== "unverified" &&
    core.access.verified &&
    !core.access.blocked &&
    !core.live &&
    core.photos === "connected";
  const scope = JSON.stringify([
    core.accountGeneration,
    core.access,
    core.live,
    core.photos,
  ]);
  const [, changed] = useReducer((n: number) => n + 1, 0);
  const [writer] = useState(
    () => new CanvasWriter(view, scope, allowed, state.execute, changed),
  );
  const viewport = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | undefined>(undefined),
    raf = useRef<number | undefined>(undefined),
    widthField = useRef<HTMLInputElement>(null);
  const measured = useRef<Pair>([1, 1]);
  const [area, setArea] = useState<Pair>([1, 1]),
    [zoom, setZoom] = useState(0);
  const help = useId();
  const canvas = view.canvas;
  const fitted = canvas
    ? (fitCanvas(area, [canvas.width, canvas.height]) ?? 1)
    : 1;
  const scale = zooms[zoom] ?? fitted;
  const origin = canvas
    ? (previewOrigin(area, [canvas.width, canvas.height], scale) ?? [0, 0])
    : [0, 0];
  const editable = allowed && (!state.pending || !!writer.inflight);
  const cancel = useCallback(() => {
    gesture.current = undefined;
    if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    raf.current = undefined;
    writer.cancel();
  }, [writer]);
  useLayoutEffect(() => {
    writer.refresh(view, scope, allowed);
    if (!writer.draft) {
      gesture.current = undefined;
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    }
  }, [view, scope, allowed, writer]);
  useEffect(() => {
    writer.activate();
    return () => {
      writer.dispose();
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    };
  }, [writer]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const w = element.clientWidth,
        h = element.clientHeight;
      if (w > 0 && h > 0)
        if (measured.current[0] !== w || measured.current[1] !== h) {
          cancel();
          measured.current = [w, h];
          setArea([w, h]);
        }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [cancel]);
  useEffect(() => {
    const stop = () => cancel();
    window.addEventListener("blur", stop);
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cancel]);
  useLayoutEffect(() => {
    viewport.current?.focus();
  }, []);
  function pointerStart(
    event: ReactPointer<HTMLElement>,
    item: OverlayInstance,
    handle?: Pair,
  ) {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      !editable ||
      document.querySelector('[role="dialog"],[role="alertdialog"]')
    )
      return;
    cancel();
    model.select(item.id);
    if (!writer.begin(item.id)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointer: event.pointerId,
      origin: [event.clientX, event.clientY],
      rect: rectOf(item),
      scale,
      moved: false,
      handle,
    };
  }
  function pointerMove(event: ReactPointer<HTMLElement>) {
    const g = gesture.current;
    if (
      !g ||
      !("pointer" in g) ||
      g.pointer !== event.pointerId ||
      !writer.draft ||
      !canvas
    )
      return;
    const dx = (event.clientX - g.origin[0]) / g.scale,
      dy = (event.clientY - g.origin[1]) / g.scale;
    if (
      !g.moved &&
      Math.hypot(event.clientX - g.origin[0], event.clientY - g.origin[1]) < 3
    )
      return;
    g.moved = true;
    const [x, y, w, h] = g.rect;
    if (g.handle) {
      const result = resize(
        [x, y],
        [w, h],
        g.handle,
        [dx, dy],
        writer.draft.base.aspectLocked,
      );
      if (result) writer.preview([...result[0], ...result[1]] as Rect);
    } else {
      const others = view.instances
        .filter((i) => i.id !== writer.draft?.id && i.visible)
        .map(rectOf);
      const result = snap(
        [x + dx + w / 2, y + dy + h / 2],
        [w, h],
        [canvas.width, canvas.height],
        others,
        limits.snapScreenPx / g.scale,
      );
      if (result)
        writer.preview([...result.position, w, h] as Rect, result.guides);
    }
  }
  function pointerEnd(event: ReactPointer<HTMLElement>) {
    const g = gesture.current;
    if (!g || !("pointer" in g) || g.pointer !== event.pointerId) return;
    pointerMove(event);
    gesture.current = undefined;
    if (g.moved) writer.finish(g.handle ? "resize" : "move");
    else writer.abandonDraft();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function heldTick() {
    const g = gesture.current;
    if (!g || !("key" in g) || !writer.draft) return;
    const [x, y, w, h] = g.rect,
      distance = heldNudgeDistance(
        Math.max(0, Math.floor(now() - g.started)),
        g.shift,
      );
    if (g.alt) {
      const r = resize(
        [x, y],
        [w, h],
        [1, 1],
        [g.direction[0] * distance, g.direction[1] * distance],
        writer.draft.base.aspectLocked,
      );
      if (r) writer.preview([...r[0], ...r[1]] as Rect);
    } else
      writer.preview([
        Math.max(
          -limits.nudgeLimit,
          Math.min(limits.nudgeLimit, x + g.direction[0] * distance),
        ),
        Math.max(
          -limits.nudgeLimit,
          Math.min(limits.nudgeLimit, y + g.direction[1] * distance),
        ),
        w,
        h,
      ]);
    raf.current = requestAnimationFrame(heldTick);
  }
  function lostPointerCapture() {
    if (gesture.current && "pointer" in gesture.current) cancel();
  }
  function keyDown(event: ReactKey<HTMLElement>) {
    if (
      !event.defaultPrevented &&
      !event.nativeEvent.isComposing &&
      !event.altKey &&
      event.ctrlKey !== event.metaKey &&
      ["z", "y"].includes(event.key.toLowerCase())
    ) {
      cancel();
      return;
    }
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.getModifierState("AltGraph") ||
      document.querySelector('[role="dialog"],[role="alertdialog"]')
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (writer.draft || writer.queued) cancel();
      else if (!event.altKey) model.setCatalogOpen(true);
      return;
    }
    if (event.key === "/" && !event.altKey && !event.repeat) {
      event.preventDefault();
      cancel();
      model.setCatalogOpen(true);
      return;
    }
    if (
      event.key === "Delete" &&
      selected &&
      editable &&
      !selected.locked &&
      !event.altKey &&
      !event.shiftKey &&
      !event.repeat
    ) {
      event.preventDefault();
      cancel();
      state.setRemoving(selected.id);
      return;
    }
    const direction: Pair | undefined = (
      {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      } as Record<string, Pair>
    )[event.key];
    if (!direction || !selected || !editable) return;
    event.preventDefault();
    if (event.repeat || gesture.current) return;
    if (!writer.begin(selected.id)) return;
    gesture.current = {
      key: event.key,
      rect: rectOf(selected),
      direction,
      shift: event.shiftKey,
      alt: event.altKey,
      started: now(),
    };
    heldTick();
  }
  function keyUp(event: ReactKey<HTMLElement>) {
    const g = gesture.current;
    if (g && "key" in g && event.key === g.key) {
      event.preventDefault();
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
      gesture.current = undefined;
      writer.finish(g.alt ? "resize" : "move");
    }
  }
  const changeZoom = (value: number) => {
    cancel();
    setZoom(Math.max(0, Math.min(zooms.length - 1, value)));
  };
  const selectedRect =
    writer.draft?.id === selected?.id
      ? writer.draft?.rect
      : selected
        ? rectOf(selected)
        : undefined;
  return {
    state,
    view,
    selected,
    select: model.select,
    writer,
    viewport,
    help,
    widthField,
    canvas,
    allowed,
    editable,
    area,
    zoom,
    scale,
    origin,
    selectedRect,
    cancel,
    keyDown,
    keyUp,
    pointerStart,
    pointerMove,
    pointerEnd,
    lostPointerCapture,
    changeZoom,
    presets,
  };
}
export type CanvasModel = ReturnType<typeof useCanvas>;
