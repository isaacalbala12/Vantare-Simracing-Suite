import { memo, useMemo } from "react";
import { MiniStage, type WidgetDoc } from "../../ui/orbit";
import { buildAuthoringV2ScenarioRuntime } from "../../overlay/authoring/fixtures/authoring-v2-scenario-fixture";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../overlay/core/profile-document";
import { WidgetVisualHost } from "../../overlay/core/WidgetVisualHost";
import { WidgetVisualViewport } from "../../overlay/core/WidgetVisualViewport";
import { resolveProfilePreviewDocument } from "../overlays/profile-preview-document";
import type { ProfileEntry } from "../state/overlay-workbench";

const MemoWidgetVisualHost = memo(WidgetVisualHost);

/** Mismo escenario que `ProfilePreview`: las cuatro superficies que pintan
 *  widgets deben coincidir, así que el mini-lienzo no inventa telemetría.
 *  Factory por instancia: cada montaje clona su runtime V2 canónico. */
function usePreviewV2Runtime() {
  return useMemo(
    () =>
      buildAuthoringV2ScenarioRuntime({
        session: "race",
        location: "track",
        state: "ready",
        widget: "standings",
        system: "vantare-crystal",
        variant: "default",
      }),
    [],
  );
}

const SYSTEM_BY_ID: Record<string, "crystal" | "original" | "endurance"> = {
  "vantare-crystal": "crystal",
  "vantare-original": "original",
  "vantare-endurance": "endurance",
};

function widgetDocsOf(document: ProfileDocumentV3 | null): WidgetDoc[] {
  const widgets = document?.layouts.general?.widgets ?? [];
  return widgets.map((widget) => ({
    id: widget.id,
    name: widget.name ?? widget.type,
    system: widget.visual.systemId,
    design: widget.visual.systemId,
    state: widget.behavior.enabled === false ? "oculto" : "activo",
    x: widget.layout.x,
    y: widget.layout.y,
    w: widget.layout.w,
    h: widget.layout.h,
    hidden: widget.behavior.enabled === false,
  }));
}

export interface HomeMiniStageProps {
  profile: ProfileEntry | null;
}

/**
 * Mini-lienzo de la focal de Inicio: el `MiniStage` del kit posiciona y escala,
 * y el render de cada widget lo pone el sistema V3 real (`WidgetVisualHost` en
 * modo `harness`), no una caja de relleno.
 */
export function HomeMiniStage({ profile }: HomeMiniStageProps) {
  const document = useMemo(
    () => resolveProfilePreviewDocument(profile?.profile ?? null, profile?.previewDocument ?? null),
    [profile],
  );

  const widgets = useMemo(() => widgetDocsOf(document), [document]);
  const instances = useMemo(() => {
    const map = new Map<string, WidgetInstanceV3>();
    for (const widget of document?.layouts.general?.widgets ?? []) map.set(widget.id, widget);
    return map;
  }, [document]);

  const system = SYSTEM_BY_ID[widgets[0]?.system ?? ""] ?? "crystal";
  const previewRuntime = usePreviewV2Runtime();

  return (
    <MiniStage
      className="orbit-home__stage"
      renderWidget={(doc) => {
        const widget = instances.get(doc.id);
        if (!widget) return null;
        return (
          <WidgetVisualViewport
            layout={widget.layout}
            testId={`orbit-home-widget-${widget.id}`}
            widgetType={widget.type}
          >
            <MemoWidgetVisualHost renderMode="harness" runtime={previewRuntime} widget={widget} />
          </WidgetVisualViewport>
        );
      }}
      system={system}
      widgets={widgets}
    />
  );
}
