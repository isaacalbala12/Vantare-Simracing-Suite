import { useMemo, useState } from "react";
import type { WidgetInstanceV3, WidgetType } from "../overlay/core/profile-document";
import type { TelemetrySnapshot } from "../overlay/core/telemetry-snapshot";
import { widgetTypeRegistry } from "../overlay/core/widget-registry";
import type {
  OverlayMappedField,
  OverlayProjectionAdaptation,
  OverlayProjectionMapping,
} from "../overlay/telemetry-shadow/overlay-projection-adapter";
import {
  compareOverlayShadow,
  type OverlayShadowEntry,
  type OverlayShadowReport,
  type OverlayShadowWidgetResult,
} from "../overlay/telemetry-shadow/overlay-shadow-comparator";

const SHADOW_HARNESS_SCENARIOS = [
  "equal",
  "partial",
  "stale",
  "disconnected",
  "unsupported",
] as const;

export type ShadowHarnessScenario = typeof SHADOW_HARNESS_SCENARIOS[number];

type ScenarioDefinition = Readonly<{
  label: string;
  stateLabel: string;
  description: string;
  widgets: readonly WidgetType[];
  projection: OverlayProjectionAdaptation;
}>;

const LEGACY_SNAPSHOT = createSnapshot("ready");
const MAPPED_PROJECTION = createMapping(createSnapshot("ready"));

const SCENARIOS: Readonly<Record<ShadowHarnessScenario, ScenarioDefinition>> = {
  equal: {
    label: "Igualdad exacta",
    stateLabel: "Paridad exacta",
    description: "Pedals conserva tres ceros legítimos en ambos pipelines.",
    widgets: ["pedals"],
    projection: MAPPED_PROJECTION,
  },
  partial: {
    label: "Cobertura parcial",
    stateLabel: "Parcial",
    description: "Standings compara señales demostradas y enumera las ausentes.",
    widgets: ["pedals", "standings"],
    projection: MAPPED_PROJECTION,
  },
  stale: {
    label: "Dato stale",
    stateLabel: "Stale",
    description: "El valor permanece visible, pero su calidad impide declararlo igual.",
    widgets: ["pedals"],
    projection: createMapping(createSnapshot("stale"), [
      mappedField("vehicles[0].throttle", "player.throttle", "stale"),
    ]),
  },
  disconnected: {
    label: "Fuente desconectada",
    stateLabel: "Desconectado",
    description: "Sin un frame utilizable, el comparator queda bloqueado de forma explícita.",
    widgets: ["pedals"],
    projection: {
      kind: "blocked",
      code: "player-unavailable",
      quality: [],
      unsupported: [],
    },
  },
  unsupported: {
    label: "Cobertura no disponible",
    stateLabel: "Unsupported",
    description: "Delta y Relative no se aprueban mientras falten sus señales canónicas.",
    widgets: ["delta", "relative"],
    projection: MAPPED_PROJECTION,
  },
};

export function TelemetryOverlayShadowHarness({
  initialScenario = "equal",
}: Readonly<{ initialScenario?: ShadowHarnessScenario }>) {
  const [scenario, setScenario] = useState(initialScenario);
  const selected = SCENARIOS[scenario];
  const report = useMemo(() => buildReport(selected), [selected]);

  return (
    <main
      className="shadow-harness"
      data-productive="false"
      data-testid="shadow-harness-root"
    >
      <style>{HARNESS_CSS}</style>
      <header className="shadow-header">
        <div>
          <p className="shadow-eyebrow">Telemetry Core · TC-07A</p>
          <h1>DIAGNÓSTICO SHADOW — NO LIVE</h1>
          <p className="shadow-intro">
            Comparación local y determinista de ViewModels. Fixture local, sin conexión live.
          </p>
        </div>
        <div className="shadow-badge" aria-label="Estado del harness">
          <span aria-hidden="true" />
          No productivo
        </div>
      </header>

      <section className="shadow-controls" aria-label="Controles de diagnóstico">
        <label htmlFor="shadow-scenario">Escenario diagnóstico</label>
        <select
          id="shadow-scenario"
          value={scenario}
          onChange={(event) => setScenario(readScenario(event.target.value))}
        >
          {SHADOW_HARNESS_SCENARIOS.map((value) => (
            <option key={value} value={value}>{SCENARIOS[value].label}</option>
          ))}
        </select>
        <div className="shadow-scenario-copy">
          <strong data-testid="shadow-scenario-state">{selected.stateLabel}</strong>
          <span>{selected.description}</span>
        </div>
      </section>

      <section
        className="shadow-summary"
        data-essential="true"
        data-testid="shadow-summary"
        aria-label="Resumen del reporte"
      >
        <SummaryMetric label="Contrato" testId="shadow-contract-version" value={`v${report.contractVersion}`} />
        <SummaryMetric label="Widgets" testId="shadow-widget-count" value={report.summary.widgets} />
        <SummaryMetric label="Campos" value={report.summary.fields} />
        <SummaryMetric label="Iguales" value={report.summary.equal} tone="good" />
        <SummaryMetric label="Tolerancia" value={report.summary.withinTolerance} />
        <SummaryMetric label="Diferencias" value={report.summary.mismatches} tone="warning" />
      </section>

      <div className="shadow-report-heading">
        <div>
          <p className="shadow-eyebrow">Reporte sanitizado</p>
          <h2>Resumen por widget</h2>
        </div>
        <p data-testid="shadow-report-status">
          {report.truncated ? "Reporte limitado por seguridad" : "Reporte completo accesible"}
        </p>
      </div>

      <section
        className="shadow-results"
        data-essential="true"
        data-testid="shadow-result-list"
        aria-label="Resultados por widget"
      >
        {report.widgets.map((widget) => (
          <WidgetResult key={`${widget.widgetType}-${widget.instance}`} widget={widget} />
        ))}
      </section>

      <footer>
        Sin payload raw, persistencia, perfiles, Studio, Desktop, OBS ni fuente live.
      </footer>
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  testId,
  tone = "neutral",
}: Readonly<{
  label: string;
  value: string | number;
  testId?: string;
  tone?: "neutral" | "good" | "warning";
}>) {
  return (
    <div className={`shadow-metric shadow-metric--${tone}`}>
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </div>
  );
}

