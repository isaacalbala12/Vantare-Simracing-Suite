//! Bounded RFC 5545 download, matching the frozen calendar/ics.rs semantics.
use super::{CalendarAlerts, CalendarSchedule, agenda};
use chrono::{DateTime, Utc};
use std::fmt::Write;

pub const ICS_LIMIT: usize = crate::frame::LIMIT / 4;
pub const ICS_PREPARED_MAX_AGE_MS: u32 = 30 * 60 * 1000;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
    Favs,
    Events,
    All,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    Invalid,
    Limit,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub series_id: String,
    pub start: i64,
    pub end: i64,
    pub summary: String,
    pub track: String,
}
pub struct Prepared {
    pub calendar: String,
    pub entries: Vec<Entry>,
    pub total: usize,
}
fn stamp(at: i64) -> Result<String, Error> {
    let at = DateTime::<Utc>::from_timestamp_millis(at).ok_or(Error::Invalid)?;
    if !(0..=super::TIMESTAMP_LIMIT * 1000).contains(&at.timestamp_millis()) {
        return Err(Error::Invalid);
    }
    Ok(at.format("%Y%m%dT%H%M%SZ").to_string())
}
fn escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\r', "")
        .replace('\n', "\\n")
}
// Fold by UTF-8 octets without splitting a code point (RFC 5545 section 3.1).
fn line(out: &mut String, value: &str) {
    let mut length = 0;
    for ch in value.chars() {
        if length + ch.len_utf8() > 75 {
            out.push_str("\r\n ");
            length = 1;
        }
        out.push(ch);
        length += ch.len_utf8();
    }
    out.push_str("\r\n");
}
fn record(entry: &Entry, now: i64, lead: Option<u8>) -> Result<String, Error> {
    let mut out = String::from("BEGIN:VEVENT\r\n");
    line(
        &mut out,
        &format!(
            "UID:{}-{}@vantare",
            escape(&entry.series_id),
            entry.start / 1000
        ),
    );
    writeln!(out, "DTSTAMP:{}\r", stamp(now)?).expect("String");
    writeln!(out, "DTSTART:{}\r", stamp(entry.start)?).expect("String");
    writeln!(out, "DTEND:{}\r", stamp(entry.end)?).expect("String");
    line(&mut out, &format!("SUMMARY:{}", escape(&entry.summary)));
    line(&mut out, &format!("LOCATION:{}", escape(&entry.track)));
    if let Some(lead) = lead {
        out.push_str("BEGIN:VALARM\r\nACTION:DISPLAY\r\n");
        line(&mut out, &format!("DESCRIPTION:{}", escape(&entry.summary)));
        write!(out, "TRIGGER:-PT{lead}M\r\nEND:VALARM\r\n").expect("String");
    }
    out.push_str("END:VEVENT\r\n");
    Ok(out)
}
fn agenda_error(error: agenda::AgendaError) -> Error {
    match error {
        agenda::AgendaError::Invalid => Error::Invalid,
        agenda::AgendaError::Expansion => Error::Limit,
    }
}
pub fn prepare(
    schedule: &CalendarSchedule,
    following: &[String],
    alerts: &CalendarAlerts,
    scope: Scope,
    alarm: bool,
    now: i64,
) -> Result<Prepared, Error> {
    stamp(now)?;
    let until = super::date_millis(&schedule.valid_until).ok_or(Error::Invalid)?;
    let header = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vantare//Calendario LMU//ES\r\nCALSCALE:GREGORIAN\r\n";
    let footer = "END:VCALENDAR\r\n";
    let mut bytes = header.len() + footer.len();
    let mut records = Vec::new();
    for series in &schedule.series {
        // GPUI ICS uses Series::every(), not its weekly/special classification.
        let daily = series.recurrence.kind == "interval";
        if match scope {
            Scope::Favs => !following.contains(&series.id),
            Scope::Events => daily,
            Scope::All => false,
        } {
            continue;
        }
        let phase = |name: &str, default: u32| {
            series
                .sessions
                .iter()
                .find(|p| p.name == name)
                .map_or(default, |p| p.duration_min)
        };
        let minutes = series.event_duration_min.map_or_else(
            || {
                i64::from(phase("practice", 3))
                    + i64::from(phase("qualifying", 8))
                    + i64::from(phase("race", series.race_duration_min.unwrap_or(0)))
            },
            i64::from,
        );
        for start in agenda::starts(schedule, series, now, until).map_err(agenda_error)? {
            if daily
                && agenda::cause(schedule, series, start, alerts)
                    .map_err(agenda_error)?
                    .is_none()
            {
                continue;
            }
            let entry = Entry {
                series_id: series.id.clone(),
                start,
                end: start.checked_add(minutes * 60_000).ok_or(Error::Invalid)?,
                summary: format!(
                    "{} · {}",
                    series.name,
                    series.track.split(" (").next().unwrap_or(&series.track)
                ),
                track: series.track.clone(),
            };
            let text = record(&entry, now, alarm.then_some(alerts.lead_min))?;
            bytes = bytes.checked_add(text.len()).ok_or(Error::Limit)?;
            if bytes > ICS_LIMIT {
                return Err(Error::Limit);
            }
            records.push((entry, text));
        }
    }
    records.sort_by_key(|(entry, _)| entry.start);
    let total = records.len();
    let mut entries = Vec::new();
    let mut calendar = String::with_capacity(bytes);
    calendar.push_str(header);
    for (entry, text) in records {
        if entries.len() < 4 {
            entries.push(entry);
        }
        calendar.push_str(&text);
    }
    calendar.push_str(footer);
    Ok(Prepared {
        calendar,
        entries,
        total,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calendar::{CalendarRecurrence, CalendarSeries};
    fn schedule(interval: u32) -> CalendarSchedule {
        CalendarSchedule {
            version: 1,
            timezone: "UTC".into(),
            valid_from: "2026-10-08T00:00:00Z".into(),
            valid_until: "2026-10-09T00:00:00Z".into(),
            series: vec![CalendarSeries {
                id: "weekly".into(),
                name: "Carrera, LMU".into(),
                track: "Sebring (WEC)".into(),
                event_kind: "weekly".into(),
                event_duration_min: Some(60),
                recurrence: CalendarRecurrence {
                    kind: "interval".into(),
                    interval_minutes: interval,
                    ..Default::default()
                },
                ..Default::default()
            }],
        }
    }
    fn now() -> i64 {
        super::super::date_millis("2026-10-08T00:00:00Z").unwrap()
    }
    #[test]
    fn stable_utc_uid_escaped_fields_duration_and_optional_alarm() {
        let mut source = schedule(60);
        source.series[0].recurrence = CalendarRecurrence {
            kind: "weekly-slots".into(),
            days: vec!["Thu".into()],
            times_utc: vec!["00:00".into()],
            ..Default::default()
        };
        let a = prepare(
            &source,
            &["weekly".into()],
            &CalendarAlerts::default(),
            Scope::Favs,
            true,
            now(),
        )
        .unwrap();
        assert_eq!(a.total, 1);
        assert_eq!(a.entries.len(), 1);
        assert!(a.calendar.contains("UID:weekly-1791417600@vantare\r\n"));
        assert!(
            a.calendar
                .contains("DTSTART:20261008T000000Z\r\nDTEND:20261008T010000Z")
        );
        assert!(
            a.calendar
                .contains("SUMMARY:Carrera\\, LMU · Sebring\r\nLOCATION:Sebring (WEC)")
        );
        assert!(a.calendar.contains("TRIGGER:-PT10M"));
        assert_eq!(a.calendar.matches("BEGIN:VEVENT").count(), a.total);
        let b = prepare(
            &source,
            &[],
            &CalendarAlerts::default(),
            Scope::Events,
            false,
            now(),
        )
        .unwrap();
        assert!(!b.calendar.contains("VALARM"));
        assert_eq!(a.entries, b.entries);
    }
    #[test]
    fn favourites_filter_and_daily_without_band_produce_empty_calendar() {
        let mut schedule = schedule(60);
        let none = prepare(
            &schedule,
            &[],
            &CalendarAlerts::default(),
            Scope::Favs,
            true,
            now(),
        )
        .unwrap();
        assert_eq!(none.total, 0);
        assert!(none.calendar.ends_with("END:VCALENDAR\r\n"));
        schedule.series[0].event_kind = "daily".into();
        assert_eq!(
            prepare(
                &schedule,
                &[],
                &CalendarAlerts::default(),
                Scope::All,
                false,
                now()
            )
            .unwrap()
            .total,
            0
        );
    }
    #[test]
    fn folded_lines_preserve_utf8_and_size_limit_rejects_large_export() {
        let mut out = String::new();
        let text = "á".repeat(80);
        line(&mut out, &text);
        assert!(out.split("\r\n").all(|line| line.len() <= 75));
        assert_eq!(out.replace("\r\n ", "").trim_end_matches("\r\n"), text);
        let mut schedule = schedule(1);
        schedule.series[0].name = "x".repeat(300);
        schedule.series[0].event_kind = "daily".into();
        let mut alerts = CalendarAlerts::default();
        alerts.bands.push(super::super::CalendarBand {
            series_id: "weekly".into(),
            from: 0,
            to: 1440,
            days: super::super::CalendarDays::All,
            mode: super::super::CalendarBandMode::Each,
        });
        assert!(matches!(
            prepare(&schedule, &[], &alerts, Scope::All, true, now()),
            Err(Error::Limit)
        ));
        assert!(matches!(
            prepare(&schedule, &[], &alerts, Scope::All, false, -1),
            Err(Error::Invalid)
        ));
    }
    fn one_departure() -> CalendarSchedule {
        let mut source = schedule(60);
        source.series[0].recurrence = CalendarRecurrence {
            kind: "weekly-slots".into(),
            days: vec!["Thu".into()],
            times_utc: vec!["00:00".into()],
            ..Default::default()
        };
        source
    }
    #[test]
    fn events_excludes_every_interval_even_when_its_event_kind_is_weekly() {
        let source = schedule(60);
        let mut alerts = CalendarAlerts::default();
        alerts.slots.push(super::super::CalendarSlot {
            series_id: "weekly".into(),
            at: now() / 1000,
        });
        assert_eq!(
            prepare(&source, &[], &alerts, Scope::All, false, now())
                .unwrap()
                .total,
            1
        );
        assert_eq!(
            prepare(&source, &[], &alerts, Scope::Events, false, now())
                .unwrap()
                .total,
            0
        );
    }
    #[test]
    fn injection_in_uid_name_and_track_cannot_create_an_ics_property_or_component() {
        let mut source = one_departure();
        source.series[0].id = format!("id,semi;slash{}{}BEGIN:VTODO{}END:VTODO", '\\', '\n', '\r');
        source.series[0].name = "Name\r\nBEGIN:VTODO\nEND:VCALENDAR".into();
        source.series[0].track = "Track\rBEGIN:VTODO\nEND:VTODO".into();
        let result = prepare(
            &source,
            &[],
            &CalendarAlerts::default(),
            Scope::All,
            true,
            now(),
        )
        .unwrap();
        assert_eq!(
            result
                .calendar
                .split("\r\n")
                .filter(|line| *line == "BEGIN:VEVENT")
                .count(),
            1
        );
        assert!(
            !result
                .calendar
                .split("\r\n")
                .any(|line| line == "BEGIN:VTODO" || line == "END:VTODO")
        );
        assert!(
            result
                .calendar
                .contains(r"UID:id\,semi\;slash\\\nBEGIN:VTODOEND:VTODO-")
        );
        assert!(
            result
                .calendar
                .contains(r"SUMMARY:Name\nBEGIN:VTODO\nEND:VCALENDAR")
        );
        assert!(!result.calendar.replace("\r\n", "").contains(['\r', '\n']));
    }
    #[test]
    fn folding_keeps_every_multibyte_codepoint_and_uses_at_most_75_octets() {
        let input = format!("SUMMARY:{}", "ñ🚗é".repeat(50));
        let mut folded = String::new();
        line(&mut folded, &input);
        assert!(folded.split("\r\n").all(|line| line.len() <= 75));
        assert_eq!(folded.replace("\r\n ", "").trim_end_matches("\r\n"), input);
        assert!(folded.as_bytes().starts_with(b"SUMMARY:"));
    }
    #[test]
    fn an_exact_256_kib_calendar_is_accepted_and_one_more_character_is_rejected() {
        assert_eq!(ICS_LIMIT, 256 * 1024);
        for padding in 0..4 {
            let mut source = one_departure();
            source.series[0].track = format!("T{}", "x".repeat(padding));
            let (mut low, mut high) = (0, ICS_LIMIT);
            while low < high {
                let mid = (low + high).div_ceil(2);
                source.series[0].name = "x".repeat(mid);
                if prepare(
                    &source,
                    &[],
                    &CalendarAlerts::default(),
                    Scope::All,
                    false,
                    now(),
                )
                .is_ok()
                {
                    low = mid;
                } else {
                    high = mid - 1;
                }
            }
            source.series[0].name = "x".repeat(low);
            let result = prepare(
                &source,
                &[],
                &CalendarAlerts::default(),
                Scope::All,
                false,
                now(),
            )
            .unwrap();
            if result.calendar.len() == ICS_LIMIT {
                source.series[0].name.push('x');
                assert!(matches!(
                    prepare(
                        &source,
                        &[],
                        &CalendarAlerts::default(),
                        Scope::All,
                        false,
                        now()
                    ),
                    Err(Error::Limit)
                ));
                return;
            }
        }
        panic!("no exact byte-limit witness found");
    }
    #[test]
    fn recurrence_expansion_limit_is_a_size_error() {
        let mut source = schedule(1);
        source.valid_until = "2026-10-20T00:00:00Z".into();
        assert!(matches!(
            prepare(
                &source,
                &[],
                &CalendarAlerts::default(),
                Scope::All,
                false,
                now()
            ),
            Err(Error::Limit)
        ));
    }
    #[test]
    fn real_october_and_weekly_slots_match_generated_gpui_for_every_scope() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../hub-web/fixtures/calendar-ics-gpui.json"
        )))
        .unwrap();
        let shared: serde_json::Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/calendar/cases.json"
        )))
        .unwrap();
        let october: serde_json::Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../hub/reference/fixtures/calendar-lmu-2026-10-06.json"
        )))
        .unwrap();
        let cases = fixture["cases"].as_array().unwrap();
        assert!(cases.iter().any(|case| case["name"] == "october-2026"
            && case["scope"] == "events"
            && case["total"].as_u64().unwrap() > 0));
        for case in cases {
            let document = if case["name"] == "october-2026" {
                &october
            } else {
                &shared
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|item| item["name"] == case["name"])
                    .unwrap()["document"]
            };
            let source = CalendarSchedule::parse(&serde_json::to_vec(document).unwrap()).unwrap();
            let following: Vec<String> = serde_json::from_value(case["following"].clone()).unwrap();
            let alerts: CalendarAlerts = serde_json::from_value(case["alerts"].clone()).unwrap();
            let scope = match case["scope"].as_str().unwrap() {
                "favs" => Scope::Favs,
                "events" => Scope::Events,
                "all" => Scope::All,
                _ => unreachable!(),
            };
            let actual = prepare(
                &source,
                &following,
                &alerts,
                scope,
                false,
                case["now"].as_i64().unwrap(),
            )
            .unwrap();
            assert_eq!(
                actual.total,
                usize::try_from(case["total"].as_u64().unwrap()).unwrap(),
                "{case}"
            );
            let preview: Vec<_> = actual.entries.iter().map(|e| serde_json::json!({"seriesId":e.series_id,"start":e.start,"end":e.end,"summary":e.summary,"track":e.track})).collect();
            assert_eq!(serde_json::json!(preview), case["preview"], "{case}");
            let uids: Vec<_> = actual
                .calendar
                .split("\r\n")
                .filter_map(|line| line.strip_prefix("UID:"))
                .collect();
            assert_eq!(serde_json::json!(uids), case["uids"], "{case}");
        }
    }
}

