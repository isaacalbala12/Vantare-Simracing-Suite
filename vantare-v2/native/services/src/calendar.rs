//! Solo lectura del horario publicado. Validación de agenda y caché en el Hub.
use crate::{Error, Result, config::BuildConfig, http::Http};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use url::Url;

#[derive(Deserialize)]
struct Published {
    schedule: serde_json::Value,
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
        .map(|row| serde_json::to_string(&row.schedule).map_err(|_| Error::Protocol))
        .transpose()?;
    Ok(schedule)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_http::Server;
    #[test]
    fn public_rpc_handles_publication_empty_invalid_and_offline() {
        let server = Server::start(vec![
            (200, r#"[{"schedule":{"version":1}}]"#.into()),
            (200, "[]".into()),
            (200, "[{}]".into()),
            (200, r#"[{"schedule":{}},{"schedule":{}}]"#.into()),
            (503, "{}".into()),
        ]);
        let mut config = BuildConfig::load();
        config.supabase = Some(server.base.clone());
        config.anon_key = Some("public-test-anon");
        let http = Http::default();
        assert_eq!(
            current(&http, &config).expect("publicado"),
            Some(r#"{"version":1}"#.into())
        );
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
    const COMPLETE: &str = r#"{"version":1,"series":[{"recurrence":{"kind":"interval","intervalMinutes":15}},{"recurrence":{"kind":"weekly-slots","days":["tue"],"timesUTC":["20:00"]}}]}"#;
    const NO_HOURS: &str = r#"{"version":1,"series":[{"recurrence":{"kind":"weekly-slots","days":[],"timesUTC":[]}}]}"#;

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
        assert!(schedule.is_some() && fallback.is_some_and(|f| f.contains("racecontrol")));
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
