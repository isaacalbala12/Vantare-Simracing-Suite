import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { DeltaTraceViewModel } from "../../widget-types/delta-trace/delta-trace-view-model";

function deltaText(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

export function DeltaTraceFunctional({ model, effects }: WidgetRendererProps<DeltaTraceViewModel>) {
  const points = model.points.length > 0 ? model.points : [{ capturedAt: 0, deltaSeconds: 0 }];
  const min = Math.min(...points.map((p) => p.deltaSeconds), -0.5);
  const max = Math.max(...points.map((p) => p.deltaSeconds), 0.5);
  const span = Math.max(0.01, max - min);
  const width = 300;
  const height = 70;
  const xFor = (index: number) => (index / Math.max(1, points.length - 1)) * width;
  const yFor = (value: number) => height - ((value - min) / span) * height;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.deltaSeconds)}`).join(" ");

  return (
    <section
      className="vf-delta-trace"
      data-widget-system="vantare-functional"
      data-widget-renderer="delta-trace"
      data-status={model.status}
      data-tone={model.trend}
      data-effects={effects}
    >
      <div className="vf-delta-trace-head">
        <span className="vf-delta-trace-current">{deltaText(model.currentDelta)}</span>
        <span className="vf-delta-trace-trend" data-trend={model.trend}>{model.trend.toUpperCase()}</span>
      </div>
      <svg className="vf-delta-trace-graph" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Delta trace">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="vf-delta-trace-zero" />
        <path d={path} className="vf-delta-trace-line" />
        <circle cx={xFor(points.length - 1)} cy={yFor(points.at(-1)!.deltaSeconds)} r="3" className="vf-delta-trace-dot" />
      </svg>
      {model.showSectors && model.sectorDeltas.length > 0 && (
        <div className="vf-delta-trace-sectors" aria-label="Sectores">
          {model.sectorDeltas.map((value, index) => (
            <span key={index} className="vf-delta-trace-sector" data-tone={value === undefined ? "unknown" : value < 0 ? "gaining" : value > 0 ? "losing" : "stable"}>
              <small>S{index + 1}</small>
              <b>{value === undefined ? "—" : deltaText(value)}</b>
            </span>
          ))}
        </div>
      )}
      {model.showTrackMap && model.trackPath && (
        <div className="vf-delta-trace-map">
          <svg viewBox="0 0 100 50" role="img" aria-label="Track map">
            <path d={model.trackPath} />
          </svg>
          {model.turnInsight ? <span className="vf-delta-trace-turn">{model.turnInsight}</span> : null}
        </div>
      )}
    </section>
  );
}
