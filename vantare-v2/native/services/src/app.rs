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
    core: Option<vantare_ipc::control::CoreLink>,
    license_store: Option<Store>,
    config: BuildConfig,
    root: PathBuf,
    http: Http,
    store: Option<Store>,
    account: Option<Account>,
    roadmap_store: Option<Store>,
    roadmap: Option<crate::roadmap::Roadmap>,
    bridge: Option<crate::bridge::Config>,
    data_session: Option<crate::bridge::DataSession>,
    report_store: Option<Store>,
    reports: Option<crate::report::Reports>,
}

impl App {
    pub fn new(config: BuildConfig, root: PathBuf) -> Self {
        Self {
            core: None,
            license_store: None,
            config,
            root,
            http: Http::default(),
            store: None,
            account: None,
            roadmap_store: None,
            roadmap: None,
            bridge: None,
            data_session: None,
            report_store: None,
            reports: None,
        }
    }

    /// Public build/backend owner supplies the agreed, pinned contract. Not IPC.
    pub fn configure_bridge(&mut self, config: crate::bridge::Config) -> Result<()> {
        if self.bridge.is_some() {
            return Err(Error::Conflict);
        }
        config.validate()?;
        self.bridge = Some(config);
        Ok(())
    }

    pub fn attach_core(&mut self, core: vantare_ipc::control::CoreLink) {
        self.core = Some(core);
    }

    fn candidate_store(&mut self) -> Result<&Store> {
        if self.license_store.is_none() {
            let context = crate::license_remote::candidate_context(
                self.config.supabase.as_ref().map(url::Url::as_str),
                self.config.channel,
            );
            self.license_store = Some(Store::open(&self.root, &context)?);
        }
        self.license_store.as_ref().ok_or(Error::Storage)
    }

    fn core_command(
        &self,
        command: vantare_ipc::control::Command,
    ) -> Result<vantare_ipc::control::Policy> {
        vantare_ipc::control::request(self.core.as_ref().ok_or(Error::Unconfigured)?, command)
            .map_err(|_| Error::Denied)
    }

    fn transfer_rights(&mut self) -> Result<Reply> {
        let candidate = self
            .candidate_store()?
            .load::<crate::license_remote::Candidate>("license-candidate");
        let policy = match candidate {
            Ok(candidate) => self.core_command(vantare_ipc::control::Command::Install {
                credential: serde_json::to_string(&candidate.credential)
                    .map_err(|_| Error::InvalidCredential)?,
            })?,
            Err(Error::NotFound) => self.core_command(vantare_ipc::control::Command::Read)?,
            Err(error) => return Err(error),
        };
        Ok(Reply::License {
            policy,
            message: "Derechos verificados y guardados por el núcleo".into(),
        })
    }

    fn revoke_local(&mut self) -> Result<()> {
        self.core_command(vantare_ipc::control::Command::Invalidate)?;
        self.candidate_store()?.remove("license-candidate")?;
        Ok(())
    }

    fn license_reply(&mut self, command: &Command) -> Result<Reply> {
        if matches!(command, Command::LicenseStatus) {
            return Ok(Reply::License {
                policy: self.core_command(vantare_ipc::control::Command::Read)?,
                message: "Política vigente del núcleo".into(),
            });
        }
        if matches!(command, Command::LicenseRenew) {
            // Sin configuración compilada no hay red, huella ni fallback de datos.
            if self.config.supabase.is_none()
                || self.config.anon_key.is_none_or(str::is_empty)
                || self.config.license_keys.is_none_or(str::is_empty)
            {
                return Err(Error::Unconfigured);
            }
            let device = crate::license::installation::legacy_fingerprint()?;
            let time = now()?;
            self.ensure_oauth(time)?;
            self.candidate_store()?;
            crate::license_remote::renew(
                &self.http,
                &self.config,
                self.account.as_ref().ok_or(Error::Authentication)?,
                time,
                &device,
                self.license_store.as_ref().ok_or(Error::Storage)?,
            )?;
            return self.transfer_rights();
        }
        if !matches!(command, Command::DeviceReset) {
            return Err(Error::Protocol);
        }
        let device = crate::license::installation::legacy_fingerprint()?;
        self.revoke_local()?;
        let time = now()?;
        self.ensure_data(time)?;
        self.candidate_store()?;
        let request = self
            .data_session
            .as_ref()
            .ok_or(Error::Authentication)?
            .request(
                &self.http,
                self.bridge.as_ref().ok_or(Error::BridgeUnconfigured)?,
                self.account.as_ref().ok_or(Error::Authentication)?,
                time,
            );
        crate::license_remote::reset_device(&request, &device)?;
        Ok(Reply::License {
            policy: self.core_command(vantare_ipc::control::Command::Read)?,
            message: "Dispositivo liberado; solicite una credencial nueva".into(),
        })
    }

    fn logout_reply(&mut self) -> Result<Reply> {
        // Invalida primero: ni limpieza local ni UI anuncian éxito antes del ACK.
        if self.core.is_some() {
            self.revoke_local()?;
        }
        self.data_session = None;
        if let Some(reports) = self.reports.as_mut() {
            reports.cancel_preview();
        }
        if self.config.native_oauth.is_some() {
            self.ensure_account()?;
            self.account
                .as_mut()
                .ok_or(Error::Unconfigured)?
                .logout(self.store.as_ref().ok_or(Error::Storage)?)?;
        }
        Ok(Reply::Account {
            signed_in: false,
            profile: None,
            expires_at: None,
            pending: false,
            message: "Sesión cerrada y derechos locales revocados".into(),
            error: None,
        })
    }

