//! Un hilo propietario de Account/Store: GPUI nunca bloquea en red ni PKCE.
use crate::client::{Action, Client, Report, field};
use std::{
    path::PathBuf,
    sync::mpsc,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
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
}
pub enum Reply {
    Ready,
    OpenBrowser(String),
    LoggedOut,
    Data(Action, serde_json::Value, Vec<Result<Vec<u8>>>),
    Failed(Error),
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
                    match commands.recv_timeout(Duration::from_millis(100)) {
                        Ok(command) => {
                            let result = (|| {
                                if session.is_none() {
                                    session = Some(Session::open(&root)?);
                                }
                                session
                                    .as_mut()
                                    .ok_or(Error::Authentication)?
                                    .handle(command)
                            })();
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
        let oauth = match store.load::<OAuth>("oauth-metadata") {
            Ok(oauth)
                if oauth.matches(
                    &oauth_config.issuer,
                    &oauth_config.client_id,
                    &oauth_config.redirect_uri,
                ) =>
            {
                oauth
            }
            Ok(_) => return Err(Error::Storage),
            Err(Error::NotFound) => {
                let oauth = OAuth::discover(
                    &http,
                    oauth_config.issuer,
                    oauth_config.client_id,
                    oauth_config.redirect_uri,
                )?;
                store.save("oauth-metadata", &oauth)?;
                oauth
            }
            Err(error) => return Err(error),
        };
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
fn now() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|_| Error::Clock)
}
