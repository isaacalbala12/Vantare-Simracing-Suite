//! Solo lectura del horario publicado. Validación de agenda y caché en el Hub.
use crate::{Error, Result, config::BuildConfig, http::Http};
use serde::Deserialize;

#[derive(Deserialize)]
struct Published {
    schedule: serde_json::Value,
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
    // La respuesta escapada también debe caber junto a version y sequence en IPC.
    let reply = crate::protocol::Reply::Calendar {
        schedule: schedule.clone(),
    };
    if serde_json::to_vec(&reply)
        .map_err(|_| Error::Protocol)?
        .len()
        > crate::protocol::MAX_FRAME - 1024
    {
        return Err(Error::TooLarge);
    }
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
}