    fn ensure_data(&mut self, now: u64) -> Result<()> {
        if self.bridge.is_none() {
            return Err(Error::BridgeUnconfigured);
        }
        self.ensure_oauth(now)?;
        let account = self.account.as_ref().ok_or(Error::Authentication)?;
        if self
            .data_session
            .as_ref()
            .is_none_or(|session| !session.valid(account, now))
        {
            self.data_session = Some(
                self.bridge
                    .as_ref()
                    .ok_or(Error::BridgeUnconfigured)?
                    .authorize(&self.http, account, now)?,
            );
        }
        Ok(())
    }

    fn ensure_oauth(&mut self, now: u64) -> Result<()> {
        self.ensure_account()?;
        let account = self.account.as_mut().ok_or(Error::Authentication)?;
        if account
            .expires_at()
            .is_some_and(|expires| expires <= now.saturating_add(60))
        {
            account.complete(
                account.refresh()?.run(&self.http, now)?,
                self.store.as_ref().ok_or(Error::Storage)?,
            )?;
        }
        Ok(())
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
        let cached = match store.load::<OAuth>("oauth-metadata") {
            Ok(oauth) if oauth.matches(&config.issuer, &config.client_id, &config.redirect_uri) => {
                Some(oauth)
            }
            Ok(_) => {
                // Solo metadata pública incompatible; no migrar ni borrar la sesión.
                store.quarantine_preserving("oauth-metadata")?;
                None
            }
            Err(Error::NotFound) => None,
            Err(error) => return Err(error),
        };
        let oauth = if let Some(oauth) = cached {
            oauth
        } else {
            let oauth = OAuth::discover(
                &self.http,
                config.issuer.clone(),
                config.client_id.clone(),
                config.redirect_uri.clone(),
            )?;
            store.save("oauth-metadata", &oauth)?;
            oauth
        };
        let account = Account::restore(oauth, &store)?;
        self.store = Some(store);
        self.account = Some(account);
        Ok(())
    }

    fn poll_account(&mut self) -> Result<Reply> {
        self.ensure_account()?;
        let account = self.account.as_mut().ok_or(Error::Authentication)?;
        if account.login_pending()
            && let Some(ticket) = account.poll_login()?
        {
            let completion = ticket.run(&self.http, now()?)?;
            let changed = account
                .identity()
                .is_some_and(|old| old != completion.identity());
            // Otra identidad no hereda el candidate ni la autoridad anteriores.
            // Revocar antes de persistir la nueva sesión; si falla, no sustituirla.
            if changed && self.core.is_some() {
                self.revoke_local()?;
            }
            self.account
                .as_mut()
                .ok_or(Error::Authentication)?
                .complete(completion, self.store.as_ref().ok_or(Error::Storage)?)?;
        }
        Ok(Self::account_reply(
            self.account.as_ref().ok_or(Error::Authentication)?,
            None,
        ))
    }

    pub fn handle(&mut self, command: Command) -> Reply {
        let report_send = matches!(command, Command::ReportSend { .. });
        let account_action = matches!(
            command,
            Command::AccountBegin
                | Command::AccountPoll
                | Command::AccountRenew
                | Command::AccountProfileRefresh
                | Command::Logout
        );
        match self.execute(command) {
            Ok(reply) => reply,
            Err(error) => {
                if report_send && error == Error::Authentication {
                    // Un 401 del envío invalida el bearer de datos aún vigente;
                    // el siguiente reintento vuelve a pasar por authorize.
                    self.data_session = None;
                }
                if account_action && let Some(account) = self.account.as_ref() {
                    Self::account_reply(account, Some(error))
                } else if error == Error::DeviceLimit {
                    // Acción concreta y distinta de cualquier otro fallo: el
                    // texto sigue saliendo del único mapeo (`error.rs`).
                    Reply::DeviceLimit {
                        message: error.to_string(),
                    }
                } else {
                    Reply::Error {
                        message: if report_send {
                            report_error(error)
                        } else {
                            error.to_string()
                        },
                    }
                }
            }
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
            Command::DraftLoad
            | Command::DraftSave { .. }
            | Command::DraftDiscard
            | Command::ReportCapture { .. }
            | Command::ReportRemoveScreenshot { .. }
            | Command::ReportPrepare
            | Command::ReportRetryPrepare
            | Command::ReportSend { .. } => {
                // Fallar antes de abrir almacenamiento/red en comandos remotos.
                // Guardar y cargar el borrador sigue disponible sin backend.
                if matches!(command, Command::ReportPrepare | Command::ReportSend { .. })
                    && self.bridge.is_none()
                {
                    return Err(Error::BridgeUnconfigured);
                }
                return self.report_reply(command);
            }
            Command::CalendarRefresh => {
                return Ok(Reply::Calendar {
                    schedule: crate::calendar::current(&self.http, &self.config)?,
                });
            }
            Command::RoadmapCached | Command::RoadmapRefresh => {
                return self.roadmap_reply(matches!(command, Command::RoadmapRefresh));
            }
            Command::TestingRefresh
            | Command::TestingAnswer { .. }
            | Command::TestingContribute { .. } => {
                return self.testing_reply(command);
            }
            Command::TransferRights => return self.transfer_rights(),
            Command::Purchase { product } => {
                let time = now()?;
                self.ensure_oauth(time)?;
                let url = crate::billing::purchase(
                    &self.http,
                    &self.config,
                    self.account.as_ref().ok_or(Error::Authentication)?,
                    time,
                    self.store.as_ref().ok_or(Error::Storage)?,
                    product,
                    option_env!("VANTARE_BILLING_ENVIRONMENT").ok_or(Error::Unconfigured)?,
                )?;
                return Ok(Reply::Checkout { url });
            }
            Command::LicenseStatus | Command::LicenseRenew | Command::DeviceReset => {
                return self.license_reply(&command);
            }
            Command::Logout => return self.logout_reply(),
            Command::AccountPoll => return self.poll_account(),
            Command::AccountProfileRefresh => {
                let time = now()?;
                self.ensure_oauth(time)?;
                let account = self.account.as_mut().ok_or(Error::Authentication)?;
                account.refresh_profile(
                    &self.http,
                    time,
                    self.store.as_ref().ok_or(Error::Storage)?,
                )?;
                return Ok(Self::account_reply(account, None));
            }
            _ => self.ensure_account()?,
        }
        let account = self.account.as_mut().ok_or(Error::Unconfigured)?;
        let store = self.store.as_ref().ok_or(Error::Storage)?;
        match command {
            Command::AccountBegin => {
                let url = account.begin_login()?;
                // Only an explicit IPC login action opens the external browser.
                // `explorer.exe <url>` trata las URL largas con parámetros como rutas
                // y abre el Explorador; el manejador de protocolo abre el navegador.
                if let Err(error) = open_login(&url) {
                    account.cancel_login()?;
                    return Err(error);
                }
            }
            Command::AccountRenew => {
                account.complete(account.refresh()?.run(&self.http, now()?)?, store)?;
            }
            _ => return Err(Error::Protocol),
        }
        Ok(Self::account_reply(account, None))
    }

