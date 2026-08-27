import type { ReactNode } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import { IconButton, Seg } from "../../../ui/orbit";
import type { StudioPreviewState } from "../state/studio-store";
import { StudioWallpaperPicker } from "./StudioWallpaperPicker";
import {
  nextZoom,
  ORBIT_BACKGROUND_OPTIONS,
  type OrbitBackgroundId,
} from "./studio-orbit-model";

/**
 * Boton de icono sin entrada en el sprite Orbit. Reutiliza las clases del kit
 * (`orbit-icon-btn`) y su contrato de tooltip (`data-tip`, nunca `title`); solo
 * el trazo es local, porque el sprite no tiene estos tres glifos.
 */
function ToolButton(props: {
  label: string;
  onClick(): void;
  pressed?: boolean;
  testId: string;
  children: ReactNode;
}) {
  const { label, onClick, pressed, testId, children } = props;
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={["orbit-icon-btn", "orbit-icon-btn--39", pressed ? "is-on" : null]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
      data-tip={label}
      data-tip-side="top"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** Fondo al que vuelve el lienzo si se borra el propio que estaba puesto. */
const FALLBACK_BACKGROUND_ID = "gradient";

export type StudioOrbitToolbarProps = {
  preview: StudioPreviewState;
  liveAvailable: boolean;
  inspectorOpen: boolean;
  /**
   * El inspector esta plegado a la fuerza porque la ventana es estrecha
   * (D-R4-4): el conmutador no puede desplegarlo y lo dice.
   */
  inspectorLocked?: boolean;
  onPreviewChange(patch: Partial<StudioPreviewState>): void;
  onToggleInspector(): void;
  onOpenBrowserView?(): void;
};

/** Toolbar de 60 px del lienzo (`06 § Overlays Studio`). */
export function StudioOrbitToolbar(props: StudioOrbitToolbarProps): React.ReactElement {
  const {
    preview,
    liveAvailable,
    inspectorOpen,
    inspectorLocked = false,
    onPreviewChange,
    onToggleInspector,
    onOpenBrowserView,
  } = props;
  const { t } = useI18n();

  return (
    <div className="orbit-studio-toolbar" data-testid="orbit-studio-toolbar">
      <Seg<OrbitBackgroundId>
        label={t("studio.toolbar.background")}
        onChange={(value) => onPreviewChange({ backgroundId: value })}
        options={ORBIT_BACKGROUND_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        // Con un fondo propio puesto no hay opcion de fabrica encendida: el
        // grupo dice la verdad, y pulsar cualquiera de las tres vuelve a ella.
        value={(preview.backgroundId as OrbitBackgroundId) ?? "grid"}
      />

      <StudioWallpaperPicker
        backgroundId={preview.backgroundId}
        fallbackBackgroundId={FALLBACK_BACKGROUND_ID}
        onSelect={(backgroundId) => onPreviewChange({ backgroundId })}
      />

      <Seg<"mock" | "live">
        label={t("studio.toolbar.source")}
        onChange={(value) => onPreviewChange({ source: value })}
        options={[
          { value: "mock", label: t("studio.toolbar.source.mock") },
          {
            value: "live",
            label: t("studio.toolbar.source.live"),
            disabled: !liveAvailable,
            title: liveAvailable ? undefined : t("studio.toolbar.source.liveDisabled"),
          },
        ]}
        value={preview.source}
      />

      <ToolButton
        label={t("studio.toolbar.safeArea")}
        onClick={() => onPreviewChange({ safeArea: !preview.safeArea })}
        pressed={preview.safeArea}
        testId="orbit-studio-safe-area"
      >
        <svg
          aria-hidden="true"
          fill="none"
          focusable="false"
          height={16}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={1.4}
          viewBox="0 0 16 16"
          width={16}
        >
          <path d="M2.5 5V3.5a1 1 0 0 1 1-1H5M11 2.5h1.5a1 1 0 0 1 1 1V5M13.5 11v1.5a1 1 0 0 1-1 1H11M5 13.5H3.5a1 1 0 0 1-1-1V11" />
        </svg>
      </ToolButton>

      {onOpenBrowserView ? (
        <button
          aria-label={t("studio.toolbar.browserView")}
          className="orbit-btn orbit-btn--ghost orbit-btn--sm orbit-studio-toolbar__bv"
          data-testid="orbit-studio-browser-view"
          data-tip={t("studio.toolbar.browserViewTip")}
          data-tip-side="top"
          onClick={onOpenBrowserView}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            focusable="false"
            height={13}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={1.4}
            viewBox="0 0 14 14"
            width={13}
          >
            <rect height="9.6" rx="1.2" width="10.8" x="1.6" y="2.2" />
            <path d="M1.6 5h10.8" />
          </svg>
          <span className="orbit-btn__label orbit-studio-toolbar__bv-label">
            {t("studio.toolbar.browserView")}
          </span>
        </button>
      ) : null}

      <span aria-hidden="true" className="orbit-studio-toolbar__spacer" />

      <IconButton
        aria-expanded={inspectorOpen}
        className="orbit-studio-toolbar__dock"
        data-testid="orbit-studio-dock-toggle"
        disabled={inspectorLocked}
        icon="i-panel"
        label={
          inspectorLocked
            ? t("studio.toolbar.inspectorLocked")
            : inspectorOpen
              ? t("studio.toolbar.collapseInspector")
              : t("studio.toolbar.expandInspector")
        }
        on={inspectorOpen}
        onClick={onToggleInspector}
      />

      <div className="orbit-studio-toolbar__zoom">
        <ToolButton
          label={t("studio.toolbar.zoomOut")}
          onClick={() => onPreviewChange({ zoom: nextZoom(preview.zoom, -1) })}
          testId="orbit-studio-zoom-out"
        >
          <svg
            aria-hidden="true"
            fill="none"
            focusable="false"
            height={14}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={1.6}
            viewBox="0 0 14 14"
            width={14}
          >
            <path d="M3 7h8" />
          </svg>
        </ToolButton>
        <span className="orbit-studio-toolbar__zoom-label" data-testid="orbit-studio-zoom-label">
          {preview.zoom === "fit" ? t("studio.toolbar.zoomFit") : `${preview.zoom}%`}
        </span>
        <ToolButton
          label={t("studio.toolbar.zoomIn")}
          onClick={() => onPreviewChange({ zoom: nextZoom(preview.zoom, 1) })}
          testId="orbit-studio-zoom-in"
        >
          <svg
            aria-hidden="true"
            fill="none"
            focusable="false"
            height={14}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={1.6}
            viewBox="0 0 14 14"
            width={14}
          >
            <path d="M7 3v8M3 7h8" />
          </svg>
        </ToolButton>
      </div>
    </div>
  );
}
