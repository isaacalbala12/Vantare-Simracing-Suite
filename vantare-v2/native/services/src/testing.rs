//! On-demand RPCs through the existing verified UUID bridge; no new auth path.
use crate::protocol::{Command, testing_document::Participation};
use crate::{Error, Result, bridge::DataRequest, license::uuid};

fn text(value: &str, max: usize, required: bool) -> bool {
    value.chars().count() <= max && !value.contains('\0') && (!required || !value.trim().is_empty())
}
pub(crate) fn validate(data: &Participation) -> Result<()> {
    if data.questionnaires.len() > 10 || data.contributions.len() > 20 {
        return Err(Error::TooLarge);
    }
    if serde_json::to_vec(data).map_err(|_| Error::Protocol)?.len() > 56 * 1024 {
        return Err(Error::TooLarge);
    }
    let mut ids = std::collections::HashSet::new();
    for q in &data.questionnaires {
        if !uuid(&q.id)
            || !ids.insert(&q.id)
            || !text(&q.version, 60, true)
            || !text(&q.title, 120, true)
            || !text(&q.question, 500, true)
            || !text(&q.note, 1000, false)
            || q.score.is_some_and(|score| !(1..=5).contains(&score))
        {
            return Err(Error::Protocol);
        }
    }
    ids.clear();
    for c in &data.contributions {
        if !uuid(&c.id)
            || !ids.insert(&c.id)
            || !text(&c.title, 120, true)
            || !text(&c.body, 1000, true)
            || !matches!(
                c.state.as_str(),
                "received" | "reviewing" | "accepted" | "declined"
            )
        {
            return Err(Error::Protocol);
        }
    }
    Ok(())
}
pub(crate) fn execute(
    request: &DataRequest<'_>,
    channel: &str,
    command: Command,
) -> Result<Participation> {
    match command {
        Command::TestingRefresh => {}
        Command::TestingAnswer { id, score, note } => {
            if !uuid(&id) || !(1..=5).contains(&score) || !text(&note, 1000, false) {
                return Err(Error::Protocol);
            }
            request
                .post(
                    "rest/v1/rpc/testing_answer_save",
                    &serde_json::json!({"p_id":id,"p_score":score,"p_note":note}),
                )?
                .success()?;
        }
        Command::TestingContribute { id, title, body } => {
            if !uuid(&id) || !text(&title, 120, true) || !text(&body, 1000, true) {
                return Err(Error::Protocol);
            }
            request.post("rest/v1/rpc/testing_contribution_submit", &serde_json::json!({"p_id":id,"p_channel":channel,"p_title":title,"p_body":body}))?.success()?;
        }
        _ => return Err(Error::Protocol),
    }
    let data: Participation = request
        .post(
            "rest/v1/rpc/testing_participation_current",
            &serde_json::json!({"p_channel":channel}),
        )?
        .success()?
        .json()?;
    validate(&data)?;
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn data() -> Participation {
        serde_json::from_value(serde_json::json!({"questionnaires":[{
            "id":"15350000-0000-0000-0000-000000000001","version":"1.2.3",
            "title":"Experiencia","question":"¿Cómo funciona?","score":null,"note":""
        }],"contributions":[]}))
        .expect("fixture")
    }
    #[test]
    fn invalid_remote_data_is_rejected_without_synthetic_rows() {
        let mut value = data();
        validate(&value).expect("real shape");
        value.questionnaires[0].score = Some(6);
        assert!(validate(&value).is_err());
        value.questionnaires[0].score = Some(1);
        value.questionnaires.push(value.questionnaires[0].clone());
        assert!(validate(&value).is_err());
        value.questionnaires.pop();
        value.questionnaires[0].note = "a".repeat(1001);
        assert!(validate(&value).is_err());
        validate(&Participation::default()).expect("empty remains empty");
    }

    #[cfg(windows)]
    #[test]
    fn answer_and_retry_use_verified_session_without_client_selected_identity() {
        use crate::{account, bridge::Config, http::Http, test_http::Server};
        let server = Server::start(vec![
            (200, serde_json::json!({"version":1,"account_id":"15350000-0000-0000-0000-000000000002","data_access_token":"data-fixture","expires_at":160}).to_string()),
            (200, "null".into()), (200, serde_json::to_string(&data()).expect("JSON")),
            (403, "{}".into()),
        ]);
        let (root, store) = crate::test_store("testing-participation");
        let account = account::fixture(&server.base, &store);
        let http = Http::default();
        let config = Config {
            authorize: server
                .base
                .join("functions/v1/native-account-authorize")
                .expect("URL"),
            supabase: server.base.clone(),
            anon_key: "public-fixture".into(),
        };
        let session = config
            .authorize(&http, &account, 100)
            .expect("verified UUID bridge");
        let request = session.request(&http, &config, &account, 100);
        let invalid = Command::TestingAnswer {
            id: data().questionnaires[0].id.clone(),
            score: 0,
            note: String::new(),
        };
        assert!(matches!(
            execute(&request, "testers", invalid),
            Err(Error::Protocol)
        ));
        let command = || Command::TestingAnswer {
            id: data().questionnaires[0].id.clone(),
            score: 5,
            note: "Mi experiencia".into(),
        };
        let result = execute(&request, "testers", command()).expect("saved and fetched");
        assert_eq!(result.questionnaires.len(), 1);
        assert!(matches!(
            execute(&request, "testers", command()),
            Err(Error::Denied)
        ));
        let expired = session.request(&http, &config, &account, 200);
        assert!(matches!(
            execute(&expired, "testers", command()),
            Err(Error::Authentication)
        ));
        let captured: Vec<_> = (0..4)
            .map(|_| {
                server
                    .requests
                    .recv_timeout(std::time::Duration::from_secs(3))
                    .expect("request")
            })
            .collect();
        assert!(captured[1].starts_with("POST /rest/v1/rpc/testing_answer_save "));
        assert!(captured[2].starts_with("POST /rest/v1/rpc/testing_participation_current "));
        assert!(
            captured[1]
                .to_lowercase()
                .contains("authorization: bearer data-fixture")
        );
        assert!(!captured[1].contains("account_id"));
        assert_eq!(
            captured[1].split("\r\n\r\n").nth(1),
            captured[3].split("\r\n\r\n").nth(1)
        );
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "testing-participation", &[]);
    }
}
