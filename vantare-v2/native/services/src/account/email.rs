//! FAPI nativa efímera. La única sesión durable sigue siendo OAuth v1.
use super::*;
use crate::protocol::{EmailAction, EmailMode, EmailStage, Reply};
use serde_json::Value;

const DEVICE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";
const COOLDOWN: u64 = 30;

pub(super) struct Login {
    client: Option<Secret>,
    mode: EmailMode,
    id: String,
    email_id: Option<String>,
    stage: EmailStage,
    subject: Option<String>,
    sent_at: Option<u64>,
    expires_at: u64,
    blocked_until: u64,
    device_endpoint: Url,
}
fn id(value: &str) -> Result<&str> {
    if value.is_empty()
        || value.len() > 256
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        return Err(Error::Protocol);
    }
    Ok(value)
}
fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or(Error::Protocol)
}
fn password(value: &str) -> Result<()> {
    if value.is_empty() || value.len() > 1024 || value.contains('\0') {
        return Err(Error::InvalidCredential);
    }
    Ok(())
}
fn device_endpoint(http: &Http, oauth: &OAuth) -> Result<Url> {
    #[derive(Deserialize)]
    struct Metadata {
        issuer: String,
        device_authorization_endpoint: Option<Url>,
        #[serde(default)]
        grant_types_supported: Vec<String>,
    }
    let metadata: Metadata = http
        .get(
            &oauth
                .issuer
                .join(".well-known/openid-configuration")
                .map_err(|_| Error::Unconfigured)?,
            None,
            None,
        )?
        .success()?
        .json()?;
    let endpoint = metadata
        .device_authorization_endpoint
        .ok_or(Error::Unconfigured)?;
    if metadata.issuer.trim_end_matches('/') != oauth.issuer.as_str().trim_end_matches('/')
        || !metadata
            .grant_types_supported
            .iter()
            .any(|g| g == DEVICE_GRANT)
        || endpoint.origin() != oauth.issuer.origin()
        || endpoint.path() != "/oauth/device_authorization"
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
    {
        return Err(Error::Unconfigured);
    }
    Ok(endpoint)
}
impl Login {
    fn signup(&self) -> bool {
        matches!(self.mode, EmailMode::SignUpCode | EmailMode::SignUpPassword)
    }
    fn strategy(&self) -> &'static str {
        if self.mode == EmailMode::Recovery {
            "reset_password_email_code"
        } else {
            "email_code"
        }
    }
    fn path(&self, suffix: &str) -> Result<String> {
        Ok(format!(
            "v1/client/{}/{}/{}",
            if self.signup() {
                "sign_ups"
            } else {
                "sign_ins"
            },
            id(&self.id)?,
            suffix
        ))
    }
    fn request(
        &mut self,
        http: &Http,
        issuer: &Url,
        path: &str,
        fields: &[(&str, &str)],
        now: u64,
    ) -> Result<Value> {
        if now >= self.expires_at {
            return Err(Error::Expired);
        }
        if now < self.blocked_until {
            return Err(Error::Busy);
        }
        let mut response = http.native_form(
            &issuer.join(path).map_err(|_| Error::Protocol)?,
            fields,
            self.client.as_ref().map(Secret::expose),
        )?;
        if let Some(token) = response.client_token.take() {
            // Native response Authorization contains the client JWT, without a Bearer prefix.
            let token = token
                .expose()
                .strip_prefix("Bearer ")
                .unwrap_or(token.expose())
                .to_owned();
            if token.is_empty()
                || token.len() > 16 * 1024
                || token.bytes().any(|b| b.is_ascii_whitespace())
            {
                return Err(Error::Protocol);
            }
            self.client = Some(Secret(token));
        }
        if response.status == 429 {
            self.blocked_until =
                now.saturating_add(response.retry_after.unwrap_or(COOLDOWN).clamp(1, 600));
            return Err(Error::Busy);
        }
        if matches!(response.status, 400 | 422) {
            let errors = response.json::<Value>().ok();
            let codes = errors
                .as_ref()
                .and_then(|e| e.get("errors"))
                .and_then(Value::as_array);
            if codes.is_some_and(|errors| {
                errors.iter().any(|error| {
                    error
                        .get("code")
                        .and_then(Value::as_str)
                        .is_some_and(|code| {
                            code.contains("captcha")
                                || code.contains("protect")
                                || code.contains("strategy")
                                || code.contains("not_allowed")
                        })
                })
            }) {
                self.stage = EmailStage::HostedRequired;
                return Err(Error::Unsupported);
            }
            return Err(Error::InvalidCredential);
        }
        let value: Value = response.success()?.json()?;
        if self.client.is_none() {
            return Err(Error::Protocol);
        }
        Ok(value)
    }
    fn observe(&mut self, value: &Value) -> Result<()> {
        let response = value.get("response").ok_or(Error::Protocol)?;
        let incoming_id = id(string(response, "id")?)?;
        if !self.id.is_empty() && incoming_id != self.id {
            return Err(Error::Protocol);
        }
        self.id = incoming_id.to_owned();
        match string(response, "status")? {
            "complete" => {
                let session_id = id(string(response, "created_session_id")?)?;
                let sessions = value
                    .pointer("/client/sessions")
                    .and_then(Value::as_array)
                    .ok_or(Error::Protocol)?;
                let session = sessions
                    .iter()
                    .find(|s| s.get("id").and_then(Value::as_str) == Some(session_id))
                    .ok_or(Error::Protocol)?;
                if session.get("status").and_then(Value::as_str) != Some("active") {
                    self.stage = EmailStage::HostedRequired;
                    return Err(Error::Unsupported);
                }
                // pending session tasks must be completed before authorizing OAuth.
                if session
                    .get("tasks")
                    .is_some_and(|tasks| !tasks.as_array().is_some_and(Vec::is_empty))
                {
                    self.stage = EmailStage::HostedRequired;
                    return Err(Error::Unsupported);
                }
                self.subject = Some(
                    id(session
                        .pointer("/user/id")
                        .and_then(Value::as_str)
                        .ok_or(Error::Protocol)?)?
                    .to_owned(),
                );
                self.stage = EmailStage::Consent;
            }
            "needs_new_password" if self.mode == EmailMode::Recovery => {
                self.stage = EmailStage::NewPassword
            }
            "needs_first_factor" if !self.signup() => {
                let strategy = self.strategy();
                self.email_id = response
                    .get("supported_first_factors")
                    .and_then(Value::as_array)
                    .and_then(|factors| {
                        factors
                            .iter()
                            .find(|f| f.get("strategy").and_then(Value::as_str) == Some(strategy))
                    })
                    .and_then(|factor| factor.get("email_address_id"))
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                self.stage = EmailStage::Code;
            }
            "missing_requirements" if self.signup() => {
                if !response
                    .get("missing_fields")
                    .and_then(Value::as_array)
                    .is_some_and(Vec::is_empty)
                    || !response
                        .get("unverified_fields")
                        .and_then(Value::as_array)
                        .is_some_and(|fields| {
                            fields.len() == 1 && fields[0].as_str() == Some("email_address")
                        })
                {
                    self.stage = EmailStage::HostedRequired;
                    return Err(Error::Unsupported);
                }
                self.stage = EmailStage::Code;
            }
            _ => {
                self.stage = EmailStage::HostedRequired;
                return Err(Error::Unsupported);
            }
        }
        Ok(())
    }
    fn device_grant(&mut self, http: &Http, oauth: &OAuth, now: u64) -> Result<Secret> {
        // Only the code created here can be approved. No IPC user_code field.
        #[derive(Deserialize)]
        struct Device {
            device_code: Secret,
            user_code: Secret,
            expires_in: u64,
            interval: u64,
        }
        let device: Device = http
            .post_form(
                &self.device_endpoint,
                &[
                    ("client_id", &oauth.client_id),
                    ("scope", "openid profile offline_access"),
                ],
            )?
            .success()?
            .json()?;
        if device.expires_in == 0
            || device.expires_in > 3600
            || device.interval == 0
            || device.interval > 60
            || device.device_code.expose().is_empty()
            || device.device_code.expose().len() > 4096
            || device.user_code.expose().is_empty()
            || device.user_code.expose().len() > 256
        {
            return Err(Error::Protocol);
        }
        self.request(
            http,
            &oauth.issuer,
            "v1/me/oauth/device",
            &[
                ("user_code", device.user_code.expose()),
                ("approved", "true"),
            ],
            now,
        )?;
        Ok(device.device_code)
    }
    fn prepare(&mut self, http: &Http, issuer: &Url, now: u64) -> Result<()> {
        let path = self.path(if self.signup() {
            "prepare_verification"
        } else {
            "prepare_first_factor"
        })?;
        let email_id = self.email_id.clone();
        let mut fields = vec![("strategy", self.strategy())];
        if !self.signup() {
            fields.push((
                "email_address_id",
                id(email_id.as_deref().ok_or(Error::Unsupported)?)?,
            ));
        }
        let value = self.request(http, issuer, &path, &fields, now)?;
        self.observe(&value)?;
        if self.stage != EmailStage::Code {
            return Err(Error::Protocol);
        }
        self.sent_at = Some(now);
        Ok(())
    }
}

