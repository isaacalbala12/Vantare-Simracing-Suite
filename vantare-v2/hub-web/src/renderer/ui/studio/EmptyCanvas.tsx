import { studioText } from "../../i18n/studio";
import { canvasText as t } from "../../i18n/studio-canvas";
import { Button } from "../Button";
import type { ReturnTypeOfStudioFocus } from "./StudioFocus";

export function EmptyCanvas({ model }: { model: ReturnTypeOfStudioFocus }) {
  const view = model.state.view;
  const unavailable = !view?.canvas || view.state !== "ready";
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
            {unavailable
              ? view?.state === "protected"
                ? studioText.protected
                : t.unavailable
              : t.emptyTitle}
          </h2>
          {!unavailable && <p>{model.blocked ? t.readOnly : t.emptyHelp}</p>}
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
        <span className="v-studio-canvas-position">{"—"}</span>
        <span className="v-canvas-grow" />
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
