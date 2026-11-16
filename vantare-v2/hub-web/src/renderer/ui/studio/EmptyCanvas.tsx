import { studioText } from "../../i18n/studio";
import { canvasText as t } from "../../i18n/studio-canvas";
import { Button } from "../Button";
import { CanvasResolution } from "./CanvasResolution";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";

export function EmptyCanvas({ model }: { model: ReturnTypeOfStudioFocus }) {
  const view = model.state.view;
  const unavailable = !view?.canvas || view.state !== "ready";
  const noCanvas =
    view?.state === "monitorUnavailable" ||
    (view?.monitor === null &&
      (view.state === "protected" || view.state === "missing"));
  return (
    <section
      className="v-focus-stage v-studio-canvas-stage"
      aria-label={t.title}
    >
      <div className="v-studio-canvas-viewport v-canvas-empty">
        {view?.canvas && (
          <div
            className="v-canvas-empty-plane"
            style={{
              aspectRatio: `${view.canvas.width} / ${view.canvas.height}`,
            }}
          >
            <span>{`${view.canvas.width} × ${view.canvas.height} · ${view.canvas.source === "monitor" ? t.monitorSource : t.customSource}`}</span>
          </div>
        )}
        <div className="v-canvas-empty-message">
          <h2>
            {view?.state === "monitorUnavailable"
              ? t.monitorUnavailableTitle
              : noCanvas
                ? t.noCanvasTitle
                : unavailable
                  ? view?.state === "protected"
                    ? studioText.protected
                    : t.unavailable
                  : t.emptyTitle}
          </h2>
          {noCanvas ? (
            <p>
              {view?.state === "monitorUnavailable"
                ? t.monitorUnavailableHelp
                : t.noCanvasHelp}
            </p>
          ) : (
            !unavailable && <p>{model.blocked ? t.readOnly : t.emptyHelp}</p>
          )}
          <Button
            variant={unavailable ? "neutral" : "primary"}
            disabled={!unavailable && model.blocked}
            onClick={() => {
              if (unavailable)
                void model.state.execute({ method: "studio.get" });
              else model.setCatalogOpen(true);
            }}
          >
            {unavailable ? studioText.reload : studioText.add}
          </Button>
        </div>
      </div>
      <footer>
        <span className="v-canvas-grow" />
        {view && (
          <div className="v-canvas-resolution-slot">
            <CanvasResolution
              canvas={view.canvas}
              monitor={view.monitor}
              enabled={false}
              onChange={() => {}}
            />
          </div>
        )}
        <Button
          size="sm"
          variant="neutral"
          onClick={() => model.state.setCanvasMode(false)}
        >
          {t.done}
        </Button>
      </footer>
    </section>
  );
}