function WidgetResult({ widget }: Readonly<{ widget: OverlayShadowWidgetResult }>) {
  return (
    <article className="shadow-widget" data-testid={`shadow-widget-${widget.widgetType}`}>
      <header>
        <div>
          <p className="shadow-eyebrow">{coverageLabel(widget.coverage)}</p>
          <h3>{widgetLabel(widget.widgetType)}</h3>
        </div>
        <span className={`shadow-outcome shadow-outcome--${widget.outcome}`}>
          {outcomeLabel(widget.outcome)}
        </span>
      </header>

      <div className="shadow-widget-counts" aria-label="Resumen del widget">
        <span>{widget.summary.fields} campos</span>
        <span>{widget.summary.equal} iguales</span>
        <span>{widget.summary.mismatches} diferencias</span>
      </div>

      <ol className="shadow-entry-list">
        {widget.entries.map((entry, index) => (
          <ShadowEntry key={`${entry.path}-${entry.item ?? "single"}-${index}`} entry={entry} />
        ))}
      </ol>
    </article>
  );
}

function ShadowEntry({ entry }: Readonly<{ entry: OverlayShadowEntry }>) {
  return (
    <li className="shadow-entry">
      <div className="shadow-entry-main">
        <code>{entry.path}</code>
        <span>{entry.classification}</span>
      </div>
      {entry.observation ? <Observation entry={entry} /> : null}
    </li>
  );
}

function Observation({ entry }: Readonly<{ entry: OverlayShadowEntry }>) {
  const observation = entry.observation;
  if (!observation || observation.kind === "redacted") return null;
  if (observation.kind === "presence") {
    return (
      <div className="shadow-observation">
        <span>Legacy <b>{observation.legacy ? "presente" : "ausente"}</b></span>
        <span>Projection <b>{observation.projection ? "presente" : "ausente"}</b></span>
      </div>
    );
  }
  return (
    <div className="shadow-observation">
      <span>Legacy <b>{displayValue(observation.legacy)}</b></span>
      <span>Projection <b>{displayValue(observation.projection)}</b></span>
    </div>
  );
}

function buildReport(definition: ScenarioDefinition): OverlayShadowReport {
  return compareOverlayShadow({
    legacySnapshot: LEGACY_SNAPSHOT,
    projection: definition.projection,
    widgets: definition.widgets.map(createWidget),
  });
}

function createWidget(type: WidgetType): WidgetInstanceV3 {
  return widgetTypeRegistry.get(type).createDefault(`shadow-fixture-${type}`);
}

function createSnapshot(status: TelemetrySnapshot["status"]): TelemetrySnapshot {
  return {
    status,
    capturedAt: 1_785_430_800_000,
    session: {
      type: "race",
      trackName: "PRIVATE_TRACK_SHADOW_105",
    },
    player: {
      inPit: false,
      throttle: 0,
      brake: 0,
      clutch: 0,
      speedKph: 0,
      rpm: 0,
      gear: 0,
      totalLaps: 0,
      lapNumber: 0,
    },
    scoring: [
      {
        id: "PRIVATE_VEHICLE_ID_SHADOW_105",
        place: 1,
        totalLaps: 0,
        inPits: false,
        isPlayer: true,
        driverName: "PRIVATE_DRIVER_SHADOW_105",
        teamName: "PRIVATE_TEAM_SHADOW_105",
      },
    ],
  };
}

