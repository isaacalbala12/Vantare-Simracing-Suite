//! Calendar's Windows notices: the frozen check_alerts window, without launch actions.
use super::{CalendarAlerts, CalendarSchedule, CalendarView, agenda};
use chrono::{Local, TimeZone, Timelike};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

pub const NOTICE_LIMIT: usize = 256;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarNotice {
    pub series_id: String,
    pub title: String,
    pub body: String,
}
#[derive(Default)]
pub(super) struct Notifier {
    last: Option<i64>,
    tick: Option<Instant>,
}
impl Notifier {
    pub(super) fn poll(
        &mut self,
        view: &CalendarView,
        alerts: &CalendarAlerts,
        now: i64,
        monotonic: Instant,
        enabled: bool,
        in_track: bool,
    ) -> Vec<CalendarNotice> {
        if !enabled {
            self.last = None;
            self.tick = None;
            return Vec::new();
        }
        if self
            .tick
            .is_some_and(|last| monotonic.saturating_duration_since(last) < Duration::from_secs(1))
        {
            return Vec::new();
        }
        self.tick = Some(monotonic);
        let since = self.last.replace(now);
        let Some(since) = since.filter(|since| *since < now) else {
            return Vec::new();
        };
        let Some(schedule) = agenda::current(view, now) else {
            return Vec::new();
        };
        // Like GPUI, disabled Windows notices still advance the observed time.
        if !alerts.channels.windows {
            return Vec::new();
        }
        due(&schedule, alerts, now, since, in_track, &Local)
    }
}
// calendar/alerts.rs::due: only fire times in (since, now], from starts in
// [now, now + lead + one minute). Bands are quiet in-track; explicit slots are not.
fn due<Z: TimeZone>(
    schedule: &CalendarSchedule,
    alerts: &CalendarAlerts,
    now: i64,
    since: i64,
    in_track: bool,
    zone: &Z,
) -> Vec<CalendarNotice> {
    let lead = i64::from(alerts.lead_min) * 60_000;
    let Some(until) = now.checked_add(lead).and_then(|n| n.checked_add(60_000)) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for series in &schedule.series {
        let Ok(starts) = agenda::starts(schedule, series, now, until) else {
            continue;
        };
        for at in starts {
            let fire = at - lead;
            if fire <= since || fire > now {
                continue;
            }
            let Ok(Some(cause)) = agenda::cause_in(schedule, series, at, alerts, zone) else {
                continue;
            };
            if in_track && cause == agenda::Cause::Band {
                continue;
            }
            let Some(local) = zone.timestamp_millis_opt(at).single() else {
                continue;
            };
            let race = series
                .sessions
                .iter()
                .find(|s| s.name == "race")
                .map_or(series.race_duration_min.unwrap_or(0), |s| s.duration_min);
            let minutes = ((at - now) / 1000).max(0).saturating_add(59) / 60;
            let remaining = match minutes {
                0..60 => format!("en {minutes} min"),
                60..1440 => format!("en {} h {:02} min", minutes / 60, minutes % 60),
                _ => format!("en {} d {} h", minutes / 1440, minutes % 1440 / 60),
            };
            let track = series.track.split(" (").next().unwrap_or(&series.track);
            values.push((
                at,
                CalendarNotice {
                    series_id: series.id.clone(),
                    title: format!(
                        "{} sale a las {}",
                        series.name,
                        format_args!("{:02}:{:02}", local.hour(), local.minute())
                    ),
                    body: format!("{track} · carrera {} · {remaining}", duration(race)),
                },
            ));
            if values.len() > NOTICE_LIMIT {
                return Vec::new();
            }
        }
    }
    values.sort_by(|a, b| (a.0, &a.1.series_id).cmp(&(b.0, &b.1.series_id)));
    values.into_iter().map(|(_, notice)| notice).collect()
}
fn duration(minutes: u32) -> String {
    match (minutes / 60, minutes % 60) {
        (0, m) => format!("{m} min"),
        (h, 0) => format!("{h} h"),
        (h, m) => format!("{h} h {m} min"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calendar::{CalendarBand, CalendarBandMode, CalendarDays, CalendarSlot};
    fn schedule() -> CalendarSchedule {
        CalendarSchedule::parse(br#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa (GP)","vehicleClass":"GT3","licenseLabel":"Bronce","raceDurationMin":20,"recurrence":{"kind":"interval","intervalMinutes":60}}]}"#).expect("valid notice schedule")
    }
    fn now() -> i64 {
        chrono::DateTime::parse_from_rfc3339("2026-11-12T11:50:00Z")
            .expect("notice time")
            .timestamp_millis()
    }
    fn alerts() -> CalendarAlerts {
        CalendarAlerts {
            bands: vec![CalendarBand {
                series_id: "qa".into(),
                from: 0,
                to: 1440,
                days: CalendarDays::All,
                mode: CalendarBandMode::Each,
            }],
            ..Default::default()
        }
    }
    fn zone() -> chrono::FixedOffset {
        chrono::FixedOffset::east_opt(7200).expect("UTC+2")
    }
    #[test]
    fn exact_frozen_text_uses_local_time_short_track_and_race_phase() {
        let mut schedule = schedule();
        schedule.series[0]
            .sessions
            .push(super::super::CalendarPhase {
                name: "race".into(),
                duration_min: 100,
                estimated: false,
            });
        let values = due(&schedule, &alerts(), now(), now() - 1, false, &zone());
        assert_eq!(
            values,
            vec![CalendarNotice {
                series_id: "qa".into(),
                title: "QA sale a las 14:00".into(),
                body: "Spa · carrera 1 h 40 min · en 10 min".into()
            }]
        );
    }
    #[test]
    fn fire_window_excludes_since_and_includes_now() {
        assert!(due(&schedule(), &alerts(), now(), now(), false, &zone()).is_empty());
        assert!(
            due(
                &schedule(),
                &alerts(),
                now() - 1,
                now() - 1000,
                false,
                &zone()
            )
            .is_empty()
        );
        assert_eq!(
            due(&schedule(), &alerts(), now(), now() - 1000, false, &zone()).len(),
            1
        );
    }
    #[test]
    fn bands_are_silent_in_track_but_explicit_event_slots_are_not() {
        assert!(due(&schedule(), &alerts(), now(), now() - 1, true, &zone()).is_empty());
        let mut schedule = schedule();
        schedule.series[0].event_kind = "weekly".into();
        let mut alerts = alerts();
        alerts.slots.push(CalendarSlot {
            series_id: "qa".into(),
            at: (now() + 600_000) / 1000,
        });
        assert_eq!(
            due(&schedule, &alerts, now(), now() - 1, true, &zone()).len(),
            1
        );
    }
    #[test]
    fn first_tick_seeds_then_delivers_once_and_resets_on_access_loss() {
        let view = CalendarView {
            official: Some(schedule()),
            ..Default::default()
        };
        let mut notifier = Notifier::default();
        let tick = Instant::now();
        assert!(
            notifier
                .poll(&view, &alerts(), now() - 1000, tick, true, false)
                .is_empty()
        );
        assert_eq!(
            notifier
                .poll(
                    &view,
                    &alerts(),
                    now(),
                    tick + Duration::from_secs(1),
                    true,
                    false
                )
                .len(),
            1
        );
        assert!(
            notifier
                .poll(
                    &view,
                    &alerts(),
                    now(),
                    tick + Duration::from_millis(1500),
                    true,
                    false
                )
                .is_empty()
        );
        assert!(
            notifier
                .poll(
                    &view,
                    &alerts(),
                    now() + 1000,
                    tick + Duration::from_secs(2),
                    true,
                    false
                )
                .is_empty()
        );
        assert!(
            notifier
                .poll(
                    &view,
                    &alerts(),
                    now() + 2000,
                    tick + Duration::from_secs(3),
                    false,
                    false
                )
                .is_empty()
        );
        assert!(
            notifier
                .poll(
                    &view,
                    &alerts(),
                    now() + 3000,
                    tick + Duration::from_secs(4),
                    true,
                    false
                )
                .is_empty()
        );
    }
    #[test]
    fn disabled_windows_channel_advances_without_replaying_on_enable() {
        let view = CalendarView {
            official: Some(schedule()),
            ..Default::default()
        };
        let tick = Instant::now();
        let mut notifier = Notifier::default();
        let mut config = alerts();
        notifier.poll(&view, &config, now() - 1000, tick, true, false);
        config.channels.windows = false;
        assert!(
            notifier
                .poll(
                    &view,
                    &config,
                    now(),
                    tick + Duration::from_secs(1),
                    true,
                    false
                )
                .is_empty()
        );
        config.channels.windows = true;
        assert!(
            notifier
                .poll(
                    &view,
                    &config,
                    now() + 1000,
                    tick + Duration::from_secs(2),
                    true,
                    false
                )
                .is_empty()
        );
    }
    #[test]
    fn no_current_schedule_or_backwards_clock_does_not_send() {
        let tick = Instant::now();
        let mut notifier = Notifier::default();
        assert!(
            notifier
                .poll(
                    &CalendarView::default(),
                    &alerts(),
                    now(),
                    tick,
                    true,
                    false
                )
                .is_empty()
        );
        let view = CalendarView {
            official: Some(schedule()),
            ..Default::default()
        };
        assert!(
            notifier
                .poll(
                    &view,
                    &alerts(),
                    now() - 1000,
                    tick + Duration::from_secs(1),
                    true,
                    false
                )
                .is_empty()
        );
    }
}