impl Account {
    pub(crate) fn email_reply(&self, now: u64, error: Option<Error>) -> Reply {
        let stage = if matches!(error, Some(Error::Unconfigured | Error::Unsupported)) {
            EmailStage::HostedRequired
        } else {
            self.email
                .as_ref()
                .map_or(EmailStage::Form, |login| login.stage)
        };
        let retry = self.email.as_ref().map_or(0, |login| {
            login
                .blocked_until
                .max(
                    login
                        .sent_at
                        .map_or(0, |sent| sent.saturating_add(COOLDOWN)),
                )
                .saturating_sub(now)
        });
        Reply::Email { stage, retry_after_seconds: retry,
            message: error.map_or_else(|| match stage {
                EmailStage::Form => "Introduce tu email",
                EmailStage::Code => "Introduce el código enviado a tu email",
                EmailStage::NewPassword => "Elige una contraseña nueva",
                EmailStage::Consent => "Autoriza el acceso de Vantare a tu identidad y perfil",
                EmailStage::HostedRequired => "Esta cuenta necesita completar un paso en el navegador",
            }.into(), |error| match error {
                Error::InvalidCredential => "Revisa el email, la contraseña o el código. No se pudo verificar el acceso.".into(),
                Error::Busy => "Espera antes de volver a intentarlo.".into(),
                Error::Unsupported | Error::Unconfigured => "Este acceso no está disponible aquí o necesita un paso adicional. Continúa en el navegador.".into(),
                _ => error.to_string(),
            }), error: error.map(|error| error.to_string()) }
    }
    pub(crate) fn email_pending(&self) -> bool {
        self.email.is_some()
    }