function createMapping(
  snapshot: TelemetrySnapshot,
  overrides: readonly OverlayMappedField[] = [],
): OverlayProjectionMapping {
  const fields = [
    mappedField("sessionType", "session.type"),
    mappedField("playerVehicleId", "player"),
    mappedField("vehicles[0].inPit", "player.inPit"),
    mappedField("vehicles[0].throttle", "player.throttle"),
    mappedField("vehicles[0].brake", "player.brake"),
    mappedField("vehicles[0].clutch", "player.clutch"),
    mappedField("vehicles[0].speedMps", "player.speedKph"),
    mappedField("vehicles[0].engineRpm", "player.rpm"),
    mappedField("vehicles[0].gear", "player.gear"),
    mappedField("vehicles[0].completedLaps", "player.totalLaps"),
    mappedField("vehicles[0].completedLaps", "player.lapNumber"),
    mappedField("vehicles[0].position", "scoring[0].place"),
    mappedField("vehicles[0].completedLaps", "scoring[0].totalLaps"),
    mappedField("vehicles[0].inPit", "scoring[0].inPits"),
  ];
  const bySourceAndTarget = new Map(
    fields.map((field) => [`${field.sourcePath}|${field.targetPath ?? ""}`, field]),
  );
  for (const field of overrides) {
    bySourceAndTarget.set(`${field.sourcePath}|${field.targetPath ?? ""}`, field);
  }
  return {
    kind: "mapped",
    snapshot,
    quality: [...bySourceAndTarget.values()],
    unsupported: [
      { targetPath: "player.deltaSeconds", reason: "unsupported-by-projection" },
      { targetPath: "scoring[].timeGapToPlayer", reason: "unsupported-by-projection" },
    ],
  };
}

function mappedField(
  sourcePath: string,
  targetPath: string,
  freshness: OverlayMappedField["freshness"] = "fresh",
): OverlayMappedField {
  return {
    sourcePath,
    targetPath,
    present: freshness !== "missing",
    provenance: freshness === "missing" ? "unknown" : "observed",
    freshness,
    usable: freshness === "fresh" || freshness === "stale",
  };
}

function readScenario(value: string): ShadowHarnessScenario {
  return SHADOW_HARNESS_SCENARIOS.includes(value as ShadowHarnessScenario)
    ? value as ShadowHarnessScenario
    : "equal";
}

function displayValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "boolean") return value ? "sí" : "no";
  return String(value);
}

function widgetLabel(type: WidgetType): string {
  switch (type) {
    case "pedals": return "Pedals";
    case "standings": return "Standings";
    case "delta": return "Delta";
    case "relative": return "Relative";
    default: return type;
  }
}

function coverageLabel(coverage: OverlayShadowWidgetResult["coverage"]): string {
  switch (coverage) {
    case "exact": return "Cobertura exacta";
    case "partial": return "Cobertura parcial";
    case "not-comparable": return "No comparable";
    case "external": return "Consumidor externo";
  }
}

function outcomeLabel(outcome: OverlayShadowWidgetResult["outcome"]): string {
  switch (outcome) {
    case "equal": return "Igual";
    case "mismatch": return "Diferencias";
    case "not-comparable": return "No comparable";
    case "external": return "Externo";
    case "blocked": return "Blocked";
    case "builder-error": return "Error controlado";
  }
}

