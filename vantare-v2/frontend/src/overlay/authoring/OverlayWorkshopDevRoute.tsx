import { useState } from "react";
import type { ReactNode } from "react";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { ALL_WIDGET_TYPES, type DesignSystemId, type WidgetInstanceV3, type WidgetType } from "../core/profile-document";
import { applyWidgetDesign } from "../core/widget-design";
import { buildEngineerPresentationFixture } from "../../engineer/engineer-presentation-fixtures";
import {
  buildAuthoringFixtureTelemetry,
  buildAuthoringFixtureWidget,
  resetAndSeedAuthoringInputTelemetry,
  type HarnessVariant,
} from "./fixtures/authoring-fixtures";
import { getCrystalHarnessDesign } from "./fixtures/authoring-fixtures";
import { listOfficialDesigns } from "../design-systems/official-designs";
import {
  parseOverlayWorkshopQuery,
  serializeOverlayWorkshopQuery,
  type OverlayWorkshopQuery,
} from "./overlay-workshop-query";
import "./overlay-workshop.css";

const SYSTEMS: readonly DesignSystemId[] = ["vantare-original", "vantare-crystal"];
const STATES = ["ready", "stale", "disconnected", "error"] as const;
const SURFACES = ["studio", "desktop", "obs", "harness"] as const;
const VARIANTS: readonly HarnessVariant[] = [
  "default",
  "relative-fill",
  "standings-stress60",
  "pedals-zero",
  "pedals-full",
];

function createScenarioWidget(query: OverlayWorkshopQuery): WidgetInstanceV3 {
  const crystalDesign = query.designId ? getCrystalHarnessDesign(query.designId) : undefined;
  let widget = buildAuthoringFixtureWidget({
    session: "race",
    location: "track",
    state: query.state,
    widget: query.widget,
    system: query.system,
    surface: query.surface,
    variant: query.variant,
    ...(crystalDesign ? { designId: crystalDesign.designId } : {}),
  });
  if (query.designId) {
    const design = listOfficialDesigns(query.widget).find((candidate) => candidate.id === query.designId);
    if (design) {
      widget = applyWidgetDesign(widget, design, "1970-01-01T00:00:00.000Z");
    }
  }
  if (crystalDesign) {
    widget.layout = {
      ...widget.layout,
      w: crystalDesign.width,
      h: crystalDesign.height,
    };
  }
  return widget;
}

function setSearch(query: OverlayWorkshopQuery): void {
  window.history.replaceState(null, "", `/workshop?${serializeOverlayWorkshopQuery(query)}`);
}

function SelectField(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  children: ReactNode;
}): React.ReactElement {
  return (
    <label className="overlay-workshop-control">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.children}
      </select>
    </label>
  );
}

function compatibleSystems(widget: WidgetType): readonly DesignSystemId[] {
  return widget === "engineer-radio" ? ["vantare-crystal"] : SYSTEMS;
}

function defaultSystem(widget: WidgetType): DesignSystemId {
  return compatibleSystems(widget)[0]!;
}

function OverlayWorkshopPage({ initialQuery }: { initialQuery: OverlayWorkshopQuery }): React.ReactElement {
  const [parsed, setQuery] = useState<OverlayWorkshopQuery>(initialQuery);
  const update = (next: OverlayWorkshopQuery) => {
    setSearch(next);
    setQuery(next);
  };

  const designs = listOfficialDesigns(parsed.widget).filter((design) => design.systemId === parsed.system);
  const widget = createScenarioWidget(parsed);
  const snapshot = buildAuthoringFixtureTelemetry({
    session: "race",
    location: "track",
    state: parsed.state,
    widget: parsed.widget,
    system: parsed.system,
    surface: parsed.surface,
    variant: parsed.variant,
    ...(parsed.designId && getCrystalHarnessDesign(parsed.designId) ? { designId: getCrystalHarnessDesign(parsed.designId)!.designId } : {}),
  });
  resetAndSeedAuthoringInputTelemetry(widget, snapshot);

  const chooseWidget = (value: string) => {
    const widgetType = value as WidgetType;
    const system = compatibleSystems(widgetType).includes(parsed.system) ? parsed.system : defaultSystem(widgetType);
    update({ ...parsed, widget: widgetType, system, designId: undefined, variant: "default" });
  };
  const chooseSystem = (value: string) => update({ ...parsed, system: value as DesignSystemId, designId: undefined });
  const chooseDesign = (value: string) => update({ ...parsed, ...(value ? { designId: value } : { designId: undefined }) });
  const chooseState = (value: string) => update({ ...parsed, state: value as OverlayWorkshopQuery["state"] });
  const chooseSurface = (value: string) => update({ ...parsed, surface: value as OverlayWorkshopQuery["surface"] });
  const chooseVariant = (value: string) => update({ ...parsed, variant: value as HarnessVariant });

  return (
    <main className="overlay-workshop" data-overlay-workshop-page>
      <header className="overlay-workshop-header">
        <p>DEV ONLY · Overlay Workshop</p>
        <span data-overlay-workshop-query>{serializeOverlayWorkshopQuery(parsed)}</span>
      </header>
      <section className="overlay-workshop-controls" aria-label="Workshop selection">
        <SelectField label="Widget" value={parsed.widget} onChange={chooseWidget}>
          {ALL_WIDGET_TYPES.map((widgetType) => <option key={widgetType} value={widgetType}>{widgetType}</option>)}
        </SelectField>
        <SelectField label="System" value={parsed.system} onChange={chooseSystem}>
          {compatibleSystems(parsed.widget).map((system) => <option key={system} value={system}>{system}</option>)}
        </SelectField>
        <SelectField label="Design" value={parsed.designId ?? ""} onChange={chooseDesign}>
          <option value="">Default renderer settings</option>
          {designs.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}
        </SelectField>
        <SelectField label="State" value={parsed.state} onChange={chooseState}>
          {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
        </SelectField>
        <SelectField label="Surface" value={parsed.surface} onChange={chooseSurface}>
          {SURFACES.map((surface) => <option key={surface} value={surface}>{surface}</option>)}
        </SelectField>
        <SelectField label="Variant" value={parsed.variant} onChange={chooseVariant}>
          {VARIANTS.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
        </SelectField>
      </section>
      <section className="overlay-workshop-stage" data-overlay-workshop-stage>
        <div
          className="overlay-workshop-widget-root"
          data-overlay-workshop-widget-root
          style={{ width: widget.layout.w, height: widget.layout.h }}
        >
          <WidgetVisualViewport widgetType={widget.type} layout={widget.layout} testId="overlay-workshop-viewport">
            <WidgetVisualHost
              widget={widget}
              snapshot={snapshot}
              renderMode={parsed.surface}
              runtime={widget.type === "engineer-radio" ? { engineerPresentation: parsed.state === "ready" ? buildEngineerPresentationFixture() : null } : undefined}
            />
          </WidgetVisualViewport>
        </div>
      </section>
    </main>
  );
}

export function OverlayWorkshopDevRoute({ search = window.location.search }: { search?: string }): React.ReactElement {
  const parsed = parseOverlayWorkshopQuery(search);
  if ("error" in parsed) {
    return (
      <main className="overlay-workshop-error" data-overlay-workshop-error role="alert">
        Workshop selection rejected: {parsed.error}
      </main>
    );
  }
  return <OverlayWorkshopPage initialQuery={parsed} />;
}
