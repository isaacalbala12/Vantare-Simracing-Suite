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
import { canvasText as t } from "../../i18n/studio-canvas.es";
import { CanvasWriter, rectOf } from "../../screens/studio/canvas-writer";
import {
  fit as fitCanvas,
  heldNudgeDistance,
  type Pair,
  previewOrigin,
  type Rect,
  resize,
  snap,
} from "../../screens/studio/geometry";
import { Button } from "../Button";
import { Callout } from "../Data";
import { Select } from "../Forms";
import { CanvasFields } from "./CanvasFields";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";
import { StudioFeedback } from "./StudioStates";
import { StudioSteps } from "./StudioSteps";
import { WidgetThumb, widgetName } from "./Widgets";
import "./canvas.css";

const handles: Pair[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
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
export function StudioCanvas({
  model,
  onBack,
  now = () => performance.now(),
}: {
  model: ReturnTypeOfStudioFocus;
  onBack: () => void;
  now?: () => number;
}) {
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
        setArea((old) => {
          if (old[0] === w && old[1] === h) return old;
          cancel();
          return [w, h];
        });
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
  function keyDown(event: ReactKey<HTMLElement>) {
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
      else model.setCatalogOpen(true);
      return;
    }
    if (event.key === "/" && !event.altKey && !event.repeat) {
      event.preventDefault();
      model.setCatalogOpen(true);
      return;
    }
    if (
      event.key === "Delete" &&
      selected &&
      editable &&
      !selected.locked &&
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
  return (
    <section className="v-canvas-mode" aria-label={t.title}>
      <div className="v-canvas-left">
        <header className="v-canvas-heading">
          <Button onClick={onBack}>{t.back}</Button>
          <span>{t.illustration}</span>
          <span className="v-canvas-status" role="status">
            {writer.notice ? t[writer.notice] : ""}
          </span>
        </header>
        <StudioFeedback model={model} />
        {!allowed && <Callout title={t.unavailable} />}
        <div
          className="v-canvas-viewport"
          ref={viewport}
          tabIndex={-1}
          role="application"
          aria-label={t.title}
          aria-describedby={help}
          onKeyDown={keyDown}
          onKeyUp={keyUp}
          onScroll={cancel}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) cancel();
          }}
        >
          {canvas && (
            <div
              className="v-canvas-scroll"
              style={{
                width: Math.max(area[0], canvas.width * scale),
                height: Math.max(area[1], canvas.height * scale),
              }}
            >
              <div
                className="v-canvas-paper"
                style={{
                  left: origin[0],
                  top: origin[1],
                  width: canvas.width * scale,
                  height: canvas.height * scale,
                }}
              >
                {view.instances.map((item) => {
                  const box =
                      writer.draft?.id === item.id
                        ? writer.draft.rect
                        : rectOf(item),
                    name = widgetName(item, view),
                    active = selected?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className="v-canvas-widget"
                      data-selected={active}
                      data-locked={item.locked}
                      style={{
                        left: box[0] * scale,
                        top: box[1] * scale,
                        width: box[2] * scale,
                        height: box[3] * scale,
                        opacity:
                          (item.opacity / 100) * (item.visible ? 1 : 0.35),
                      }}
                    >
                      <button
                        type="button"
                        className="v-canvas-move"
                        data-canvas-handle
                        aria-label={t.move(name)}
                        aria-pressed={active}
                        aria-disabled={!editable || item.locked}
                        tabIndex={
                          active && item.canvasPlacement !== "outside" ? 0 : -1
                        }
                        onFocus={() => model.select(item.id)}
                        onClick={() => model.select(item.id)}
                        onPointerDown={(e) => pointerStart(e, item)}
                        onPointerMove={pointerMove}
                        onPointerUp={pointerEnd}
                        onPointerCancel={cancel}
                        onLostPointerCapture={() => {
                          if (gesture.current && "pointer" in gesture.current)
                            cancel();
                        }}
                      >
                        <WidgetThumb kind={item.kind} fit="fill" />
                      </button>
                      {active && (
                        <>
                          <span className="v-canvas-caption">
                            {name} · {Math.round(box[2])} × {Math.round(box[3])}
                          </span>
                          {!item.locked &&
                            handles.map((handle, index) => (
                              <button
                                type="button"
                                key={handle.join(",")}
                                className="v-canvas-handle"
                                data-index={index}
                                aria-label={t.resize(name, t.handles[index])}
                                aria-disabled={!editable}
                                tabIndex={-1}
                                onPointerDown={(e) =>
                                  pointerStart(e, item, handle)
                                }
                                onPointerMove={pointerMove}
                                onPointerUp={pointerEnd}
                                onPointerCancel={cancel}
                                onLostPointerCapture={() => {
                                  if (
                                    gesture.current &&
                                    "pointer" in gesture.current
                                  )
                                    cancel();
                                }}
                                onClick={(e) => {
                                  if (e.detail === 0)
                                    widthField.current?.focus();
                                }}
                              />
                            ))}
                        </>
                      )}
                    </div>
                  );
                })}
                {writer.draft?.guides.map((at, axis) =>
                  at === null ? null : (
                    <span
                      key={axis === 0 ? "x" : "y"}
                      className="v-canvas-guide"
                      data-axis={axis}
                      style={
                        axis === 0 ? { left: at * scale } : { top: at * scale }
                      }
                    />
                  ),
                )}
                <span className="v-canvas-resolution">
                  {canvas.width} × {canvas.height}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="v-canvas-toolbar">
          <Select
            label={t.resolution}
            value={
              canvas?.source === "monitor"
                ? "monitor"
                : `${canvas?.width}x${canvas?.height}`
            }
            disabled={!allowed || state.pending}
            options={[
              {
                value: "monitor",
                label:
                  canvas?.source === "monitor"
                    ? `${t.monitor} · ${canvas.width} × ${canvas.height}`
                    : t.monitor,
              },
              ...presets.map(([w, h]) => ({
                value: `${w}x${h}`,
                label: `${w} × ${h}`,
              })),
              ...(canvas?.source === "custom" &&
              !presets.some(
                ([w, h]) => w === canvas.width && h === canvas.height,
              )
                ? [
                    {
                      value: `${canvas.width}x${canvas.height}`,
                      label: `${t.custom} · ${canvas.width} × ${canvas.height}`,
                    },
                  ]
                : []),
            ]}
            onChange={(value) => {
              cancel();
              if (value === "monitor")
                void state.execute({
                  method: "studio.canvas",
                  baseRevision: view.revision,
                  resolution: { kind: "monitor" },
                });
              else {
                const p = presets.find(([w, h]) => `${w}x${h}` === value);
                if (p)
                  void state.execute({
                    method: "studio.canvas",
                    baseRevision: view.revision,
                    resolution: { kind: "custom", width: p[0], height: p[1] },
                  });
              }
            }}
          />
          <span>{selectedRect ? t.coordinate(...selectedRect) : ""}</span>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t.zoomOut}
            onClick={() => changeZoom(zoom - 1)}
          >
            −
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t.fit}
            onClick={() => changeZoom(0)}
          >
            {Math.round(scale * 100)} %
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t.zoomIn}
            onClick={() => changeZoom(zoom + 1)}
          >
            +
          </Button>
        </div>
        <div className="v-canvas-list" role="toolbar" aria-label={t.title}>
          {view.instances.map((item) => (
            <Button
              key={item.id}
              data-widget={item.id}
              variant="ghost"
              aria-pressed={selected?.id === item.id}
              onClick={() => {
                cancel();
                model.select(item.id);
                viewport.current?.focus();
              }}
            >
              <WidgetThumb kind={item.kind} icon />
              {widgetName(item, view)}
              {item.canvasPlacement === "outside" && <small>{t.outside}</small>}
            </Button>
          ))}
          <Button
            onClick={() => model.setCatalogOpen(true)}
            disabled={!allowed}
          >
            {t.add}
          </Button>
        </div>
        <p id={help} className="v-canvas-help">
          {t.help}
        </p>
      </div>
      <aside className="v-canvas-inspector" aria-label={t.geometry}>
        {selected ? (
          <>
            <h2>{widgetName(selected, view)}</h2>
            <CanvasFields
              key={selected.id}
              item={selected}
              writer={writer}
              disabled={!editable || selected.locked}
              widthRef={widthField}
            />
            <StudioSteps item={selected} readOnly={!allowed} />
          </>
        ) : (
          <p>{t.empty}</p>
        )}
      </aside>
    </section>
  );
}