    fn account_reply(account: &Account, error: Option<Error>) -> Reply {
        let pending = account.login_pending();
        Reply::Account {
            signed_in: account.identity().is_some(),
            profile: account.profile().cloned(),
            expires_at: account.expires_at(),
            pending,
            message: error.map_or_else(
                || {
                    if pending {
                        "Complete el inicio de sesión en el navegador"
                    } else if account.identity().is_some() {
                        "Sesión Clerk protegida; derechos pendientes del núcleo"
                    } else {
                        "Sesión cerrada en este dispositivo"
                    }
                    .into()
                },
                |error| error.to_string(),
            ),
            error: error.map(|error| error.to_string()),
        }
    }

    fn testing_reply(&mut self, command: Command) -> Result<Reply> {
        let time = now()?;
        self.ensure_data(time)?;
        let request = self
            .data_session
            .as_ref()
            .ok_or(Error::Authentication)?
            .request(
                &self.http,
                self.bridge.as_ref().ok_or(Error::BridgeUnconfigured)?,
                self.account.as_ref().ok_or(Error::Authentication)?,
                time,
            );
        let channel = crate::report::rpc_channel(self.config.channel.ok_or(Error::Unconfigured)?);
        Ok(Reply::Testing {
            data: crate::testing::execute(&request, channel, command)?,
        })
    }

    fn roadmap_reply(&mut self, refresh: bool) -> Result<Reply> {
        let base = self.config.supabase.as_ref().ok_or(Error::Unconfigured)?;
        if self.roadmap.is_none() {
            let context = format!(
                "roadmap-v1|{base}|{}",
                self.config.channel.unwrap_or("unknown")
            );
            let store = Store::open(&self.root, &context)?;
            self.roadmap = Some(crate::roadmap::Roadmap::restore(&store)?);
            self.roadmap_store = Some(store);
        }
        let roadmap = self.roadmap.as_mut().ok_or(Error::Storage)?;
        let outcome = if refresh {
            match self.config.anon_key {
                Some(anon) => roadmap.refresh(
                    &self.http,
                    base,
                    anon,
                    now()?,
                    self.roadmap_store.as_ref().ok_or(Error::Storage)?,
                ),
                None => Err(Error::Unconfigured),
            }
        } else {
            Err(Error::Offline)
        };
        Ok(Reply::Roadmap {
            publication: roadmap.publication().cloned(),
            fetched_at: roadmap.fetched_at(),
            stale: outcome.is_err(),
            message: match outcome {
                Ok(()) => "Publicación actualizada".into(),
                Err(Error::Offline) if !refresh => {
                    "Última publicación guardada; puede actualizarla manualmente".into()
                }
                Err(error) => error.to_string(),
            },
        })
    }

    fn draft_reply(&mut self, command: Command) -> Result<Reply> {
        let store = self.report_store.as_ref().ok_or(Error::Storage)?;
        match command {
            Command::DraftLoad => Ok(Reply::Draft {
                draft: crate::report::load_draft(store)?,
                message: "Borrador local; no se ha enviado".into(),
            }),
            Command::DraftSave { fields } => {
                self.reports
                    .as_mut()
                    .ok_or(Error::Storage)?
                    .cancel_preview();
                Ok(Reply::Draft {
                    draft: Some(crate::report::save_draft(store, fields)?),
                    message: "Borrador protegido guardado; no se ha enviado".into(),
                })
            }
            Command::DraftDiscard => {
                self.reports
                    .as_mut()
                    .ok_or(Error::Storage)?
                    .cancel_preview();
                store.remove("report-draft")?;
                store.remove("report-images")?;
                Ok(Reply::Draft {
                    draft: None,
                    message:
                        "Borrador eliminado; cualquier intento previo sigue pendiente de revisión"
                            .into(),
                })
            }
            Command::ReportCapture { .. } | Command::ReportRemoveScreenshot { .. } => {
                self.reports
                    .as_mut()
                    .ok_or(Error::Storage)?
                    .cancel_preview();
                let draft = match command {
                    Command::ReportCapture { fields } => {
                        crate::report::save_draft(store, fields)?;
                        crate::report::screenshots::capture(store)?
                    }
                    Command::ReportRemoveScreenshot { id, fields } => {
                        crate::report::save_draft(store, fields)?;
                        crate::report::screenshots::remove(store, &id)?
                    }
                    _ => return Err(Error::Protocol),
                };
                Ok(Reply::Draft { draft: Some(draft),
                    message: "Revisa la captura antes de consentir el envío. Puedes quitarla; todavía no se ha subido.".into() })
            }
            _ => Err(Error::Protocol),
        }
    }

