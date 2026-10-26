//! FAPI nativa efímera. La única sesión durable sigue siendo OAuth v1.
use super::{Account, Error, Exchange, Grant, Http, Identity, OAuth, Result, Secret, Url};
use crate::protocol::{EmailAction, EmailMode, EmailStage, Reply};
use serde::Deserialize;
use serde_json::Value;
use std::io::Write;

const DEVICE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";
const COOLDOWN: u64 = 30;

pub(super) struct Login {
    client: Option<Secret>,
    mode: EmailMode,
    id: String,
    email_id: Option<String>,
    stage: EmailStage,
    subject: Option<String>,
    session: Option<String>,
    sent_at: Option<u64>,
    expires_at: u64,
    blocked_until: u64,
    device_endpoint: Url,
    interval: u64,
    pending: Option<Pending>,
}

struct Pending {
    exchange: Exchange,
    deadline: u64,
    next: u64,
    interval: u64,
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

/// Solo etiquetas cerradas: nunca rutas con IDs, cuerpos ni texto remoto libre.
fn diagnostic(path: &str, response: &crate::http::Response) -> String {
    let stage = match path.rsplit('/').next().unwrap_or("") {
        "client" => "client",
        "sign_ins" => "sign_in",
        "sign_ups" => "sign_up",
        "prepare_first_factor" => "prepare_first_factor",
        "prepare_verification" => "prepare_verification",
        "attempt_first_factor" => "attempt_first_factor",
        "attempt_verification" => "attempt_verification",
        "reset_password" => "reset_password",
        "device" => "device_approval",
        _ => "unrecognized",
    };
    let body = response.json::<Value>().ok();
    let code = match body
        .as_ref()
        .and_then(|b| b.pointer("/errors/0/code"))
        .and_then(Value::as_str)
    {
        Some(
            code @ ("form_identifier_not_found"
            | "form_password_incorrect"
            | "form_code_incorrect"
            | "form_param_format_invalid"
            | "form_param_missing"
            | "form_password_pwned"
            | "form_password_length_too_short"
            | "verification_failed"
            | "verification_expired"
            | "captcha_invalid"
            | "captcha_missing_token"
            | "strategy_for_user_invalid"
            | "form_param_value_invalid"
            | "native_api_disabled"
            | "too_many_requests"),
        ) => code,
        None if (200..300).contains(&response.status) => "none",
        _ => "unrecognized",
    };
    format!(
        "account-email: stage={stage} status={} clerk_code={code}",
        response.status
    )
}

fn rejection(response: &crate::http::Response) -> Error {
    let body = response.json::<Value>().unwrap_or(Value::Null);
    let codes: Vec<_> = body
        .get("errors")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|error| error.get("code").and_then(Value::as_str))
        .collect();
    if codes.contains(&"form_identifier_not_found") {
        Error::NotFound
    } else if codes.contains(&"form_password_pwned") {
        Error::CompromisedPassword
    } else if codes.iter().any(|code| {
        code.contains("captcha")
            || code.contains("protect")
            || code.contains("strategy")
            || code.contains("not_allowed")
    }) {
        Error::Unsupported
    } else if codes
        .iter()
        .any(|code| code.starts_with("form_password_") && *code != "form_password_incorrect")
    {
        Error::WeakPassword
    } else if codes.iter().any(|code| {
        matches!(
            *code,
            "form_password_incorrect"
                | "form_code_incorrect"
                | "verification_failed"
                | "form_param_format_invalid"
        )
    }) {
        Error::InvalidCredential
    } else {
        Error::Denied
    }
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
        let _written = writeln!(std::io::stderr(), "{}", diagnostic(path, &response));
        if response.status == 429 {
            self.blocked_until =
                now.saturating_add(response.retry_after.unwrap_or(COOLDOWN).clamp(1, 600));
            return Err(Error::Busy);
        }
        if matches!(response.status, 400 | 422) {
            let error = rejection(&response);
            if error == Error::Unsupported {
                self.stage = EmailStage::HostedRequired;
            }
            return Err(error);
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
        incoming_id.clone_into(&mut self.id);
        let status = string(response, "status")?;
        let state = match status {
            "complete"
            | "needs_first_factor"
            | "needs_new_password"
            | "missing_requirements"
            | "needs_second_factor"
            | "needs_client_trust"
            | "needs_protect_check" => status,
            _ => "unrecognized",
        };
        let _written = writeln!(
            std::io::stderr(),
            "account-email: stage=observe state={state}"
        );
        match status {
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
                self.session = Some(session_id.to_owned());
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
                self.stage = EmailStage::NewPassword;
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
        struct Authorization {
            device_code: Secret,
            user_code: Secret,
            expires_in: u64,
            interval: u64,
        }
        // Bloqueo local por 429: no hay nada que autorizar todavía y cada clic
        // de «Autorizar» no debe enviar una petición evitable al endpoint.
        if now < self.blocked_until {
            return Err(Error::Busy);
        }
        let device: Authorization = http
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
        self.interval = device.interval;
        self.expires_at = self.expires_at.min(now.saturating_add(device.expires_in));
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
        let retry = self
            .email
            .as_ref()
            .map_or(self.email_block.saturating_sub(now), |login| {
                login
                    .blocked_until
                    .max(self.email_block)
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
                EmailStage::Authorizing => "Esperando la confirmación de Clerk. Puedes volver para cancelar.",
                EmailStage::HostedRequired => "Esta cuenta necesita completar un paso en el navegador",
            }.into(), |error| match error {
                Error::NotFound => "Esta cuenta no existe: crea una cuenta o revisa el email.".into(),
                Error::Denied | Error::Authentication => "El servicio de acceso rechazó la petición. Reintenta o continúa en el navegador.".into(),
                Error::InvalidCredential => "Revisa el email, la contraseña o el código. No se pudo verificar el acceso.".into(),
                Error::Busy => "Espera antes de volver a intentarlo.".into(),
                Error::Expired | Error::Canceled => "El código ha caducado o el acceso se reinició. Pide otro código para continuar.".into(),
                Error::Pending => "Clerk aún no ha confirmado la autorización. Espera unos segundos y pulsa «Autorizar» otra vez.".into(),
                Error::Storage => "No se pudo guardar la sesión. Vuelve a iniciar el acceso para continuar.".into(),
                Error::WeakPassword => "La contraseña es demasiado débil o corta. Elige una más larga y menos común.".into(),
                Error::CompromisedPassword => "Esta contraseña apareció en una filtración. Elige una contraseña diferente.".into(),
                Error::Unsupported | Error::Unconfigured => "Este acceso no está disponible aquí o necesita un paso adicional. Continúa en el navegador.".into(),
                _ => error.to_string(),
            }), error: error.map(|error| error.to_string()) }
    }
    pub(crate) fn email_pending(&self) -> bool {
        self.email.is_some()
    }

