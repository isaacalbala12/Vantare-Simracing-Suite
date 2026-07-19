import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { InputTelemetryViewModel } from "../../../widget-types/input-telemetry/input-telemetry-view-model";

const percent = (value: number) => Math.round(value * 100);

type TraceTemplate = "input-blade" | "input-capsule" | "input-dense";
const traceGeometry = {
  "input-blade": { width: 500, height: 96, baseline: 88, amplitude: 76 },
  "input-capsule": { width: 500, height: 74, baseline: 70, amplitude: 65 },
  "input-dense": { width: 400, height: 44, baseline: 40, amplitude: 36 },
} as const;

function tracePath(
  model: InputTelemetryViewModel,
  channel: "throttle" | "brake" | "clutch",
  template: TraceTemplate,
): string {
  if (model.history.length === 0) return "";
  const geometry = traceGeometry[template];
  const start = model.history[0]!.capturedAt;
  const end = model.history.at(-1)!.capturedAt;
  const span = Math.max(1, end - start);
  const samples = channel === "clutch"
    ? model.history.filter((sample) => sample.clutch > 0)
    : model.history;
  return samples.map((sample, index) => {
    const x = model.history.length === 1
      ? geometry.width
      : ((sample.capturedAt - start) / span) * geometry.width;
    const y = geometry.baseline - sample[channel] * geometry.amplitude;
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  }).join("");
}

function Trace({ model, template }: { model: InputTelemetryViewModel; template: TraceTemplate }) {
  const geometry = traceGeometry[template];
  return <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-label="Input history">
    {template === "input-blade" ? <>
      {[24, 48, 72].map((y) => <line key={y} x1="0" y1={y} x2="500" y2={y} />)}
    </> : null}
    <path d={tracePath(model, "throttle", template)}/>
    <path d={tracePath(model, "brake", template)}/>
    {model.showClutch && template !== "input-dense" ? <path d={tracePath(model, "clutch", template)}/> : null}
  </svg>;
}

function inputChannels(model: InputTelemetryViewModel) {
  return [["clutch", model.clutch], ["brake", model.brake], ["throttle", model.throttle]].filter(([name]) => name !== "clutch" || model.showClutch) as [string, number][];
}

function VerticalInputs({ model }: { model: InputTelemetryViewModel }) {
  return <div className="vc-input-vertical">{inputChannels(model).map(([name, raw]) => <div data-input={name} key={name}><b>{percent(raw)}</b><span><i style={{ height: `${percent(raw)}%` }}/></span></div>)}</div>;
}

function Readout({ model }: { model: InputTelemetryViewModel }) {
  return <div className="vc-input-readout"><b>{model.gear === undefined ? "—" : Math.round(model.gear)}</b><div><strong>{model.speedKph === undefined ? "—" : Math.round(model.speedKph)}</strong><small>KPH</small></div></div>;
}

function DenseReadout({ model }: { model: InputTelemetryViewModel }) {
  return <div className="vc-input-readout"><b>{model.gear === undefined ? "—" : Math.round(model.gear)}</b><strong>{model.speedKph === undefined ? "—" : Math.round(model.speedKph)}</strong><small>KPH</small></div>;
}

export function InputTelemetryCrystal({ model, settings }: WidgetRendererProps<InputTelemetryViewModel>) {
  const template = typeof settings.templateId === "string" ? settings.templateId : "input-blade";
  if (template === "input-capsule") return <section data-widget-system="vantare-crystal" data-widget-renderer="input-telemetry" data-template={template} data-status={model.status} className="vc-input-telemetry vc-input-capsule"><header>INPUTS</header><div className="vc-input-graph"><Trace model={model} template="input-capsule"/></div><VerticalInputs model={model}/><Readout model={model}/></section>;
  if (template === "input-dense") return <section data-widget-system="vantare-crystal" data-widget-renderer="input-telemetry" data-template={template} data-status={model.status} className="vc-input-telemetry vc-input-dense"><header>INP</header><div className="vc-input-graph"><Trace model={model} template="input-dense"/></div><div className="vc-input-horizontal">{[["throttle", "T", model.throttle], ["brake", "B", model.brake], ["clutch", "C", model.clutch]].filter(([name]) => name !== "clutch" || model.showClutch).map(([name, label, raw]) => <div data-input={name} key={String(name)}><b>{label}</b><span><i style={{ width: `${percent(raw as number)}%` }}/></span><em>{String(percent(raw as number)).padStart(3, "0")}</em></div>)}</div><DenseReadout model={model}/></section>;
  return <section data-widget-system="vantare-crystal" data-widget-renderer="input-telemetry" data-template={template} data-status={model.status} className="vc-input-telemetry vc-input-blade"><header>TELEMETRY</header><div className="vc-input-graph"><Trace model={model} template="input-blade"/></div><VerticalInputs model={model}/><Readout model={model}/></section>;
}
