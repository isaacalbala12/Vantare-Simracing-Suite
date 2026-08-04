import { useLayoutEffect, useState } from "react";
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
import { clearInputTelemetryHistory } from "../widget-types/input-telemetry/input-telemetry-accumulator";
import {
  parseOverlayWorkshopQuery,
  serializeOverlayWorkshopQuery,
  DEFAULT_OVERLAY_WORKSHOP_QUERY,
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
    session: query.session,
    location: query.location,
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

type PreparedFixture = {
  key: string;
  widget: WidgetInstanceV3;
  snapshot: ReturnType<typeof buildAuthoringFixtureTelemetry>;
};

function prepareFixture(query: OverlayWorkshopQuery): PreparedFixture {
  const crystalDesign = query.designId ? getCrystalHarnessDesign(query.designId) : undefined;
  const widget = createScenarioWidget(query);
  const snapshot = buildAuthoringFixtureTelemetry({
    session: query.session,
    location: query.location,
    state: query.state,
    widget: query.widget,
    system: query.system,
    surface: query.surface,
    variant: query.variant,
    ...(crystalDesign ? { designId: crystalDesign.designId } : {}),
  });
  return { key: serializeOverlayWorkshopQuery(query), widget, snapshot };
}

const PRESET_DIMENSIONS = { "720p": [1280, 720], "1080p": [1920, 1080], "1440p": [2560, 1440] } as const;

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

function DimensionField(props: { label: string; value: string; onChange(value: string): void }): React.ReactElement {
  const max = props.label === "Width" ? 3840 : 2160;
  return <label className="overlay-workshop-control"><span>{props.label}</span><input type="number" min="64" max={max} step="1" value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function compatibleSystems(widget: WidgetType): readonly DesignSystemId[] {
  return widget === "engineer-radio" ? ["vantare-crystal"] : SYSTEMS;
}

function defaultSystem(widget: WidgetType): DesignSystemId {
  return compatibleSystems(widget)[0]!;
}

function WorkshopSurface({ prepared, surface, query, comparison = false }: { prepared: PreparedFixture; surface: OverlayWorkshopQuery["surface"]; query: OverlayWorkshopQuery; comparison?: boolean }): React.ReactElement {
  const width = query.width ?? prepared.widget.layout.w;
  const height = query.height ?? prepared.widget.layout.h;
  return <div className="overlay-workshop-surface" data-overlay-workshop-surface={surface} data-overlay-workshop-comparison={comparison || undefined}>
    {surface !== "obs" && <span className="overlay-workshop-surface-label">{surface}</span>}
    <div className="overlay-workshop-widget-root" data-overlay-workshop-widget-root style={{ width, height, transform: `scale(${query.scale})`, transformOrigin: "center" }}>
      <WidgetVisualViewport widgetType={prepared.widget.type} layout={{ ...prepared.widget.layout, w: width, h: height }} testId="overlay-workshop-viewport">
        <WidgetVisualHost widget={{ ...prepared.widget, layout: { ...prepared.widget.layout, w: width, h: height } }} snapshot={prepared.snapshot} renderMode={surface}
          runtime={prepared.widget.type === "engineer-radio" ? { engineerPresentation: query.state === "ready" ? buildEngineerPresentationFixture() : null } : undefined} />
      </WidgetVisualViewport>
    </div>
  </div>;
}

function OverlayWorkshopPage({ initialQuery }: { initialQuery: OverlayWorkshopQuery }): React.ReactElement {
  const [parsed, setQuery] = useState<OverlayWorkshopQuery>(initialQuery);
  const [prepared, setPrepared] = useState<PreparedFixture | null>(null);
  const [dimensionDraft, setDimensionDraft] = useState({
    width: initialQuery.width?.toString() ?? "",
    height: initialQuery.height?.toString() ?? "",
  });
  const [scaleDraft, setScaleDraft] = useState(String(initialQuery.scale));
  const update = (next: OverlayWorkshopQuery) => {
    setSearch(next);
    setQuery(next);
  };

  const designs = listOfficialDesigns(parsed.widget).filter((design) => design.systemId === parsed.system);
  const fixtureKey = serializeOverlayWorkshopQuery(parsed);

  useLayoutEffect(() => {
    const next = prepareFixture(parsed);
    resetAndSeedAuthoringInputTelemetry(next.widget, next.snapshot);
    let active = true;
    queueMicrotask(() => {
      if (active) setPrepared(next);
    });
    return () => {
      active = false;
      clearInputTelemetryHistory(next.widget.id);
    };
  }, [parsed]);

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
  const chooseSession = (value: string) => update({ ...parsed, session: value as OverlayWorkshopQuery["session"] });
  const chooseLocation = (value: string) => update({ ...parsed, location: value as OverlayWorkshopQuery["location"] });
  const chooseBackground = (value: string) => update({ ...parsed, background: value as OverlayWorkshopQuery["background"] });
  const chooseScale = (value: string) => {
    setScaleDraft(value);
    const scale = Number(value);
    if (value !== "" && Number.isFinite(scale) && scale >= 0.25 && scale <= 2) update({ ...parsed, scale });
  };
  const choosePreset = (value: string) => update({ ...parsed, preset: value as OverlayWorkshopQuery["preset"] });
  const chooseCompare = (value: string) => update({ ...parsed, ...(value ? { compare: value as OverlayWorkshopQuery["surface"] } : { compare: undefined }) });
  const reset = () => {
    setDimensionDraft({ width: "", height: "" });
    setScaleDraft(String(DEFAULT_OVERLAY_WORKSHOP_QUERY.scale));
    update({ ...DEFAULT_OVERLAY_WORKSHOP_QUERY });
  };
  const applyPreset = () => {
    const [width, height] = PRESET_DIMENSIONS[parsed.preset];
    setDimensionDraft({ width: String(width), height: String(height) });
    update({ ...parsed, width, height });
  };
  const chooseDimension = (field: "width" | "height", value: string) => {
    const next = { ...dimensionDraft, [field]: value };
    setDimensionDraft(next);
    const width = Number(next.width);
    const height = Number(next.height);
    const widthValid = next.width !== "" && Number.isInteger(width) && width >= 64 && width <= 3840;
    const heightValid = next.height !== "" && Number.isInteger(height) && height >= 64 && height <= 2160;
    if (widthValid && heightValid) update({ ...parsed, width, height });
  };

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
        <SelectField label="Session" value={parsed.session} onChange={chooseSession}>
          {(["practice", "qualifying", "race"] as const).map((session) => <option key={session} value={session}>{session}</option>)}
        </SelectField>
        <SelectField label="Location" value={parsed.location} onChange={chooseLocation}>
          {(["track", "pits"] as const).map((location) => <option key={location} value={location}>{location}</option>)}
        </SelectField>
        <SelectField label="Surface" value={parsed.surface} onChange={chooseSurface}>
          {SURFACES.map((surface) => <option key={surface} value={surface}>{surface}</option>)}
        </SelectField>
        <SelectField label="Variant" value={parsed.variant} onChange={chooseVariant}>
          {VARIANTS.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
        </SelectField>
        <SelectField label="Stage background" value={parsed.background} onChange={chooseBackground}>
          {(["transparent", "grid", "solid", "context"] as const).map((background) => <option key={background} value={background}>{background}</option>)}
        </SelectField>
        <label className="overlay-workshop-control"><span>Scale</span><input type="number" min="0.25" max="2" step="0.05" value={scaleDraft} onChange={(event) => chooseScale(event.target.value)} /></label>
        <SelectField label="Preset" value={parsed.preset} onChange={choosePreset}>
          {(["720p", "1080p", "1440p"] as const).map((preset) => <option key={preset} value={preset}>{preset}</option>)}
        </SelectField>
        <button type="button" onClick={applyPreset}>Apply declared dimensions</button>
        <DimensionField label="Width" value={dimensionDraft.width} onChange={(value) => chooseDimension("width", value)} />
        <DimensionField label="Height" value={dimensionDraft.height} onChange={(value) => chooseDimension("height", value)} />
        <SelectField label="Compare" value={parsed.compare ?? ""} onChange={chooseCompare}>
          <option value="">Off</option>{SURFACES.filter((surface) => surface !== parsed.surface).map((surface) => <option key={surface} value={surface}>{surface}</option>)}
        </SelectField>
        <button type="button" onClick={reset}>Reset controls</button>
      </section>
      <section className={`overlay-workshop-stage overlay-workshop-stage--${parsed.background}`} data-overlay-workshop-stage>
        {prepared?.key === fixtureKey && (
          <><WorkshopSurface prepared={prepared} surface={parsed.surface} query={parsed} />
          {parsed.compare && <WorkshopSurface prepared={prepared} surface={parsed.compare} query={parsed} comparison />}</>
        )}
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
