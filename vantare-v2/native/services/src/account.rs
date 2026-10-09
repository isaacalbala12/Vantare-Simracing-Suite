//! Clerk OAuth nativo. Nunca se convierte un OAuth token en JWT de Supabase.
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::{Error, Result, http::Http, storage::Store};

fn fresh_generation() -> Result<u128> {
    let mut bytes = [0; 16];
    getrandom::fill(&mut bytes).map_err(|_| Error::Storage)?;
    Ok(u128::from_le_bytes(bytes))
}

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(transparent)]
pub struct Secret(String);

impl Secret {
    pub(crate) fn expose(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OAuth {
    issuer: Url,
    client_id: String,
    redirect: Url,
    authorization: Url,
    token: Url,
    userinfo: Url,
}

#[derive(Deserialize)]
struct Discovery {
    issuer: String,
    authorization_endpoint: Url,
    token_endpoint: Url,
    userinfo_endpoint: Url,
    code_challenge_methods_supported: Vec<String>,
}

impl OAuth {
    pub fn matches(&self, issuer: &Url, client_id: &str, redirect: &Url) -> bool {
        self.issuer == *issuer
            && self.client_id == client_id
            && self.redirect == *redirect
            && [&self.authorization, &self.token, &self.userinfo]
                .iter()
                .all(|url| {
                    url.origin() == issuer.origin()
                        && url.query().is_none()
                        && url.fragment().is_none()
                        && url.username().is_empty()
                        && url.password().is_none()
                })
    }
    pub fn discover(http: &Http, issuer: Url, client_id: String, redirect: Url) -> Result<Self> {
        if client_id.is_empty() || client_id.len() > 256 || issuer.query().is_some() {
            return Err(Error::Unconfigured);
        }
        let document: Discovery = http
            .get(
                &issuer
                    .join(".well-known/openid-configuration")
                    .map_err(|_| Error::Unconfigured)?,
                None,
                None,
            )?
            .success()?
            .json()?;
        if document.issuer.trim_end_matches('/') != issuer.as_str().trim_end_matches('/')
            || !document
                .code_challenge_methods_supported
                .iter()
                .any(|method| method == "S256")
        {
            return Err(Error::Protocol);
        }
        for endpoint in [
            &document.authorization_endpoint,
            &document.token_endpoint,
            &document.userinfo_endpoint,
        ] {
            if endpoint.origin() != issuer.origin()
                || endpoint.query().is_some()
                || endpoint.fragment().is_some()
                || !endpoint.username().is_empty()
                || endpoint.password().is_some()
            {
                return Err(Error::Protocol);
            }
        }
        if redirect.scheme() != "http"
            || redirect.host_str() != Some("127.0.0.1")
            || redirect.query().is_some()
            || redirect.fragment().is_some()
            || !redirect.username().is_empty()
            || redirect.password().is_some()
        {
            return Err(Error::Unconfigured);
        }
        Ok(Self {
            issuer,
            client_id,
            redirect,
            authorization: document.authorization_endpoint,
            token: document.token_endpoint,
            userinfo: document.userinfo_endpoint,
        })
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Identity {
    pub issuer: String,
    pub subject: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Session {
    identity: Identity,
    client_id: String,
    access: Secret,
    refresh: Secret,
    expires_at: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "state", deny_unknown_fields)]
enum Saved {
    SignedOut,
    SignedIn { version: u8, session: Session },
}

struct Attempt {
    socket: TcpListener,
    state: Secret,
    verifier: Secret,
    redirect: Url,
    deadline: Instant,
}

pub struct Account {
    oauth: OAuth,
    session: Option<Session>,
    profile: Option<crate::protocol::AccountProfile>,
    attempt: Option<Attempt>,
    generation: u128,
}

// Tickets carry secrets inside the service process, never over IPC or Debug.
pub struct Exchange {
    oauth: OAuth,
    generation: u128,
    grant: Grant,
    previous_identity: Option<Identity>,
}
enum Grant {
    Code {
        code: Secret,
        verifier: Secret,
        redirect: Url,
    },
    Refresh(Secret),
}
pub struct Completion {
    generation: u128,
    session: Session,
    profile: crate::protocol::AccountProfile,
}

impl Completion {
    pub(crate) fn identity(&self) -> &Identity {
        &self.session.identity
    }
}

#[derive(Deserialize)]
struct Tokens {
    access_token: Secret,
    refresh_token: Option<Secret>,
    token_type: String,
    expires_in: u64,
}
#[derive(Deserialize)]
struct UserInfo {
    sub: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    given_name: Option<String>,
    #[serde(default)]
    family_name: Option<String>,
    #[serde(default)]
    picture: Option<String>,
    #[serde(default)]
    image_url: Option<String>,
}

#[path = "account/profile.rs"]
mod profile;

impl Exchange {
    pub fn run(self, http: &Http, now: u64) -> Result<Completion> {
        let fields = match &self.grant {
            Grant::Code {
                code,
                verifier,
                redirect,
            } => vec![
                ("grant_type", "authorization_code"),
                ("client_id", &self.oauth.client_id),
                ("code", code.expose()),
                ("code_verifier", verifier.expose()),
                ("redirect_uri", redirect.as_str()),
            ],
            Grant::Refresh(refresh) => vec![
                ("grant_type", "refresh_token"),
                ("client_id", &self.oauth.client_id),
                ("refresh_token", refresh.expose()),
            ],
        };
        let tokens: Tokens = http
            .post_form(&self.oauth.token, &fields)?
            .success()?
            .json()?;
        if !tokens.token_type.eq_ignore_ascii_case("bearer")
            || tokens.expires_in == 0
            || tokens.expires_in > 7 * 86400
            || tokens.access_token.0.is_empty()
            || tokens.access_token.0.len() > 16 * 1024
        {
            return Err(Error::Protocol);
        }
        let info: UserInfo = http
            .get(
                &self.oauth.userinfo,
                Some(tokens.access_token.expose()),
                None,
            )?
            .success()?
            .json()?;
        if info.sub.is_empty() || info.sub.len() > 256 {
            return Err(Error::Authentication);
        }
        let identity = Identity {
            issuer: self.oauth.issuer.to_string(),
            subject: info.sub.clone(),
        };
        if self
            .previous_identity
            .as_ref()
            .is_some_and(|previous| previous != &identity)
        {
            return Err(Error::Authentication);
        }
        let refresh = match (tokens.refresh_token, &self.grant) {
            (Some(refresh), _) if !refresh.0.is_empty() && refresh.0.len() <= 16 * 1024 => refresh,
            (None, Grant::Refresh(refresh)) => refresh.clone(),
            _ => return Err(Error::Protocol),
        };
        let profile = info.profile(http);
        Ok(Completion {
            generation: self.generation,
            profile,
            session: Session {
                identity,
                client_id: self.oauth.client_id,
                access: tokens.access_token,
                refresh,
                expires_at: now.checked_add(tokens.expires_in).ok_or(Error::Clock)?,
            },
        })
    }
}

impl Account {
    pub fn restore(oauth: OAuth, store: &Store) -> Result<Self> {
        let session = match store.load_for_restore::<Saved>("account") {
            Ok(Some(Saved::SignedOut) | None) | Err(Error::NotFound) => None,
            Ok(Some(Saved::SignedIn {
                version: 1,
                session,
            })) if session.identity.issuer == oauth.issuer.as_str()
                && session.client_id == oauth.client_id =>
            {
                Some(session)
            }
            Ok(_) => {
                store.quarantine("account");
                None
            }
            Err(error) => return Err(error),
        };
        let profile = profile::restore(store, session.as_ref().map(|session| &session.identity));
        Ok(Self {
            oauth,
            session,
            profile,
            attempt: None,
            generation: fresh_generation()?,
        })
    }

    pub fn identity(&self) -> Option<&Identity> {
        self.session.as_ref().map(|session| &session.identity)
    }

    pub fn profile(&self) -> Option<&crate::protocol::AccountProfile> {
        self.profile.as_ref()
    }

    /// Acción explícita tras editar en el portal; no renueva la licencia.
    pub fn refresh_profile(&mut self, http: &Http, now: u64, store: &Store) -> Result<()> {
        let info: UserInfo = http
            .get(&self.oauth.userinfo, Some(self.bearer(now)?), None)?
            .success()?
            .json()?;
        let identity = self.identity().ok_or(Error::Authentication)?;
        if info.sub != identity.subject {
            return Err(Error::Authentication);
        }
        let profile = info.profile(http);
        profile::save(store, identity, &profile)?;
        self.profile = Some(profile);
        Ok(())
    }

    pub(crate) fn generation(&self) -> u128 {
        self.generation
    }
    pub fn expires_at(&self) -> Option<u64> {
        self.session.as_ref().map(|session| session.expires_at)
    }

    pub(crate) fn bearer(&self, now: u64) -> Result<&str> {
        let session = self.session.as_ref().ok_or(Error::Authentication)?;
        if now >= session.expires_at {
            return Err(Error::Expired);
        }
        Ok(session.access.expose())
    }

    pub fn authorized<T>(&self, now: u64, operation: impl FnOnce(&str) -> Result<T>) -> Result<T> {
        operation(self.bearer(now)?)
    }

    pub fn begin_login(&mut self) -> Result<Url> {
        // Un inicio explícito sustituye el anterior antes de reservar su puerto.
        self.cancel_login()?;
        let port = self
            .oauth
            .redirect
            .port_or_known_default()
            .ok_or(Error::Unconfigured)?;
        let socket = TcpListener::bind(("127.0.0.1", port)).map_err(|_| Error::Busy)?;
        socket.set_nonblocking(true).map_err(|_| Error::Protocol)?;
        let mut redirect = self.oauth.redirect.clone();
        redirect
            .set_port(Some(
                socket.local_addr().map_err(|_| Error::Protocol)?.port(),
            ))
            .map_err(|()| Error::Unconfigured)?;
        let state = Secret(crate::random_id()?);
        let verifier = Secret(crate::random_id()?);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.expose().as_bytes()));
        let mut url = self.oauth.authorization.clone();
        url.query_pairs_mut().extend_pairs([
            ("client_id", self.oauth.client_id.as_str()),
            ("response_type", "code"),
            ("scope", "openid profile offline_access"),
            ("redirect_uri", redirect.as_str()),
            ("state", state.expose()),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
        ]);
        self.attempt = Some(Attempt {
            socket,
            state,
            verifier,
            redirect,
            deadline: Instant::now() + Duration::from_mins(3),
        });
        Ok(url)
    }

    pub(crate) fn login_pending(&self) -> bool {
        self.attempt.is_some()
    }

    pub(crate) fn cancel_login(&mut self) -> Result<()> {
        self.attempt = None;
        self.generation = self.generation.checked_add(1).ok_or(Error::Protocol)?;
        Ok(())
    }

    pub fn poll_login(&mut self) -> Result<Option<Exchange>> {
        let attempt = self.attempt.as_ref().ok_or(Error::Canceled)?;
        if Instant::now() >= attempt.deadline {
            self.attempt = None;
            return Err(Error::Canceled);
        }
        let (mut socket, _) = match attempt.socket.accept() {
            Ok(pair) => pair,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => return Ok(None),
            Err(_) => return Err(Error::Protocol),
        };
        // Windows y macOS heredan el modo no bloqueante del listener: el navegador
        // conecta antes de enviar la petición y leer fallaría con WouldBlock.
        socket.set_nonblocking(false).map_err(|_| Error::Protocol)?;
        // One absolute deadline; a local slow sender cannot retain this worker.
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut bytes = Vec::new();
        while !bytes.ends_with(b"\r\n\r\n") {
            let remaining = deadline
                .checked_duration_since(Instant::now())
                .ok_or(Error::Protocol)?;
            socket
                .set_read_timeout(Some(remaining))
                .map_err(|_| Error::Protocol)?;
            let mut byte = [0];
            socket.read_exact(&mut byte).map_err(|_| Error::Protocol)?;
            bytes.push(byte[0]);
            if bytes.len() > 8192 {
                return Err(Error::TooLarge);
            }
        }
        let request = std::str::from_utf8(&bytes).map_err(|_| Error::Protocol);
        let code = request.and_then(|request| callback_code(request, attempt, &self.oauth.issuer));
        // El navegador siempre recibe una página; sin respuesta muestra ERR_EMPTY_RESPONSE.
        let (status, body) = match &code {
            Ok(_) => (
                "200 OK",
                "Sesión iniciada en Vantare. Puede cerrar esta ventana.",
            ),
            Err(_) => (
                "400 Bad Request",
                "Vantare no pudo completar el inicio de sesión. Vuelva a la aplicación e inténtelo de nuevo.",
            ),
        };
        let reply = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{body}",
            body.len()
        );
        socket
            .write_all(reply.as_bytes())
            .map_err(|_| Error::Protocol)?;
        let code = code?;
        let attempt = self.attempt.take().ok_or(Error::Canceled)?;
        Ok(Some(Exchange {
            oauth: self.oauth.clone(),
            generation: self.generation,
            grant: Grant::Code {
                code,
                verifier: attempt.verifier,
                redirect: attempt.redirect,
            },
            previous_identity: None,
        }))
    }

    pub fn refresh(&self) -> Result<Exchange> {
        let session = self.session.as_ref().ok_or(Error::Authentication)?;
        Ok(Exchange {
            oauth: self.oauth.clone(),
            generation: self.generation,
            grant: Grant::Refresh(session.refresh.clone()),
            previous_identity: Some(session.identity.clone()),
        })
    }

    pub fn complete(&mut self, completion: Completion, store: &Store) -> Result<()> {
        if completion.generation != self.generation {
            return Err(Error::Canceled);
        }
        profile::save(store, &completion.session.identity, &completion.profile)?;
        store.save(
            "account",
            &Saved::SignedIn {
                version: 1,
                session: completion.session,
            },
        )?;
        // Reload only protected data after successful atomic persistence.
        let Saved::SignedIn { session, .. } = store.load("account")? else {
            return Err(Error::Storage);
        };
        self.session = Some(session);
        self.profile = Some(completion.profile);
        self.generation = self.generation.checked_add(1).ok_or(Error::Protocol)?;
        Ok(())
    }

    pub fn logout(&mut self, store: &Store) -> Result<()> {
        self.cancel_login()?;
        self.session = None;
        self.profile = None;
        // Atomic tombstone survives a crash; no old refresh can restore the account.
        store.save("account", &Saved::SignedOut)?;
        store.remove("account-profile")
    }
}

/// Valida la petición del redirect y devuelve el código. Parámetros extra del
/// proveedor se ignoran; `iss` (RFC 9207), si llega, debe ser el issuer.
fn callback_code(request: &str, attempt: &Attempt, issuer: &Url) -> Result<Secret> {
    let line = request.lines().next().ok_or(Error::Protocol)?;
    let parts: Vec<_> = line.split_whitespace().collect();
    if parts.len() != 3
        || parts[0] != "GET"
        || !parts[1].starts_with('/')
        || parts[1].starts_with("//")
    {
        return Err(Error::Protocol);
    }
    let callback = attempt
        .redirect
        .join(parts[1])
        .map_err(|_| Error::Protocol)?;
    let mut state = None;
    let mut code = None;
    for (key, value) in callback.query_pairs() {
        match key.as_ref() {
            "state" if state.is_none() => state = Some(value.into_owned()),
            "code" if code.is_none() => code = Some(value.into_owned()),
            "state" | "code" | "error" => return Err(Error::Authentication),
            "iss" if value.trim_end_matches('/') != issuer.as_str().trim_end_matches('/') => {
                return Err(Error::Authentication);
            }
            _ => {}
        }
    }
    if callback.path() != attempt.redirect.path()
        || state.as_deref() != Some(attempt.state.expose())
    {
        return Err(Error::Authentication);
    }
    Ok(Secret(
        code.filter(|code| !code.is_empty() && code.len() <= 4096)
            .ok_or(Error::Authentication)?,
    ))
}

#[cfg(all(test, any(windows, unix)))]
mod tests;

#[cfg(all(test, any(windows, unix)))]
pub(crate) fn fixture(issuer: &Url, store: &Store) -> Account {
    let oauth = OAuth {
        authorization: issuer.join("authorize").expect("test"),
        token: issuer.join("token").expect("test"),
        userinfo: issuer.join("userinfo").expect("test"),
        issuer: issuer.clone(),
        client_id: "public-fixture".into(),
        redirect: Url::parse("http://127.0.0.1:0/callback").expect("test"),
    };
    store
        .save(
            "account",
            &Saved::SignedIn {
                version: 1,
                session: Session {
                    identity: Identity {
                        issuer: issuer.to_string(),
                        subject: "user_fixture".into(),
                    },
                    client_id: oauth.client_id.clone(),
                    access: Secret(crate::random_id().expect("test entropy")),
                    refresh: Secret(crate::random_id().expect("test entropy")),
                    expires_at: 1000,
                },
            },
        )
        .expect("fixture protected session");
    Account::restore(oauth, store).expect("fixture account")
}
