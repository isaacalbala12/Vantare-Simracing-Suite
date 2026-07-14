import { useI18n } from "../../../i18n/I18nProvider";
import type { StudioPreviewState } from "../state/studio-store";
import { CANVAS_BACKGROUNDS } from "./canvas-backgrounds";

const ZOOM_STEPS: readonly StudioPreviewState["zoom"][] = ["fit", 50, 75, 100, 125, 150];

function nextZoom(current: StudioPreviewState["zoom"], direction: -1 | 1): StudioPreviewState["zoom"] {
  const index = ZOOM_STEPS.indexOf(current);
  const safeIndex = index === -1 ? ZOOM_STEPS.indexOf(100) : index;
  const nextIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, safeIndex + direction));
  return ZOOM_STEPS[nextIndex];
}

export type CanvasToolbarProps = {
  preview: StudioPreviewState;
  onPreviewChange(patch: Partial<StudioPreviewState>): void;
};

export function CanvasToolbar(props: CanvasToolbarProps): React.ReactElement {
  const { preview, onPreviewChange } = props;
  const { t } = useI18n();

  return (
    <div data-testid="studio-canvas-toolbar" className="osv3-canvas-toolbar">
      <div className="osv3-canvas-toolbar__heading">
        <span className="osv3-canvas-toolbar__eyebrow">{t("studio.v3.canvas.title")}</span>
        <span className="osv3-canvas-toolbar__dimensions">1920×1080</span>
      </div>
      <div className="osv3-canvas-toolbar__controls">
        <button
          type="button"
          data-testid="studio-zoom-fit"
          className="osv3-canvas-toolbar__button"
          onClick={() => onPreviewChange({ zoom: "fit" })}
        >
          {t("studio.v3.canvas.zoom.fit")}
        </button>
        <button
          type="button"
          data-testid="studio-zoom-minus"
          className="osv3-canvas-toolbar__button"
          aria-label={t("studio.v3.canvas.zoom.decrease")}
          onClick={() => onPreviewChange({ zoom: nextZoom(preview.zoom, -1) })}
        >
          -
        </button>
        <span data-testid="studio-zoom-label" className="osv3-canvas-toolbar__label">
          {preview.zoom === "fit" ? "Fit" : `${preview.zoom}%`}
        </span>
        <button
          type="button"
          data-testid="studio-zoom-plus"
          className="osv3-canvas-toolbar__button"
          aria-label={t("studio.v3.canvas.zoom.increase")}
          onClick={() => onPreviewChange({ zoom: nextZoom(preview.zoom, 1) })}
        >
          +
        </button>
        <select
          data-testid="studio-background-select"
          className="osv3-canvas-toolbar__select"
          value={preview.backgroundId}
          onChange={(event) => onPreviewChange({ backgroundId: event.target.value })}
        >
          {CANVAS_BACKGROUNDS.map((background) => (
            <option key={background.id} value={background.id}>
              {background.id}
            </option>
          ))}
        </select>
        <label className="osv3-canvas-toolbar__toggle">
          <input
            data-testid="studio-safe-area-toggle"
            type="checkbox"
            checked={preview.safeArea}
            onChange={(event) => onPreviewChange({ safeArea: event.target.checked })}
          />
          {t("studio.v3.canvas.safeArea")}
        </label>
      </div>
    </div>
  );
}