    fn begin_email(
        &mut self,
        http: &Http,
        mode: EmailMode,
        email: &str,
        input: &str,
        now: u64,
    ) -> Result<()> {
        if self
            .email
            .as_ref()
            .is_some_and(|login| now < login.blocked_until)
        {
            return Err(Error::Busy);
        }
        let email = email.trim();
        if email.len() > 254
            || !email.contains('@')
            || email
                .bytes()
                .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
        {
            return Err(Error::InvalidCredential);
        }
        if matches!(mode, EmailMode::SignInPassword | EmailMode::SignUpPassword) {
            password(input)?;
        }
        self.cancel_login()?;
        let endpoint = device_endpoint(http, &self.oauth)?;
        self.email = Some(Login {
            client: None,
            mode,
            id: String::new(),
            email_id: None,
            stage: EmailStage::Form,
            subject: None,
            sent_at: None,
            expires_at: now.checked_add(600).ok_or(Error::Clock)?,
            blocked_until: 0,
            device_endpoint: endpoint,
        });
        let login = self.email.as_mut().ok_or(Error::Protocol)?;
        login.request(http, &self.oauth.issuer, "v1/client", &[], now)?;
        let mut fields = vec![(
            if login.signup() {
                "email_address"
            } else {
                "identifier"
            },
            email,
        )];
        if matches!(mode, EmailMode::SignInPassword | EmailMode::SignUpPassword) {
            fields.push(("password", input));
            if !login.signup() {
                fields.push(("strategy", "password"));
            }
        }
        let value = login.request(
            http,
            &self.oauth.issuer,
            if login.signup() {
                "v1/client/sign_ups"
            } else {
                "v1/client/sign_ins"
            },
            &fields,
            now,
        )?;
        login.observe(&value)?;
        if login.stage == EmailStage::Code {
            if mode == EmailMode::SignInPassword {
                login.stage = EmailStage::HostedRequired;
                return Err(Error::Unsupported);
            }
            login.prepare(http, &self.oauth.issuer, now)?;
        }
        Ok(())
    }

