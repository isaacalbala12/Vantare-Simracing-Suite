//! Marketing: OAuth actual y ACK remoto; nunca se guarda en privacy.json.
use super::{App, Command, Error, Reply, Result, now};
use crate::http::Http;
use serde::Deserialize;
use url::Url;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Ack {
    version: u32,
    ok: bool,
    consent: bool,
    locale: Option<String>,
    revision: u64,
}

fn execute(http: &Http, base: &Url, token: &str, command: &Command) -> Result<Reply> {
    let body = match command {
        Command::MailConsentGet => serde_json::json!({"version":1,"action":"get"}),
        Command::MailConsentSet { consent, source } => {
            serde_json::json!({"version":1,"action":"set","consent":consent,"locale":"es","source":source})
        }
        _ => return Err(Error::Protocol),
    };
    let response = http.post_json(
        &base
            .join("functions/v1/native-mail-consent")
            .map_err(|_| Error::Unconfigured)?,
        &body,
        Some(token),
        None,
    )?;
    match response.status {
        403 => {
            let body: serde_json::Value = response.json()?;
            return Err(
                if body.get("error").and_then(serde_json::Value::as_str)
                    == Some("verified_email_required")
                {
                    Error::MailVerificationRequired
                } else {
                    Error::Denied
                },
            );
        }
        409 => return Err(Error::MailErasurePending),
        429 => return Err(Error::RateLimited),
        _ => {}
    }
    let ack: Ack = response.success()?.json()?;
    if ack.version != 1
        || !ack.ok
        || ack
            .locale
            .as_deref()
            .is_some_and(|l| !["es", "en", "it", "pt-BR"].contains(&l))
        || matches!(command, Command::MailConsentSet { consent, .. } if *consent != ack.consent)
    {
        return Err(Error::Protocol);
    }
    Ok(Reply::MailConsent {
        consent: ack.consent,
        locale: ack.locale,
        revision: ack.revision,
    })
}
impl App {
    pub(super) fn mail_reply(&mut self, command: &Command) -> Result<Reply> {
        let time = now()?;
        self.ensure_oauth(time)?;
        let result = self
            .account
            .as_ref()
            .ok_or(Error::Authentication)?
            .authorized(time, |token| {
                execute(
                    &self.http,
                    self.config.supabase.as_ref().ok_or(Error::Unconfigured)?,
                    token,
                    command,
                )
            });
        if matches!(result, Err(Error::Authentication)) {
            return self.logout_reply();
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{protocol::MailSource, test_http::Server};
    #[test]
    fn restored_oauth_is_refreshed_and_401_clears_the_session_after_core_ack() {
        use crate::app::tests::{CoreStep, core_fixture};
        use crate::config::{BuildConfig, OAuthBuild};
        let server = Server::start(vec![
            (200, serde_json::json!({"access_token":"rotated-mail-test","refresh_token":"refresh-mail-test","token_type":"Bearer","expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
            (401, "{}".into()),
        ]);
        let (root, store) = crate::test_store("mail-oauth");
        let account = crate::account::fixture(&server.base, &store);
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: None,
            license_keys: None,
            channel: None,
            native_oauth: Some(OAuthBuild {
                issuer: server.base.clone(),
                client_id: "public-fixture".into(),
                redirect_uri: Url::parse("http://127.0.0.1:0/callback").unwrap(),
            }),
        };
        let mut app = App::new(config, root.clone());
        app.account = Some(account);
        app.store = Some(store);
        let (link, core) = core_fixture("mail-test".into(), "", vec![CoreStep::Invalidate]);
        app.attach_core(link);
        assert!(matches!(
            app.handle(Command::MailConsentGet),
            Reply::Account {
                signed_in: false,
                pending: false,
                ..
            }
        ));
        assert!(app.account.as_ref().unwrap().identity().is_none());
        let requests: Vec<_> = (0..3).map(|_| server.requests.recv().unwrap()).collect();
        assert!(requests[0].starts_with("POST /token "));
        assert!(requests[2].starts_with("POST /functions/v1/native-mail-consent "));
        assert!(
            requests[2]
                .to_lowercase()
                .contains("authorization: bearer rotated-mail-test")
        );
        server.finish();
        core.join().unwrap();
        drop(app);
        crate::cleanup_store(&root, "mail-oauth", &[]);
    }
    #[test]
    fn verified_endpoint_receives_only_choice_locale_source_and_current_bearer() {
        let server = Server::start(vec![
            (
                200,
                r#"{"version":1,"ok":true,"consent":true,"locale":"es","revision":9}"#.into(),
            ),
            (
                200,
                r#"{"version":1,"ok":true,"consent":false,"locale":null,"revision":0}"#.into(),
            ),
        ]);
        let http = Http::default();
        assert!(matches!(
            execute(
                &http,
                &server.base,
                "current-oauth-test",
                &Command::MailConsentSet {
                    consent: true,
                    source: MailSource::Onboarding
                }
            ),
            Ok(Reply::MailConsent {
                consent: true,
                revision: 9,
                ..
            })
        ));
        assert!(matches!(
            execute(
                &http,
                &server.base,
                "current-oauth-test",
                &Command::MailConsentGet
            ),
            Ok(Reply::MailConsent {
                consent: false,
                revision: 0,
                ..
            })
        ));
        let set = server.requests.recv().unwrap();
        assert!(set.starts_with("POST /functions/v1/native-mail-consent "));
        assert!(
            set.to_lowercase()
                .contains("authorization: bearer current-oauth-test")
        );
        let body: serde_json::Value =
            serde_json::from_str(set.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(
            body,
            serde_json::json!({"version":1,"action":"set","consent":true,"locale":"es","source":"onboarding"})
        );
        let get = server.requests.recv().unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(get.split("\r\n\r\n").nth(1).unwrap())
                .unwrap(),
            serde_json::json!({"version":1,"action":"get"})
        );
        server.finish();
    }
    #[test]
    fn errors_and_invalid_ack_never_confirm_or_retry_a_choice() {
        for (status, body, expected) in [
            (401, "{}", Error::Authentication),
            (
                403,
                r#"{"error":"verified_email_required"}"#,
                Error::MailVerificationRequired,
            ),
            (403, "{}", Error::Denied),
            (409, "{}", Error::MailErasurePending),
            (429, "{}", Error::RateLimited),
            (503, "{}", Error::Offline),
            (
                200,
                r#"{"version":1,"ok":true,"consent":false,"locale":"es","revision":1}"#,
                Error::Protocol,
            ),
        ] {
            let server = Server::start(vec![(status, body.into())]);
            assert!(
                matches!(execute(&Http::default(), &server.base, "test", &Command::MailConsentSet { consent:true, source:MailSource::Settings }), Err(error) if error == expected)
            );
            server.requests.recv().unwrap();
            assert!(server.requests.try_recv().is_err());
            server.finish();
        }
    }
}
