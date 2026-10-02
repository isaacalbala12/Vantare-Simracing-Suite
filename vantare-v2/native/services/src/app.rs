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
        crate::config::remote_url(config.authorize.as_str())?;
        crate::config::remote_url(config.supabase.as_str())?;
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
            let time = now()?;
            self.ensure_oauth(time)?;
            self.candidate_store()?;
            let device = crate::license::installation::legacy_fingerprint()?;
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
        self.revoke_local()?;
        let time = now()?;
        self.ensure_data(time)?;
        let device = crate::license::installation::legacy_fingerprint()?;
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
        let account_action = matches!(
            command,
            Command::AccountBegin | Command::AccountPoll | Command::AccountRenew | Command::Logout
        );
        match self.execute(command) {
            Ok(reply) => reply,
            Err(error) => {
                if account_action && let Some(account) = self.account.as_ref() {
                    Self::account_reply(account, Some(error))
                } else {
                    Reply::Error {
                        message: error.to_string(),
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
            | Command::ReportPrepare
            | Command::ReportRetryPrepare
            | Command::ReportSend { .. } => return self.report_reply(command),
            Command::RoadmapCached | Command::RoadmapRefresh => {
                return self.roadmap_reply(matches!(command, Command::RoadmapRefresh));
            }
            Command::TransferRights => return self.transfer_rights(),
            Command::LicenseStatus | Command::LicenseRenew | Command::DeviceReset => {
                return self.license_reply(&command);
            }
            Command::Logout => return self.logout_reply(),
            Command::AccountPoll => return self.poll_account(),
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
        let store = self.report_store.as_ref().ok_or(Error::Storage)?;
        match command {
            Command::DraftLoad => {
                return Ok(Reply::Draft {
                    draft: crate::report::load_draft(store)?,
                    message: "Borrador local; no se ha enviado".into(),
                });
            }
            Command::DraftSave { fields } => {
                self.reports
                    .as_mut()
                    .ok_or(Error::Storage)?
                    .cancel_preview();
                return Ok(Reply::Draft {
                    draft: Some(crate::report::save_draft(store, fields)?),
                    message: "Borrador protegido guardado; no se ha enviado".into(),
                });
            }
            Command::DraftDiscard => {
                self.reports
                    .as_mut()
                    .ok_or(Error::Storage)?
                    .cancel_preview();
                store.remove("report-draft")?;
                return Ok(Reply::Draft {
                    draft: None,
                    message:
                        "Borrador eliminado; cualquier intento previo sigue pendiente de revisión"
                            .into(),
                });
            }
            Command::ReportRetryPrepare => {
                if let Some(receipt) = self
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
            }
            _ => {}
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
                    preview: reports.prepare(&request, draft, environment)?,
                })
            }
            Command::ReportRetryPrepare => Ok(Reply::ReportPreview {
                preview: reports
                    .prepare_retry(&request, self.config.channel.ok_or(Error::Unconfigured)?)?,
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
        Install,
        Invalidate,
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
                let error = matches!(step, CoreStep::RejectInstall | CoreStep::RejectInvalidate)
                    .then_some("fixture rejection".to_owned());
                // Fixture de transporte: no acredita grants ni runtime real.
                control::write(
                    &mut pipe,
                    &control::Response {
                        version: control::VERSION,
                        sequence: request.sequence,
                        policy: control::Policy {
                            version: 1,
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

    #[test]
    fn switching_identity_revokes_before_saving_and_rejection_preserves_the_old_session() {
        for rejected in [false, true] {
            let device = crate::license::installation::legacy_fingerprint().expect("fingerprint");
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
        std::env::var_os("LOCALAPPDATA")
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