    /// Un solo intento por comando IPC. Entre intentos no se bloquea el
    /// servicio: puede atender Cancel/Logout. `now` es el reloj inyectado.
    pub(crate) fn exchange_email(
        &mut self,
        http: &Http,
        ticket: Option<Exchange>,
        now: u64,
    ) -> Result<Option<super::Completion>> {
        let Some(login) = self.email.as_mut() else {
            return Err(Error::Canceled);
        };
        if let Some(exchange) = ticket {
            login.pending = Some(Pending {
                exchange,
                deadline: now.saturating_add(30).min(login.expires_at),
                next: now,
                interval: login.interval,
            });
        }
        let Some(mut pending) = login.pending.take() else {
            return Ok(None);
        };
        if now > pending.deadline {
            login.stage = EmailStage::Consent;
            return Err(Error::Pending);
        }
        if now < pending.next {
            login.pending = Some(pending);
            return Ok(None);
        }
        match pending.exchange.attempt(http, now) {
            Err(error @ (Error::Pending | Error::Busy)) => {
                if error == Error::Busy {
                    pending.interval = pending.interval.saturating_add(5);
                }
                pending.next = now.saturating_add(pending.interval);
                if pending.next > pending.deadline {
                    login.stage = EmailStage::Consent;
                    return Err(Error::Pending);
                }
                login.stage = EmailStage::Authorizing;
                login.pending = Some(pending);
                Ok(None)
            }
            result => {
                login.stage = EmailStage::Consent;
                if result.is_ok() {
                    self.end_email_session(http);
                    // El canje consumió el intento y cerró FAPI. Si luego falla
                    // el guardado local, se empieza de nuevo desde el formulario.
                    self.email = None;
                }
                result.map(Some)
            }
        }
    }

    /// Cierra la sesión FAPI creada por el login (mejor esfuerzo): tras canjear
    /// el Device Grant o al cancelar/cerrar sesión no debe quedar como activa.
    pub(crate) fn end_email_session(&mut self, http: &Http) {
        let Some(login) = self.email.as_mut() else {
            return;
        };
        let (Some(client), Some(session)) = (login.client.as_ref(), login.session.take()) else {
            return;
        };
        let Ok(path) = id(&session).map(|session| format!("v1/client/sessions/{session}/end"))
        else {
            return;
        };
        if let Ok(url) = self.oauth.issuer.join(&path) {
            let _best_effort = http.native_form(&url, &[], Some(client.expose()));
        }
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
            || now < self.email_block
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
        self.end_email_session(http);
        self.cancel_login()?;
        let endpoint = device_endpoint(http, &self.oauth)?;
        self.email = Some(Login {
            client: None,
            mode,
            id: String::new(),
            email_id: None,
            stage: EmailStage::Form,
            subject: None,
            session: None,
            sent_at: None,
            expires_at: now.checked_add(600).ok_or(Error::Clock)?,
            blocked_until: 0,
            device_endpoint: endpoint,
            interval: 5,
            pending: None,
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
        self.sync_block();
        let result = self.email_step(http, action, now);
        self.sync_block();
        result
    }
    fn sync_block(&mut self) {
        if let Some(login) = &self.email {
            self.email_block = self.email_block.max(login.blocked_until);
        }
    }
    fn email_step(
        &mut self,
        http: &Http,
        action: EmailAction,
        now: u64,
    ) -> Result<Option<Exchange>> {
        if let EmailAction::Cancel {} = action {
            self.end_email_session(http);
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
            self.end_email_session(http);
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
            EmailAction::Resend {} if login.stage == EmailStage::Code => {
                if login
                    .sent_at
                    .is_some_and(|sent| now < sent.saturating_add(COOLDOWN))
                {
                    return Err(Error::Busy);
                }
                login.prepare(http, &self.oauth.issuer, now)?;
            }
            EmailAction::Finish {} if login.stage == EmailStage::Consent => {
                let device_code = login.device_grant(http, &self.oauth, now)?;
                let expected = Identity {
                    issuer: self.oauth.issuer.to_string(),
                    subject: login.subject.clone().ok_or(Error::Authentication)?,
                };
                // La aprobación es explícita; AccountPoll continuará el mismo
                // grant si Clerk todavía no tiene lista la autorización.
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
