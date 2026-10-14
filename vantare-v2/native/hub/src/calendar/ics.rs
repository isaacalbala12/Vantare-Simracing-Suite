//! Exportación `.ics` como descarga puntual (sin suscripción por servidor).
//! Las series diarias solo entran por las salidas que caen en tus avisos:
//! sin ellos serían cientos de eventos por semana.
use super::{alerts::Alerts, model::Schedule};
use chrono::{DateTime, Utc};
use std::fmt::Write;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Options {
    /// Solo las series que sigues; si no, todas las que tienen salidas útiles.
    pub only_favs: bool,
    /// Añade un recordatorio con tu antelación de aviso.
    pub alarm: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            only_favs: true,
            alarm: true,
        }
    }
}

fn stamp(at: DateTime<Utc>) -> String {
    at.format("%Y%m%dT%H%M%SZ").to_string()
}

fn escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
}

/// Calendario con las salidas desde `now` hasta el fin de la semana publicada.
pub fn build(
    schedule: &Schedule,
    favs: &[String],
    alerts: &Alerts,
    options: Options,
    now: DateTime<Utc>,
) -> Result<String, String> {
    let (_, until) = schedule.window()?;
    let mut out = String::from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vantare//Calendario LMU//ES\r\nCALSCALE:GREGORIAN\r\n",
    );
    for series in &schedule.series {
        if options.only_favs && !favs.contains(&series.id) {
            continue;
        }
        let daily = series.every().is_some();
        for start in schedule.starts(series, now, until)? {
            if daily && alerts.cause(schedule, series, start).is_none() {
                continue;
            }
            let end = start + chrono::Duration::minutes(series.event_minutes());
            let summary = format!("{} · {}", series.name, series.track_short());
            write!(
                out,
                "BEGIN:VEVENT\r\nUID:{}-{}@vantare\r\nDTSTAMP:{}\r\nDTSTART:{}\r\nDTEND:{}\r\nSUMMARY:{}\r\nLOCATION:{}\r\n",
                series.id,
                start.timestamp(),
                stamp(now),
                stamp(start),
                stamp(end),
                escape(&summary),
                escape(&series.track),
            )
            .expect("escribir en un String no falla");
            if options.alarm {
                write!(
                out,
                    "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:{}\r\nTRIGGER:-PT{}M\r\nEND:VALARM\r\n",
                    escape(&summary),
                    alerts.lead_min,
                )
                .expect("escribir en un String no falla");
            }
            out.push_str("END:VEVENT\r\n");
        }
    }
    out.push_str("END:VCALENDAR\r\n");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const OCTOBER: &[u8] = include_bytes!("../../reference/fixtures/calendar-lmu-2026-10-06.json");

    fn now() -> DateTime<Utc> {
        "2026-10-08T17:47:13Z".parse().unwrap()
    }

    #[test]
    fn valid_calendar_with_stable_uids_and_no_daily_without_band() {
        let schedule = Schedule::parse(OCTOBER).unwrap();
        let weekly = schedule
            .series
            .iter()
            .find(|s| s.every().is_none())
            .unwrap();
        let favs = vec![weekly.id.clone()];
        let alerts = Alerts::default();
        let a = build(&schedule, &favs, &alerts, Options::default(), now()).unwrap();
        let b = build(&schedule, &favs, &alerts, Options::default(), now()).unwrap();
        assert!(a.starts_with("BEGIN:VCALENDAR\r\n") && a.ends_with("END:VCALENDAR\r\n"));
        assert_eq!(
            a.matches("BEGIN:VEVENT").count(),
            a.matches("END:VEVENT").count()
        );
        assert!(a.contains("BEGIN:VEVENT") && a.contains("TRIGGER:-PT10M"));
        let uids = |s: &str| {
            s.lines()
                .filter(|l| l.starts_with("UID:"))
                .map(str::to_owned)
                .collect::<Vec<_>>()
        };
        assert_eq!(uids(&a), uids(&b));
        let everything = Options {
            only_favs: false,
            ..Options::default()
        };
        let all = build(&schedule, &[], &alerts, everything, now()).unwrap();
        assert!(!all.contains(
            &format!("UID:{}-", schedule.series.iter().find(|s| s.every().is_some()).unwrap().id)
        ));
    }
}
