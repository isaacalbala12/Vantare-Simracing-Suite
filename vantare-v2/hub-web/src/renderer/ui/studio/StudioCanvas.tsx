import { canvasText as t } from "../../i18n/studio-canvas.es";
import { useCanvas } from "../../screens/studio/use-canvas";
import { Button } from "../Button";
import { Callout } from "../Data";
import { Select } from "../Forms";
import { CanvasFields } from "./CanvasFields";
import { CanvasViewport } from "./CanvasViewport";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";
import { StudioFeedback } from "./StudioStates";
import { StudioSteps } from "./StudioSteps";
import { WidgetThumb, widgetName } from "./Widgets";
import "./canvas.css";
export function StudioCanvas({
  model,
  onBack,
  now,
}: {
  model: ReturnTypeOfStudioFocus;
  onBack: () => void;
  now?: () => number;
}) {
  const canvasModel = useCanvas(model, now);
  const {
    state,
    view,
    selected,
    writer,
    viewport,
    widthField,
    canvas,
    allowed,
    editable,
    zoom,
    scale,
    selectedRect,
    cancel,
    changeZoom,
    presets,
    help,
  } = canvasModel;
  return (
    <section className="v-canvas-mode" aria-label={t.title}>
      <div className="v-canvas-left">
        <header className="v-canvas-heading">
          <Button onClick={onBack}>{t.back}</Button>
          <span>{t.illustration}</span>
          <span className="v-canvas-status" role="status">
            {writer.inflight ? t.saving : writer.notice ? t[writer.notice] : ""}
          </span>
        </header>
        <StudioFeedback model={model} />
        {!allowed && <Callout title={t.unavailable} />}
        <CanvasViewport model={canvasModel} />
        <div className="v-canvas-toolbar">
          <Select
            label={t.resolution}
            value={
              canvas?.source === "monitor"
                ? "monitor"
                : `${canvas?.width}x${canvas?.height}`
            }
            disabled={!allowed}
            pending={state.pending}
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
              if (state.pending) return;
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
