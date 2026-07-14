import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { RaceScheduleViewModel } from "../../../widget-types/race-schedule/race-schedule-view-model";

export function RaceScheduleCrystal({ model }: WidgetRendererProps<RaceScheduleViewModel>) {
  return <section data-widget-system="vantare-crystal" data-widget-renderer="race-schedule" data-status={model.status} className="vc-race-schedule"><header><b><i/>LE MANS ULTIMATE • DAILY RACE SCHEDULE</b><time>LIVE UTC</time></header><nav><span>UPCOMING EVENTS</span><b>ALL LICENSES</b></nav><div className="vc-race-events">{model.events.length ? model.events.map((event, index) => <article key={event.id} data-tier={index}><div><small>{event.license ?? "OFFICIAL"}</small><h3>{event.title}</h3><strong>{event.track}</strong><footer>{event.classes.map((item) => <i key={item}>{item}</i>)}<i>{event.durationMinutes}M RACE</i></footer></div><aside><time>{event.startAt}</time><b>{event.status}</b></aside></article>) : <p>CALENDAR UNAVAILABLE</p>}</div></section>;
}
