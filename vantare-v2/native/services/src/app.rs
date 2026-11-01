//! Propietario único de red y persistencia; nunca decide derechos del núcleo.
use crate::{
    Error, Result,
    account::{Account, OAuth},
    config::BuildConfig,
    http::Http,
    outcome::{
        Observation, Origin as OutcomeOrigin, Outcome as AccessOutcome, Revocation, outcome,
    },
    protocol::{Command, Reply, Session},
    storage::Store,
};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
mod mail;
#[cfg(all(test, windows))]
mod online_only_tests;
mod pilot;
#[cfg(all(test, windows))]
mod renewal_tests;

pub struct App {
    core: Option<vantare_ipc::control::CoreLink>,
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
    triage: crate::triage::Triage,
    pilot: Option<crate::pilot::Local>,
    pilot_identity: Option<crate::account::Identity>,
    clock: fn() -> Result<u64>,
}

impl App {
    pub fn new(config: BuildConfig, root: PathBuf) -> Self {
        Self::with_clock(config, root, now)
    }

    pub fn with_clock(config: BuildConfig, root: PathBuf, clock: fn() -> Result<u64>) -> Self {
        retire_legacy_license_files(&config, &root, clock);
        Self {
            core: None,
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
            triage: crate::triage::Triage::default(),
            pilot: None,
            pilot_identity: None,
            clock,
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

    /// Explicit per-instance fixture opt-in; unavailable to CLI/IPC or distribution.
    #[cfg(feature = "test-support")]
    pub fn enable_loopback_for_test(&mut self) {
        self.http.enable_loopback_for_test();
    }

    fn core_command(
        &self,
        command: vantare_ipc::control::Command,
    ) -> Result<vantare_ipc::control::Policy> {
        vantare_ipc::control::request(self.core.as_ref().ok_or(Error::Unconfigured)?, command)
            .map_err(|error| {
                let failure = vantare_ipc::control::Failure::classify(&error);
                eprintln!("services-core {}", failure.diagnostic());
                Error::Core(failure)
            })
    }

    fn policy_message(policy: &vantare_ipc::control::Policy) -> String {
        if let Some(message) = crate::outcome::policy_message(policy) {
            message
        } else if policy.state.permits_access() {
            "Derechos verificados y guardados por el núcleo".into()
        } else {
            "Puedes iniciar sesión o comprobar el acceso para recuperarlo.".into()
        }
    }

    fn revoke_local(&mut self, effects: AccessOutcome) -> Result<()> {
        if !effects.revoke {
            return Ok(());
        }
        self.core_command(vantare_ipc::control::Command::Invalidate)?;
        Ok(())
    }

    /// Called only on the renew stack with its freshly verified HTTP response.
    /// No license response or retry hint is persisted by services.
    fn complete_online_renewal(
        &mut self,
        credential: &crate::license::CredentialV1,
    ) -> Result<Reply> {
        let installed = self.core_command(vantare_ipc::control::Command::InstallOnline {
            credential: serde_json::to_string(credential).map_err(|_| Error::InvalidCredential)?,
        });
        let policy = match installed {
            Ok(policy) => policy,
            Err(error @ Error::Core(vantare_ipc::control::Failure::Rejected)) => {
                let policy = self.core_command(vantare_ipc::control::Command::Read)?;
                if matches!(
                    policy.state,
                    vantare_ipc::control::AccessState::ClockBehind { .. }
                ) {
                    let message = Self::policy_message(&policy);
                    return Ok(Reply::License { policy, message });
                }
                return Err(error);
            }
            Err(error) => return Err(error),
        };
        Ok(Reply::License {
            policy,
            message: "Derechos verificados y guardados por el núcleo".into(),
        })
    }

    fn license_reply(&mut self, command: &Command) -> Result<Reply> {
        if matches!(command, Command::LicenseStatus) {
            let policy = self.core_command(vantare_ipc::control::Command::Read)?;
            let message = Self::policy_message(&policy);
            return Ok(Reply::License { policy, message });
        }
        if matches!(
            command,
            Command::LicenseRenew | Command::LicenseRenewAutomatic
        ) {
            let automatic = matches!(command, Command::LicenseRenewAutomatic);
            // Sin configuración compilada no hay red, huella ni fallback de datos.
            if self.config.supabase.is_none()
                || self.config.anon_key.is_none_or(str::is_empty)
                || self.config.license_keys.is_none_or(str::is_empty)
            {
                return Err(Error::Unconfigured);
            }
            let device = crate::license::installation::legacy_fingerprint()?;
            // Sin propietario no se inicia red: solo su ACK instala una licencia.
            // Las renovaciones conservan siempre los derechos firmados anteriores.
            self.core.as_ref().ok_or(Error::Unconfigured)?;
            let time = (self.clock)()?;
            self.ensure_oauth_origin(time, automatic)?;
            let renewal = crate::license_remote::renew(
                &self.http,
                &self.config,
                self.account.as_ref().ok_or(Error::Authentication)?,
                time,
                &device,
            );
            let credential = match renewal {
                Ok(credential) => credential,
                Err(error) => {
                    return Err(if error == Error::InvalidCredential {
                        Error::Version
                    } else {
                        error
                    });
                }
            };
            let reply = self.complete_online_renewal(&credential)?;
            if has_commercial_license(&credential.claims.capabilities, time) {
                crate::diagnostics::record_usage_once(
                    &crate::diagnostics::Usage::AccountSignedIn {},
                );
                crate::diagnostics::record_usage_once(
                    &crate::diagnostics::Usage::CommercialLicenseObserved {},
                );
            }
            return Ok(reply);
        }
        if !matches!(command, Command::DeviceReset) {
            return Err(Error::Protocol);
        }
        let device = crate::license::installation::legacy_fingerprint()?;
        let time = (self.clock)()?;
        self.ensure_oauth(time)?;
        self.ensure_data(time)?;
        // No retirar derechos si la sesión no permite liberar el dispositivo.
        self.revoke_local(outcome(Observation::Action(Revocation::DeviceReset)))?;
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
        self.revoke_local(outcome(Observation::Action(Revocation::Logout)))?;
        self.data_session = None;
        self.triage.cancel();
        if let Some(reports) = self.reports.as_mut() {
            reports.cancel_preview();
        }
        if self.config.native_oauth.is_some() {
            // Local logout must not require discovery or decrypting an old session.
            if self.store.is_none() {
                self.store = Some(self.open_account_store()?);
            }
            let store = self.store.as_ref().ok_or(Error::Storage)?;
            let at = (self.clock)().unwrap_or(0).saturating_mul(1000);
            if let Err(error) = store.restore_cache::<serde_json::Value>("account", at) {
                eprintln!("account-logout: account-quarantine={error:?}");
            }
            if let Err(error) = store.restore_cache::<OAuth>("oauth-metadata", at) {
                eprintln!("account-logout: metadata-quarantine={error:?}");
            }
            if let Some(account) = self.account.as_mut() {
                account.end_email_session(&self.http);
                account.logout(store)?;
            } else {
                Account::clear_saved(store)?;
            }
        }
        Ok(Reply::Account {
            session: Session::SignedOut,
            copy_link: false,
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
        self.ensure_oauth_origin(now, false)
    }
    fn ensure_oauth_origin(&mut self, now: u64, automatic: bool) -> Result<()> {
        self.ensure_account()?;
        let account = self.account.as_ref().ok_or(Error::Authentication)?;
        if account.needs_sign_in() {
            return Err(Error::Authentication);
        }
        if account
            .expires_at()
            .is_some_and(|expires| expires <= now.saturating_add(60))
        {
            self.refresh_oauth_origin(now, automatic)?;
        }
        Ok(())
    }

    fn refresh_oauth(&mut self, now: u64) -> Result<()> {
        self.refresh_oauth_origin(now, false)
    }
    fn refresh_oauth_origin(&mut self, now: u64, automatic: bool) -> Result<()> {
        // Un refresh rechazado exige nueva entrada, sin invalidar derechos firmados.
        self.core.as_ref().ok_or(Error::Unconfigured)?;
        let exchange = self
            .account
            .as_ref()
            .ok_or(Error::Authentication)?
            .refresh()?;
        let completion = match exchange.run(&self.http, now) {
            Ok(completion) => completion,
            Err(error) => {
                let effects = outcome(Observation::Error(
                    error,
                    OutcomeOrigin::OAuth { automatic },
                ));
                if effects.needs_sign_in {
                    self.data_session = None;
                    self.account
                        .as_mut()
                        .ok_or(Error::Authentication)?
                        .require_sign_in(self.store.as_ref().ok_or(Error::Storage)?)?;
                }
                return Err(error);
            }
        };
        self.account
            .as_mut()
            .ok_or(Error::Authentication)?
            .complete(completion, self.store.as_ref().ok_or(Error::Storage)?)
    }

    fn open_account_store(&self) -> Result<Store> {
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
        Store::open(&self.root, &context)
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
        let store = match self.store.take() {
            Some(store) => store,
            None => self.open_account_store()?,
        };
        let at = (self.clock)()?.saturating_mul(1000);
        let cached = match store.restore_cache::<OAuth>("oauth-metadata", at)? {
            Some(oauth)
                if oauth.matches(&config.issuer, &config.client_id, &config.redirect_uri) =>
            {
                Some(oauth)
            }
            Some(_) => {
                // Solo metadata pública incompatible; no migrar ni borrar la sesión.
                store.quarantine_dated("oauth-metadata", at)?;
                None
            }
            None => None,
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
        let account = Account::restore_at(oauth, &store, at)?;
        self.store = Some(store);
        self.account = Some(account);
        Ok(())
    }

    fn poll_account(&mut self) -> Result<Reply> {
        self.ensure_account()?;
        if self.account.as_ref().is_some_and(Account::email_pending) {
            return Ok(self.email_account(None));
        }
        let account = self.account.as_mut().ok_or(Error::Authentication)?;
        if account.login_pending()
            && let Some(ticket) = account.poll_login()?
        {
            let completion = ticket.run(&self.http, (self.clock)()?)?;
            let changed = account
                .identity()
                .is_none_or(|old| old != completion.identity());
            if changed {
                self.triage.cancel();
            }
            // Otra identidad no hereda la autoridad anterior.
            // Sin identidad restaurada tampoco se conoce al dueño del binding.
            // Revocar antes de persistir la nueva sesión; si falla, no sustituirla.
            if changed {
                self.revoke_local(outcome(Observation::Action(Revocation::IdentityChange)))?;
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

    fn automatic_failure(error: Error) -> Reply {
        // La tabla marca DeviceLimit como renewal=true (definitivo). Este retorno
        // previo conserva su variante accionable en vez de emitir LicenseFailure.
        if error == Error::DeviceLimit {
            return Reply::DeviceLimit {
                message: error.to_string(),
            };
        }
        Reply::LicenseFailure {
            outcome: outcome(Observation::Error(
                error,
                OutcomeOrigin::Renewal { automatic: true },
            ))
            .renewal,
            message: if error == Error::Version {
                "Actualiza la app para verificar la nueva licencia.".into()
            } else {
                error.to_string()
            },
        }
    }

    fn renewal_failure(&self, error: Error, automatic: bool) -> Reply {
        if !automatic
            && let Some(account) = self
                .account
                .as_ref()
                .filter(|account| account.needs_sign_in())
        {
            return Self::account_reply(account, Some(error));
        }
        let classification = outcome(Observation::Error(
            error,
            OutcomeOrigin::Renewal { automatic },
        ));
        // Sin identidad no hubo petición remota: conserva el error local tras Logout.
        let has_identity = self.account.as_ref().and_then(Account::identity).is_some();
        if automatic
            || (has_identity
                && classification.renewal == crate::protocol::RenewalOutcome::Definitive)
        {
            // El rechazo explícito frena el scheduler también en manual,
            // conservando el binding. El transporte sigue transitorio.
            Self::automatic_failure(error)
        } else {
            Reply::Error {
                message: error.to_string(),
            }
        }
    }

    fn diagnostic_operation(command: &Command) -> &'static str {
        match command {
            Command::TriagePrepare { .. } => "triage-prepare",
            Command::TriageSend { .. } => "triage-send",
            Command::TestingRefresh
            | Command::TestingAnswer { .. }
            | Command::TestingContribute { .. } => "participation",
            Command::ReportSend { .. } => "report-send",
            _ => "request",
        }
    }

    pub fn handle(&mut self, command: Command) -> Reply {
        let report_send = matches!(
            command,
            Command::ReportSend { .. } | Command::TriageSend { .. }
        );
        if let Command::AccountEmail { action } = command {
            return self.email_account(Some(action));
        }
        let operation = Self::diagnostic_operation(&command);
        let account_action = matches!(
            command,
            Command::AccountBegin
                | Command::AccountCancel
                | Command::AccountCopyLink
                | Command::AccountPoll
                | Command::AccountRenew
                | Command::AccountProfileRefresh
                | Command::Logout
        );
        let profile_refresh = matches!(command, Command::AccountProfileRefresh);
        let login_begin = matches!(command, Command::AccountBegin);
        let automatic = matches!(command, Command::LicenseRenewAutomatic);
        let probe = matches!(command, Command::Status | Command::Probe);
        let license_renew = matches!(
            command,
            Command::LicenseRenew | Command::LicenseRenewAutomatic
        );
        if login_begin {
            let _log = writeln!(std::io::stderr(), "account-login: begin");
        }
        let outcome = self.execute(command);
        if license_renew {
            // Error es un enum cerrado sin mensajes remotos ni datos de cuenta.
            let result = outcome.as_ref().map(|_| ()).map_err(|error| *error);
            let _log = writeln!(
                std::io::stderr(),
                "account-rights: renewal-result={result:?}"
            );
        }
        if login_begin && let Err(error) = &outcome {
            let _log = writeln!(std::io::stderr(), "account-login: failed {error:?}");
        }
        if !probe && let Ok(time) = (self.clock)() {
            self.triage.record(time, outcome.is_err(), operation);
        }
        if license_renew && let Err(error) = outcome {
            return self.renewal_failure(error, automatic);
        }
        match outcome {
            Ok(reply) => {
                if matches!(
                    &reply,
                    Reply::Account {
                        signed_in: true,
                        pending: false,
                        error: None,
                        ..
                    }
                ) && self.account.as_ref().is_some_and(|account| {
                    (self.clock)().is_ok_and(|time| account.authorized(time, |_| Ok(())).is_ok())
                }) {
                    crate::diagnostics::record_usage_once(
                        &crate::diagnostics::Usage::AccountSignedIn {},
                    );
                }
                let feature = match &reply {
                    Reply::Checkout { .. } => Some("checkout_opened"),
                    Reply::ReportReceipt { .. } if report_send => Some("report_sent"),
                    _ => None,
                };
                if let Some(feature) = feature {
                    crate::diagnostics::record_usage(&crate::diagnostics::Usage::FeatureUsed {
                        feature: feature.into(),
                    });
                }
                reply
            }
            Err(error) => {
                if report_send && error == Error::Authentication {
                    // Un 401 del envío invalida el bearer de datos aún vigente;
                    // el siguiente reintento vuelve a pasar por authorize.
                    self.data_session = None;
                }
                if account_action && let Some(account) = self.account.as_ref() {
                    Self::account_error_reply(account, error, profile_refresh)
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

    fn email_account(&mut self, action: Option<crate::protocol::EmailAction>) -> Reply {
        let result: Result<Reply> = (|| {
            self.ensure_account()?;
            let time = (self.clock)()?;
            let account = self.account.as_mut().ok_or(Error::Authentication)?;
            let ticket = match action {
                Some(action) => account.email_action(&self.http, action, time)?,
                None => None,
            };
            // Cancel devuelve un formulario sin login y no tiene canje pendiente.
            if !account.email_pending() {
                return Ok(account.email_reply(time, None));
            }
            if let Some(completion) = account.exchange_email(&self.http, ticket, time)? {
                if self
                    .account
                    .as_ref()
                    .and_then(Account::identity)
                    .is_none_or(|old| old != completion.identity())
                {
                    self.triage.cancel();
                    self.revoke_local(outcome(Observation::Action(Revocation::IdentityChange)))?;
                }
                self.account
                    .as_mut()
                    .ok_or(Error::Authentication)?
                    .complete(completion, self.store.as_ref().ok_or(Error::Storage)?)?;
                crate::diagnostics::record_usage_once(
                    &crate::diagnostics::Usage::AccountSignedIn {},
                );
                return Ok(Self::account_reply(
                    self.account.as_ref().ok_or(Error::Authentication)?,
                    None,
                ));
            }
            Ok(self
                .account
                .as_ref()
                .ok_or(Error::Authentication)?
                .email_reply(time, None))
        })();
        result.unwrap_or_else(|error| {
            self.account.as_ref().map_or_else(
                || Reply::Email {
                    stage: crate::protocol::EmailStage::Form,
                    retry_after_seconds: 0,
                    message: error.to_string(),
                    error: Some(error.to_string()),
                },
                |account| account.email_reply((self.clock)().unwrap_or(0), Some(error)),
            )
        })
    }

    fn status_reply(&self) -> Reply {
        Reply::Status {
            account_configured: self.config.native_account_configured(),
            message: if self.config.native_account_configured() {
                "servicio disponible"
            } else {
                "servicio no configurado"
            }
            .into(),
        }
    }

    fn execute(&mut self, command: Command) -> Result<Reply> {
        match command {
            Command::MailConsentGet | Command::MailConsentSet { .. } => {
                return self.mail_reply(&command);
            }
            Command::PilotLoad | Command::PilotSave { .. } | Command::PilotSync => {
                return self.pilot_reply(command);
            }
            Command::Status | Command::Probe => return Ok(self.status_reply()),
            Command::AccountEmail { .. } => return Err(Error::Protocol),
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
                let racecontrol = url::Url::parse(crate::calendar::RACECONTROL_URL)
                    .map_err(|_| Error::Unconfigured)?;
                let at = chrono::DateTime::from_timestamp(
                    i64::try_from((self.clock)()?).unwrap_or(0),
                    0,
                )
                .ok_or(Error::Clock)?;
                let (schedule, fallback) =
                    crate::calendar::refresh(&self.http, &self.config, &racecontrol, at)?;
                return Ok(Reply::Calendar { schedule, fallback });
            }
            Command::RoadmapCached | Command::RoadmapRefresh => {
                return self.roadmap_reply(matches!(command, Command::RoadmapRefresh));
            }
            Command::TestingRefresh
            | Command::TestingAnswer { .. }
            | Command::TestingCredit { .. }
            | Command::TestingNoticeRead { .. }
            | Command::TestingContribute { .. } => {
                return self.testing_reply(command);
            }
            Command::TriagePrepare { .. } | Command::TriageSend { .. } => {
                return self.triage_reply(command);
            }
            Command::Purchase { product } => return self.purchase_reply(product),
            Command::LicenseStatus
            | Command::LicenseRenew
            | Command::LicenseRenewAutomatic
            | Command::DeviceReset => {
                return self.license_reply(&command);
            }
            Command::Logout => return self.logout_reply(),
            Command::AccountCancel => return self.cancel_account_attempt(),
            Command::AccountCopyLink => {
                let account = self.account.as_ref().ok_or(Error::Canceled)?;
                return Ok(Reply::AccountLink {
                    url: crate::protocol::LoginLink(account.login_link()?.to_owned()),
                });
            }
            Command::AccountPoll => return self.poll_account(),
            Command::AccountRenew => {
                self.ensure_account()?;
                self.refresh_oauth((self.clock)()?)?;
                return Ok(Self::account_reply(
                    self.account.as_ref().ok_or(Error::Authentication)?,
                    None,
                ));
            }
            Command::AccountProfileRefresh => {
                let time = (self.clock)()?;
                // Profile reads (including the Hub's missing-cache refresh) have
                // no authority to revoke a signed license or log the account out.
                self.ensure_oauth_origin(time, true)?;
                let account = self.account.as_mut().ok_or(Error::Authentication)?;
                account.refresh_profile(
                    &self.http,
                    time,
                    self.store.as_ref().ok_or(Error::Storage)?,
                )?;
                return Ok(Self::account_reply(account, None));
            }
            Command::AccountBegin => self.ensure_account()?,
        }
        let account = self.account.as_mut().ok_or(Error::Unconfigured)?;
        match command {
            Command::AccountBegin => {
                crate::browser::begin(account, crate::browser::open)?;
            }
            _ => return Err(Error::Protocol),
        }
        Ok(Self::account_reply(account, None))
    }

    fn purchase_reply(&mut self, product: crate::protocol::BillingProduct) -> Result<Reply> {
        let time = (self.clock)()?;
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
        Ok(Reply::Checkout { url })
    }

    fn account_error_reply(account: &Account, error: Error, profile_refresh: bool) -> Reply {
        let mut reply = Self::account_reply(account, Some(error));
        if profile_refresh
            && account.identity().is_some()
            && !account.needs_sign_in()
            && let Reply::Account { message, .. } = &mut reply
        {
            *message = "No se pudo actualizar el perfil; la sesión sigue abierta.".into();
        }
        reply
    }

    fn account_reply(account: &Account, error: Option<Error>) -> Reply {
        let pending = account.login_pending();
        let copy_link = account.login_link().is_ok();
        let error = error
            .or(copy_link.then_some(Error::BrowserUnavailable))
            .or((account.needs_sign_in() && !pending).then_some(Error::Authentication));
        Reply::Account {
            session: account.session(),
            copy_link,
            signed_in: account.identity().is_some() && !account.needs_sign_in(),
            profile: account.profile().cloned(),
            expires_at: account.expires_at(),
            pending,
            message: if account.needs_sign_in() && !pending {
                "Vuelve a iniciar sesión para usar los servicios de tu cuenta.".into()
            } else {
                error.map_or_else(
                    || {
                        if pending {
                            "Complete el inicio de sesión en el navegador"
                        } else if account.identity().is_some() {
                            "Sesión iniciada en este dispositivo"
                        } else {
                            "Sesión cerrada en este dispositivo"
                        }
                        .into()
                    },
                    |error| error.to_string(),
                )
            },
            error: error.map(|error| error.to_string()),
        }
    }

    fn cancel_account_attempt(&mut self) -> Result<Reply> {
        self.ensure_account()?;
        let account = self.account.as_mut().ok_or(Error::Authentication)?;
        account.end_email_session(&self.http);
        account.cancel_login()?;
        Ok(Self::account_reply(account, None))
    }

    fn testing_reply(&mut self, command: Command) -> Result<Reply> {
        let time = (self.clock)()?;
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

    fn triage_reply(&mut self, command: Command) -> Result<Reply> {
        let time = (self.clock)()?;
        self.ensure_data(time)?;
        let session = self.data_session.as_ref().ok_or(Error::Authentication)?;
        let channel = crate::report::rpc_channel(self.config.channel.ok_or(Error::Unconfigured)?);
        match command {
            Command::TriagePrepare {
                title,
                body,
                selection,
                consent,
            } => {
                let names = self
                    .account
                    .as_ref()
                    .and_then(|a| a.profile())
                    .map(|p| vec![p.name.clone()])
                    .unwrap_or_default();
                let input = crate::triage::Input {
                    title: &title,
                    body: &body,
                    selection,
                    consent,
                    private_names: &names,
                };
                Ok(Reply::TriagePreview {
                    preview: self
                        .triage
                        .prepare(session.account_id(), channel, input, time)?,
                })
            }
            Command::TriageSend { preview_id } => {
                let request = session.request(
                    &self.http,
                    self.bridge.as_ref().ok_or(Error::BridgeUnconfigured)?,
                    self.account.as_ref().ok_or(Error::Authentication)?,
                    time,
                );
                Ok(Reply::Testing {
                    data: self.triage.send(&request, channel, &preview_id, time)?,
                })
            }
            _ => Err(Error::Protocol),
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
                    (self.clock)()?,
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
        let now = (self.clock)()?;
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

// One-way retirement, not a license cache: inspect names only, never decrypt or install.
// Missing files do not create a Store. Busy/rename/clock failures cannot block startup.
fn retire_legacy_license_files(config: &BuildConfig, root: &Path, clock: fn() -> Result<u64>) {
    use sha2::{Digest, Sha256};
    let context = format!(
        "license-v1|{}|{}",
        config
            .supabase
            .as_ref()
            .map_or("unconfigured", url::Url::as_str),
        config.channel.unwrap_or("unknown")
    );
    let namespace = root.join(format!("{:x}", Sha256::digest(context.as_bytes())));
    #[cfg(windows)]
    let extension = "dpapi";
    #[cfg(not(windows))]
    let extension = "json";
    let present = ["license-candidate", "license-transfer-pending"].map(|name| {
        let exists = namespace.join(format!("{name}.{extension}")).try_exists();
        if exists.is_err() {
            eprintln!("license-retirement-incomplete");
        }
        (name, exists.unwrap_or(false))
    });
    if !present.iter().any(|(_, exists)| *exists) {
        return;
    }
    let Ok(store) = Store::open(root, &context) else {
        eprintln!("license-retirement-incomplete");
        return;
    };
    let at = clock().unwrap_or_default().saturating_mul(1000);
    for (name, exists) in present {
        if exists && store.quarantine_dated(name, at).is_err() {
            eprintln!("license-retirement-incomplete");
        }
    }
}

fn has_commercial_license(capabilities: &[crate::license::Capability], now: u64) -> bool {
    capabilities
        .iter()
        .any(|capability| match capability.key.as_str() {
            "vantare.edition.launch_v1" | "vantare.plan.founders" => capability.perpetual,
            "vantare.plan.pro" => chrono::DateTime::parse_from_rfc3339(&capability.paid_through)
                .is_ok_and(|end| u64::try_from(end.timestamp()).is_ok_and(|end| end > now)),
            _ => false,
        })
}

#[cfg(test)]
impl App {
    // Fixture accessor; production only retires names and never loads license content.
    fn legacy_store(&self) -> Result<Store> {
        Store::open(
            &self.root,
            &crate::license_remote::tests::legacy_context(
                self.config.supabase.as_ref().map(url::Url::as_str),
                self.config.channel,
            ),
        )
    }
}

#[cfg(test)]
mod analytics_tests {
    use super::*;

    #[test]
    fn commercial_observation_excludes_roles_expired_and_unknown_grants() {
        for (key, expiry, perpetual, expected) in [
            ("vantare.plan.pro", "2026-10-15T00:00:00Z", false, true),
            ("vantare.plan.pro", "2020-01-01T00:00:00Z", false, false),
            ("vantare.plan.pro", "invalid", false, false),
            (
                "vantare.operational.owner",
                "2026-10-15T00:00:00Z",
                false,
                false,
            ),
            ("vantare.module.engineer", "", true, false),
            ("vantare.edition.launch_v1", "", true, true),
        ] {
            let capability = crate::license::Capability {
                key: key.into(),
                paid_through: expiry.into(),
                perpetual,
                scope_version: String::new(),
            };
            assert_eq!(
                has_commercial_license(&[capability], 1_792_000_000),
                expected
            );
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

    #[cfg(windows)]
    mod characterization;
    #[cfg(windows)]
    mod session_cancel;

    #[cfg(windows)]
    #[test]
    fn profile_refresh_rejections_preserve_session_and_candidate_through_host_session() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        for oauth_refresh in [true, false] {
            for (status, body) in [
                (400, r#"{"error":"invalid_grant"}"#),
                (401, "{}"),
                (403, "{}"),
                (429, "{}"),
                (503, "{}"),
            ] {
                let server = crate::test_http::Server::start(vec![(status, body.into())]);
                let (root, store) = crate::test_store("profile-preserves-session");
                let account = crate::account::fixture(&server.base, &store);
                assert!(
                    account.profile().is_none(),
                    "restored session has no cached profile"
                );
                let clock: fn() -> Result<u64> = if oauth_refresh {
                    || Ok(1000)
                } else {
                    || Ok(100)
                };
                let mut app = App::with_clock(BuildConfig::load(), root.clone(), clock);
                app.account = Some(account);
                app.store = Some(store);
                app.legacy_store()
                    .expect("store")
                    .save(
                        "license-candidate",
                        &crate::license_remote::tests::LegacyCandidate {
                            credential: credential.clone(),
                            account_id: credential.claims.subject.clone(),
                            device: device.clone(),
                        },
                    )
                    .expect("signed candidate");
                let (link, core) = core_fixture(device.clone(), keys, vec![CoreStep::Read]);
                app.attach_core(link);
                let reply = crate::host::fixture_request(&mut app, Command::AccountProfileRefresh);
                let needs_sign_in = oauth_refresh && matches!(status, 400 | 401);
                if let Reply::Account { message, .. } = &reply {
                    assert_eq!(
                        message,
                        if needs_sign_in {
                            "Vuelve a iniciar sesión para usar los servicios de tu cuenta."
                        } else {
                            "No se pudo actualizar el perfil; la sesión sigue abierta."
                        }
                    );
                }
                assert!(matches!(
                    reply,
                    Reply::Account {
                        signed_in,
                        profile: None,
                        expires_at: Some(1000),
                        error: Some(_),
                        ..
                    } if signed_in != needs_sign_in
                ));
                assert!(
                    app.legacy_store()
                        .expect("store")
                        .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                        .is_ok()
                );
                assert!(matches!(
                    crate::host::fixture_request(&mut app, Command::LicenseStatus),
                    Reply::License { .. }
                ));
                core.join().expect("only Read: never Invalidate");
                let request = server
                    .requests
                    .recv_timeout(Duration::from_secs(3))
                    .expect("observed profile route");
                assert!(request.starts_with(if oauth_refresh {
                    "POST /token "
                } else {
                    "GET /userinfo "
                }));
                assert!(
                    server.requests.try_recv().is_err(),
                    "one request, no replay"
                );
                server.finish();
                drop(app);
                crate::cleanup_store(&root, "profile-preserves-session", &[]);
            }
        }
    }

    #[cfg(windows)]
    #[test]
    fn account_renew_uses_injected_clock_before_http() {
        let server = crate::test_http::Server::start_observed(vec![(
            400,
            r#"{"error":"invalid_grant"}"#.into(),
        )]);
        let (root, store) = crate::test_store("account-renew-clock");
        let account = crate::account::fixture(&server.base, &store);
        let mut app = App::with_clock(BuildConfig::load(), root.clone(), || Err(Error::Canceled));
        app.account = Some(account);
        app.store = Some(store);
        assert_eq!(
            app.execute(Command::AccountRenew).err(),
            Some(Error::Canceled)
        );
        assert!(
            server.requests.try_recv().is_err(),
            "clock failure precedes HTTP"
        );
        drop(app);
        assert!(server.finish_observed().is_empty());
        crate::cleanup_store(&root, "account-renew-clock", &[]);
    }

    #[cfg(windows)]
    #[test]
    fn logout_tombstone_survives_locked_reads_and_cleanup_but_write_failure_is_reported() {
        use std::os::windows::fs::OpenOptionsExt;
        for (name, sharing, succeeds) in [
            ("oauth-metadata", 6, true),  // deny reads without locking the tombstone
            ("oauth-metadata", 1, true),  // deny quarantine rename
            ("account-profile", 1, true), // deny cosmetic cleanup
            ("account", 1, false),        // deny the required tombstone replacement
        ] {
            let server = crate::test_http::Server::start(vec![]);
            let (root, namespace, context) =
                seed_broken_session(&server.base, "oauth-metadata", b"broken fixture");
            let store = Store::open(&root, &context).expect("fixture store");
            let account = crate::account::fixture(&server.base, &store);
            store
                .save("account-profile", &serde_json::json!({}))
                .expect("profile");
            drop(account);
            drop(store);
            let locked = std::fs::OpenOptions::new()
                .read(true)
                .share_mode(sharing)
                .open(namespace.join(format!("{name}.dpapi")))
                .expect("fixture lock");
            let mut app =
                App::with_clock(account_recovery_config(&server.base), root.clone(), || {
                    Ok(1000)
                });
            let (link, core) = core_fixture(String::new(), "unused", vec![CoreStep::Invalidate]);
            app.attach_core(link);
            let reply = crate::host::fixture_request(&mut app, Command::Logout);
            assert_eq!(
                matches!(
                    reply,
                    Reply::Account {
                        signed_in: false,
                        error: None,
                        ..
                    }
                ),
                succeeds
            );
            if !succeeds {
                assert!(matches!(reply, Reply::Error { .. }));
            }
            core.join().expect("revocation before local writes");
            assert!(server.requests.try_recv().is_err(), "no logout discovery");
            drop(locked);
            drop(app);
            let store = Store::open(&root, &context).expect("restart fixture");
            let saved = store
                .load::<serde_json::Value>("account")
                .expect("durable state");
            assert_eq!(
                saved["state"],
                if succeeds { "SignedOut" } else { "SignedIn" }
            );
            drop(store);
            server.finish();
            crate::cleanup_store(&root, &context, &[]);
        }
    }

    #[cfg(windows)]
    fn seed_broken_session(
        base: &url::Url,
        damaged: &str,
        broken: &[u8],
    ) -> (PathBuf, PathBuf, String) {
        let context = format!("v1|{base}|public-fixture|nightly|{base}");
        let (root, store) = crate::test_store(&context);
        let account = crate::account::fixture(base, &store);
        let oauth: OAuth = serde_json::from_value(serde_json::json!({
            "issuer":base, "client_id":"public-fixture", "redirect":"http://127.0.0.1:0/callback",
            "authorization":base.join("authorize").expect("url"), "token":base.join("token").expect("url"),
            "userinfo":base.join("userinfo").expect("url")
        })).expect("metadata");
        store
            .save("oauth-metadata", &oauth)
            .expect("metadata fixture");
        let namespace = std::fs::read_dir(&root)
            .expect("root")
            .next()
            .expect("namespace")
            .expect("entry")
            .path();
        let path = namespace.join(format!("{damaged}.dpapi"));
        std::fs::write(&path, broken).expect("corrupt fixture only");
        drop(account);
        drop(store);
        (root, namespace, context)
    }

    #[cfg(windows)]
    fn complete_fixture_login(app: &mut App) {
        let account = app.account.as_mut().expect("restored signed out");
        let login = account
            .begin_login()
            .expect("new login without opening browser");
        assert!(account.login_pending());
        let (link, core) = core_fixture(String::new(), "unused", vec![CoreStep::Invalidate]);
        app.attach_core(link);
        let _socket = login_callback(&login);
        assert!(matches!(
            crate::host::fixture_request(app, Command::AccountPoll),
            Reply::Account {
                signed_in: true,
                pending: false,
                error: None,
                ..
            }
        ));
        assert_eq!(
            app.account
                .as_ref()
                .expect("new account")
                .identity()
                .expect("new identity")
                .subject,
            "user_recovered"
        );
        core.join().expect("new identity invalidates before saving");
    }

    #[cfg(windows)]
    fn account_recovery_config(base: &url::Url) -> BuildConfig {
        BuildConfig {
            supabase: Some(base.clone()),
            anon_key: None,
            license_keys: None,
            channel: Some("nightly"),
            native_oauth: Some(crate::config::OAuthBuild {
                issuer: base.clone(),
                client_id: "public-fixture".into(),
                redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("url"),
            }),
        }
    }

    #[cfg(windows)]
    #[test]
    fn corrupt_account_documents_recover_and_logout_without_discovery() {
        for (damaged, logout_first) in [
            ("account", true),
            ("oauth-metadata", true),
            ("account", false),
            ("oauth-metadata", false),
        ] {
            let server = crate::test_http::Server::start_with(|base| {
                let mut responses = if damaged == "oauth-metadata" {
                    vec![(200, serde_json::json!({
                "issuer":base, "authorization_endpoint":base.join("authorize").expect("url"),
                "token_endpoint":base.join("token").expect("url"), "userinfo_endpoint":base.join("userinfo").expect("url"),
                "code_challenge_methods_supported":["S256"]
            }).to_string())]
                } else {
                    vec![]
                };
                responses.extend([
                    (200, serde_json::json!({"access_token":"fixture-new-access","refresh_token":"fixture-new-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
                    (200, serde_json::json!({"sub":"user_recovered"}).to_string()),
                ]);
                responses
            });
            let broken = b"fixture-unreadable-dpapi";
            let (root, namespace, context) = seed_broken_session(&server.base, damaged, broken);
            let config = || account_recovery_config(&server.base);
            let mut app = App::with_clock(config(), root.clone(), || Ok(1000));
            let mut seen = 0;
            if !logout_first {
                assert!(
                    matches!(crate::host::fixture_request(&mut app, Command::AccountPoll), Reply::Account { pending: false, error: None, signed_in, .. } if signed_in == (damaged == "oauth-metadata"))
                );
                let account = app.account.as_mut().expect("recoverable account");
                account
                    .begin_login()
                    .expect("new PKCE attempt after corruption");
                account.cancel_login().expect("close fixture listener");
                seen = server.requests.try_iter().count();
            }
            // Logout also works first, with corrupt metadata and no discovery/network.
            let (link, core) = core_fixture(String::new(), "unused", vec![CoreStep::Invalidate]);
            app.attach_core(link);
            assert!(matches!(
                crate::host::fixture_request(&mut app, Command::Logout),
                Reply::Account {
                    signed_in: false,
                    error: None,
                    ..
                }
            ));
            core.join().expect("durable logout ACK");
            assert!(
                server.requests.try_recv().is_err(),
                "logout never discovers OAuth"
            );
            let archived: Vec<_> = std::fs::read_dir(&namespace)
                .expect("namespace")
                .flatten()
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(&format!("{damaged}-1000000-"))
                })
                .map(|entry| std::fs::read(entry.path()).expect("bytes"))
                .collect();
            assert_eq!(archived, vec![broken.to_vec()]);
            // A fresh process can poll and start a new PKCE attempt after logout.
            drop(app);
            let mut app = App::with_clock(config(), root.clone(), || Ok(1000));
            assert!(matches!(
                crate::host::fixture_request(&mut app, Command::AccountPoll),
                Reply::Account {
                    signed_in: false,
                    pending: false,
                    error: None,
                    ..
                }
            ));
            complete_fixture_login(&mut app);
            drop(app);
            let mut app = App::with_clock(config(), root.clone(), || Ok(1000));
            assert!(matches!(
                crate::host::fixture_request(&mut app, Command::AccountPoll),
                Reply::Account {
                    signed_in: true,
                    pending: false,
                    error: None,
                    ..
                }
            ));
            drop(app);
            // Metadata corruption needs exactly one discovery; intact metadata needs none.
            assert_eq!(
                seen + server.requests.try_iter().count(),
                2 + usize::from(damaged == "oauth-metadata")
            );
            server.finish();
            crate::cleanup_store(&root, &context, &[]);
        }
    }

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
        assert!(app.store.is_none());
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
        let (link, core) = core_fixture(String::new(), "unused", vec![CoreStep::Invalidate]);
        let worker = std::thread::spawn(move || {
            server_pipe.accept().expect("local IPC connection");
            for index in 0..3 {
                let request: crate::protocol::Request =
                    crate::protocol::read(&mut server_pipe).expect("IPC request");
                if index == 2 {
                    // El primer login también revoca cualquier binding previo.
                    app.attach_core(link.clone());
                }
                let response = crate::protocol::Response {
                    version: crate::protocol::VERSION,
                    sequence: request.sequence,
                    reply: app.handle(request.command),
                };
                crate::protocol::write(&mut server_pipe, &response).expect("IPC response");
            }
            drop(app);
            core.join().expect("initial identity revocation ACK");
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
        let _socket = login_callback(&login);
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
        let (link, core) = core_fixture(String::new(), "unused", vec![]);
        app.attach_core(link);
        app.ensure_oauth(100).expect("current token needs no HTTP");
        assert!(server.requests.try_recv().is_err());
        assert_eq!(app.ensure_oauth(1000), Err(Error::Authentication));
        let request = server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("refresh");
        assert!(request.starts_with("POST /token "));
        assert!(server.requests.try_recv().is_err());
        assert!(app.account.as_ref().expect("account").needs_sign_in());
        assert!(app.account.as_ref().expect("account").identity().is_some());
        assert_eq!(app.ensure_oauth(1000), Err(Error::Authentication));
        core.join()
            .expect("no core commands for a rejected refresh");
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-refresh-failure", &["account"]);
    }

    #[test]
    fn logout_without_core_requires_ack_before_session_success() {
        let server = crate::test_http::Server::start(vec![]);
        let (root, store) = crate::test_store("app-detached-logout");
        let account = crate::account::fixture(&server.base, &store);
        let mut config = BuildConfig::load();
        config.native_oauth = Some(crate::config::OAuthBuild {
            issuer: server.base.clone(),
            client_id: "public-fixture".into(),
            redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("redirect"),
        });
        let mut app = App::new(config, root.clone());
        app.account = Some(account);
        app.store = Some(store);
        let (credential, keys) = crate::license_remote::tests::signed_fixture("logout-device");
        app.config.supabase = Some(server.base.clone());
        app.config.anon_key = Some("public-test-key");
        app.config.license_keys = Some(keys);
        app.legacy_store()
            .expect("store")
            .save(
                "license-candidate",
                &crate::license_remote::tests::LegacyCandidate {
                    account_id: credential.claims.subject.clone(),
                    credential,
                    device: "logout-device".into(),
                },
            )
            .expect("signed candidate");
        #[cfg(windows)]
        assert!(matches!(
            app.execute(Command::LicenseRenew),
            Err(Error::Unconfigured)
        ));
        assert!(server.requests.try_recv().is_err());
        assert!(matches!(
            app.execute(Command::Logout),
            Err(Error::Unconfigured)
        ));
        assert!(app.account.as_ref().expect("account").identity().is_some());
        assert!(
            app.legacy_store()
                .expect("store")
                .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                .is_ok(),
            "no durable revocation ACK: preserve the session for a managed retry"
        );
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-detached-logout", &[]);
    }

    #[test]
    fn logout_ends_the_clerk_fapi_session() {
        use crate::protocol::{EmailAction, EmailMode};
        let server = crate::test_http::Server::start_native(|base| {
            vec![
                (
                    200,
                    serde_json::json!({
                        "issuer": base.as_str(),
                        "device_authorization_endpoint": base.join("oauth/device_authorization").expect("fixture"),
                        "grant_types_supported": ["urn:ietf:params:oauth:grant-type:device_code"],
                    })
                    .to_string(),
                ),
                (200, "{}".into()),
                (
                    200,
                    serde_json::json!({
                        "response": {
                            "id": "sia_fixture",
                            "status": "complete",
                            "created_session_id": "sess_fixture",
                        },
                        "client": {
                            "sessions": [{
                                "id": "sess_fixture",
                                "status": "active",
                                "tasks": [],
                                "user": {"id": "user_fixture"},
                            }],
                        },
                    })
                    .to_string(),
                ),
                (200, "{}".into()), // cierre de la sesión FAPI
            ]
        });
        let (root, store) = crate::test_store("app-logout-fapi");
        let mut account = crate::account::fixture(&server.base, &store);
        account
            .email_action(
                &Http::default(),
                EmailAction::Begin {
                    mode: EmailMode::SignInPassword,
                    email: "pilot@example.invalid".into(),
                    password: "generated-password-fixture".into(),
                },
                100,
            )
            .expect("login FAPI efímero");
        let device = "logout-fapi-fixture";
        let (_, keys) = crate::license_remote::tests::signed_fixture(device);
        let (link, core) = core_fixture(device.into(), keys, vec![CoreStep::Invalidate]);
        let config = BuildConfig {
            supabase: None,
            anon_key: None,
            license_keys: None,
            channel: None,
            native_oauth: Some(crate::config::OAuthBuild {
                issuer: server.base.clone(),
                client_id: "public-fixture".into(),
                redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("redirect"),
            }),
        };
        let mut app = App::new(config, root.clone());
        app.account = Some(account);
        app.store = Some(store);
        app.attach_core(link);
        assert!(matches!(
            app.handle(Command::Logout),
            Reply::Account {
                signed_in: false,
                error: None,
                ..
            }
        ));
        assert!(app.account.as_ref().expect("account").identity().is_none());
        let wire: Vec<String> = server.requests.try_iter().collect();
        assert_eq!(wire.len(), 4, "una petición por paso del flujo");
        assert!(
            wire[3].starts_with("POST /v1/client/sessions/sess_fixture/end?"),
            "cerrar sesión también cierra la sesión FAPI de Clerk"
        );
        core.join().expect("revocación ACK");
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-logout-fapi", &[]);
    }

    #[cfg(windows)]
    #[test]
    fn oauth_invalid_grant_requires_sign_in_without_revoking_or_dropping_identity() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        // Profile is presentation, including its automatic missing-cache refresh;
        // its non-destructive path is covered through host::session above.
        for command in [Command::LicenseRenew, Command::AccountRenew] {
            let server =
                crate::test_http::Server::start(vec![(400, r#"{"error":"invalid_grant"}"#.into())]);
            let (root, store) = crate::test_store("app-invalid-grant");
            let account = crate::account::fixture(&server.base, &store);
            let mut config = BuildConfig::load();
            config.supabase = Some(server.base.clone());
            config.anon_key = Some("public-test-key");
            config.license_keys = Some(keys);
            let mut app = App::new(config, root.clone());
            app.account = Some(account);
            app.store = Some(store);
            app.legacy_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::tests::LegacyCandidate {
                        credential: credential.clone(),
                        account_id: credential.claims.subject.clone(),
                        device: device.clone(),
                    },
                )
                .expect("previous signed candidate");
            let (link, core) = core_fixture(device.clone(), keys, vec![CoreStep::Read]);
            app.attach_core(link);
            assert!(
                matches!(
                    app.handle(command),
                    Reply::Account {
                        signed_in: false,
                        pending: false,
                        error: Some(_),
                        ..
                    }
                ),
                "manual rejection must immediately request fresh sign-in"
            );
            assert!(
                app.legacy_store()
                    .expect("store")
                    .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                    .is_ok()
            );
            assert!(app.account.as_ref().expect("account").identity().is_some());
            assert!(app.account.as_ref().expect("account").needs_sign_in());
            assert!(matches!(
                app.handle(Command::AccountPoll),
                Reply::Account {
                    signed_in: false,
                    pending: false,
                    error: Some(_),
                    ..
                }
            ));
            assert!(app.data_session.is_none());
            assert!(
                server
                    .requests
                    .recv_timeout(Duration::from_secs(3))
                    .expect("refresh")
                    .starts_with("POST /token ")
            );
            assert!(
                server.requests.try_recv().is_err(),
                "never call userinfo or native-license after rejection"
            );
            app.execute(Command::LicenseStatus)
                .expect("rights preserved");
            core.join().expect("only Read, no invalidation");
            server.finish();
            drop(app);
            crate::cleanup_store(&root, "app-invalid-grant", &[]);
        }
    }

    #[cfg(windows)]
    #[test]
    fn generic_and_transient_oauth_errors_preserve_previous_rights_and_session() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        for (status, body, expected) in [
            (400, r#"{"error":"invalid_request"}"#, Error::Protocol),
            (400, "malformed", Error::Protocol),
            (429, r#"{"error":"invalid_grant"}"#, Error::Offline),
            (503, "{}", Error::Offline),
        ] {
            let server = crate::test_http::Server::start(vec![(status, body.into())]);
            let (root, store) = crate::test_store("app-oauth-transient");
            let account = crate::account::fixture(&server.base, &store);
            let mut config = BuildConfig::load();
            config.supabase = Some(server.base.clone());
            config.anon_key = Some("public-test-key");
            config.license_keys = Some(keys);
            let mut app = App::new(config, root.clone());
            app.account = Some(account);
            app.store = Some(store);
            app.legacy_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::tests::LegacyCandidate {
                        credential: credential.clone(),
                        account_id: credential.claims.subject.clone(),
                        device: device.clone(),
                    },
                )
                .expect("previous candidate");
            let (link, core) = core_fixture(device.clone(), keys, vec![]);
            app.attach_core(link);
            assert!(matches!(app.execute(Command::LicenseRenew), Err(error) if error == expected));
            assert!(
                app.legacy_store()
                    .expect("store")
                    .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                    .is_ok()
            );
            assert!(app.account.as_ref().expect("account").identity().is_some());
            assert!(
                server
                    .requests
                    .recv_timeout(Duration::from_secs(3))
                    .expect("refresh")
                    .starts_with("POST /token ")
            );
            assert!(server.requests.try_recv().is_err());
            core.join().expect("no invalidation");
            server.finish();
            drop(app);
            crate::cleanup_store(&root, "app-oauth-transient", &[]);
        }
    }

    #[cfg(windows)]
    #[test]
    fn definitive_online_license_rejection_never_invalidates_or_uses_late_legacy_files() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        for status in [401, 403, 409] {
            let server = crate::test_http::Server::start(vec![
                (200, serde_json::json!({"access_token":"fixture-rotated", "refresh_token":"fixture-refresh", "token_type":"Bearer", "expires_in":3600}).to_string()),
                (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
                (status, serde_json::json!({"error": if status == 409 { "device_limit" } else { "unauthorized" }}).to_string()),
            ]);
            let (root, store) = crate::test_store("app-online-denial");
            let account = crate::account::fixture(&server.base, &store);
            let mut config = BuildConfig::load();
            config.supabase = Some(server.base.clone());
            config.anon_key = Some("public-test-key");
            config.license_keys = Some(keys);
            let mut app = App::new(config, root.clone());
            app.account = Some(account);
            app.store = Some(store);
            app.legacy_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::tests::LegacyCandidate {
                        credential: credential.clone(),
                        account_id: credential.claims.subject.clone(),
                        device: device.clone(),
                    },
                )
                .expect("previous signed candidate");
            let (link, core) = core_fixture(device.clone(), keys, vec![CoreStep::Read]);
            app.attach_core(link);
            assert!(app.execute(Command::LicenseRenew).is_err());
            assert!(
                app.legacy_store()
                    .expect("store")
                    .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                    .is_ok(),
                "online rejection must retain the previous license"
            );
            app.execute(Command::LicenseStatus)
                .expect("rights preserved");
            core.join().expect("only Read, no invalidation");
            server.finish();
            drop(app);
            crate::cleanup_store(&root, "app-online-denial", &[]);
        }
    }

    #[cfg(windows)]
    #[test]
    fn transient_online_license_failures_never_invalidate_or_use_late_legacy_files() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        for (status, body, expected) in [
            (429, "{}", Error::Offline),
            (503, "{}", Error::Offline),
            (
                409,
                r#"{"error":"account_conflict"}"#,
                Error::AccountConflict,
            ),
        ] {
            let server = crate::test_http::Server::start(vec![
                (200, serde_json::json!({"access_token":"fixture-rotated", "refresh_token":"fixture-refresh", "token_type":"Bearer", "expires_in":3600}).to_string()),
                (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
                (status, body.into()),
            ]);
            let (root, store) = crate::test_store("app-transient-license");
            let account = crate::account::fixture(&server.base, &store);
            let mut config = BuildConfig::load();
            config.supabase = Some(server.base.clone());
            config.anon_key = Some("public-test-key");
            config.license_keys = Some(keys);
            let mut app = App::with_clock(config, root.clone(), || Ok(1000));
            app.account = Some(account);
            app.store = Some(store);
            let (link, core) = core_fixture(device.clone(), keys, vec![]);
            app.attach_core(link);
            app.legacy_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::tests::LegacyCandidate {
                        credential: credential.clone(),
                        account_id: credential.claims.subject.clone(),
                        device: device.clone(),
                    },
                )
                .expect("previous signed candidate");
            assert_eq!(app.execute(Command::LicenseRenew).err(), Some(expected));
            if expected == Error::AccountConflict {
                assert!(matches!(
                    App::automatic_failure(expected),
                    Reply::LicenseFailure {
                        outcome: crate::protocol::RenewalOutcome::Transient,
                        ..
                    }
                ));
            }
            assert!(
                app.legacy_store()
                    .expect("store")
                    .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                    .is_ok()
            );
            server.finish();
            core.join().expect("no revocation for transient error");
            drop(app);
            crate::cleanup_store(&root, "app-transient-license", &[]);
        }
    }

    pub(super) enum CoreStep {
        #[cfg(windows)]
        Read,
        ReadLicensed,
        ReadRecovery,
        ReadClockBehind,
        InstallOnline,
        InstallOnlineCredential(String),
        VersionMismatch,
        VersionCloses,
        Invalidate,
        RejectInstallOnline,
        DisconnectInstallOnline,
        RejectInvalidate,
    }

    fn assert_install_command(
        step: &CoreStep,
        command: vantare_ipc::control::Command,
        device: &str,
        keys: &str,
    ) {
        use vantare_ipc::control;
        let credential = match command {
            control::Command::Install { credential } => {
                assert!(
                    !matches!(
                        step,
                        CoreStep::InstallOnline
                            | CoreStep::InstallOnlineCredential(_)
                            | CoreStep::DisconnectInstallOnline
                            | CoreStep::RejectInstallOnline
                    ),
                    "renew must preserve online provenance"
                );
                credential
            }
            control::Command::InstallOnline { credential } => {
                assert!(
                    matches!(
                        step,
                        CoreStep::InstallOnline
                            | CoreStep::InstallOnlineCredential(_)
                            | CoreStep::DisconnectInstallOnline
                            | CoreStep::RejectInstallOnline
                    ),
                    "disk candidate cannot claim online provenance"
                );
                credential
            }
            _ => panic!("signed credential required"),
        };
        if let CoreStep::InstallOnlineCredential(expected) = step {
            assert_eq!(
                &credential, expected,
                "online install must use the exact fresh HTTP credential"
            );
        }
        let proof = crate::license::Verifier::public_keys(keys)
            .expect("keys")
            .v1(
                &serde_json::from_str::<crate::license::CredentialV1>(&credential).expect("v1"),
                "550e8400-e29b-41d4-a716-446655440000",
                device,
            )
            .expect("signed v1");
        assert!(proof.grants().is_empty());
    }

    pub(super) fn core_fixture(
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
                #[cfg(windows)]
                let read_only = matches!(
                    step,
                    CoreStep::Read
                        | CoreStep::ReadLicensed
                        | CoreStep::ReadRecovery
                        | CoreStep::ReadClockBehind
                        | CoreStep::VersionMismatch
                        | CoreStep::VersionCloses
                );
                #[cfg(not(windows))]
                let read_only = matches!(step, CoreStep::VersionMismatch | CoreStep::VersionCloses);
                if read_only {
                    assert!(
                        matches!(request.command, control::Command::Read),
                        "untrusted cached license never reaches Install"
                    );
                } else if matches!(step, CoreStep::Invalidate | CoreStep::RejectInvalidate) {
                    assert!(matches!(request.command, control::Command::Invalidate));
                } else {
                    assert_install_command(&step, request.command, &device, keys);
                }
                #[cfg(windows)]
                if matches!(step, CoreStep::DisconnectInstallOnline) {
                    // Explicit close after receiving Install, without an ACK.
                    drop(pipe);
                    continue;
                }
                if matches!(step, CoreStep::VersionCloses) {
                    continue; // Old control peers close without a typed response.
                }
                let error = match step {
                    CoreStep::RejectInvalidate => Some("fixture rejection"),
                    #[cfg(windows)]
                    CoreStep::RejectInstallOnline => Some(control::REJECTED),
                    _ => None,
                }
                .map(str::to_owned);
                // Fixture de transporte: no acredita grants ni runtime real.
                control::write(
                    &mut pipe,
                    &control::Response {
                        version: if matches!(step, CoreStep::VersionMismatch) {
                            control::VERSION - 1
                        } else {
                            control::VERSION
                        },
                        sequence: request.sequence,
                        policy: control::Policy {
                            version: control::VERSION,
                            revision: 1,
                            checked_at_ms: control::wall_ms().expect("clock"),
                            state: if matches!(step, CoreStep::ReadClockBehind) {
                                vantare_ipc::control::AccessState::ClockBehind { until_ms: 200_000 }
                            } else if matches!(step, CoreStep::ReadRecovery) {
                                vantare_ipc::control::AccessState::RecoveryRequired
                            } else if matches!(step, CoreStep::ReadLicensed) {
                                vantare_ipc::control::AccessState::Active
                            } else {
                                vantare_ipc::control::AccessState::NoCredential
                            },
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
    fn only_explicit_authorization_rejection_is_a_definitive_core_failure() {
        use vantare_ipc::control::Failure;
        for kind in [
            std::io::ErrorKind::TimedOut,
            std::io::ErrorKind::UnexpectedEof,
            std::io::ErrorKind::BrokenPipe,
            std::io::ErrorKind::InvalidData,
            std::io::ErrorKind::PermissionDenied,
        ] {
            let error = Error::Core(Failure::classify(&kind.into()));
            assert!(matches!(
                App::automatic_failure(error),
                Reply::LicenseFailure {
                    outcome: crate::protocol::RenewalOutcome::Transient,
                    ..
                }
            ));
        }
        assert!(matches!(
            App::automatic_failure(Error::Core(Failure::Rejected)),
            Reply::LicenseFailure {
                outcome: crate::protocol::RenewalOutcome::Definitive,
                ..
            }
        ));
        for error in [
            Error::Version,
            Error::Unconfigured,
            Error::Clock,
            Error::Storage,
        ] {
            assert!(matches!(
                App::automatic_failure(error),
                Reply::LicenseFailure {
                    outcome: crate::protocol::RenewalOutcome::Transient,
                    ..
                }
            ));
        }
    }

    #[cfg(windows)]
    #[test]
    fn automatic_authentication_and_conflict_failures_never_invalidate_or_delete_the_cache() {
        use crate::protocol::RenewalOutcome;
        let device = crate::license::installation::legacy_fingerprint().expect("device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        for (oauth_failure, status) in [
            (true, 401),
            (false, 401),
            (false, 403),
            (false, 409),
            (true, 503),
            (false, 429),
            (false, 503),
        ] {
            let mut responses = Vec::new();
            if !oauth_failure {
                responses.push((200,serde_json::json!({"access_token":"fixture-access","refresh_token":"fixture-refresh","token_type":"Bearer","expires_in":3600}).to_string()));
                responses.push((200, serde_json::json!({"sub":"user_fixture"}).to_string()));
            }
            responses.push((status, "{}".into()));
            let server = crate::test_http::Server::start(responses);
            let (root, store) = crate::test_store("automatic-auth-preserve");
            let account = crate::account::fixture(&server.base, &store);
            let mut config = BuildConfig::load();
            config.supabase = Some(server.base.clone());
            config.anon_key = Some("public-test-key");
            config.license_keys = Some(keys);
            let mut app = App::new(config, root.clone());
            app.account = Some(account);
            app.store = Some(store);
            app.legacy_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::tests::LegacyCandidate {
                        credential: credential.clone(),
                        account_id: credential.claims.subject.clone(),
                        device: device.clone(),
                    },
                )
                .expect("previous verified cache");
            let (link, core) = core_fixture(device.clone(), keys, vec![CoreStep::Read]);
            app.attach_core(link);
            let expected = if status >= 429 {
                RenewalOutcome::Transient
            } else {
                RenewalOutcome::Definitive
            };
            assert!(matches!(app.handle(Command::LicenseRenewAutomatic),
                Reply::LicenseFailure {outcome,..} if outcome==expected));
            assert!(
                app.legacy_store()
                    .expect("store")
                    .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                    .is_ok()
            );
            assert!(app.account.as_ref().expect("account").identity().is_some());
            assert!(matches!(
                app.execute(Command::LicenseStatus),
                Ok(Reply::License { .. })
            ));
            core.join().expect("only Read, never Invalidate");
            server.finish();
            drop(app);
            crate::cleanup_store(&root, "automatic-auth-preserve", &[]);
        }
    }

    #[cfg(windows)]
    #[test]
    fn automatic_new_key_rejection_never_invalidates_or_uses_late_legacy_files() {
        let device = crate::license::installation::legacy_fingerprint().expect("device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        let mut newer = credential.clone();
        newer.key_id = "server-newer-fixture".into();
        let server = crate::test_http::Server::start(vec![
            (200, serde_json::json!({"access_token":"fixture-access", "refresh_token":"fixture-refresh", "token_type":"Bearer", "expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
            (200, serde_json::json!({"credential":newer,"online_capabilities":[]}).to_string()),
        ]);
        let (root, store) = crate::test_store("automatic-preserves-rights");
        let account = crate::account::fixture(&server.base, &store);
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-test-key"),
            license_keys: Some(keys),
            channel: Some("test"),
            native_oauth: None,
        };
        let mut app = App::new(config, root.clone());
        app.account = Some(account);
        app.store = Some(store);
        app.legacy_store()
            .expect("store")
            .save(
                "license-candidate",
                &crate::license_remote::tests::LegacyCandidate {
                    account_id: credential.claims.subject.clone(),
                    device: device.clone(),
                    credential,
                },
            )
            .expect("valid previous cache");
        let (link, core) = core_fixture(device, keys, vec![CoreStep::Read]);
        app.attach_core(link);
        assert!(app.execute(Command::LicenseRenewAutomatic).is_err());
        assert!(
            matches!(
                app.execute(Command::LicenseStatus),
                Ok(Reply::License { .. })
            ),
            "automatic verification failure cannot revoke a valid binding"
        );
        assert!(
            app.legacy_store()
                .expect("store")
                .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                .is_ok()
        );
        core.join().expect("automatic path never sends Invalidate");
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "automatic-preserves-rights", &[]);
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
            vec![CoreStep::InstallOnline, CoreStep::Invalidate],
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
        let reply = app.handle(Command::Logout);
        assert!(matches!(
            reply,
            Reply::Account {
                signed_in: false,
                ..
            }
        ));
        assert!(matches!(
            app.legacy_store()
                .expect("store")
                .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate"),
            Err(Error::NotFound)
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
        let (link, core) = core_fixture(device, keys, vec![CoreStep::Read]);
        app.attach_core(link);
        let reply = app.handle(Command::LicenseRenew);
        assert_eq!(
            match &reply {
                Reply::DeviceLimit { message } => message.clone(),
                other => panic!("409 device_limit llegó como {other:?}"),
            },
            Error::DeviceLimit.to_string(),
            "el texto sigue saliendo del único mapeo de errores"
        );
        app.execute(Command::LicenseStatus)
            .expect("rights preserved");
        core.join().expect("device limit does not invalidate");
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
    fn detached_identity_switch_requires_ack_and_ignores_late_legacy_files() {
        identity_switch_without_core(true);
    }

    #[test]
    fn detached_login_with_missing_identity_cannot_inherit_a_previous_candidate() {
        identity_switch_without_core(false);
    }

    fn login_callback(login: &url::Url) -> TcpStream {
        let params: std::collections::HashMap<_, _> = login
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();
        let redirect = url::Url::parse(&params["redirect_uri"]).expect("redirect");
        let mut socket =
            TcpStream::connect(("127.0.0.1", redirect.port().expect("port"))).expect("callback");
        write!(
            socket,
            "GET /callback?state={}&code=fixture HTTP/1.1\r\nHost: localhost\r\n\r\n",
            params["state"]
        )
        .expect("callback request");
        socket
    }

    fn identity_switch_without_core(previous_identity: bool) {
        let server = crate::test_http::Server::start(vec![
            (200, serde_json::json!({"access_token":"new-local-access","refresh_token":"new-local-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"other_fixture_user"}).to_string()),
            (200, serde_json::json!({"access_token":"retry-local-access","refresh_token":"retry-local-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"other_fixture_user"}).to_string()),
        ]);
        let (root, store) = crate::test_store("app-detached-switch");
        let mut account = crate::account::fixture(&server.base, &store);
        if !previous_identity {
            account.logout(&store).expect("missing restored identity");
        }
        let saved_before = store
            .load::<serde_json::Value>("account")
            .expect("old session");
        let device = "detached-switch-fixture";
        let (credential, keys) = crate::license_remote::tests::signed_fixture(device);
        let mut config = BuildConfig::load();
        config.supabase = Some(server.base.clone());
        let mut app = App::new(config, root.clone());
        app.account = Some(account);
        app.store = Some(store);
        app.legacy_store()
            .expect("candidate store")
            .save(
                "license-candidate",
                &crate::license_remote::tests::LegacyCandidate {
                    account_id: credential.claims.subject.clone(),
                    credential,
                    device: device.into(),
                },
            )
            .expect("A candidate before detached login");

        for managed in [false, true] {
            let core = if managed {
                let (link, core) = core_fixture(device.into(), keys, vec![CoreStep::Invalidate]);
                app.attach_core(link);
                Some(core)
            } else {
                None
            };
            let login = app
                .account
                .as_mut()
                .expect("account")
                .begin_login()
                .expect("explicit retry without browser");
            let _socket = login_callback(&login);
            assert!(
                matches!(app.handle(Command::AccountPoll), Reply::Account {
                signed_in, pending: false, error, ..
            } if signed_in == (managed || previous_identity) && error.is_some() != managed),
                "detached login must fail before saving B; managed retry must await Invalidate ACK"
            );
            let saved = app
                .store
                .as_ref()
                .expect("store")
                .load::<serde_json::Value>("account")
                .expect("durable account");
            if managed {
                assert_eq!(
                    saved["session"]["identity"]["subject"],
                    "other_fixture_user"
                );
                core.expect("managed core").join().expect("revocation ACK");
            } else {
                assert!(
                    saved == saved_before,
                    "detached login replaced the durable account"
                );
            }
            let candidate =
                app.legacy_store()
                    .expect("candidate store")
                    .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate");
            assert!(
                candidate.is_ok(),
                "paso 8: old files are ignored after either outcome"
            );
        }
        for _ in 0..4 {
            server
                .requests
                .recv_timeout(Duration::from_secs(3))
                .expect("OAuth loopback only");
        }
        assert!(server.requests.try_recv().is_err());
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "app-detached-switch", &[]);
    }

    #[test]
    fn switching_identity_revokes_before_saving_and_rejection_preserves_the_old_session() {
        for (rejected, needs_sign_in) in
            [(false, false), (true, false), (false, true), (true, true)]
        {
            let device = "identity-change-fixture".to_owned();
            let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
            let server = crate::test_http::Server::start(vec![
                (200, serde_json::json!({"access_token":"new-local-access","refresh_token":"new-local-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
                (200, serde_json::json!({"sub":"other_fixture_user"}).to_string()),
            ]);
            let (root, store) = crate::test_store("app-account-switch");
            let mut account = crate::account::fixture(&server.base, &store);
            if needs_sign_in {
                account.require_sign_in(&store).expect("NeedsSignIn");
            }
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
            app.legacy_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::tests::LegacyCandidate {
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
                matches!(reply, Reply::Account { signed_in, pending: false, error, .. } if signed_in == (!needs_sign_in || !rejected) && error.is_some() == rejected)
            );
            assert_eq!(
                app.account.as_ref().expect("account").needs_sign_in(),
                needs_sign_in && rejected
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
            assert!(
                app.legacy_store()
                    .expect("old store")
                    .load::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
                    .is_ok(),
                "old file is ignored after either outcome"
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

#[cfg(test)]
mod copy_link_tests {
    use super::*;
    #[test]
    fn copy_command_returns_only_a_live_manual_link_and_cancel_removes_the_capability() {
        let server = crate::test_http::Server::start(vec![]);
        let (root, store) = crate::test_store("copy-command");
        let mut account = crate::account::fixture(&server.base, &store);
        assert_eq!(
            crate::browser::begin(&mut account, |_| Err(Error::BrowserUnavailable)),
            Err(Error::BrowserUnavailable)
        );
        assert!(matches!(
            App::account_reply(&account, None),
            Reply::Account {
                pending: true,
                copy_link: true,
                error: Some(_),
                ..
            }
        ));
        let mut app = App::new(BuildConfig::load(), root.clone());
        app.account = Some(account);
        app.store = Some(store);
        assert!(
            matches!(app.handle(Command::AccountCopyLink), Reply::AccountLink { url } if url.0.contains("code_challenge=") && !url.0.contains("code_verifier"))
        );
        app.account
            .as_mut()
            .expect("account")
            .cancel_login()
            .expect("cancel");
        assert!(matches!(
            app.handle(Command::AccountCopyLink),
            Reply::Account {
                pending: false,
                copy_link: false,
                error: Some(_),
                ..
            }
        ));
        drop(app);
        server.finish();
        crate::cleanup_store(&root, "copy-command", &[]);
    }
}

#[cfg(all(test, windows))]
mod online_compatibility_tests {
    use super::tests::{CoreStep, core_fixture};
    use super::*;

    #[test]
    fn manual_online_rejection_explains_the_future_boundary_without_claiming_access() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        let (root, store) = crate::test_store("clock-behind-message");
        drop(store);
        let mut app = App::with_clock(
            BuildConfig {
                supabase: None,
                anon_key: None,
                license_keys: Some(keys),
                channel: Some("test"),
                native_oauth: None,
            },
            root.clone(),
            || Ok(100),
        );
        let candidate = crate::license_remote::tests::LegacyCandidate {
            account_id: credential.claims.subject.clone(),
            device: device.clone(),
            credential,
        };
        app.legacy_store()
            .expect("isolated store")
            .save("license-candidate", &candidate)
            .expect("cache");
        let (link, core) = core_fixture(
            device,
            keys,
            vec![CoreStep::RejectInstallOnline, CoreStep::ReadClockBehind],
        );
        app.attach_core(link);
        let Reply::License { policy, message } = app
            .complete_online_renewal(&candidate.credential)
            .expect("diagnosis")
        else {
            panic!("typed core state required");
        };
        assert_eq!(
            policy.state,
            vantare_ipc::control::AccessState::ClockBehind { until_ms: 200_000 }
        );
        assert!(!policy.state.permits_access());
        assert_eq!(
            message,
            crate::outcome::policy_message(&policy).expect("dated state")
        );
        assert!(message.contains("hora local"));
        assert!(!message.starts_with("Necesitas conexión"));
        core.join().expect("all core requests observed");
        drop(app);
        std::fs::remove_dir_all(root).expect("isolated fixture cleanup");
    }

    #[test]
    fn recovery_status_ignores_late_legacy_files_and_renewal_installs_only_fresh_http() {
        for pending in [false, true] {
            let device =
                crate::license::installation::legacy_fingerprint().expect("test fingerprint");
            let (cached, cached_keys) =
                crate::license_remote::tests::signed_fixture_named(&device, "cached");
            let (credential, fresh_keys) =
                crate::license_remote::tests::signed_fixture_named(&device, "fresh");
            let expected = serde_json::to_string(&credential).expect("fresh HTTP fixture");
            let keys: &'static str =
                Box::leak(format!("{cached_keys},{fresh_keys}").into_boxed_str());
            let server = crate::test_http::Server::start(vec![
            (200, serde_json::json!({"access_token":"fixture-new-access","refresh_token":"fixture-new-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
            (200, serde_json::json!({"credential":credential,"online_capabilities":[]}).to_string()),
        ]);
            let (root, store) = crate::test_store("authority-helper-admission");
            let account = crate::account::fixture(&server.base, &store);
            let mut app = App::new(
                BuildConfig {
                    supabase: Some(server.base.clone()),
                    anon_key: Some("public-test-key"),
                    license_keys: Some(keys),
                    channel: Some("test"),
                    native_oauth: Some(crate::config::OAuthBuild {
                        issuer: server.base.clone(),
                        client_id: "public-fixture".into(),
                        redirect_uri: url::Url::parse("http://127.0.0.1:0/callback")
                            .expect("redirect"),
                    }),
                },
                root.clone(),
            );
            app.account = Some(account);
            app.store = Some(store);
            app.legacy_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::tests::LegacyCandidate {
                        account_id: cached.claims.subject.clone(),
                        device: device.clone(),
                        credential: cached,
                    },
                )
                .expect("old disk candidate");
            if pending {
                app.legacy_store()
                    .expect("store")
                    .save("license-transfer-pending", &true)
                    .expect("old transfer hint");
            }
            let (link, core) = core_fixture(
                device,
                keys,
                vec![
                    CoreStep::ReadRecovery,
                    CoreStep::InstallOnlineCredential(expected),
                ],
            );
            app.attach_core(link);
            assert!(matches!(app.execute(Command::LicenseStatus),
                Ok(Reply::License { policy, .. }) if policy.state.needs_recovery() && !policy.state.permits_access()));
            assert!(
                server.requests.try_recv().is_err(),
                "disk transfer never renews or claims online provenance"
            );
            assert!(
                matches!(
                    app.execute(Command::LicenseRenewAutomatic),
                    Ok(Reply::License { .. })
                ),
                "normal renewal remains reachable after recovery status"
            );
            core.join()
                .expect("Read recovery then newly completed InstallOnline; no disk Install");
            server.finish();
            drop(app);
            crate::cleanup_store(&root, "authority-helper-admission", &[]);
        }
    }

    #[test]
    fn authority_recovery_control_version_mismatch_is_transient_without_invalidation() {
        for step in [CoreStep::VersionMismatch, CoreStep::VersionCloses] {
            let closes = matches!(step, CoreStep::VersionCloses);
            let (link, core) = core_fixture(String::new(), "unused", vec![step]);
            let mut app = App::new(
                BuildConfig {
                    supabase: None,
                    anon_key: None,
                    license_keys: None,
                    channel: None,
                    native_oauth: None,
                },
                std::env::temp_dir(),
            );
            app.attach_core(link);
            let error = app
                .core_command(vantare_ipc::control::Command::Read)
                .expect_err("incompatible component");
            let Error::Core(failure) = error else {
                panic!("closed typed core failure required")
            };
            if closes {
                assert!(matches!(
                    failure,
                    vantare_ipc::control::Failure::Eof
                        | vantare_ipc::control::Failure::PeerGone
                        | vantare_ipc::control::Failure::Disconnected
                ));
            } else {
                assert_eq!(failure, vantare_ipc::control::Failure::Version);
            }
            assert!(matches!(
                App::automatic_failure(error),
                Reply::LicenseFailure {
                    outcome: crate::protocol::RenewalOutcome::Transient,
                    ..
                }
            ));
            core.join().expect("one read, no invalidate or replay");
        }
    }
}