const HARNESS_CSS = `
  :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #08090b; color: #f4f4f5; }
  * { box-sizing: border-box; }
  html, body, #root { min-width: 0; min-height: 100%; margin: 0; }
  body { background: radial-gradient(circle at 50% -20%, #2a1115 0, #0d0e11 36rem, #08090b 72rem); }
  button, select { font: inherit; }
  .shadow-harness { width: min(100%, 1480px); min-height: 100vh; margin: 0 auto; padding: 32px; overflow-wrap: anywhere; }
  .shadow-header, .shadow-controls, .shadow-report-heading, .shadow-widget > header { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .shadow-header { padding-bottom: 26px; border-bottom: 1px solid #24262c; }
  .shadow-eyebrow { margin: 0 0 8px; color: #ef3340; font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
  h1, h2, h3, p { margin-top: 0; }
  h1 { margin-bottom: 9px; font-size: clamp(24px, 3vw, 38px); letter-spacing: -.045em; }
  h2 { margin-bottom: 0; font-size: 24px; }
  h3 { margin-bottom: 0; font-size: 20px; }
  .shadow-intro, .shadow-scenario-copy span, footer { margin-bottom: 0; color: #a2a3aa; line-height: 1.55; }
  .shadow-badge { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 9px; padding: 9px 12px; border: 1px solid #3d2427; border-radius: 999px; background: #1a1012; color: #f07d85; font-size: 12px; font-weight: 800; text-transform: uppercase; }
  .shadow-badge span { width: 7px; height: 7px; border-radius: 50%; background: #ef3340; box-shadow: 0 0 14px #ef3340; }
  .shadow-controls { display: grid; grid-template-columns: max-content minmax(210px, 280px) 1fr; margin: 24px 0; padding: 18px; border: 1px solid #292b31; border-radius: 12px; background: rgba(18, 19, 23, .92); }
  .shadow-controls label { color: #cacbd0; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .shadow-controls select { width: 100%; min-width: 0; padding: 10px 38px 10px 12px; border: 1px solid #3a3c44; border-radius: 8px; background: #0d0e11; color: #fff; }
  .shadow-scenario-copy { min-width: 0; display: grid; gap: 4px; }
  .shadow-scenario-copy strong { color: #fff; }
  .shadow-summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
  .shadow-metric { min-width: 0; padding: 16px; border: 1px solid #272930; border-radius: 10px; background: #111216; }
  .shadow-metric span { display: block; margin-bottom: 8px; color: #85878f; font-size: 10px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
  .shadow-metric strong { display: block; font-size: 25px; font-variant-numeric: tabular-nums; }
  .shadow-metric--good strong { color: #35d38b; }
  .shadow-metric--warning strong { color: #ffca57; }
  .shadow-report-heading { margin: 34px 0 16px; }
  .shadow-report-heading > p { margin-bottom: 0; color: #7f8189; font-size: 12px; }
  .shadow-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .shadow-widget { min-width: 0; overflow: hidden; border: 1px solid #292b31; border-radius: 12px; background: rgba(17, 18, 22, .96); }
  .shadow-widget > header { padding: 18px; border-bottom: 1px solid #24262c; }
  .shadow-outcome { flex: 0 0 auto; padding: 7px 9px; border: 1px solid #3d3f47; border-radius: 6px; color: #b8bac2; font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .shadow-outcome--equal { border-color: #1e6245; color: #49dfa0; }
  .shadow-outcome--mismatch, .shadow-outcome--blocked, .shadow-outcome--not-comparable { border-color: #623039; color: #ff7d89; }
  .shadow-widget-counts { display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 12px 18px; border-bottom: 1px solid #24262c; color: #8f9199; font-size: 12px; font-variant-numeric: tabular-nums; }
  .shadow-entry-list { max-height: 480px; margin: 0; padding: 0; overflow: auto; list-style: none; }
  .shadow-entry { display: grid; gap: 9px; padding: 12px 18px; border-bottom: 1px solid #1e2025; }
  .shadow-entry:last-child { border-bottom: 0; }
  .shadow-entry-main, .shadow-observation { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-width: 0; }
  .shadow-entry code { min-width: 0; color: #d7d8dc; font: 600 12px/1.4 ui-monospace, "SFMono-Regular", Consolas, monospace; overflow-wrap: anywhere; }
  .shadow-entry-main > span { flex: 0 0 auto; color: #a1a3aa; font: 700 10px/1.3 ui-monospace, "SFMono-Regular", Consolas, monospace; }
  .shadow-observation { justify-content: flex-start; flex-wrap: wrap; color: #6f7179; font-size: 11px; }
  .shadow-observation span { display: inline-flex; gap: 7px; }
  .shadow-observation b { color: #f2f2f3; font-variant-numeric: tabular-nums; }
  footer { margin-top: 28px; padding-top: 18px; border-top: 1px solid #24262c; font-size: 12px; }
  @media (max-width: 1040px) {
    .shadow-harness { padding: 24px; }
    .shadow-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .shadow-controls { grid-template-columns: 1fr 1fr; }
    .shadow-scenario-copy { grid-column: 1 / -1; }
  }
  @media (max-width: 680px) {
    .shadow-harness { padding: 18px 14px 26px; }
    .shadow-header, .shadow-report-heading { align-items: flex-start; flex-direction: column; }
    .shadow-controls { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .shadow-scenario-copy { grid-column: auto; }
    .shadow-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .shadow-results { grid-template-columns: minmax(0, 1fr); }
    .shadow-widget > header { align-items: flex-start; }
    .shadow-entry-main { align-items: flex-start; flex-direction: column; gap: 5px; }
  }
`;
