//! Propietario único de red y persistencia; nunca decide derechos del núcleo.
use crate::{
    Error, Result,
    account::{Account, OAuth},
    config::BuildConfig,
    http::Http,
    protocol::{Command, Reply},
    storage::Store,
};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct App {
    config: BuildConfig,
    root: PathBuf,
    http: Http,
    store: Option<Store>,
    account: Option<Account>,
    login_pending: bool,
}

impl App {
    pub fn new(config: BuildConfig, root: PathBuf) -> Self {
        Self {
            config,
            root,
            http: Http::default(),
            store: None,
            account: None,
            login_pending: false,
        }
    }

    fn ensure_account(&mut self) -> Result<()> {
        if self.account.is_some() {
            return Ok(());
        }
        let config = self
            .config
            .native_oauth
            .as_ref()
            .ok_or(Error::Unconfigured)?;
        let context = format!(
            "v1|{}|{}|{}|{}",
            config.issuer,
            config.client_id,
            self.config.channel.unwrap_or("unknown"),
            self.config.supabase.as_ref().map_or("", url::Url::as_str)
        );
        let store = Store::open(&self.root, &context)?;
        let oauth = match store.load::<OAuth>("oauth-metadata") {
            Ok(oauth) if oauth.matches(&config.issuer, &config.client_id, &config.redirect_uri) => {
                oauth
            }
            Ok(_) => return Err(Error::Storage),
            Err(Error::NotFound) => {
                let oauth = OAuth::discover(
                    &self.http,
                    config.issuer.clone(),
                    config.client_id.clone(),
                    config.redirect_uri.clone(),
                )?;
                store.save("oauth-metadata", &oauth)?;
                oauth
            }
            Err(error) => return Err(error),
        };
        let account = Account::restore(oauth, &store)?;
        self.store = Some(store);
        self.account = Some(account);
        Ok(())
    }

    pub fn handle(&mut self, command: Command) -> Reply {
        match self.execute(command) {
            Ok(reply) => reply,
            Err(error) => Reply::Error {
                message: error.to_string(),
            },
        }
    }

    fn execute(&mut self, command: Command) -> Result<Reply> {
        match command {
            Command::Status => {
                return Ok(Reply::Status {
                    account_configured: self.config.native_account_configured(),
                    message: if self.config.native_account_configured() {
                        "servicio disponible"
                    } else {
                        "servicio no configurado"
                    }
                    .into(),
                });
            }
            Command::Shutdown => return Ok(Reply::Closed),
            _ => self.ensure_account()?,
        }
        let account = self.account.as_mut().ok_or(Error::Unconfigured)?;
        let store = self.store.as_ref().ok_or(Error::Storage)?;
        match command {
            Command::AccountBegin => {
                let url = account.begin_login()?;
                // Only an explicit IPC login action opens the external browser.
                std::process::Command::new("explorer.exe")
                    .arg(url.as_str())
                    .spawn()
                    .map_err(|_| Error::Unsupported)?;
                self.login_pending = true;
            }
            Command::AccountPoll if self.login_pending => {
                if let Some(ticket) = account.poll_login()? {
                    self.login_pending = false;
                    account.complete(ticket.run(&self.http, now()?)?, store)?;
                }
            }
            Command::AccountPoll => {}
            Command::AccountRenew => {
                account.complete(account.refresh()?.run(&self.http, now()?)?, store)?;
            }
            Command::Logout => {
                self.login_pending = false;
                account.logout(store)?;
            }
            Command::Status | Command::Shutdown => return Err(Error::Protocol),
        }
        Ok(Reply::Account {
            signed_in: account.identity().is_some(),
            expires_at: account.expires_at(),
            pending: self.login_pending,
            message: if self.login_pending {
                "Complete el inicio de sesión en el navegador"
            } else if account.identity().is_some() {
                "Sesión Clerk protegida; derechos pendientes del núcleo"
            } else {
                "Sesión cerrada en este dispositivo"
            }
            .into(),
        })
    }
}

pub fn now() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| Error::Clock)
}

pub fn default_root() -> Result<PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .map(|path| PathBuf::from(path).join("Vantare/native/services"))
        .ok_or(Error::Storage)
}
