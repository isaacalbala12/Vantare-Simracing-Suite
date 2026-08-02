import { useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from "react";
import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import { createWidgetDiagnosticCollector, type WidgetDiagnostic, type WidgetDiagnosticCollector } from "../core/widget-diagnostics";
import { RuntimeWidgetFrame } from "./RuntimeWidgetFrame";
import { resolveRuntimeLayout, selectRuntimeWidgets } from "./resolve-runtime-layout";
import { useRateLimitedTelemetry } from "./use-rate-limited-telemetry";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";

export const RUNTIME_SURFACE_VISIBILITY_HZ = 15;

export type RuntimeOverlaySurfaceProps = {
  document: ProfileDocumentV3;
  telemetry: TelemetryRateCoordinator;
  renderMode: "desktop" | "obs";
  layoutOrigin?: { x: number; y: number };
  onDiagnostic?: (diagnostic: WidgetDiagnostic) => void;
  diagnostics?: WidgetDiagnosticCollector;
  engineerPresentations?: EngineerPresentationStore;
};

const subscribeToNothing = () => () => undefined;
const noPresentation = () => null;

export function RuntimeOverlaySurface(props: RuntimeOverlaySurfaceProps): React.ReactElement {
  const { document, telemetry, renderMode, layoutOrigin, onDiagnostic, diagnostics: diagnosticsProp, engineerPresentations } = props;
  const diagnostics = useMemo(() => diagnosticsProp ?? createWidgetDiagnosticCollector(), [diagnosticsProp]);
  const snapshot = useRateLimitedTelemetry(telemetry, RUNTIME_SURFACE_VISIBILITY_HZ);
  const layout = resolveRuntimeLayout(document, snapshot);
  const widgets = selectRuntimeWidgets(layout, snapshot);
  const preservedDiagnosticSent = useRef(false);
  const engineerPresentation = useSyncExternalStore(
    engineerPresentations?.subscribe ?? subscribeToNothing,
    engineerPresentations?.getSnapshot ?? noPresentation,
    noPresentation,
  );

  useEffect(() => {
    const preserved = layout.preservedWidgets ?? [];
    if (preserved.length === 0 || preservedDiagnosticSent.current) {
      return;
    }
    preservedDiagnosticSent.current = true;
    const diagnostic = {
      code: "preserved-widgets-skipped",
      surface: renderMode,
      message: `Skipping ${preserved.length} preserved legacy widget(s) at runtime`,
      occurredAt: new Date(0).toISOString(),
    } satisfies WidgetDiagnostic;
    diagnostics.report(diagnostic);
    onDiagnostic?.(diagnostic);
  }, [diagnostics, layout.preservedWidgets, onDiagnostic, renderMode]);

  const surfaceStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background: "transparent",
  };

  return (
    <div data-testid="runtime-overlay-surface" data-render-mode={renderMode} style={surfaceStyle}>
      {widgets.map((widget) => (
        <RuntimeWidgetFrame
          key={widget.id}
          widget={widget}
          telemetry={telemetry}
          renderMode={renderMode}
          layoutOrigin={layoutOrigin}
          onDiagnostic={onDiagnostic}
          diagnostics={diagnostics}
          engineerPresentation={engineerPresentation}
        />
      ))}
    </div>
  );
}
