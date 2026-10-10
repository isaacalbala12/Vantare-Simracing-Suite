//! Un hilo propietario de Account/Store: GPUI nunca bloquea en red ni PKCE.
use crate::client::{Action, Client, Report, field};
use std::{
    path::PathBuf,
    sync::mpsc,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use vantare_services::{
    Error, Result,
    account::{Account, OAuth},
    config::BuildConfig,
    http::Http,
    storage::Store,
};

pub enum Command {
    Restore,
    Login,
    Logout,
    Call(Action),
    Timing(&'static str, u128),
    Prefetch(Action),
}
pub enum Reply {
    Ready,
    OpenBrowser(String),
    LoggedOut,
    Data(Action, serde_json::Value, Vec<Result<Vec<u8>>>),
    Failed(Error),
    Prefetched(Action, Result<serde_json::Value>),
}
pub struct Worker {
    pub send: mpsc::Sender<Command>,
    pub receive: mpsc::Receiver<Reply>,
}
impl Worker {
    pub fn start(root: PathBuf) -> Result<Self> {
        let (send, commands) = mpsc::channel();
        let (replies, receive) = mpsc::channel();
        thread::Builder::new()
            .name("vantare-admin-services".into())
            .spawn(move || {
                let mut session: Option<Session> = None;
                loop {
                    let command = if session.as_ref().is_some_and(|s| s.pending) {
                        commands.recv_timeout(Duration::from_millis(100))
                    } else {
                        commands
                            .recv()
                            .map_err(|_| mpsc::RecvTimeoutError::Disconnected)
                    };
                    match command {
                        Ok(command) => {
                            if let Command::Timing(label, elapsed) = command {
                                crate::diagnostics::record(label, elapsed, "ui");
                                continue;
                            }
                            let label = match &command {
                                Command::Restore => "restore",
                                Command::Login => "login",
                                Command::Logout => "logout",
                                Command::Call(action) | Command::Prefetch(action) => action.label(),
                                Command::Timing(..) => "timing",
                            };
                            let started = Instant::now();
                            let result = (|| {
                                if session.is_none() {
                                    session = Some(Session::open(&root)?);
                                }
                                session
                                    .as_mut()
                                    .ok_or(Error::Authentication)?
                                    .handle(command)
                            })();
                            crate::diagnostics::record(
                                label,
                                started.elapsed().as_micros(),
                                match &result {
                                    Ok(Reply::Prefetched(_, Err(_))) | Err(_) => "error",
                                    _ => "ok",
                                },
                            );
                            if replies.send(result.unwrap_or_else(Reply::Failed)).is_err() {
                                break;
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    if let Some(session) = session.as_mut()
                        && session.pending
                    {
                        match session.poll() {
                            Ok(Some(reply)) => {
                                if replies.send(reply).is_err() {
                                    break;
                                }
                            }
                            Ok(None) => {}
                            Err(error) => {
                                session.pending = false;
                                if replies.send(Reply::Failed(error)).is_err() {
                                    break;
                                }
                            }
                        }
                    }
                }
            })
            .map_err(|_| Error::Offline)?;
        Ok(Self { send, receive })
    }
}
struct Session {
    account: Account,
    store: Store,
    http: Http,
    client: Client,
    pending: bool,
}
impl Session {
    fn open(root: &std::path::Path) -> Result<Self> {
        let client = Client::from_build()?;
        let config = BuildConfig::load();
        let oauth_config = config.native_oauth.ok_or(Error::Unconfigured)?;
        // Misma carpeta y binding que App::ensure_account, no una segunda sesión.
        let context = format!(
            "v1|{}|{}|{}|{}",
            oauth_config.issuer,
            oauth_config.client_id,
            config.channel.unwrap_or("unknown"),
            config.supabase.as_ref().map_or("", url::Url::as_str)
        );
        let store = Store::open(root, &context)?;
        let http = Http::default();
        let oauth = load_oauth(&store, &http, oauth_config)?;
        Ok(Self {
            account: Account::restore(oauth, &store)?,
            store,
            http,
            client,
            pending: false,
        })
    }
    fn refresh(&mut self) -> Result<()> {
        let time = now()?;
        if self
            .account
            .expires_at()
            .is_some_and(|expiry| expiry <= time.saturating_add(60))
        {
            self.account.complete(
                self.account.refresh()?.run(&self.http, now()?)?,
                &self.store,
            )?;
        }
        Ok(())
    }
    fn handle(&mut self, command: Command) -> Result<Reply> {
        match command {
            Command::Timing(..) => Err(Error::Protocol),
            Command::Prefetch(action) => {
                let result = self
                    .refresh()
                    .and_then(|()| self.client.call(&self.account, now()?, &action));
                Ok(Reply::Prefetched(action, result))
            }
            Command::Login => {
                let url = self.account.begin_login()?;
                self.pending = true;
                Ok(Reply::OpenBrowser(url.to_string()))
            }
            Command::Logout => {
                self.pending = false;
                self.account.logout(&self.store)?;
                Ok(Reply::LoggedOut)
            }
            Command::Restore => {
                self.refresh()?;
                if self.account.identity().is_some() {
                    Ok(Reply::Ready)
                } else {
                    Ok(Reply::LoggedOut)
                }
            }
            Command::Call(action) => {
                self.refresh()?;
                let response = self.client.call(&self.account, now()?, &action)?;
                let mut screenshots = vec![];
                if matches!(action, Action::GetReport { .. }) {
                    let report: Report = field(&response, "report")?;
                    if report.screenshots.len() > 3 {
                        return Err(Error::TooLarge);
                    }
                    for url in &report.screenshots {
                        screenshots.push(self.client.screenshot(url));
                    }
                }
                Ok(Reply::Data(action, response, screenshots))
            }
        }
    }
    fn poll(&mut self) -> Result<Option<Reply>> {
        if let Some(exchange) = self.account.poll_login()? {
            self.account
                .complete(exchange.run(&self.http, now()?)?, &self.store)?;
            self.pending = false;
            return Ok(Some(Reply::Ready));
        }
        Ok(None)
    }
}
fn load_oauth(
    store: &Store,
    http: &Http,
    oauth_config: vantare_services::config::OAuthBuild,
) -> Result<OAuth> {
    let cached = match store.load::<OAuth>("oauth-metadata") {
        Ok(oauth)
            if oauth.matches(
                &oauth_config.issuer,
                &oauth_config.client_id,
                &oauth_config.redirect_uri,
            ) =>
        {
            Some(oauth)
        }
        Ok(_) => {
            store.quarantine_preserving("oauth-metadata")?;
            None
        }
        Err(Error::NotFound) => None,
        Err(error) => return Err(error),
    };
    if let Some(oauth) = cached {
        return Ok(oauth);
    }
    let oauth = OAuth::discover(
        http,
        oauth_config.issuer,
        oauth_config.client_id,
        oauth_config.redirect_uri,
    )?;
    store.save("oauth-metadata", &oauth)?;
    Ok(oauth)
}

fn now() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|_| Error::Clock)
}

/// Owner-only read-back using this app's isolated session. No credentials printed.
pub fn diagnose_owner(root: &std::path::Path) -> Result<()> {
    let mut session = Session::open(root)?;
    session.refresh()?;
    println!("restore signed_in={}", session.account.identity().is_some());
    diagnose_pages(&session)?;
    let issuer = BuildConfig::load()
        .native_oauth
        .ok_or(Error::Unconfigured)?
        .issuer;
    let discovery: Discovery = session
        .http
        .get(
            &issuer
                .join(".well-known/openid-configuration")
                .map_err(|_| Error::Unconfigured)?,
            None,
            None,
        )?
        .success()?
        .json()?;
    if discovery.userinfo_endpoint.origin() != issuer.origin()
        || discovery.userinfo_endpoint.query().is_some()
    {
        return Err(Error::Unconfigured);
    }
    let profile: Profile = session.account.authorized(now()?, |bearer| {
        session
            .http
            .get(&discovery.userinfo_endpoint, Some(bearer), None)?
            .success()?
            .json()
    })?;
    if session
        .account
        .identity()
        .is_none_or(|identity| identity.subject != profile.sub)
    {
        return Err(Error::Authentication);
    }
    println!(
        "profile email_present={} name_present={}",
        profile.email.is_some(),
        profile.name.is_some()
    );
    diagnose_searches(&session, profile)
}
#[derive(serde::Deserialize)]
struct Discovery {
    userinfo_endpoint: url::Url,
}
#[derive(serde::Deserialize)]
struct Profile {
    sub: String,
    email: Option<String>,
    name: Option<String>,
}

fn diagnose_pages(session: &Session) -> Result<()> {
    let started = Instant::now();
    let value = session.client.call(
        &session.account,
        now()?,
        &Action::SearchAccounts {
            query: String::new(),
            limit: 1,
            cursor: None,
        },
    )?;
    let first: Vec<crate::client::User> = field(&value, "accounts")?;
    let cursor: Option<String> = field(&value, "next_cursor")?;
    println!(
        "list_first ms={} count={} next_cursor={}",
        started.elapsed().as_millis(),
        first.len(),
        cursor.is_some()
    );
    if let Some(cursor) = cursor {
        let started = Instant::now();
        let value = session.client.call(
            &session.account,
            now()?,
            &Action::SearchAccounts {
                query: String::new(),
                limit: 50,
                cursor: Some(cursor),
            },
        )?;
        let next: Vec<crate::client::User> = field(&value, "accounts")?;
        let cursor: Option<String> = field(&value, "next_cursor")?;
        println!(
            "list_next ms={} count={} next_cursor={} repeats_first={}",
            started.elapsed().as_millis(),
            next.len(),
            cursor.is_some(),
            next.iter()
                .any(|row| first.iter().any(|p| p.account_id == row.account_id))
        );
    }
    Ok(())
}

fn diagnose_searches(session: &Session, profile: Profile) -> Result<()> {
    let mut self_id = None;
    for (kind, query) in [("email", profile.email), ("name", profile.name)] {
        let Some(query) = query else { continue };
        let action = Action::SearchAccounts {
            query,
            limit: 50,
            cursor: None,
        };
        let started = Instant::now();
        let value = session.client.call(&session.account, now()?, &action)?;
        let users: Vec<crate::client::User> = field(&value, "accounts")?;
        let found = users
            .iter()
            .find(|user| user.roles.iter().any(|role| role == "owner"));
        if let Some(user) = found {
            self_id = Some(user.account_id.clone());
        }
        println!(
            "search_{kind} ms={} count={} contains_owner={}",
            started.elapsed().as_millis(),
            users.len(),
            found.is_some()
        );
    }
    if let Some(account_id) = self_id {
        let started = Instant::now();
        let value =
            session
                .client
                .call(&session.account, now()?, &Action::GetAccount { account_id })?;
        let user: crate::client::User = field(&value, "account")?;
        println!(
            "get_account ms={} owner={} email_present={}",
            started.elapsed().as_millis(),
            user.roles.iter().any(|role| role == "owner"),
            user.email.is_some()
        );
        if let Some(query) = user.email {
            let started = Instant::now();
            let value = session.client.call(
                &session.account,
                now()?,
                &Action::SearchAccounts {
                    query,
                    limit: 50,
                    cursor: None,
                },
            )?;
            let users: Vec<crate::client::User> = field(&value, "accounts")?;
            println!(
                "search_email ms={} count={} contains_owner={}",
                started.elapsed().as_millis(),
                users.len(),
                users
                    .iter()
                    .any(|row| row.roles.iter().any(|role| role == "owner"))
            );
        }
    }
    for action in [
        Action::GetRollout,
        Action::ListReports {
            status: None,
            limit: 100,
            cursor: None,
        },
    ] {
        let started = Instant::now();
        let value = session.client.call(&session.account, now()?, &action)?;
        println!(
            "{} ms={} rows={}",
            action.label(),
            started.elapsed().as_millis(),
            value
                .get(if matches!(action, Action::GetRollout) {
                    "rollout"
                } else {
                    "reports"
                })
                .and_then(|v| v.as_array())
                .map_or(0, Vec::len)
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn regression_1555_admin_redirect_mismatch_is_quarantined_before_discovery() {
        let root = std::env::temp_dir().join(format!("admin-oauth-1555-{}", std::process::id()));
        let issuer = url::Url::parse("http://127.0.0.1:1/").expect("issuer");
        let old_redirect = url::Url::parse("http://127.0.0.1:0/old-callback").expect("redirect");
        let old: OAuth = serde_json::from_value(serde_json::json!({
            "issuer":issuer, "client_id":"public-fixture", "redirect":old_redirect,
            "authorization":issuer.join("authorize").expect("url"),
            "token":issuer.join("token").expect("url"),
            "userinfo":issuer.join("userinfo").expect("url")
        }))
        .expect("metadata");
        let store = Store::open(&root, "1555-admin-context").expect("store");
        store.save("oauth-metadata", &old).expect("metadata");
        store
            .save("account", &serde_json::json!({"fixture":"preserve"}))
            .expect("session marker");
        let namespace = std::fs::read_dir(&root)
            .expect("root")
            .next()
            .expect("namespace")
            .expect("entry")
            .path();
        let before = std::fs::read_dir(&namespace)
            .expect("namespace")
            .filter_map(|entry| {
                let path = entry.expect("entry").path();
                if path.file_name().expect("name") == "owner.lock" {
                    return None;
                }
                Some((path.clone(), std::fs::read(path).expect("bytes")))
            })
            .collect::<Vec<_>>();
        let config = || vantare_services::config::OAuthBuild {
            issuer: issuer.clone(),
            client_id: "public-fixture".into(),
            redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("redirect"),
        };
        // HTTP is rejected by the services dependency: reaching discovery is observable
        // without network or build-time credentials.
        assert!(matches!(
            load_oauth(&store, &Http::default(), config()),
            Err(Error::Unconfigured)
        ));
        assert!(matches!(
            store.load::<OAuth>("oauth-metadata"),
            Err(Error::NotFound)
        ));
        let aside = std::fs::read_dir(&namespace)
            .expect("namespace")
            .filter_map(|entry| {
                let path = entry.expect("entry").path();
                path.extension()
                    .is_some_and(|ext| ext == "corrupto")
                    .then_some(path)
            })
            .collect::<Vec<_>>();
        assert_eq!(aside.len(), 1);
        for (path, bytes) in before {
            if path
                .file_name()
                .expect("name")
                .to_string_lossy()
                .starts_with("oauth-metadata")
            {
                assert_eq!(std::fs::read(&aside[0]).expect("quarantined bytes"), bytes);
            } else {
                assert_eq!(std::fs::read(path).expect("preserved session"), bytes);
            }
        }
        assert!(matches!(
            load_oauth(&store, &Http::default(), config()),
            Err(Error::Unconfigured)
        ));
        drop(store);
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
