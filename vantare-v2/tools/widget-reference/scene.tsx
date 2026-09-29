// Solo montaje: ViewModels, diseños, datos y renderizadores pertenecen al producto.
import { createRoot } from "react-dom/client";
import "../../frontend/src/index.css";
import "../../frontend/src/overlay/design-systems/vantare-functional/tokens.css";
import { I18nProvider } from "../../frontend/src/i18n/I18nProvider";
import { WidgetVisualHost } from "../../frontend/src/overlay/core/WidgetVisualHost";
import { WidgetVisualViewport } from "../../frontend/src/overlay/core/WidgetVisualViewport";
import { widgetTypeRegistry } from "../../frontend/src/overlay/core/widget-registry";
import { ALL_WIDGET_TYPES, type WidgetType } from "../../frontend/src/overlay/core/profile-document";
import { applyWidgetDesign } from "../../frontend/src/overlay/core/widget-design";
import { listOfficialDesigns } from "../../frontend/src/overlay/design-systems/official-designs";
import { vantareFunctionalManifest } from "../../frontend/src/overlay/design-systems/vantare-functional/manifest";
import { buildWorkshopFrameV2 } from "../../frontend/src/overlay/authoring/fixtures/authoring-v2-workshop-frame";
import { buildEngineerPresentationFixture } from "../../frontend/src/engineer/engineer-presentation-fixtures";
import { resolveStandingsMinimumSize } from "../../frontend/src/overlay/widget-types/standings/standings-frame-layout";

const catalog = ALL_WIDGET_TYPES.map((type) => {
  const design = listOfficialDesigns(type).find(d => d.systemId === "vantare-functional" && d.isDefault);
  const registered = vantareFunctionalManifest.widgets.some(w => w.widgetType === type);
  return { type, designId: design?.id, blocked: !registered ? "Sin renderer Eficiencia en manifest.ts" : !design ? "Sin diseño oficial Eficiencia por defecto" : undefined };
});
const type = new URLSearchParams(location.search).get("widget") as WidgetType | null;
const entry = catalog.find(item => item.type === type);
const diagnostics: unknown[] = [];
let metadata: Record<string, unknown> = { catalog, diagnostics };

if (entry && !entry.blocked && type && entry.designId) {
  const design = listOfficialDesigns(type).find(d => d.id === entry.designId)!;
  let widget = applyWidgetDesign(widgetTypeRegistry.get(type).createDefault(`reference-${type}`), design, "1970-01-01T00:00:00.000Z");
  const runtime = buildWorkshopFrameV2({ widget: type, system: "vantare-functional", variant: "default", session: "race", location: "track", state: "ready" });
  if (type === "engineer-radio") runtime.engineerPresentation = buildEngineerPresentationFixture("es", "warning");
  if (type === "standings") {
    const minimum = resolveStandingsMinimumSize(widget, true, 30, { frame: runtime.overlayV2Frame!, source: runtime.overlayV2Source! });
    if (!minimum?.height) throw new Error("Standings no tiene dimensiones intrínsecas");
    widget = { ...widget, layout: { ...widget.layout, w: minimum.width, h: minimum.height } };
  }
  widget = { ...widget, layout: { ...widget.layout, x: 0, y: 0 } };
  metadata = { ...metadata, widget, runtime, scene: "Workshop default / race / track / ready", renderMode: "harness", brandVisible: true };
  createRoot(document.getElementById("root")!).render(
    <I18nProvider><div id="reference-widget" style={{ width: widget.layout.w, height: widget.layout.h }}>
      <WidgetVisualViewport widgetType={type} visual={widget.visual} layout={widget.layout} testId="reference-viewport">
        <WidgetVisualHost widget={widget} runtime={runtime} renderMode="harness" brandVisible onDiagnostic={d => diagnostics.push(d)} />
      </WidgetVisualViewport>
    </div></I18nProvider>,
  );
}
Object.assign(window, { reference: metadata });
