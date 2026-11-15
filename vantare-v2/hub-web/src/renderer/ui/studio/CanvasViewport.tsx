import { canvasText as t } from "../../i18n/studio-canvas.es";
import { rectOf } from "../../screens/studio/canvas-writer";
import type { Pair } from "../../screens/studio/geometry";
import type { CanvasModel } from "../../screens/studio/use-canvas";
import { WidgetThumb, widgetName } from "./Widgets";

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
export function CanvasViewport({ model }: { model: CanvasModel }) {
  const {
    writer,
    view,
    selected,
    select,
    viewport,
    canvas,
    origin,
    area,
    scale,
    editable,
    help,
    widthField,
    cancel,
    keyDown,
    keyUp,
    pointerStart,
    pointerMove,
    pointerEnd,
    lostPointerCapture,
  } = model;
  return (
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
                    opacity: (item.opacity / 100) * (item.visible ? 1 : 0.35),
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
                    onFocus={() => select(item.id)}
                    onClick={() => select(item.id)}
                    onPointerDown={(e) => pointerStart(e, item)}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerEnd}
                    onPointerCancel={cancel}
                    onLostPointerCapture={lostPointerCapture}
                  >
                    <WidgetThumb kind={item.kind} fit="fill" />
                  </button>
                  {active && (
                    <>
                      <span
                        className="v-canvas-caption"
                        style={{ top: Math.max(-22, -box[1] * scale) }}
                      >
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
                            onPointerDown={(e) => pointerStart(e, item, handle)}
                            onPointerMove={pointerMove}
                            onPointerUp={pointerEnd}
                            onPointerCancel={cancel}
                            onLostPointerCapture={lostPointerCapture}
                            onClick={(e) => {
                              if (e.detail === 0) widthField.current?.focus();
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
  );
}
