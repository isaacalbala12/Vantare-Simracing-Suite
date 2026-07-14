import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { DeltaTraceViewModel } from "../../../widget-types/delta-trace/delta-trace-view-model";

const delta = (value: number | undefined) => value === undefined ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

export function DeltaTraceCrystal({ model }: WidgetRendererProps<DeltaTraceViewModel>) {
  const points = model.points.map((point, index) => `${index === 0 ? "M" : "L"} ${(index / Math.max(1, model.points.length - 1)) * 600} ${40 - point.deltaSeconds * 60}`).join(" ");
  return <section data-widget-system="vantare-crystal" data-widget-renderer="delta-trace" data-status={model.status} className="vc-delta-trace"><div className="vc-dt-top"><aside><small>ALL</small><b>LIVE</b></aside><div className="vc-dt-graph"><strong>{delta(model.currentDelta)}</strong><svg viewBox="0 0 600 80" preserveAspectRatio="none" role="img" aria-label="Delta trace"><line x1="0" y1="40" x2="600" y2="40"/><path d={points || "M 0 40 L 600 40"}/></svg></div><aside><small>SB</small><b>—</b></aside></div><div className="vc-dt-bottom"><div className="vc-dt-sectors">{Array.from({ length: 14 }, (_, index) => <i key={index}>{model.sectorDeltas[index] === undefined ? "" : delta(model.sectorDeltas[index])}</i>)}</div><div className="vc-dt-turn"><small>TURN</small><b>{model.turnInsight ?? "—"}</b><em>{model.trend.toUpperCase()}</em></div><div className="vc-dt-map">{model.trackPath ? <svg viewBox="0 0 100 50"><path d={model.trackPath}/></svg> : <span>MAP —</span>}</div></div></section>;
}
