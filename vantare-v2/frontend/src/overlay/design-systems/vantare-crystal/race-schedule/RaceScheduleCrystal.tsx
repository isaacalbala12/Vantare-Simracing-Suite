import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { RaceScheduleViewModel } from "../../../widget-types/race-schedule/race-schedule-view-model";

const timingLabel = (index: number) => index === 0 ? "STARTS IN —" : index === 3 ? "— @ — UTC" : "NEXT @ — UTC";

export function RaceScheduleCrystal({ model }: WidgetRendererProps<RaceScheduleViewModel>) {
  return (
    <section data-widget-system="vantare-crystal" data-widget-renderer="race-schedule" data-status={model.status} className="vc-race-schedule">
      <header><b><i />LE MANS ULTIMATE • DAILY RACE SCHEDULE</b><time>LIVE UTC —</time></header>
      <nav><span>SCHEDULE FROM: —</span><div>{["ALL LICENSES", "BRONZE SR", "SILVER SR", "GOLD SR"].map((label, index) => <b data-active={index === 0} key={label}>{label}</b>)}</div></nav>
      <div className="vc-race-events">
        {model.events.length ? model.events.map((event, index) => {
          const metadata = [
            ...event.classes.map((value) => ({ kind: "class", value })),
            { kind: "pill", value: `${event.durationMinutes}M RACE` },
          ];
          while (metadata.length < 6) metadata.push({ kind: "pill", value: "—" });
          return (
            <article key={event.id} data-tier={index}>
              <div>
                <small>{event.license ?? "OFFICIAL"}</small>
                <h3>{event.title}</h3>
                <strong>{event.track}</strong>
                <footer>{metadata.map((item, itemIndex) => <i data-kind={item.kind} data-slot={itemIndex} data-class={item.kind === "class" ? item.value.toLowerCase() : undefined} key={`${item.kind}-${itemIndex}`}>{item.value}</i>)}</footer>
              </div>
              <aside><time>{timingLabel(index)}</time><b>{event.status}</b></aside>
            </article>
          );
        }) : <p>CALENDAR UNAVAILABLE</p>}
      </div>
    </section>
  );
}
