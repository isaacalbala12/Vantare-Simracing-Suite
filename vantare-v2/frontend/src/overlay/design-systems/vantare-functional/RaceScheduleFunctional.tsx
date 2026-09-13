import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { RaceScheduleViewModel } from "../../widget-types/race-schedule/race-schedule-view-model";

export function RaceScheduleFunctional({ model, effects }: WidgetRendererProps<RaceScheduleViewModel>) {
  return (
    <section
      className="vf-race-schedule"
      data-widget-system="vantare-functional"
      data-widget-renderer="race-schedule"
      data-status={model.status}
      data-effects={effects}
    >
      <header className="vf-race-schedule-header">
        <span className="vf-race-schedule-title">Schedule</span>
        <span className="vf-race-schedule-tz">{model.timeZone}</span>
      </header>
      <div className="vf-race-schedule-list">
        {model.events.length > 0 ? (
          model.events.map((event) => (
            <article key={event.id} className="vf-race-schedule-item" data-status={event.status}>
              <div className="vf-race-schedule-main">
                <span className="vf-race-schedule-license">{event.license ?? "—"}</span>
                <strong className="vf-race-schedule-name">{event.title}</strong>
                <span className="vf-race-schedule-track">{event.track}</span>
              </div>
              <div className="vf-race-schedule-meta">
                <span className="vf-race-schedule-classes">{event.classes.join(" ")}</span>
                <span className="vf-race-schedule-duration">{event.durationMinutes}m</span>
              </div>
            </article>
          ))
        ) : (
          <p className="vf-status-message">No events available</p>
        )}
      </div>
    </section>
  );
}
