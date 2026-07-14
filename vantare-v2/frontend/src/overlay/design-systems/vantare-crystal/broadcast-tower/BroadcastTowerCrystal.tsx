import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { BroadcastTowerViewModel } from "../../../widget-types/broadcast-tower/broadcast-tower-view-model";

export function BroadcastTowerCrystal({ model }: WidgetRendererProps<BroadcastTowerViewModel>) {
  return <section data-widget-system="vantare-crystal" data-widget-renderer="broadcast-tower" data-status={model.status} className="vc-broadcast-tower"><div className="vc-broadcast-lap"><small>VUELTA</small><b>{model.lap ?? "—"}</b></div><div className="vc-broadcast-stream">{model.rows.map((row) => <article className={row.isPlayer ? "is-player" : ""} key={`${row.place}-${row.number}`}><b>{row.place}</b><i/><div><strong>{row.name}</strong><small>{row.gap === undefined ? "—" : `${row.gap > 0 ? "+" : ""}${row.gap.toFixed(3)}s`}</small></div><em>{row.team.slice(0, 3).toUpperCase()}</em></article>)}</div>{model.showWeather || model.showSof ? <aside>{model.showWeather ? <b>ASFALTO {model.trackTempC === undefined ? "—" : `${model.trackTempC}°C`}</b> : null}{model.showSof ? <small>SOF {model.sof ?? "—"}</small> : null}</aside> : null}</section>;
}
