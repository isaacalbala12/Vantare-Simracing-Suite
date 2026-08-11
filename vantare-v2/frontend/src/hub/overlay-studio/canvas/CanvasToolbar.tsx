import { useState } from "react";
import {
  MAX_LAYOUT_VIEWPORT_DIMENSION,
  MIN_LAYOUT_VIEWPORT_DIMENSION,
  isValidLayoutViewportDimension,
  type LayoutViewport,
} from "../../../overlay/core/layout-viewport";
import { useI18n } from "../../../i18n/I18nProvider";
import type { StudioPreviewState } from "../state/studio-store";
import { CANVAS_BACKGROUNDS } from "./canvas-backgrounds";
import {
  findLayoutViewportPreset,
  getLayoutViewportPreset,
  LAYOUT_VIEWPORT_PRESETS,
} from "./preview-resolution";

const ZOOM_STEPS: readonly StudioPreviewState["zoom"][] = ["fit", 50, 75, 100, 125, 150];

function nextZoom(current: StudioPreviewState["zoom"], direction: -1 | 1): StudioPreviewState["zoom"] {
  const index = ZOOM_STEPS.indexOf(current);
  const safeIndex = index === -1 ? ZOOM_STEPS.indexOf(100) : index;
  const nextIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, safeIndex + direction));
  return ZOOM_STEPS[nextIndex];
}

function parseDimension(draft: string): number | null {
  if (draft.trim() === "") {
    return null;
  }
  const value = Number(draft);
  return isValidLayoutViewportDimension(value) ? value : null;
}

export type CanvasToolbarProps = {
  preview: StudioPreviewState;
  layoutViewport: LayoutViewport;
  onPreviewChange(patch: Partial<StudioPreviewState>): void;
  onLayoutViewportChange(layoutViewport: LayoutViewport): void;
};

