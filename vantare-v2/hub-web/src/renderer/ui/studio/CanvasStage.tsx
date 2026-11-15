import {
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText } from "../../i18n/studio";
import { canvasText as t } from "../../i18n/studio-canvas";
import { useCanvas } from "../../screens/studio/canvas";
import { useCanvasInputs } from "../../screens/studio/canvas-inputs";
import {
  fitCanvas,
  type Pair,
  previewOrigin,
} from "../../screens/studio/geometry";
import { boxOf } from "../../screens/studio/gesture-state";
import { useStudio } from "../../screens/studio/state";
import { Button, IconButton } from "../Button";
import { Callout } from "../Data";
import { WidgetThumb } from "../widgets/WidgetThumb";
import { CanvasTools } from "./CanvasTools";
import { widgetName } from "./Widgets";
import "./studio-canvas.css";

// UI zoom choices from frozen native/hub/src/studio.rs; no document writes.
export const canvasZoomSteps = [null, 50, 75, 100, 125, 150] as const;
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
export function CanvasStage({
  view,
  selected,
  onSelect,
  actions,
}: {
  view: StudioView;
  selected: OverlayInstance;
  onSelect: (id: string) => void;
  actions: ReactNode;
}) {
  const studio = useStudio(),
    model = useCanvas(view);
  const viewport = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Pair>([1, 1]),
    [zoom, setZoom] = useState(0),
    [guides, setGuides] = useState<readonly [number | null, number | null]>([
      null,
      null,
    ]);
  const canvas: Pair = view.canvas
    ? [view.canvas.width, view.canvas.height]
    : [1, 1];
  const percent = canvasZoomSteps[zoom];
  const scale =
    percent === null ? (fitCanvas(area, canvas) ?? 1) : percent / 100;
  const input = useCanvasInputs(model, viewport, scale, onSelect, setGuides);
  const cancel = input.cancel;
  const help = useId();
  const measured = useRef<Pair>([0, 0]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => {
      if (
        measured.current[0] === node.clientWidth &&
        measured.current[1] === node.clientHeight
      )
        return;
      measured.current = [node.clientWidth, node.clientHeight];
      cancel();
      setArea((previous) =>
        previous[0] === node.clientWidth && previous[1] === node.clientHeight
          ? previous
          : [Math.max(1, node.clientWidth), Math.max(1, node.clientHeight)],
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cancel]);
  const visible = view.instances.filter(
    (item) => item.visible || item.id === selected.id,
  );
  const rendered = visible.map((item) => ({
    item,
    box: model.box(item.id) ?? boxOf(item),
  }));
  const minX = Math.min(0, ...rendered.map(({ box }) => box.x)),
    minY = Math.min(0, ...rendered.map(({ box }) => box.y));
  const maxX = Math.max(
      canvas[0],
      ...rendered.map(({ box }) => box.x + box.size.width),
    ),
    maxY = Math.max(
      canvas[1],
      ...rendered.map(({ box }) => box.y + box.size.height),
    );
  const origin = previewOrigin(area, canvas, scale) ?? [0, 0];
  const shift: Pair = [origin[0] - minX * scale, origin[1] - minY * scale];
  const box = model.box(selected.id) ?? boxOf(selected);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    // Keep an out-of-canvas selection reachable without inventing its coordinates.
    const x = shift[0] + box.x * scale,
      y = shift[1] + box.y * scale;
    if (
      x < node.scrollLeft ||
      x + box.size.width * scale > node.scrollLeft + node.clientWidth
    )
      node.scrollLeft = Math.max(
        0,
        x + (box.size.width * scale - node.clientWidth) / 2,
      );
    if (
      y < node.scrollTop ||
      y + box.size.height * scale > node.scrollTop + node.clientHeight
    )
      node.scrollTop = Math.max(
        0,
        y + (box.size.height * scale - node.clientHeight) / 2,
      );
  }, [
    scale,
    shift[0],
    shift[1],
    box.x,
    box.y,
    box.size.width,
    box.size.height,
  ]);
  useLayoutEffect(() => {
    viewport.current
      ?.querySelector<HTMLButtonElement>(
        '[data-canvas-selected="true"] [data-canvas-move]',
      )
      ?.focus({ preventScroll: true });
  }, []);
  const notice = model.snapshot.notice;
  const changeZoom = (step: number) => {
    input.cancel();
    setZoom(Math.max(0, Math.min(canvasZoomSteps.length - 1, step)));
  };
  return (
    <section
      className="v-focus-stage v-studio-canvas-stage"
      aria-label={t.title}
      aria-busy={model.pending}
    >
      <header>
        <span>
          <Icon name="info" />
          {studioText.illustrationNote}
        </span>
        {actions}
      </header>
      {!view.canvas ? (
        <Callout
          title={t.unavailable}
          actions={
            <Button
              onClick={() => void studio.execute({ method: "studio.get" })}
            >
              {studioText.reload}
            </Button>
          }
        />
      ) : (
        <>
          {!model.enabled && (
            <p className="v-studio-canvas-readonly">{t.readOnly}</p>
          )}
          <div ref={viewport} className="v-studio-canvas-viewport">
            <div
              className="v-studio-canvas-space"
              style={{
                width: Math.max(area[0], (maxX - minX) * scale + origin[0]),
                height: Math.max(area[1], (maxY - minY) * scale + origin[1]),
              }}
            >
              <div
                className="v-studio-canvas-plane"
                style={{
                  left: shift[0],
                  top: shift[1],
                  width: canvas[0] * scale,
                  height: canvas[1] * scale,
                }}
              >
                <span>{`${canvas[0]} × ${canvas[1]}`}</span>
              </div>
              {rendered.map(({ item, box }) => {
                const active = item.id === selected.id,
                  name = widgetName(item, view);
                const outside =
                  box.x < 0 ||
                  box.y < 0 ||
                  box.x + box.size.width > canvas[0] ||
                  box.y + box.size.height > canvas[1];
                return (
                  <div
                    key={item.id}
                    className="v-studio-canvas-widget"
                    data-canvas-selected={active}
                    data-outside={outside}
                    data-hidden={!item.visible}
                    style={{
                      left: shift[0] + box.x * scale,
                      top: shift[1] + box.y * scale,
                      width: box.size.width * scale,
                      height: box.size.height * scale,
                    }}
                  >
                    <span
                      className="v-studio-canvas-image"
                      aria-hidden="true"
                      style={{
                        opacity:
                          (item.opacity / 100) * (item.visible ? 1 : 0.35),
                      }}
                    >
                      <WidgetThumb kind={item.kind} fit="fill" />
                    </span>
                    <button
                      type="button"
                      data-canvas-move
                      aria-label={t.move(name)}
                      aria-describedby={help}
                      aria-disabled={!model.enabled || item.locked}
                      tabIndex={active ? 0 : -1}
                      onFocus={() => onSelect(item.id)}
                      onPointerDown={(event) =>
                        input.pointerDown(event, item.id)
                      }
                      onPointerMove={input.pointerMove}
                      onPointerUp={input.pointerUp}
                      onPointerCancel={input.pointerLost}
                      onLostPointerCapture={input.pointerLost}
                      onKeyDown={(event) => input.keyDown(event, item.id)}
                      onBlur={input.blur}
                    />
                    {active && (
                      <>
                        <span
                          className="v-studio-canvas-caption"
                          style={{
                            top: Math.max(-22, -(shift[1] + box.y * scale)),
                          }}
                        >
                          {name}
                          {outside
                            ? ` · ${t.outside}`
                            : !item.visible
                              ? ` · ${t.hidden}`
                              : ""}
                        </span>
                        {handles.map((handle, i) => (
                          <button
                            key={t.handles[i]}
                            type="button"
                            className="v-studio-canvas-handle"
                            data-canvas-handle={i}
                            aria-label={t.resize(name, t.handles[i])}
                            aria-describedby={help}
                            aria-disabled={!model.enabled || item.locked}
                            tabIndex={0}
                            style={{
                              left: `${(handle[0] + 1) * 50}%`,
                              top: `${(handle[1] + 1) * 50}%`,
                              cursor: `${["nwse", "ns", "nesw", "ew", "nwse", "ns", "nesw", "ew"][i]}-resize`,
                            }}
                            onPointerDown={(event) =>
                              input.pointerDown(event, item.id, handle)
                            }
                            onPointerMove={input.pointerMove}
                            onPointerUp={input.pointerUp}
                            onPointerCancel={input.pointerLost}
                            onLostPointerCapture={input.pointerLost}
                            onKeyDown={(event) =>
                              input.keyDown(event, item.id, handle)
                            }
                            onBlur={input.blur}
                          />
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
              {guides[0] !== null && (
                <span
                  className="v-studio-canvas-guide"
                  data-axis="x"
                  style={{
                    left: shift[0] + guides[0] * scale,
                    top: shift[1],
                    height: canvas[1] * scale,
                  }}
                />
              )}
              {guides[1] !== null && (
                <span
                  className="v-studio-canvas-guide"
                  data-axis="y"
                  style={{
                    top: shift[1] + guides[1] * scale,
                    left: shift[0],
                    width: canvas[0] * scale,
                  }}
                />
              )}
            </div>
          </div>
          <footer>
            <output className="v-studio-canvas-position" aria-live="off">
              {t.position(box.x, box.y, box.size.width, box.size.height)}
              {selected.canvasPlacement === "outside" ? ` · ${t.outside}` : ""}
            </output>
            <div className="v-studio-canvas-zoom">
              <IconButton
                label={t.zoomLess}
                variant="ghost"
                disabled={zoom === 0}
                onClick={() => changeZoom(zoom - 1)}
              >
                {"−"}
              </IconButton>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t.fit}
                onClick={() => changeZoom(0)}
              >
                {percent === null ? "↔ " : ""}
                {`${Math.round(scale * 100)} %`}
              </Button>
              <IconButton
                label={t.zoomMore}
                variant="ghost"
                disabled={zoom === canvasZoomSteps.length - 1}
                onClick={() => changeZoom(zoom + 1)}
              >
                {"+"}
              </IconButton>
            </div>
            <CanvasTools
              box={box}
              canvas={canvas}
              enabled={
                model.enabled &&
                !selected.locked &&
                (!studio.pending || model.pending)
              }
              write={(change, target) =>
                model.dispatch({
                  type: "write",
                  id: selected.id,
                  change,
                  target,
                })
              }
            />
          </footer>
        </>
      )}
      <p id={help} className="v-studio-canvas-help">
        {t.help}
      </p>
      <div className="v-studio-canvas-feedback">
        <p role="alert" className="v-studio-canvas-status">
          {notice ? (notice === "failed" ? t.failed : t.changed) : ""}
        </p>
        <p role="status" className="v-studio-canvas-status">
          {!notice && model.snapshot.saved ? t.saved : ""}
        </p>
      </div>
    </section>
  );
}
