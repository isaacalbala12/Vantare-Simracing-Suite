//! Explicit local alert preferences. No program scheduling or service requests.
use super::{CalendarAlerts, CalendarConfigView, Contents, HostError, State, date_millis};
use chrono::{Datelike, Timelike};

impl State {
    pub fn alerts_save(
        &mut self,
        alerts: &CalendarAlerts,
        expected: &str,
    ) -> Result<CalendarConfigView, HostError> {
        self.alerts_save_at(alerts, expected, chrono::Utc::now().timestamp_millis())
    }
    pub(super) fn alerts_save_at(
        &mut self,
        alerts: &CalendarAlerts,
        expected: &str,
        now: i64,
    ) -> Result<CalendarConfigView, HostError> {
        if !alerts.valid() {
            return Err(HostError::Rejected);
        }
        let mut doc = self.observed_document("calendar-alerts.json", expected)?;
        let Contents::Alerts(old) = &doc.contents else {
            return Err(HostError::Rejected);
        };
        if old == alerts {
            self.config_view.observe(&doc);
            return Ok(self.config_view.clone());
        }
        // #2089: preserve a legacy value or switch it off, never arm a launch.
        if alerts.auto_launch && !old.auto_launch {
            return Err(HostError::Rejected);
        }
        self.validate_alert_changes(old, alerts, now)?;
        doc.value = serde_json::to_value(alerts).map_err(|_| HostError::Rejected)?;
        self.write_config_document("calendar-alerts.json", &doc)
    }
    fn validate_alert_changes(
        &self,
        old: &CalendarAlerts,
        next: &CalendarAlerts,
        now: i64,
    ) -> Result<(), HostError> {
        let active: Vec<_> = self
            .view
            .official
            .iter()
            .chain(&self.view.fallback)
            .filter(|schedule| {
                date_millis(&schedule.valid_from)
                    .zip(date_millis(&schedule.valid_until))
                    .is_some_and(|(from, until)| from <= now && now < until)
            })
            .collect();
        let new_bands = next.bands.iter().filter(|band| !old.bands.contains(band));
        let new_slots = next.slots.iter().filter(|slot| !old.slots.contains(slot));
        for band in new_bands {
            if active.is_empty() {
                return Err(HostError::CalendarScheduleUnavailable);
            }
            if !active.iter().any(|schedule| {
                schedule.series.iter().any(|series| {
                    series.id == band.series_id
                        && series.recurrence.kind == "interval"
                        && !matches!(series.event_kind.as_str(), "weekly" | "special")
                })
            }) {
                return Err(HostError::Rejected);
            }
        }
        for slot in new_slots {
            if slot.at.saturating_mul(1000) < now {
                return Err(HostError::Rejected);
            }
            if active.is_empty() {
                return Err(HostError::CalendarScheduleUnavailable);
            }
            if !active.iter().any(|schedule| {
                schedule.series.iter().any(|series| {
                    series.id == slot.series_id && occurrence(schedule, series, slot.at)
                })
            }) {
                return Err(HostError::Rejected);
            }
        }
        Ok(())
    }
}
// Same UTC grid as frozen calendar/model.rs::Schedule::starts, without expanding it.
fn occurrence(
    schedule: &super::super::CalendarSchedule,
    series: &super::super::CalendarSeries,
    at: i64,
) -> bool {
    let Some((from, until)) =
        date_millis(&schedule.valid_from).zip(date_millis(&schedule.valid_until))
    else {
        return false;
    };
    if at < from / 1000 || at >= until / 1000 || at % 60 != 0 {
        return false;
    }
    let recurrence = &series.recurrence;
    if recurrence.kind == "interval" {
        let every = i64::from(recurrence.interval_minutes);
        if every <= 0 {
            return false;
        }
        let offset = i64::from(series.start_offset_minute).rem_euclid(every);
        // Unix seconds between 0001-01-01 UTC (GPUI origin) and 1970-01-01 UTC.
        return (at + 62_135_596_800 - offset * 60).rem_euclid(every * 60) == 0;
    }
    let Some(date) = chrono::DateTime::from_timestamp(at, 0) else {
        return false;
    };
    let weekday = super::super::WEEKDAYS[date.weekday().num_days_from_monday() as usize];
    let time = format!("{:02}:{:02}", date.hour(), date.minute());
    recurrence.kind == "weekly-slots"
        && recurrence.days.iter().any(|day| day == weekday)
        && recurrence.times_utc.contains(&time)
}