function LayoutViewportControls(props: {
  layoutViewport: LayoutViewport;
  onChange(layoutViewport: LayoutViewport): void;
}): React.ReactElement {
  const { layoutViewport, onChange } = props;
  const { t } = useI18n();
  const [selectedPresetId, setSelectedPresetId] = useState(
    findLayoutViewportPreset(layoutViewport)?.id ?? "custom",
  );
  const [widthDraft, setWidthDraft] = useState(String(layoutViewport.width));
  const [heightDraft, setHeightDraft] = useState(String(layoutViewport.height));
  const width = parseDimension(widthDraft);
  const height = parseDimension(heightDraft);
  const draftViewport = width !== null && height !== null ? { width, height } : null;
  const draftChanged =
    draftViewport !== null &&
    (draftViewport.width !== layoutViewport.width || draftViewport.height !== layoutViewport.height);

  return (
    <>
      <label className="osv3-canvas-toolbar__field">
        <span>{t("studio.v3.layoutViewport.preset")}</span>
        <select
          data-testid="studio-resolution-select"
          className="osv3-canvas-toolbar__select"
          value={selectedPresetId}
          onChange={(event) => {
            const presetId = event.target.value;
            if (presetId === "custom") {
              setSelectedPresetId(presetId);
              return;
            }
            const preset = getLayoutViewportPreset(presetId);
            if (!preset) {
              return;
            }
            onChange({ width: preset.width, height: preset.height });
          }}
        >
          {LAYOUT_VIEWPORT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          <option value="custom">{t("studio.v3.layoutViewport.custom")}</option>
        </select>
      </label>
      <div className="osv3-canvas-toolbar__surface-inputs">
        <label className="osv3-canvas-toolbar__field">
          <span>{t("studio.v3.layoutViewport.width")}</span>
          <input
            type="number"
            inputMode="numeric"
            data-testid="studio-layout-width-input"
            className="osv3-canvas-toolbar__dimension-input"
            aria-label={t("studio.v3.layoutViewport.width")}
            aria-invalid={width === null}
            min={MIN_LAYOUT_VIEWPORT_DIMENSION}
            max={MAX_LAYOUT_VIEWPORT_DIMENSION}
            step={1}
            value={widthDraft}
            onChange={(event) => {
              setSelectedPresetId("custom");
              setWidthDraft(event.target.value);
            }}
          />
        </label>
        <label className="osv3-canvas-toolbar__field">
          <span>{t("studio.v3.layoutViewport.height")}</span>
          <input
            type="number"
            inputMode="numeric"
            data-testid="studio-layout-height-input"
            className="osv3-canvas-toolbar__dimension-input"
            aria-label={t("studio.v3.layoutViewport.height")}
            aria-invalid={height === null}
            min={MIN_LAYOUT_VIEWPORT_DIMENSION}
            max={MAX_LAYOUT_VIEWPORT_DIMENSION}
            step={1}
            value={heightDraft}
            onChange={(event) => {
              setSelectedPresetId("custom");
              setHeightDraft(event.target.value);
            }}
          />
        </label>
      </div>
      <button
        type="button"
        data-testid="studio-layout-viewport-apply"
        className="osv3-canvas-toolbar__button osv3-canvas-toolbar__apply"
        disabled={!draftViewport || !draftChanged}
        onClick={() => {
          if (draftViewport && draftChanged) {
            onChange(draftViewport);
          }
        }}
      >
        {t("studio.v3.layoutViewport.apply")}
      </button>
    </>
  );
}

export function CanvasToolbar(props: CanvasToolbarProps): React.ReactElement {
  const { preview, layoutViewport, onPreviewChange, onLayoutViewportChange } = props;
  const { t } = useI18n();
  const [optionsOpen, setOptionsOpen] = useState(false);

  return (
    <div data-testid="studio-canvas-toolbar" className="osv3-canvas-toolbar">
      <div className="osv3-canvas-toolbar__heading">
        <span className="osv3-canvas-toolbar__eyebrow">{t("studio.v3.canvas.title")}</span>
        <span
          data-testid="studio-canvas-dimensions"
          className="osv3-canvas-toolbar__dimensions"
        >
          {layoutViewport.width}×{layoutViewport.height}
        </span>
      </div>
      <div className="osv3-canvas-toolbar__controls">
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
          {preview.zoom === "fit" ? t("studio.v3.canvas.zoom.fitLabel") : `${preview.zoom}%`}
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
        <div className="osv3-canvas-toolbar__options">
          <button
            type="button"
            data-testid="studio-canvas-options-toggle"
            className="osv3-canvas-toolbar__button osv3-canvas-toolbar__options-toggle"
            aria-expanded={optionsOpen}
            aria-label={t("studio.v3.header.menu")}
            onClick={() => setOptionsOpen((open) => !open)}
          >
            •••
          </button>
          <div
            className={optionsOpen ? "osv3-canvas-toolbar__options-panel osv3-canvas-toolbar__options-panel--open" : "osv3-canvas-toolbar__options-panel"}
            aria-hidden={!optionsOpen}
          >
            <button
              type="button"
              data-testid="studio-zoom-fit"
              className="osv3-canvas-toolbar__button"
              onClick={() => onPreviewChange({ zoom: "fit" })}
            >
              {t("studio.v3.canvas.zoom.fit")}
            </button>
            <LayoutViewportControls
              key={`${layoutViewport.width}x${layoutViewport.height}`}
              layoutViewport={layoutViewport}
              onChange={onLayoutViewportChange}
            />
            <label className="osv3-canvas-toolbar__field">
              <span>{t("studio.v3.canvas.background")}</span>
              <select
                data-testid="studio-background-select"
                className="osv3-canvas-toolbar__select"
                value={preview.backgroundId}
                onChange={(event) => onPreviewChange({ backgroundId: event.target.value })}
              >
                {CANVAS_BACKGROUNDS.map((background) => (
                  <option key={background.id} value={background.id}>
                    {t(background.labelKey)}
                  </option>
                ))}
              </select>
            </label>
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
      </div>
    </div>
  );
}