#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarIcsScope {
    Favs,
    Events,
    All,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarIcsStatus {
    Saved,
    Cancelled,
    Conflict,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarIcsEntry {
    pub series_id: String,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub start: i64,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub end: i64,
    pub summary: String,
    pub track: String,
}
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarIcsView {
    pub calendar: String,
    pub prepared_hash: String,
    pub entries: Vec<CalendarIcsEntry>,
    pub total: u32,
    pub valid_until: String,
}
impl super::State {
    pub fn ics_prepare(
        &mut self,
        scope: CalendarIcsScope,
        alarm: bool,
        now: i64,
    ) -> Result<CalendarIcsView, crate::protocol::HostError> {
        use crate::protocol::HostError;
        let view = self.load();
        let config = self.config();
        let schedule = agenda::current(&view, now).ok_or(HostError::CalendarScheduleUnavailable)?;
        let check = |state| match state {
            super::CalendarDocumentState::Ready => Ok(()),
            super::CalendarDocumentState::Protected => Err(HostError::Protected),
            super::CalendarDocumentState::Unavailable => Err(HostError::Io),
        };
        if scope == CalendarIcsScope::Favs {
            check(config.documents.following)?;
        }
        if alarm || scope != CalendarIcsScope::Events {
            check(config.documents.alerts)?;
        }
        let scope = match scope {
            CalendarIcsScope::Favs => Scope::Favs,
            CalendarIcsScope::Events => Scope::Events,
            CalendarIcsScope::All => Scope::All,
        };
        let value = prepare(
            &schedule,
            &config.following,
            &config.alerts,
            scope,
            alarm,
            now,
        )
        .map_err(|error| match error {
            Error::Invalid => HostError::Rejected,
            Error::Limit => HostError::CalendarExportTooLarge,
        })?;
        Ok(CalendarIcsView {
            prepared_hash: vantare_services::content_hash(value.calendar.as_bytes()),
            calendar: value.calendar,
            total: u32::try_from(value.total).map_err(|_| HostError::CalendarExportTooLarge)?,
            valid_until: schedule.valid_until,
            entries: value
                .entries
                .into_iter()
                .map(|entry| CalendarIcsEntry {
                    series_id: entry.series_id,
                    start: entry.start,
                    end: entry.end,
                    summary: entry.summary,
                    track: entry.track,
                })
                .collect(),
        })
    }
}
