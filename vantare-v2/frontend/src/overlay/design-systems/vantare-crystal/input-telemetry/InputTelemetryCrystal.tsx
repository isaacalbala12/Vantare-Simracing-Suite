import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { InputTelemetryViewModel } from "../../../widget-types/input-telemetry/input-telemetry-view-model";

const percent = (value: number) => Math.round(value * 100);

function tracePath(values: readonly number[]): string {
  if (values.length === 0) return "";
  return values.map((value, index) => `${index === 0 ? "M" : "L"}${values.length === 1 ? 500 : (index / (values.length - 1)) * 500} ${88 - value * 76}`).join("");
}

function Trace({ model }: { model: InputTelemetryViewModel }) {
  return <svg viewBox="0 0 500 96" preserveAspectRatio="none" aria-label="Input history"><path d={tracePath(model.history.map((sample) => sample.throttle))}/><path d={tracePath(model.history.map((sample) => sample.brake))}/></svg>;
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

export function InputTelemetryCrystal({ model, settings }: WidgetRendererProps<InputTelemetryViewModel>) {
  const template = typeof settings.templateId === "string" ? settings.templateId : "input-blade";
  if (template === "input-capsule") return <section data-widget-system="vantare-crystal" data-widget-renderer="input-telemetry" data-template={template} data-status={model.status} className="vc-input-telemetry vc-input-capsule"><header>INPUTS</header><div className="vc-input-graph"><Trace model={model}/></div><VerticalInputs model={model}/><Readout model={model}/></section>;
  if (template === "input-dense") return <section data-widget-system="vantare-crystal" data-widget-renderer="input-telemetry" data-template={template} data-status={model.status} className="vc-input-telemetry vc-input-dense"><header>INP</header><div className="vc-input-graph"><Trace model={model}/></div><div className="vc-input-horizontal">{[["throttle", "T", model.throttle], ["brake", "B", model.brake], ["clutch", "C", model.clutch]].filter(([name]) => name !== "clutch" || model.showClutch).map(([name, label, raw]) => <div data-input={name} key={String(name)}><b>{label}</b><span><i style={{ width: `${percent(raw as number)}%` }}/></span><em>{String(percent(raw as number)).padStart(3, "0")}</em></div>)}</div><Readout model={model}/></section>;
  return <section data-widget-system="vantare-crystal" data-widget-renderer="input-telemetry" data-template={template} data-status={model.status} className="vc-input-telemetry vc-input-blade"><header>TELEMETRY</header><div className="vc-input-graph"><Trace model={model}/></div><VerticalInputs model={model}/><Readout model={model}/></section>;
}
