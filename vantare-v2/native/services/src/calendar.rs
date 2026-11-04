//! Solo lectura del horario publicado. Validación de agenda y caché en el Hub.
use crate::{Error, Result, config::BuildConfig, http::Http};
use chrono::{DateTime, NaiveTime, Utc};
use serde::Deserialize;
use std::collections::HashSet;
use url::Url;

#[derive(Deserialize)]
struct Published {
    schedule: serde_json::Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct ScheduleContract {
    version: u32,
    timezone: String,
    valid_from: String,
    valid_until: String,
    series: Vec<SeriesContract>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct SeriesContract {
    id: String,
    name: String,
    track: String,
    vehicle_class: String,
    license_label: String,
    recurrence: RecurrenceContract,
    #[serde(default)]
    classes: Vec<VehicleClassContract>,
    #[serde(default)]
    race_duration_min: Option<u32>,
    #[serde(default)]
    event_duration_min: Option<u32>,
    #[serde(default)]
    sessions: Vec<SessionContract>,
    #[serde(default)]
    tier: String,
    #[serde(default)]
    event_kind: String,
    #[serde(default)]
    format: String,
    #[serde(default)]
    setup: String,
    #[serde(default)]
    assists: String,
    #[serde(default)]
    tyre_warmers: bool,
    #[serde(default)]
    tyres: Option<u32>,
    #[serde(default)]
    splits: Option<u32>,
    #[serde(default)]
    safety_rating: String,
    #[serde(default)]
    ve_limit: Option<u32>,
    #[serde(default)]
    notes: Vec<String>,
    #[serde(default)]
    source: String,
    #[serde(default)]
    start_offset_minute: i64,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct VehicleClassContract {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct SessionContract {
    name: String,
    duration_min: u32,
    #[serde(default)]
    estimated: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecurrenceContract {
    kind: String,
    #[serde(default)]
    interval_minutes: i64,
    #[serde(default)]
    days: Vec<String>,
    #[serde(default, rename = "timesUTC")]
    times_utc: Vec<String>,
}

fn validate_schedule(value: &serde_json::Value) -> Result<()> {
    let schedule: ScheduleContract =
        serde_json::from_value(value.clone()).map_err(|_| Error::Protocol)?;
    let from = DateTime::parse_from_rfc3339(&schedule.valid_from).map_err(|_| Error::Protocol)?;
    let until = DateTime::parse_from_rfc3339(&schedule.valid_until).map_err(|_| Error::Protocol)?;
    if schedule.version != 1
        || schedule.timezone != "UTC"
        || until <= from
        || !(1..=256).contains(&schedule.series.len())
    {
        return Err(Error::Protocol);
    }
    let mut ids = HashSet::new();
    for series in &schedule.series {
        if series.id.trim().is_empty() || series.name.trim().is_empty() || !ids.insert(&series.id) {
            return Err(Error::Protocol);
        }
        let recurrence = &series.recurrence;
        match recurrence.kind.as_str() {
            "interval" if (1..=10080).contains(&recurrence.interval_minutes) => {}
            "weekly-slots"
                if !recurrence.days.is_empty()
                    && !recurrence.times_utc.is_empty()
                    && recurrence.days.iter().all(|day| {
                        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].contains(&day.as_str())
                    })
                    && recurrence
                        .times_utc
                        .iter()
                        .all(|time| NaiveTime::parse_from_str(time, "%H:%M").is_ok()) => {}
            _ => return Err(Error::Protocol),
        }
    }
    Ok(())
}

/// Portada de `RaceControl`: respaldo de solo lectura de las series diarias.
pub const RACECONTROL_URL: &str = "https://racecontrol.gg/";

/// Horario oficial y, solo si falta o está incompleto, el respaldo.
/// Si el oficial falla pero el respaldo llega, se devuelve el respaldo solo.
pub fn refresh(
    http: &Http,
    config: &BuildConfig,
    racecontrol: &Url,
    now: DateTime<Utc>,
) -> Result<(Option<String>, Option<String>)> {
    let official = current(http, config);
    let needs_backup = match &official {
        Ok(Some(schedule)) => incomplete(schedule),
        _ => true,
    };
    let backup = if needs_backup {
        crate::racecontrol::fetch(http, racecontrol, now)
            .ok()
            .flatten()
    } else {
        None
    };
    let (schedule, fallback) = match official {
        Ok(schedule) => (schedule, backup),
        Err(_) if backup.is_some() => (None, backup),
        Err(error) => return Err(error),
    };
    // Las respuestas escapadas también deben caber juntas en un frame IPC.
    let reply = crate::protocol::Reply::Calendar {
        schedule: schedule.clone(),
        fallback: fallback.clone(),
    };
    if serde_json::to_vec(&reply)
        .map_err(|_| Error::Protocol)?
        .len()
        > crate::protocol::MAX_FRAME - 1024
    {
        return Err(Error::TooLarge);
    }
    Ok((schedule, fallback))
}

/// Una serie sin horas (intervalo vacío o tandas sin días/horas) deja el horario incompleto.
fn incomplete(schedule: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(schedule) else {
        return true;
    };
    let Some(series) = value["series"].as_array() else {
        return true;
    };
    series.iter().any(|series| {
        let recurrence = &series["recurrence"];
        match recurrence["kind"].as_str() {
            Some("interval") => recurrence["intervalMinutes"]
                .as_i64()
                .is_none_or(|m| m <= 0),
            Some("weekly-slots") => {
                recurrence["days"].as_array().is_none_or(Vec::is_empty)
                    || recurrence["timesUTC"].as_array().is_none_or(Vec::is_empty)
            }
            _ => true,
        }
    })
}

pub fn current(http: &Http, config: &BuildConfig) -> Result<Option<String>> {
    let base = config.supabase.as_ref().ok_or(Error::Unconfigured)?;
    let anon = config
        .anon_key
        .filter(|key| !key.trim().is_empty())
        .ok_or(Error::Unconfigured)?;
    let url = base
        .join("rest/v1/rpc/race_schedule_current")
        .map_err(|_| Error::Unconfigured)?;
    // RPC pública de solo lectura; no requiere OAuth ni puente Clerk.
    let mut rows: Vec<Published> = http
        .post_json(&url, &serde_json::json!({}), Some(anon), Some(anon))?
        .success()?
        .json()?;
    if rows.len() > 1 {
        return Err(Error::Protocol);
    }
    let schedule = rows
        .pop()
        .map(|row| {
            validate_schedule(&row.schedule)?;
            serde_json::to_string(&row.schedule).map_err(|_| Error::Protocol)
        })
        .transpose()?;
    Ok(schedule)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_http::Server;

    #[test]
    fn shared_calendar_corpus_is_checked_before_ipc() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/calendar/cases.json"))
                .expect("corpus");
        let cases = cases.as_array().expect("casos");
        let replies = cases
            .iter()
            .map(|case| {
                (
                    200,
                    serde_json::json!([{"schedule": case["document"]}]).to_string(),
                )
            })
            .collect();
        let server = Server::start(replies);
        let mut config = BuildConfig::load();
        config.supabase = Some(server.base.clone());
        config.anon_key = Some("public-test-anon");
        let http = Http::default();
        let actual: Vec<bool> = cases
            .iter()
            .map(|_| current(&http, &config).is_ok())
            .collect();
        server.finish();
        let expected: Vec<bool> = cases
            .iter()
            .map(|case| case["valid"].as_bool().expect("veredicto"))
            .collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn real_published_calendar_passes_services_contract() {
        let document: serde_json::Value = serde_json::from_str(include_str!(
            "../../hub/reference/fixtures/calendar-lmu-2026-10-06.json"
        ))
        .expect("fixture real");
        assert_eq!(validate_schedule(&document), Ok(()));
    }
    #[test]
    fn public_rpc_handles_publication_empty_invalid_and_offline() {
        let server = Server::start(vec![
            (200, format!(r#"[{{"schedule":{COMPLETE}}}]"#)),
            (200, "[]".into()),
            (200, "[{}]".into()),
            (200, r#"[{"schedule":{}},{"schedule":{}}]"#.into()),
            (503, "{}".into()),
        ]);
        let mut config = BuildConfig::load();
        config.supabase = Some(server.base.clone());
        config.anon_key = Some("public-test-anon");
        let http = Http::default();
        assert!(current(&http, &config).expect("publicado").is_some());
        assert_eq!(current(&http, &config).expect("vacío"), None);
        assert_eq!(current(&http, &config), Err(Error::Protocol));
        assert_eq!(current(&http, &config), Err(Error::Protocol));
        assert_eq!(current(&http, &config), Err(Error::Offline));
        for _ in 0..5 {
            let request = server.requests.recv().expect("petición");
            assert!(request.starts_with("POST /rest/v1/rpc/race_schedule_current "));
            assert!(request.to_lowercase().contains("apikey: public-test-anon"));
            assert!(request.ends_with("{}"));
        }
        server.finish();
        config.anon_key = None;
        assert_eq!(current(&http, &config), Err(Error::Unconfigured));
    }

    const PAGE: &str = include_str!("testdata/racecontrol-daily.html");
    const COMPLETE: &str = r#"{"version":1,"timezone":"UTC","validFrom":"2026-10-01T00:00:00Z","validUntil":"2026-11-01T00:00:00Z","series":[{"id":"daily","name":"Daily","track":"Sebring","vehicleClass":"LMGT3","licenseLabel":"Bronze","recurrence":{"kind":"interval","intervalMinutes":15}},{"id":"weekly","name":"Weekly","track":"Spa","vehicleClass":"LMP2","licenseLabel":"Silver","recurrence":{"kind":"weekly-slots","days":["Tue"],"timesUTC":["20:00"]}}]}"#;
    const NO_HOURS: &str = r#"{"version":1,"timezone":"UTC","validFrom":"2026-10-01T00:00:00Z","validUntil":"2026-11-01T00:00:00Z","series":[{"id":"weekly","name":"Weekly","track":"Spa","vehicleClass":"LMP2","licenseLabel":"Silver","recurrence":{"kind":"weekly-slots","days":[],"timesUTC":[]}}]}"#;

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-14T17:55:00Z")
            .expect("hora")
            .with_timezone(&Utc)
    }

    #[test]
    fn schedules_without_hours_are_incomplete() {
        assert!(!incomplete(COMPLETE));
        assert!(incomplete(NO_HOURS));
        assert!(incomplete("no es json"));
    }

    #[test]
    fn backup_is_fetched_only_when_official_is_missing_or_incomplete() {
        let rpc = |schedule: &str| format!(r#"[{{"schedule":{schedule}}}]"#);
        // Oficial completo: una sola petición y sin respaldo.
        let server = Server::start(vec![(200, rpc(COMPLETE))]);
        let mut config = BuildConfig::load();
        config.supabase = Some(server.base.clone());
        config.anon_key = Some("public-test-anon");
        let http = Http::default();
        let (schedule, fallback) = refresh(&http, &config, &server.base, now()).expect("completo");
        assert!(schedule.is_some() && fallback.is_none());
        server.finish();
        // Oficial incompleto: se pide también la portada.
        let server = Server::start(vec![(200, rpc(NO_HOURS)), (200, PAGE.into())]);
        config.supabase = Some(server.base.clone());
        let (schedule, fallback) =
            refresh(&http, &config, &server.base, now()).expect("incompleto");
        assert!(schedule.is_none() && fallback.is_some_and(|f| f.contains("racecontrol")));
        server.finish();
        // Oficial caído y respaldo disponible: solo respaldo.
        let server = Server::start(vec![(503, "{}".into()), (200, PAGE.into())]);
        config.supabase = Some(server.base.clone());
        let (schedule, fallback) = refresh(&http, &config, &server.base, now()).expect("caído");
        assert!(schedule.is_none() && fallback.is_some());
        server.finish();
        // Las dos fuentes caídas: el error del oficial.
        let server = Server::start(vec![(503, "{}".into()), (503, "{}".into())]);
        config.supabase = Some(server.base.clone());
        assert_eq!(
            refresh(&http, &config, &server.base, now()),
            Err(Error::Offline)
        );
        server.finish();
    }
}
