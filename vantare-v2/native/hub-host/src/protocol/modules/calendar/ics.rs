//! Bounded RFC 5545 download, matching the frozen calendar/ics.rs semantics.
use super::{CalendarAlerts, CalendarSchedule, agenda};
use chrono::{DateTime, Utc};
use std::fmt::Write;

pub const ICS_LIMIT: usize = crate::frame::LIMIT / 4;
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
        &format!("UID:{}-{}@vantare", entry.series_id, entry.start / 1000),
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
        let daily = agenda::daily(series);
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
        let minutes = series.event_duration_min.map(i64::from).unwrap_or_else(|| {
            i64::from(phase("practice", 3))
                + i64::from(phase("qualifying", 8))
                + i64::from(phase("race", series.race_duration_min.unwrap_or(0)))
        });
        for start in agenda::starts(schedule, series, now, until).map_err(|_| Error::Invalid)? {
            if daily
                && agenda::cause(schedule, series, start, alerts)
                    .map_err(|_| Error::Invalid)?
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
        let a = prepare(
            &schedule(60),
            &["weekly".into()],
            &CalendarAlerts::default(),
            Scope::Favs,
            true,
            now(),
        )
        .unwrap();
        assert_eq!(a.total, 24);
        assert_eq!(a.entries.len(), 4);
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
            &schedule(60),
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
        assert!(matches!(
            prepare(
                &schedule,
                &[],
                &CalendarAlerts::default(),
                Scope::All,
                true,
                now()
            ),
            Err(Error::Limit)
        ));
        assert!(matches!(
            prepare(
                &schedule,
                &[],
                &CalendarAlerts::default(),
                Scope::All,
                false,
                -1
            ),
            Err(Error::Invalid)
        ));
    }
}