    fn report_reply(&mut self, command: Command) -> Result<Reply> {
        if self.reports.is_none() {
            let context = format!(
                "report-v1|{}|{}",
                self.config
                    .supabase
                    .as_ref()
                    .map_or("unconfigured", url::Url::as_str),
                self.config.channel.unwrap_or("unknown")
            );
            let store = Store::open(&self.root, &context)?;
            self.reports = Some(crate::report::Reports::restore(&store)?);
            self.report_store = Some(store);
        }
        if matches!(
            command,
            Command::DraftLoad
                | Command::DraftSave { .. }
                | Command::DraftDiscard
                | Command::ReportCapture { .. }
                | Command::ReportRemoveScreenshot { .. }
        ) {
            return self.draft_reply(command);
        }
        let store = self.report_store.as_ref().ok_or(Error::Storage)?;
        if matches!(command, Command::ReportRetryPrepare)
            && let Some(receipt) = self
                .reports
                .as_ref()
                .and_then(crate::report::Reports::receipt)
        {
            return Ok(Reply::ReportReceipt {
                receipt: receipt.clone(),
                draft_state: self
                    .reports
                    .as_ref()
                    .ok_or(Error::Storage)?
                    .draft_state(store)
                    .unwrap_or(crate::protocol::DraftState::CleanupPending),
            });
        }
        let now = now()?;
        self.ensure_data(now)?;
        let request = self
            .data_session
            .as_ref()
            .ok_or(Error::Authentication)?
            .request(
                &self.http,
                self.bridge.as_ref().ok_or(Error::BridgeUnconfigured)?,
                self.account.as_ref().ok_or(Error::Authentication)?,
                now,
            );
        let store = self.report_store.as_ref().ok_or(Error::Storage)?;
        let reports = self.reports.as_mut().ok_or(Error::Storage)?;
        match command {
            Command::ReportPrepare => {
                let draft = crate::report::load_draft(store)?.ok_or(Error::NotFound)?;
                let environment = crate::report::Environment::local(
                    self.config.channel.ok_or(Error::Unconfigured)?,
                )?;
                Ok(Reply::ReportPreview {
                    preview: reports.prepare_with_images(
                        &request,
                        draft.clone(),
                        environment,
                        crate::report::screenshots::load(store, &draft)?,
                    )?,
                })
            }
            Command::ReportRetryPrepare => Ok(Reply::ReportPreview {
                preview: reports.prepare_retry(
                    &request,
                    crate::report::rpc_channel(self.config.channel.ok_or(Error::Unconfigured)?),
                )?,
            }),
            Command::ReportSend { preview_id } => {
                let (receipt, draft_state) = reports.send(&request, &preview_id, store)?;
                Ok(Reply::ReportReceipt {
                    receipt,
                    draft_state,
                })
            }
            _ => Err(Error::Protocol),
        }
    }
}

pub(crate) fn report_error(error: Error) -> String {
    if error == Error::Denied {
        "Tu cuenta aún no está habilitada para enviar reportes. El borrador se conserva; solicita a Isaac el rol tester.".into()
    } else {
        error.to_string()
    }
}

pub fn now() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| Error::Clock)
}

