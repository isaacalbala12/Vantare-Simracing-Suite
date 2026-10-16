//! Exportación `.ics` como descarga puntual (sin suscripción por servidor).
//! Las series diarias solo entran por las salidas que caen en tus avisos:
//! sin ellos serían cientos de eventos por semana.
use super::{alerts::Alerts, model::Schedule};
use chrono::{DateTime, Utc};
use std::fmt::Write;

/// Qué series entran en el archivo.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Scope {
    /// Solo las series que sigues.
    #[default]
    Favs,
    /// Solo los eventos semanales y especiales, con todas sus tandas.
    Events,
    /// Todas las series con salidas útiles.
    All,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Options {
    pub scope: Scope,
    /// Añade un recordatorio con tu antelación de aviso.
    pub alarm: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            scope: Scope::Favs,
            alarm: true,
        }
    }
}

/// Una salida que acabará como evento del calendario.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub series_id: String,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub summary: String,
    pub track: String,
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

/// Salidas desde `now` hasta el fin de la semana publicada que entran en el archivo.
pub fn entries(
    schedule: &Schedule,
    favs: &[String],
    alerts: &Alerts,
    options: Options,
    now: DateTime<Utc>,
) -> Result<Vec<Entry>, String> {
    let (_, until) = schedule.window()?;
    let mut out = vec![];
    for series in &schedule.series {
        let daily = series.every().is_some();
        let wanted = match options.scope {
            Scope::Favs => favs.contains(&series.id),
            Scope::Events => !daily,
            Scope::All => true,
        };
        if !wanted {
            continue;
        }
        for start in schedule.starts(series, now, until)? {
            if daily && alerts.cause(schedule, series, start).is_none() {
                continue;
            }
            out.push(Entry {
                series_id: series.id.clone(),
                start,
                end: start + chrono::Duration::minutes(series.event_minutes()),
                summary: format!("{} · {}", series.name, series.track_short()),
                track: series.track.clone(),
            });
        }
    }
    out.sort_by_key(|entry| entry.start);
    Ok(out)
}

/// Calendario con las salidas desde `now` hasta el fin de la semana publicada.
pub fn build(
    schedule: &Schedule,
    favs: &[String],
    alerts: &Alerts,
    options: Options,
    now: DateTime<Utc>,
) -> Result<String, String> {
    let mut out = String::from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vantare//Calendario LMU//ES\r\nCALSCALE:GREGORIAN\r\n",
    );
    for entry in entries(schedule, favs, alerts, options, now)? {
        write!(
            out,
            "BEGIN:VEVENT\r\nUID:{}-{}@vantare\r\nDTSTAMP:{}\r\nDTSTART:{}\r\nDTEND:{}\r\nSUMMARY:{}\r\nLOCATION:{}\r\n",
            entry.series_id,
            entry.start.timestamp(),
            stamp(now),
            stamp(entry.start),
            stamp(entry.end),
            escape(&entry.summary),
            escape(&entry.track),
        )
        .expect("escribir en un String no falla");
        if options.alarm {
            write!(
                out,
                "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:{}\r\nTRIGGER:-PT{}M\r\nEND:VALARM\r\n",
                escape(&entry.summary),
                alerts.lead_min,
            )
            .expect("escribir en un String no falla");
        }
        out.push_str("END:VEVENT\r\n");
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
            scope: Scope::All,
            ..Options::default()
        };
        let all = build(&schedule, &[], &alerts, everything, now()).unwrap();
        assert!(!all.contains(
            &format!("UID:{}-", schedule.series.iter().find(|s| s.every().is_some()).unwrap().id)
        ));
    }
}
