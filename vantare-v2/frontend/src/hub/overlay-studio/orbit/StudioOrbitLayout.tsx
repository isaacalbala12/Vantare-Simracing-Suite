import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/I18nProvider";
import { resolveLayoutViewport } from "../../../overlay/core/layout-viewport";
import type { WidgetDiagnosticCollector } from "../../../overlay/core/widget-diagnostics";
import type { StudioProfileEntry } from "../components/StudioHeader";
import { useStudioDocument, useStudioPreview } from "../state/studio-store";
import { useStudioTelemetryLiveAvailable } from "../canvas/StudioTelemetryProvider";
import { useOrbitSimStatus } from "../../orbit/sim-status-context";
import { StudioOrbitInspector } from "./StudioOrbitInspector";
import { StudioOrbitStage } from "./StudioOrbitStage";
import { StudioOrbitToolbar } from "./StudioOrbitToolbar";
import { StudioTopbarControls } from "./StudioTopbarControls";
import { StudioWidgetList } from "./StudioWidgetList";
import {
  fill,
  readRightDockClosed,
  STUDIO_AUTO_FOLD_INSPECTOR_WIDTH,
  writeRightDockClosed,
} from "./studio-orbit-model";
import {
  STUDIO_CONTEXT_SLOT_ID,
  STUDIO_TOPBAR_SLOT_ID,
  useOrbitSlot,
} from "./studio-orbit-slots";
import "../../../styles/orbit-studio.css";

export type StudioOrbitLayoutProps = {
  profiles: StudioProfileEntry[];
  activeFile: string;
  onRequestProfileChange(file: string): void;
  onOpenBrowserView?(): void;
  diagnostics?: WidgetDiagnosticCollector;
};

/**
 * Disposicion Orbit del Studio (`15-briefings/04-studio.md`).
 *
 * Es solo presentacion: el documento, el historial, los permisos y el guardado
 * siguen siendo los del Studio V3. Lo unico que cambia es donde se pinta cada
 * pieza —lista en la columna de la shell, controles en la topbar, toolbar/
 * lienzo/statusbar en el workspace e inspector plegable a la derecha—.
 */
export function StudioOrbitLayout(props: StudioOrbitLayoutProps): React.ReactElement {
  const { profiles, activeFile, onRequestProfileChange, onOpenBrowserView, diagnostics } = props;
  const { t } = useI18n();
  const { document: profileDocument, activeLayout, selectedWidgetId } = useStudioDocument();
  const { preview, setPreview } = useStudioPreview();
  // El sim tiene una sola fuente: la de la shell, que es la que pinta el Pill
  // LMU al pie de la columna. Solo cuando el Studio se monta fuera de la shell
  // Orbit (Studio V3 clasico, tests aislados) se cae al `liveAvailable` del
  // proveedor de telemetria.
  const simStatus = useOrbitSimStatus();
  const providerLiveAvailable = useStudioTelemetryLiveAvailable();
  const liveAvailable = simStatus === null ? providerLiveAvailable : simStatus === "connected";
  const contextSlot = useOrbitSlot(STUDIO_CONTEXT_SLOT_ID);
  const topbarSlot = useOrbitSlot(STUDIO_TOPBAR_SLOT_ID);
  const [inspectorWanted, setInspectorWanted] = useState(() => !readRightDockClosed());
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // Ventana estrecha: el inspector se pliega solo para que la toolbar quepa en
  // la columna del lienzo (D-R4-4). Se lee el viewport **real**, igual que el
  // auto-plegado de la columna contextual de la shell: bajo `zoom` las media
  // queries y el JS deben ver lo mismo.
  const [tooNarrow, setTooNarrow] = useState(
    () =>
      typeof window !== "undefined" && window.innerWidth < STUDIO_AUTO_FOLD_INSPECTOR_WIDTH,
  );
  useEffect(() => {
    const onResize = () =>
      setTooNarrow(window.innerWidth < STUDIO_AUTO_FOLD_INSPECTOR_WIDTH);
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const inspectorOpen = inspectorWanted && !tooNarrow;

  const toggleInspector = useCallback(() => {
    setInspectorWanted((open) => {
      writeRightDockClosed(open);
      return !open;
    });
  }, []);

  // Sin fuente en vivo el selector no puede quedarse en "live": el propio
  // Studio ya obliga a mock cuando el sim no esta conectado.
  useEffect(() => {
    if (!liveAvailable && preview.source === "live") setPreview({ source: "mock" });
  }, [liveAvailable, preview.source, setPreview]);

  const layoutViewport = resolveLayoutViewport(profileDocument ?? {});
  const widgetCount = activeLayout?.widgets.length ?? 0;

  const status = useMemo(
    () => ({
      coords: pointer ? `${pointer.x} · ${pointer.y}` : "",
      canvas: fill(t("studio.status.canvas"), {
        w: layoutViewport.width,
        h: layoutViewport.height,
      }),
      selection: `${fill(t("studio.status.widgets"), { n: widgetCount })} · ${fill(
        t("studio.status.selected"),
        { n: selectedWidgetId ? 1 : 0 },
      )}`,
    }),
    [layoutViewport.height, layoutViewport.width, pointer, selectedWidgetId, t, widgetCount],
  );

  return (
    <div
      className="orbit-studio"
      data-right-dock={inspectorOpen ? "open" : "closed"}
      data-testid="orbit-studio"
    >
      <div className="orbit-studio__canvas">
        <StudioOrbitToolbar
          inspectorLocked={tooNarrow}
          inspectorOpen={inspectorOpen}
          liveAvailable={liveAvailable}
          onOpenBrowserView={onOpenBrowserView}
          onPreviewChange={setPreview}
          onToggleInspector={toggleInspector}
          preview={preview}
        />
        <StudioOrbitStage diagnostics={diagnostics} onPointer={setPointer} />
        <div className="orbit-studio__statusbar" data-testid="orbit-studio-statusbar">
          <span data-testid="orbit-studio-status-coords">{status.coords}</span>
          <span>{status.canvas}</span>
          {tooNarrow ? (
            <span
              className="orbit-studio__statusbar-note"
              data-testid="orbit-studio-status-inspector-locked"
            >
              {t("studio.status.inspectorLocked")}
            </span>
          ) : null}
          <span className="orbit-studio__statusbar-right" data-testid="orbit-studio-status-selection">
            {status.selection}
          </span>
        </div>
      </div>

      <aside
        className="orbit-studio__dock"
        data-testid="orbit-studio-dock"
        hidden={!inspectorOpen}
        id="orbit-studio-right-dock"
      >
        <StudioOrbitInspector />
      </aside>

      {contextSlot ? createPortal(<StudioWidgetList />, contextSlot) : null}
      {topbarSlot
        ? createPortal(
            <StudioTopbarControls
              activeFile={activeFile}
              onRequestProfileChange={onRequestProfileChange}
              profiles={profiles}
            />,
            topbarSlot,
          )
        : null}
    </div>
  );
}