    pub(crate) fn email_action(
        &mut self,
        http: &Http,
        action: EmailAction,
        now: u64,
    ) -> Result<Option<Exchange>> {
        if let EmailAction::Cancel = action {
            self.cancel_login()?;
            return Ok(None);
        }
        if let EmailAction::Begin {
            mode,
            email,
            password: input,
        } = action
        {
            let input = Secret(input);
            self.begin_email(http, mode, &email, input.expose(), now)?;
            return Ok(None);
        }
        let login = self.email.as_mut().ok_or(Error::Canceled)?;
        if now >= login.expires_at {
            self.cancel_login()?;
            return Err(Error::Expired);
        }
        match action {
            EmailAction::Verify { code } if login.stage == EmailStage::Code => {
                let code = Secret(code);
                if code.expose().len() != 6 || !code.expose().bytes().all(|b| b.is_ascii_digit()) {
                    return Err(Error::InvalidCredential);
                }
                let value = login.request(
                    http,
                    &self.oauth.issuer,
                    &login.path(if login.signup() {
                        "attempt_verification"
                    } else {
                        "attempt_first_factor"
                    })?,
                    &[("strategy", login.strategy()), ("code", code.expose())],
                    now,
                )?;
                login.observe(&value)?;
            }
            EmailAction::Reset {
                password: input,
                sign_out_of_other_sessions,
            } if login.stage == EmailStage::NewPassword => {
                let input = Secret(input);
                password(input.expose())?;
                let value = login.request(
                    http,
                    &self.oauth.issuer,
                    &login.path("reset_password")?,
                    &[
                        ("password", input.expose()),
                        (
                            "sign_out_of_other_sessions",
                            if sign_out_of_other_sessions {
                                "true"
                            } else {
                                "false"
                            },
                        ),
                    ],
                    now,
                )?;
                login.observe(&value)?;
            }
            EmailAction::Resend if login.stage == EmailStage::Code => {
                if login
                    .sent_at
                    .is_some_and(|sent| now < sent.saturating_add(COOLDOWN))
                {
                    return Err(Error::Busy);
                }
                login.prepare(http, &self.oauth.issuer, now)?;
            }
            EmailAction::Finish if login.stage == EmailStage::Consent => {
                let device_code = login.device_grant(http, &self.oauth, now)?;
                let expected = Identity {
                    issuer: self.oauth.issuer.to_string(),
                    subject: login.subject.clone().ok_or(Error::Authentication)?,
                };
                // A single first token request after synchronous approval, no polling loop.
                return Ok(Some(Exchange {
                    oauth: self.oauth.clone(),
                    generation: self.generation,
                    grant: Grant::Device(device_code),
                    previous_identity: Some(expected),
                }));
            }
            _ => return Err(Error::Protocol),
        }
        Ok(None)
    }
}

#[cfg(test)]
mod tests;
