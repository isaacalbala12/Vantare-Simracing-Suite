import { Tooltip } from "@base-ui/react/tooltip";
import {
  type ReactNode,
  useCallback,
  useEffect,
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
import { studioDropText } from "../../i18n/studio-drop";
import { useCanvas } from "../../screens/studio/canvas";
import { useCanvasInputs } from "../../screens/studio/canvas-inputs";
import { useCatalogInputs } from "../../screens/studio/catalog-inputs";
import {
  fitCanvas,
  type Pair,
  previewOrigin,
} from "../../screens/studio/geometry";
import { boxOf } from "../../screens/studio/gesture-state";
import { useStudio } from "../../screens/studio/state";
import { Button, IconButton } from "../Button";
import { Callout, Keycap } from "../Data";
import { WidgetThumb } from "../widgets/WidgetThumb";
import { CanvasCatalog } from "./CanvasCatalog";
import { CanvasResolution } from "./CanvasResolution";
import { CanvasTools } from "./CanvasTools";
import { CatalogGhost } from "./CatalogGhost";
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
  catalogOpen = false,
  onCatalogOpenChange = () => {},
}: {
  view: StudioView;
  selected?: OverlayInstance;
  onSelect: (id: string) => void;
  actions: ReactNode;
  catalogOpen?: boolean;
  onCatalogOpenChange?: (open: boolean) => void;
}) {
  const studio = useStudio(),
    model = useCanvas(view);
  const viewport = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
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
  const drop = useCatalogInputs(
    view,
    model.enabled && !model.pending && !model.snapshot.gesture,
    plane,
    viewport,
    () => onCatalogOpenChange(false),
  );
  const cancel = useCallback(() => {
    input.cancel();
    drop.cancel();
  }, [input.cancel, drop.cancel]);
  useEffect(() => {
    if (!catalogOpen) drop.cancel();
  }, [catalogOpen, drop.cancel]);
  const displayedGuides = drop.visual?.preview?.guides ?? guides;
  const help = useId();
  const noteId = useId();
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
  const visible = view.instances;
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
  const proposedShift: Pair = [
    origin[0] - minX * scale,
    origin[1] - minY * scale,
  ];
  const idleShift = useRef<Pair>(proposedShift);
  const gesturing = !!model.snapshot.gesture || !!drop.visual;
  // The coordinate frame belongs to the gesture, not to its moving draft.
  // Otherwise crossing zero moves the plane underneath a captured pointer.
  const shift = gesturing ? idleShift.current : proposedShift;
  useLayoutEffect(() => {
    if (!gesturing) idleShift.current = proposedShift;
  }, [gesturing, proposedShift[0], proposedShift[1]]);
  const box = selected
    ? (model.box(selected.id) ?? boxOf(selected))
    : undefined;
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || gesturing || !box) return;
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
  }, [gesturing, scale, shift[0], shift[1], box]);
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
      <div className="v-studio-canvas-feedback">
        <span className="v-canvas-accessible-help" role="status">
          {drop.message}
        </span>
        <p
          role="alert"
          className="v-studio-canvas-status"
          data-tone={notice === "failed" ? "err" : "warn"}
        >
          {notice
            ? notice === "uncertain"
              ? t.uncertain
              : notice === "failed"
                ? t.failed
                : t.changed
            : ""}
          {notice && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => model.dispatch({ type: "dismiss" })}
            >
              {t.dismiss}
            </Button>
          )}
        </p>
        <p role="status" className="v-studio-canvas-status">
          {!notice && model.snapshot.saved ? t.saved : ""}
        </p>
      </div>
      {!view.canvas ? (
        <>
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
          <footer>
            <div className="v-canvas-resolution-slot">
              <CanvasResolution
                canvas={view.canvas}
                monitor={view.monitor}
                enabled={false}
                onChange={() => {}}
              />
            </div>
            {actions}
          </footer>
        </>
      ) : (
        <>
          {!model.enabled && notice !== "uncertain" && (
            <div className="v-studio-canvas-readonly" role="status">
              {studio.needsRead ? (
                t.uncertain
              ) : model.live ? (
                <>
                  <strong>{t.liveReadOnly}</strong>
                  <small>{t.liveReadOnlyHelp}</small>
                </>
              ) : (
                t.readOnly
              )}
            </div>
          )}
          <div
            ref={viewport}
            className="v-studio-canvas-viewport"
            tabIndex={-1}
          >
            <div
              className="v-studio-canvas-space"
              style={{
                width: Math.max(area[0], (maxX - minX) * scale + origin[0]),
                height: Math.max(area[1], (maxY - minY) * scale + origin[1]),
              }}
            >
              <div
                ref={plane}
                className="v-studio-canvas-plane"
                data-canvas-width={canvas[0]}
                data-canvas-height={canvas[1]}
                style={{
                  left: shift[0],
                  top: shift[1],
                  width: canvas[0] * scale,
                  height: canvas[1] * scale,
                }}
              >
                <span>{`${canvas[0]} × ${canvas[1]} · ${view.canvas.source === "monitor" ? t.monitorSource : t.customSource}`}</span>
              </div>
              {rendered.map(({ item, box }) => {
                const active = item.id === selected?.id,
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
                    {
                      <>
                        <span
                          className="v-studio-canvas-caption"
                          style={{
                            top: active
                              ? 0
                              : Math.max(-22, -(shift[1] + box.y * scale)),
                          }}
                        >
                          {name}
                          {outside
                            ? ` · ${t.outside}`
                            : !item.visible
                              ? ` · ${t.hidden}`
                              : ""}
                        </span>
                        {active && (
                          <span
                            className="v-canvas-widget-dim"
                            aria-hidden="true"
                          >{`${Math.round(box.size.width)} × ${Math.round(box.size.height)}`}</span>
                        )}
                        {active &&
                          model.enabled &&
                          !item.locked &&
                          handles.map((handle, i) => (
                            <button
                              key={t.handles[i]}
                              type="button"
                              className="v-studio-canvas-handle"
                              data-canvas-handle={i}
                              aria-label={t.resize(name, t.handles[i])}
                              aria-describedby={help}
                              aria-disabled={!model.enabled || item.locked}
                              tabIndex={-1}
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
                    }
                  </div>
                );
              })}
              {drop.visual?.preview && (
                <div
                  className="v-canvas-drop-ghost"
                  aria-hidden="true"
                  style={{
                    left: shift[0] + drop.visual.preview.at[0] * scale,
                    top: shift[1] + drop.visual.preview.at[1] * scale,
                    width: drop.visual.preview.size[0] * scale,
                    height: drop.visual.preview.size[1] * scale,
                  }}
                >
                  <span>
                    <WidgetThumb kind={drop.visual.kind} fit="fill" />
                  </span>
                  <strong>
                    {
                      view.catalog.find(
                        (widget) => widget.kind === drop.visual?.kind,
                      )?.name
                    }{" "}
                    · {studioDropText.release}
                  </strong>
                </div>
              )}
              {displayedGuides[0] !== null && (
                <span
                  className="v-studio-canvas-guide"
                  data-axis="x"
                  style={{
                    left: shift[0] + displayedGuides[0] * scale,
                    top: shift[1],
                    height: canvas[1] * scale,
                  }}
                >
                  <em>
                    {displayedGuides[0] === canvas[0] / 2
                      ? t.center
                      : `x ${Math.round(displayedGuides[0])}`}
                  </em>
                </span>
              )}
              {displayedGuides[1] !== null && (
                <span
                  className="v-studio-canvas-guide"
                  data-axis="y"
                  style={{
                    top: shift[1] + displayedGuides[1] * scale,
                    left: shift[0],
                    width: canvas[0] * scale,
                  }}
                >
                  <em>
                    {displayedGuides[1] === canvas[1] / 2
                      ? t.center
                      : `y ${Math.round(displayedGuides[1])}`}
                  </em>
                </span>
              )}
              {model.snapshot.gesture && box && (
                <>
                  <div
                    className="v-canvas-origin-ghost"
                    style={{
                      left: shift[0] + model.snapshot.gesture.origin.x * scale,
                      top: shift[1] + model.snapshot.gesture.origin.y * scale,
                      width: model.snapshot.gesture.origin.size.width * scale,
                      height: model.snapshot.gesture.origin.size.height * scale,
                    }}
                  />
                  <span
                    className="v-canvas-readout"
                    style={{
                      left: shift[0] + box.x * scale,
                      top: shift[1] + (box.y + box.size.height) * scale + 10,
                    }}
                  >
                    {t.coordinates(box.x, box.y)}
                    {guides.some((v) => v !== null) ? ` · ${t.snap}` : ""}
                  </span>
                </>
              )}
            </div>
            {model.enabled && (
              <span id={help} className="v-canvas-accessible-help">
                {t.help}
              </span>
            )}
          </div>
          {view.instances.length === 0 && !catalogOpen && (
            <div className="v-canvas-empty-message">
              <h2>{t.emptyTitle}</h2>
              <p>{model.enabled ? t.emptyHelp : t.readOnly}</p>
              <Button
                variant="neutral"
                disabled={!model.enabled}
                onClick={() => onCatalogOpenChange(true)}
              >
                {studioText.add}
              </Button>
            </div>
          )}
          {catalogOpen && (
            <CanvasCatalog
              view={view}
              enabled={model.enabled}
              pending={
                studio.pending || model.pending || !!model.snapshot.gesture
              }
              input={drop}
              close={() => onCatalogOpenChange(false)}
            />
          )}
          {drop.visual && (
            <CatalogGhost
              visual={drop.visual}
              name={
                view.catalog.find((widget) => widget.kind === drop.visual?.kind)
                  ?.name ?? ""
              }
            />
          )}
          <footer role="toolbar" aria-label={t.tools}>
            {selected && box ? (
              <>
                <output
                  className="v-studio-canvas-position"
                  aria-live="off"
                  data-outside={selected.canvasPlacement === "outside"}
                >
                  {t.position(box.x, box.y, box.size.width, box.size.height)}
                  {selected.canvasPlacement === "outside"
                    ? ` · ${t.outside}`
                    : ""}
                </output>
                <CanvasTools
                  box={box}
                  canvas={canvas}
                  enabled={
                    model.enabled &&
                    !selected.locked &&
                    !studio.pending &&
                    !model.pending
                  }
                  write={(change, target) => {
                    if (model.current.current.pending) return;
                    model.dispatch({
                      type: "write",
                      id: selected.id,
                      change,
                      target,
                    });
                  }}
                />
              </>
            ) : (
              <span className="v-studio-canvas-position">{t.emptyTitle}</span>
            )}
            <div className="v-canvas-resolution-slot">
              <CanvasResolution
                canvas={view.canvas}
                monitor={view.monitor}
                enabled={model.enabled && !studio.pending && !model.pending}
                onChange={(resolution) => {
                  cancel();
                  void studio.execute({
                    method: "studio.canvas",
                    resolution,
                    baseRevision: view.revision,
                  });
                }}
              />
            </div>
            <Tooltip.Root>
              <Tooltip.Trigger
                render={<Button variant="ghost" size="sm" />}
                aria-label={t.note}
                aria-describedby={noteId}
              >
                <Icon name="info" />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner className="v-positioner" sideOffset={6}>
                  <Tooltip.Popup
                    className="v-tooltip v-canvas-info-tooltip"
                    role="tooltip"
                    id={noteId}
                  >
                    <p>{t.note}</p>
                    <div>
                      <Keycap>{t.keyArrows}</Keycap> {t.keyMove}
                    </div>
                    <div>
                      <Keycap>{t.keyAlt}</Keycap> {t.keySize}
                    </div>
                    <div>
                      <Keycap>{t.keyShift}</Keycap> {t.keyStep}
                    </div>
                    <div>
                      <Keycap>{t.keyEscape}</Keycap> {t.keyCancel}
                    </div>
                    <Tooltip.Arrow />
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <span className="v-canvas-grow" />
            <span
              className="v-canvas-save-state"
              role="status"
              data-error={!!notice}
            >
              {notice
                ? t.failedShort
                : !model.enabled
                  ? t.readonlyShort
                  : model.pending
                    ? t.saving
                    : model.snapshot.saved
                      ? t.savedShort
                      : ""}
            </span>
            <div className="v-studio-canvas-zoom">
              <IconButton
                label={t.zoomLess}
                variant="ghost"
                disabled={zoom === 0}
                onClick={() => changeZoom(zoom - 1)}
              >
                {"−"}
              </IconButton>
              <output>{`${Math.round(scale * 100)} %`}</output>
              <IconButton
                label={t.zoomMore}
                variant="ghost"
                disabled={zoom === canvasZoomSteps.length - 1}
                onClick={() => changeZoom(zoom + 1)}
              >
                {"+"}
              </IconButton>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t.fit}
                onClick={() => changeZoom(0)}
              >
                {t.fitShort}
              </Button>
            </div>
            {actions}
          </footer>
        </>
      )}
    </section>
  );
}