#[cfg(all(test, any(windows, unix)))]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpStream, time::Duration};

    #[cfg(unix)]
    #[test]
    fn unix_v1_renew_and_reset_stop_before_storage_oauth_or_core() {
        let server = crate::test_http::Server::start(vec![]);
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-fixture"),
            license_keys: Some("unused-fixture"),
            channel: Some("nightly"),
            native_oauth: None,
        };
        // Una raíz inaccesible y ningún core revelan cualquier acceso prematuro.
        let mut app = App::new(config, std::path::PathBuf::from("/qa-unavailable-root"));
        for command in [Command::LicenseRenew, Command::DeviceReset] {
            assert!(matches!(app.execute(command), Err(Error::Unsupported)));
        }
        assert!(app.store.is_none() && app.license_store.is_none());
        assert!(server.requests.try_recv().is_err());
        server.finish();
    }

    #[test]
    fn regression_1542_redirect_change_rediscovers_oauth_in_same_namespace() {
        let server = crate::test_http::Server::start_with(|base| {
            vec![(200, serde_json::json!({
            "issuer":base, "authorization_endpoint":base.join("authorize").expect("url"),
            "token_endpoint":base.join("token").expect("url"), "userinfo_endpoint":base.join("userinfo").expect("url"),
            "code_challenge_methods_supported":["S256"]
        }).to_string())]
        });
        let context = format!("v1|{}|public-fixture|nightly|{}", server.base, server.base);
        let (root, store) = crate::test_store(&context);
        let old: OAuth = serde_json::from_value(serde_json::json!({
            "issuer":server.base, "client_id":"public-fixture", "redirect":"http://127.0.0.1:0/old-callback",
            "authorization":server.base.join("authorize").expect("url"), "token":server.base.join("token").expect("url"),
            "userinfo":server.base.join("userinfo").expect("url")
        })).expect("old metadata");
        store.save("oauth-metadata", &old).expect("save");
        let _account = crate::account::fixture(&server.base, &store);
        let namespace = std::fs::read_dir(&root)
            .expect("root")
            .next()
            .expect("namespace")
            .expect("entry")
            .path();
        let session_path = namespace.join(if cfg!(windows) {
            "account.dpapi"
        } else {
            "account.json"
        });
        let session_bytes = std::fs::read(&session_path).expect("session fixture");
        drop(store);
        let redirect = url::Url::parse("http://127.0.0.1:0/callback").expect("redirect");
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: None,
            license_keys: None,
            channel: Some("nightly"),
            native_oauth: Some(crate::config::OAuthBuild {
                issuer: server.base.clone(),
                client_id: "public-fixture".into(),
                redirect_uri: redirect.clone(),
            }),
        };
        let mut app = App::new(config, root.clone());
        app.ensure_account().expect("redirect recovery");
        assert!(app.account.as_ref().expect("account").identity().is_some());
        assert!(std::fs::read(&session_path).expect("preserved session") == session_bytes);
        assert!(
            std::fs::read_dir(&namespace)
                .expect("namespace")
                .any(|entry| entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".corrupto"))
        );
        assert!(
            app.store
                .as_ref()
                .expect("store")
                .load::<OAuth>("oauth-metadata")
                .expect("new metadata")
                .matches(&server.base, "public-fixture", &redirect)
        );
        app.ensure_account().expect("cached recovery");
        let request = server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("discovery");
        assert!(request.starts_with("GET /.well-known/openid-configuration "));
        assert!(server.requests.try_recv().is_err());
        server.finish();
        drop(app);
        crate::cleanup_store(&root, &context, &[]);
    }

    #[test]
    fn isa1548_nonaccount_ipc_error_keeps_callback_alive_until_success() {
        use std::sync::Arc;
        use vantare_ipc::transport::{Event, Listener};
        let server = crate::test_http::Server::start(vec![
            (200, r#"{"access_token":"fixture-access","refresh_token":"fixture-refresh","expires_in":60,"token_type":"Bearer"}"#.into()),
            (200, r#"{"sub":"user_fixture"}"#.into()),
        ]);
        let (root, store) = crate::test_store("nonaccount-login-error");
        let mut account = crate::account::fixture(&server.base, &store);
        account.logout(&store).expect("signed out");
        let login = account.begin_login().expect("login without browser");
        let params: std::collections::HashMap<_, _> = login
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();
        let redirect = url::Url::parse(&params["redirect_uri"]).expect("redirect");
        let config = BuildConfig {
            supabase: None,
            anon_key: None,
            license_keys: None,
            channel: None,
            native_oauth: None,
        };
        let mut app = App::new(config, root.clone());
        app.account = Some(account);
        app.store = Some(store);
        let name = format!("le-{}", crate::random_id().expect("pipe id"));
        let stop = Arc::new(Event::new().expect("event"));
        let mut listener = Listener::new(&name, Arc::clone(&stop), Duration::from_secs(5))
            .expect("local IPC listener");
        let mut server_pipe = listener.instance().expect("pipe instance");
        let worker = std::thread::spawn(move || {
            server_pipe.accept().expect("local IPC connection");
            for _ in 0..3 {
                let request: crate::protocol::Request =
                    crate::protocol::read(&mut server_pipe).expect("IPC request");
                let response = crate::protocol::Response {
                    version: crate::protocol::VERSION,
                    sequence: request.sequence,
                    reply: app.handle(request.command),
                };
                crate::protocol::write(&mut server_pipe, &response).expect("IPC response");
            }
            drop(app);
        });
        let mut client = vantare_ipc::control::connect_ready(&name, &stop, Duration::from_secs(5))
            .expect("IPC client");
        let mut wire_reply = |sequence, command| {
            let request = crate::protocol::Request {
                version: crate::protocol::VERSION,
                sequence,
                nonce: "1".repeat(64),
                command,
            };
            crate::protocol::write(&mut client, &request).expect("IPC write");
            crate::protocol::read::<crate::protocol::Response>(&mut client)
                .expect("IPC read")
                .reply
        };
        assert!(matches!(
            wire_reply(1, Command::LicenseStatus),
            Reply::Error { .. }
        ));
        assert!(matches!(
            wire_reply(2, Command::AccountPoll),
            Reply::Account {
                signed_in: false,
                pending: true,
                error: None,
                ..
            }
        ));
        let mut socket = TcpStream::connect(("127.0.0.1", redirect.port().expect("port")))
            .expect("callback survived");
        write!(
            socket,
            "GET /callback?state={}&code=fixture HTTP/1.1\r\nHost: localhost\r\n\r\n",
            params["state"]
        )
        .expect("request");
        assert!(matches!(
            wire_reply(3, Command::AccountPoll),
            Reply::Account {
                signed_in: true,
                pending: false,
                error: None,
                ..
            }
        ));
        for _ in 0..2 {
            server
                .requests
                .recv_timeout(Duration::from_secs(3))
                .expect("OAuth loopback only");
        }
        assert!(server.requests.try_recv().is_err());
        server.finish();
        worker.join().expect("IPC worker closed");
        crate::cleanup_store(&root, "nonaccount-login-error", &[]);
    }

    #[test]
    fn report_without_bridge_fails_visibly_before_storage_or_network() {
        let mut app = App::new(BuildConfig::load(), std::env::temp_dir());
        for command in [
            Command::ReportPrepare,
            Command::ReportSend {
                preview_id: "unused".into(),
            },
        ] {
            let Reply::Error { message } = app.handle(command) else {
                panic!("se requiere un error visible");
            };
            assert_eq!(message, Error::BridgeUnconfigured.to_string());
        }
        assert!(app.report_store.is_none());
        assert!(app.account.is_none());
    }

    #[test]
    fn license_without_build_configuration_is_explicitly_unconfigured() {
        for missing in 0..3 {
            let mut config = BuildConfig::load();
            config.supabase = Some(url::Url::parse("https://example.invalid/").expect("URL"));
            config.anon_key = Some("public-test-key");
            config.license_keys = Some("test-key-not-used");
            match missing {
                0 => config.supabase = None,
                1 => config.anon_key = None,
                _ => config.license_keys = None,
            }
            let mut app = App::new(config, std::env::temp_dir());
            assert!(matches!(
                app.execute(Command::LicenseRenew),
                Err(Error::Unconfigured)
            ));
        }
    }

    #[test]
    fn restore_and_poll_never_issue_remote_license_requests() {
        let server = crate::test_http::Server::start(vec![]);
        let (root, store) = crate::test_store("app-restore-poll");
        let account = crate::account::fixture(&server.base, &store);
        let mut app = App::new(BuildConfig::load(), root.clone());
        app.account = Some(account);
        app.store = Some(store);
        for _ in 0..3 {
            assert!(matches!(
                app.handle(Command::AccountPoll),
                Reply::Account {
                    signed_in: true,
                    pending: false,
                    ..
                }
            ));
        }
        assert!(server.requests.try_recv().is_err());
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-restore-poll", &["account"]);
    }

    #[test]
    fn oauth_refresh_failure_stops_license_renewal_without_retry() {
        let server = crate::test_http::Server::start(vec![(401, "{}".into())]);
        let (root, store) = crate::test_store("app-refresh-failure");
        let account = crate::account::fixture(&server.base, &store);
        let mut app = App::new(BuildConfig::load(), root.clone());
        app.account = Some(account);
        app.store = Some(store);
        app.ensure_oauth(100).expect("current token needs no HTTP");
        assert!(server.requests.try_recv().is_err());
        assert_eq!(app.ensure_oauth(1000), Err(Error::Authentication));
        let request = server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("refresh");
        assert!(request.starts_with("POST /token "));
        assert!(server.requests.try_recv().is_err());
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-refresh-failure", &["account"]);
    }

    enum CoreStep {
        #[cfg(windows)]
        Install,
        Invalidate,
        #[cfg(windows)]
        RejectInstall,
        RejectInvalidate,
    }

    fn core_fixture(
        device: String,
        keys: &'static str,
        steps: Vec<CoreStep>,
    ) -> (vantare_ipc::control::CoreLink, std::thread::JoinHandle<()>) {
        use std::sync::Arc;
        use vantare_ipc::{
            control,
            transport::{Event, Listener},
        };
        let stop = Arc::new(Event::new().expect("event"));
        let pipe_name = format!("nl-{}", &crate::random_id().expect("id")[..12]);
        let link = control::CoreLink {
            pipe: pipe_name.clone(),
            image: std::env::current_exe().expect("image"),
            nonce: crate::random_id().expect("nonce"),
        };
        let mut listener =
            Listener::new(&pipe_name, stop, Duration::from_secs(3)).expect("listener");
        let first = listener.instance().expect("instance");
        let nonce = link.nonce.clone();
        let core = std::thread::spawn(move || {
            let mut first = Some(first);
            for step in steps {
                let mut pipe = first
                    .take()
                    .unwrap_or_else(|| listener.instance().expect("instance"));
                pipe.accept().expect("core connection");
                let request: control::Request = control::read(&mut pipe).expect("core request");
                assert_eq!(request.nonce, nonce);
                if matches!(step, CoreStep::Invalidate | CoreStep::RejectInvalidate) {
                    assert!(matches!(request.command, control::Command::Invalidate));
                } else {
                    let control::Command::Install { credential } = request.command else {
                        panic!("signed credential required")
                    };
                    let proof = crate::license::Verifier::public_keys(keys)
                        .expect("keys")
                        .proof(&credential, &device, "unused-v2-installation")
                        .expect("signed v1");
                    assert!(proof.grants().is_empty());
                }
                let rejected = match step {
                    CoreStep::RejectInvalidate => true,
                    #[cfg(windows)]
                    CoreStep::RejectInstall => true,
                    _ => false,
                };
                let error = rejected.then_some("fixture rejection".to_owned());
                // Fixture de transporte: no acredita grants ni runtime real.
                control::write(
                    &mut pipe,
                    &control::Response {
                        version: control::VERSION,
                        sequence: request.sequence,
                        policy: control::Policy {
                            version: control::VERSION,
                            revision: 1,
                            checked_at_ms: control::wall_ms().expect("clock"),
                            ..control::Policy::default()
                        },
                        error,
                    },
                )
                .expect("core ACK");
            }
        });
        (link, core)
    }

    #[cfg(windows)]
    #[test]
    fn oauth_refresh_native_license_and_core_ack_precede_ipc_success_and_logout() {
        let device = crate::license::installation::legacy_fingerprint().expect("local fingerprint");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        let server = crate::test_http::Server::start(vec![
            (200, serde_json::json!({"access_token":"rotated-local-access","refresh_token":"rotated-local-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
            (200, serde_json::json!({"credential":credential,"online_capabilities":[]}).to_string()),
        ]);
        let (root, store) = crate::test_store("app-native-license-ack");
        let account = crate::account::fixture(&server.base, &store);
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-test-key"),
            license_keys: Some(keys),
            channel: Some("test"),
            native_oauth: Some(crate::config::OAuthBuild {
                issuer: server.base.clone(),
                client_id: "public-fixture".into(),
                redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("redirect"),
            }),
        };
        let mut app = App::new(config, root.clone());
        app.account = Some(account);
        app.store = Some(store);
        let (link, core) = core_fixture(
            device,
            keys,
            vec![
                CoreStep::Install,
                CoreStep::Invalidate,
                CoreStep::RejectInstall,
            ],
        );
        app.attach_core(link);
        let reply = app.handle(Command::LicenseRenew);
        assert!(
            matches!(reply, Reply::License { .. }),
            "success needs the core ACK"
        );
        for path in [
            "POST /token ",
            "GET /userinfo ",
            "POST /functions/v1/native-license ",
        ] {
            let request = server
                .requests
                .recv_timeout(Duration::from_secs(3))
                .expect("one HTTP operation");
            assert!(request.starts_with(path));
            if path.contains("native-license") {
                assert!(
                    request
                        .to_lowercase()
                        .contains("authorization: bearer rotated-local-access")
                );
            }
        }
        let candidate = app
            .candidate_store()
            .expect("store")
            .load::<crate::license_remote::Candidate>("license-candidate")
            .expect("candidate");
        let reply = app.handle(Command::Logout);
        assert!(matches!(
            reply,
            Reply::Account {
                signed_in: false,
                ..
            }
        ));
        assert!(matches!(
            app.candidate_store()
                .expect("store")
                .load::<crate::license_remote::Candidate>("license-candidate"),
            Err(Error::NotFound)
        ));
        // Si llegase a disco una emisión tardía, el núcleo debe rechazarla.
        app.candidate_store()
            .expect("store")
            .save("license-candidate", &candidate)
            .expect("late fixture");
        assert!(matches!(
            app.handle(Command::TransferRights),
            Reply::Error { .. }
        ));
        assert!(matches!(
            app.handle(Command::LicenseRenew),
            Reply::Error { .. }
        ));
        assert!(
            server.requests.try_recv().is_err(),
            "logout cannot restart OAuth or license HTTP"
        );
        core.join().expect("core fixture closed");
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-native-license-ack", &[]);
    }

    #[cfg(windows)]
    #[test]
    fn a_device_limit_reaches_ipc_as_its_own_reply_and_not_as_generic_text() {
        let device = crate::license::installation::legacy_fingerprint().expect("huella local");
        let (_, keys) = crate::license_remote::tests::signed_fixture(&device);
        let server = crate::test_http::Server::start(vec![
            (200, serde_json::json!({"access_token":"rotated-local-access","refresh_token":"rotated-local-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
            (
                409,
                serde_json::json!({"error":"device_limit","message":"generic"}).to_string(),
            ),
        ]);
        let (root, store) = crate::test_store("app-device-limit");
        let account = crate::account::fixture(&server.base, &store);
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-test-key"),
            license_keys: Some(keys),
            channel: Some("test"),
            native_oauth: Some(crate::config::OAuthBuild {
                issuer: server.base.clone(),
                client_id: "public-fixture".into(),
                redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("redirect"),
            }),
        };
        let mut app = App::new(config, root.clone());
        app.account = Some(account);
        app.store = Some(store);
        let reply = app.handle(Command::LicenseRenew);
        assert_eq!(
            match &reply {
                Reply::DeviceLimit { message } => message.clone(),
                other => panic!("409 device_limit llegó como {other:?}"),
            },
            Error::DeviceLimit.to_string(),
            "el texto sigue saliendo del único mapeo de errores"
        );
        // El marco IPC conserva la distinción que el Hub consume.
        let mut wire = Vec::new();
        crate::protocol::write(
            &mut wire,
            &crate::protocol::Response {
                version: crate::protocol::VERSION,
                sequence: 1,
                reply,
            },
        )
        .expect("marco IPC");
        assert!(
            matches!(
                crate::protocol::read::<crate::protocol::Response>(&mut wire.as_slice())
                    .expect("DTO IPC")
                    .reply,
                Reply::DeviceLimit { .. }
            ),
            "el límite de dispositivos no puede llegar como fallo genérico"
        );
        for path in [
            "POST /token ",
            "GET /userinfo ",
            "POST /functions/v1/native-license ",
        ] {
            let request = server
                .requests
                .recv_timeout(Duration::from_secs(3))
                .expect("una operación HTTP");
            assert!(request.starts_with(path));
        }
        assert!(server.requests.try_recv().is_err());
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-device-limit", &["account"]);
    }

    #[test]
    fn switching_identity_revokes_before_saving_and_rejection_preserves_the_old_session() {
        for rejected in [false, true] {
            let device = "identity-change-fixture".to_owned();
            let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
            let server = crate::test_http::Server::start(vec![
                (200, serde_json::json!({"access_token":"new-local-access","refresh_token":"new-local-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
                (200, serde_json::json!({"sub":"other_fixture_user"}).to_string()),
            ]);
            let (root, store) = crate::test_store("app-account-switch");
            let mut account = crate::account::fixture(&server.base, &store);
            let login = account.begin_login().expect("login without browser");
            let params: std::collections::HashMap<_, _> = login
                .query_pairs()
                .map(|(key, value)| (key.into_owned(), value.into_owned()))
                .collect();
            let redirect = url::Url::parse(&params["redirect_uri"]).expect("redirect");
            let mut socket = TcpStream::connect(("127.0.0.1", redirect.port().expect("port")))
                .expect("callback");
            write!(
                socket,
                "GET /callback?state={}&code=fixture HTTP/1.1\r\nHost: localhost\r\n\r\n",
                params["state"]
            )
            .expect("callback request");
            let mut config = BuildConfig::load();
            config.supabase = Some(server.base.clone());
            let mut app = App::new(config, root.clone());
            app.account = Some(account);
            app.store = Some(store);
            app.candidate_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::Candidate {
                        account_id: credential.claims.subject.clone(),
                        credential,
                        device: device.clone(),
                    },
                )
                .expect("previous candidate");
            let (link, core) = core_fixture(
                device,
                keys,
                vec![if rejected {
                    CoreStep::RejectInvalidate
                } else {
                    CoreStep::Invalidate
                }],
            );
            app.attach_core(link);
            let reply = app.handle(Command::AccountPoll);
            assert!(
                matches!(reply, Reply::Account { signed_in: true, pending: false, error, .. } if error.is_some() == rejected)
            );
            let expected = if rejected {
                "user_fixture"
            } else {
                "other_fixture_user"
            };
            assert_eq!(
                app.account
                    .as_ref()
                    .expect("account")
                    .identity()
                    .expect("identity")
                    .subject,
                expected
            );
            assert_eq!(
                app.candidate_store()
                    .expect("store")
                    .load::<crate::license_remote::Candidate>("license-candidate")
                    .is_ok(),
                rejected
            );
            for _ in 0..2 {
                server
                    .requests
                    .recv_timeout(Duration::from_secs(3))
                    .expect("OAuth only");
            }
            assert!(
                server.requests.try_recv().is_err(),
                "services polling never renews the license"
            );
            core.join().expect("core closed");
            server.finish();
            drop(app);
            crate::cleanup_store(&root, "app-account-switch", &[]);
        }
    }

    #[test]
    fn callback_error_keeps_ipc_pending_and_exchange_error_clears_it() {
        let server = crate::test_http::Server::start(vec![(503, "{}".into())]);
        let (root, store) = crate::test_store("app-login-errors");
        let mut account = crate::account::fixture(&server.base, &store);
        account.logout(&store).expect("signed out fixture");
        let login = account.begin_login().expect("begin without browser");
        let params: std::collections::HashMap<_, _> = login
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();
        let redirect = url::Url::parse(&params["redirect_uri"]).expect("redirect");
        let mut app = App::new(BuildConfig::load(), root.clone());
        app.account = Some(account);
        app.store = Some(store);
        let mut socket =
            TcpStream::connect(("127.0.0.1", redirect.port().expect("port"))).expect("callback");
        write!(
            socket,
            "GET /callback?state=wrong-state&code=fixture HTTP/1.1\r\nHost: localhost\r\n\r\n"
        )
        .expect("request");
        let response = crate::protocol::Response {
            version: crate::protocol::VERSION,
            sequence: 1,
            reply: app.handle(Command::AccountPoll),
        };
        let mut wire = Vec::new();
        crate::protocol::write(&mut wire, &response).expect("IPC response");
        let decoded: crate::protocol::Response =
            crate::protocol::read(&mut wire.as_slice()).expect("IPC read");
        assert!(
            matches!(
                decoded.reply,
                Reply::Account {
                    pending: true,
                    error: Some(_),
                    ..
                }
            ),
            "rejected callback must not abandon polling"
        );
        drop(socket);
        let mut socket =
            TcpStream::connect(("127.0.0.1", redirect.port().expect("port"))).expect("callback");
        write!(
            socket,
            "GET /callback?state={}&code=fixture HTTP/1.1\r\nHost: localhost\r\n\r\n",
            params["state"]
        )
        .expect("request");
        assert!(
            matches!(
                app.handle(Command::AccountPoll),
                Reply::Account {
                    signed_in: false,
                    pending: false,
                    error: Some(_),
                    ..
                }
            ),
            "exchange failure leaves no listener"
        );
        assert!(matches!(
            app.handle(Command::AccountPoll),
            Reply::Account {
                pending: false,
                error: None,
                ..
            }
        ));
        assert!(TcpStream::connect(("127.0.0.1", redirect.port().expect("port"))).is_err());
        server
            .requests
            .recv_timeout(std::time::Duration::from_secs(3))
            .expect("one token request");
        assert!(server.requests.try_recv().is_err());
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-login-errors", &["account"]);
    }
}

pub fn default_root() -> Result<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("VANTARE_NATIVE_DATA_ROOT")
            .or_else(|| std::env::var_os("LOCALAPPDATA"))
            .map(|path| PathBuf::from(path).join("Vantare/native/services"))
            .ok_or(Error::Storage)
    }
    #[cfg(target_os = "linux")]
    {
        let root = match std::env::var_os("XDG_CONFIG_HOME") {
            Some(path) if PathBuf::from(&path).is_absolute() => PathBuf::from(path),
            Some(_) => return Err(Error::Storage),
            None => home()?.join(".config"),
        };
        Ok(root.join("Vantare/native/services"))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(home()?.join("Library/Application Support/Vantare/native/services"))
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        Err(Error::Unsupported)
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn home() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or(Error::Storage)
}

fn open_login(url: &url::Url) -> Result<()> {
    #[cfg(windows)]
    let mut command = {
        let mut command = std::process::Command::new("rundll32.exe");
        command.args(["url.dll,FileProtocolHandler", url.as_str()]);
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(url.as_str());
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(url.as_str());
        command
    };
    command.spawn().map(|_| ()).map_err(|_| Error::Unsupported)
}
