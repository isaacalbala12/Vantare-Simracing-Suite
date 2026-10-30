//! Propietario único de red y persistencia; nunca decide derechos del núcleo.
use crate::{
    Error, Result,
    account::{Account, OAuth},
    config::BuildConfig,
    http::Http,
    protocol::{Command, Reply},
    storage::Store,
};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
mod mail;
mod pilot;

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
    triage: crate::triage::Triage,
    pilot: Option<crate::pilot::Local>,
    pilot_identity: Option<crate::account::Identity>,
    recovered_renewal_transfer: bool,
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
            triage: crate::triage::Triage::default(),
            pilot: None,
            pilot_identity: None,
            recovered_renewal_transfer: false,
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
            .map_err(|error| {
                let failure = vantare_ipc::control::Failure::classify(&error);
                eprintln!("services-core {}", failure.diagnostic());
                Error::Core(failure)
            })
    }

    fn transfer_rights(&mut self) -> Result<Reply> {
        self.transfer_rights_observed().map(|(reply, _)| reply)
    }

    fn transfer_rights_observed(&mut self) -> Result<(Reply, bool)> {
        let pending = self.pending_renewal_transfer()?;
        let mut installed = false;
        let candidate = self
            .candidate_store()?
            .load_cache::<serde_json::Value>("license-candidate");
        let policy = match candidate {
            Ok(document) => {
                match serde_json::from_value::<crate::license_remote::Candidate>(document) {
                    Ok(candidate) => {
                        let text = serde_json::to_string(&candidate.credential)
                            .map_err(|_| Error::InvalidCredential)?;
                        let issue = self
                            .config
                            .license_keys
                            .map(crate::license::Verifier::public_keys)
                            .transpose()?
                            .and_then(|verifier| {
                                verifier.cache_issue(&text).or_else(|| {
                                    verifier
                                        .v1(
                                            &candidate.credential,
                                            &candidate.account_id,
                                            &candidate.device,
                                        )
                                        .err()
                                        .map(|_| crate::license::CacheIssue::InvalidSignature)
                                })
                            });
                        if let Some(issue) = issue {
                            self.quarantine_candidate(issue)?
                        } else {
                            match self.core_command(vantare_ipc::control::Command::Install {
                                credential: text,
                            }) {
                                Ok(policy) => {
                                    installed = true;
                                    policy
                                },
                                Err(error) => {
                                    let policy =
                                        self.core_command(vantare_ipc::control::Command::Read)?;
                                    if !policy.online_recovery_required || policy.overlays_advanced
                                    {
                                        return Err(error);
                                    }
                                    // Admission without rights, only on an explicit
                                    // core recovery state. This cannot replay Install
                                    // or manufacture online provenance from disk.
                                    policy
                                }
                            }
                        }
                    }
                    Err(_) if self.config.license_keys.is_some() => {
                        self.quarantine_candidate(crate::license::CacheIssue::UnsupportedFormat)?
                    }
                    Err(_) => return Err(Error::Storage),
                }
            }
            Err(Error::Corrupt) => {
                self.quarantine_candidate(crate::license::CacheIssue::Unreadable)?
            }
            Err(Error::NotFound) => self.core_command(vantare_ipc::control::Command::Read)?,
            Err(error) => return Err(error),
        };
        if pending {
            // A durable installation ACK completes the hint; a successful Read
            // with no usable candidate retires an orphan without renewing it.
            self.candidate_store()?.remove("license-transfer-pending")?;
            self.recovered_renewal_transfer = installed;
        }
        let message = if policy.online_recovery_required {
            "Necesitas conexión para recuperar el acceso; comprueba el acceso o inicia sesión.".into()
        } else {
            "Derechos verificados y guardados por el núcleo".into()
        };
        Ok((Reply::License { policy, message }, installed))
    }

    fn pending_renewal_transfer(&mut self) -> Result<bool> {
        match self
            .candidate_store()?
            .load_cache::<bool>("license-transfer-pending")
        {
            Ok(pending) => Ok(pending),
            Err(Error::NotFound) => Ok(false),
            Err(Error::Corrupt) => {
                // This retry hint has no authority. Preserve unreadable bytes
                // and recover as absent; real filesystem errors still propagate.
                self.candidate_store()?
                    .quarantine_preserving("license-transfer-pending")?;
                self.recovered_renewal_transfer = false;
                eprintln!(
                    "license-transfer-marker {}",
                    crate::license::CacheIssue::Unreadable.diagnostic()
                );
                Ok(false)
            }
            Err(error) => Err(error),
        }
    }

    fn quarantine_candidate(
        &mut self,
        issue: crate::license::CacheIssue,
    ) -> Result<vantare_ipc::control::Policy> {
        self.recovered_renewal_transfer = false;
        self.candidate_store()?.remove("license-transfer-pending")?;
        self.candidate_store()?
            .quarantine_dated("license-candidate", now()?.saturating_mul(1000))?;
        eprintln!("{}", issue.diagnostic());
        self.core_command(vantare_ipc::control::Command::Read)
    }

    fn revoke_local(&mut self) -> Result<()> {
        self.core_command(vantare_ipc::control::Command::Invalidate)?;
        self.recovered_renewal_transfer = false;
        self.candidate_store()?.remove("license-transfer-pending")?;
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
            // La renovación puede exigir revocación. Sin propietario no se
            // inicia red ni se anuncia una limpieza parcial como revocación.
            self.core.as_ref().ok_or(Error::Unconfigured)?;
            if automatic && (self.recovered_renewal_transfer || self.pending_renewal_transfer()?) {
                let (reply, installed) = self.transfer_rights_observed()?;
                self.recovered_renewal_transfer = false;
                if installed {
                    return Ok(reply);
                }
                // A stale hint without a usable candidate did not renew or
                // install anything. Continue to the normal HTTP renewal.
            }
            let time = now()?;
            self.ensure_oauth_origin(time, automatic)?;
            let renewal = (|| {
                self.candidate_store()?;
                crate::license_remote::renew(
                    &self.http,
                    &self.config,
                    self.account.as_ref().ok_or(Error::Authentication)?,
                    time,
                    &device,
                    self.license_store.as_ref().ok_or(Error::Storage)?,
                )
            })();
            let candidate = match renewal {
                Ok(candidate) => candidate,
                Err(error) => {
                    if !automatic
                        && matches!(
                            error,
                            Error::Authentication
                                | Error::Denied
                                | Error::Conflict
                                | Error::DeviceLimit
                        )
                    {
                        // Rechazo definitivo: ACK durable antes de limpiar la caché.
                        self.revoke_local()?;
                    }
                    return Err(if error == Error::InvalidCredential {
                        Error::Version
                    } else {
                        error
                    });
                }
            };
            if automatic {
                self.candidate_store()?
                    .save("license-transfer-pending", &true)?;
            }
            // This provenance exists only on this stack after verified HTTPS.
            // Do not reload Candidate: disk transfer must never gain recovery authority.
            let policy = self.core_command(vantare_ipc::control::Command::InstallOnline {
                credential: serde_json::to_string(&candidate.credential)
                    .map_err(|_| Error::InvalidCredential)?,
            })?;
            self.recovered_renewal_transfer = false;
            self.candidate_store()?.remove("license-transfer-pending")?;
            let reply = Reply::License {
                policy,
                message: "Derechos verificados y guardados por el núcleo".into(),
            };
            if has_commercial_license(&candidate.credential.claims.capabilities, time) {
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
        self.revoke_local()?;
        self.data_session = None;
        self.triage.cancel();
        if let Some(reports) = self.reports.as_mut() {
            reports.cancel_preview();
        }
        if self.config.native_oauth.is_some() {
            self.ensure_account()?;
            let account = self.account.as_mut().ok_or(Error::Unconfigured)?;
            account.end_email_session(&self.http);
            account.logout(self.store.as_ref().ok_or(Error::Storage)?)?;
        }
        Ok(Reply::Account {
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
        // Explicit refresh can revoke after its durable ACK; automatic refresh preserves rights.
        self.core.as_ref().ok_or(Error::Unconfigured)?;
        let exchange = self
            .account
            .as_ref()
            .ok_or(Error::Authentication)?
            .refresh()?;
        let completion = match exchange.run(&self.http, now) {
            Ok(completion) => completion,
            Err(error @ (Error::Authentication | Error::Denied)) => {
                if automatic {
                    return Err(error);
                }
                self.revoke_local()?;
                self.data_session = None;
                self.account
                    .as_mut()
                    .ok_or(Error::Authentication)?
                    .logout(self.store.as_ref().ok_or(Error::Storage)?)?;
                return Err(error);
            }
            Err(error) => return Err(error),
        };
        self.account
            .as_mut()
            .ok_or(Error::Authentication)?
            .complete(completion, self.store.as_ref().ok_or(Error::Storage)?)
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
        if self.account.as_ref().is_some_and(Account::email_pending) {
            return Ok(self.email_account(None));
        }
        let account = self.account.as_mut().ok_or(Error::Authentication)?;
        if account.login_pending()
            && let Some(ticket) = account.poll_login()?
        {
            let completion = ticket.run(&self.http, now()?)?;
            let changed = account
                .identity()
                .is_none_or(|old| old != completion.identity());
            if changed {
                self.triage.cancel();
            }
            // Otra identidad no hereda el candidate ni la autoridad anteriores.
            // Sin identidad restaurada tampoco se conoce al dueño del binding.
            // Revocar antes de persistir la nueva sesión; si falla, no sustituirla.
            if changed {
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

    fn automatic_failure(error: Error) -> Reply {
        if error == Error::DeviceLimit {
            return Reply::DeviceLimit {
                message: error.to_string(),
            };
        }
        let definitive = matches!(
            error,
            Error::Authentication
                | Error::Denied
                | Error::Conflict
                | Error::Core(vantare_ipc::control::Failure::Rejected)
        );
        Reply::LicenseFailure {
            outcome: if definitive {
                crate::protocol::RenewalOutcome::Definitive
            } else {
                crate::protocol::RenewalOutcome::Transient
            },
            message: if error == Error::Version {
                "Actualiza la app para verificar la nueva licencia.".into()
            } else {
                error.to_string()
            },
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
                | Command::AccountCopyLink
                | Command::AccountPoll
                | Command::AccountRenew
                | Command::AccountProfileRefresh
                | Command::Logout
        );
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
        if !probe && let Ok(time) = now() {
            self.triage.record(time, outcome.is_err(), operation);
        }
        if automatic && let Err(error) = outcome {
            return Self::automatic_failure(error);
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
                    now().is_ok_and(|time| account.authorized(time, |_| Ok(())).is_ok())
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

    fn email_account(&mut self, action: Option<crate::protocol::EmailAction>) -> Reply {
        let result: Result<Reply> = (|| {
            self.ensure_account()?;
            let time = now()?;
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
                    self.revoke_local()?;
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
                |account| account.email_reply(now().unwrap_or(0), Some(error)),
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
                let at = chrono::DateTime::from_timestamp(i64::try_from(now()?).unwrap_or(0), 0)
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
            Command::TransferRights => return self.transfer_rights(),
            Command::Purchase { product } => return self.purchase_reply(product),
            Command::LicenseStatus
            | Command::LicenseRenew
            | Command::LicenseRenewAutomatic
            | Command::DeviceReset => {
                return self.license_reply(&command);
            }
            Command::Logout => return self.logout_reply(),
            Command::AccountCopyLink => {
                let account = self.account.as_ref().ok_or(Error::Canceled)?;
                return Ok(Reply::AccountLink {
                    url: crate::protocol::LoginLink(account.login_link()?.to_owned()),
                });
            }
            Command::AccountPoll => return self.poll_account(),
            Command::AccountRenew => {
                self.ensure_account()?;
                self.refresh_oauth(now()?)?;
                return Ok(Self::account_reply(
                    self.account.as_ref().ok_or(Error::Authentication)?,
                    None,
                ));
            }
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
        Ok(Reply::Checkout { url })
    }

    fn account_reply(account: &Account, error: Option<Error>) -> Reply {
        let pending = account.login_pending();
        let copy_link = account.login_link().is_ok();
        let error = error.or(copy_link.then_some(Error::BrowserUnavailable));
        Reply::Account {
            copy_link,
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

    fn triage_reply(&mut self, command: Command) -> Result<Reply> {
        let time = now()?;
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
        let (link, core) = core_fixture(String::new(), "unused", vec![CoreStep::Invalidate]);
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
        core.join().expect("refresh rejection invalidation ACK");
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
        app.candidate_store()
            .expect("store")
            .save(
                "license-candidate",
                &crate::license_remote::Candidate {
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
            app.candidate_store()
                .expect("store")
                .load::<crate::license_remote::Candidate>("license-candidate")
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
    fn oauth_invalid_grant_revokes_before_native_license_and_drops_session() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        for command in [
            Command::LicenseRenew,
            Command::AccountRenew,
            Command::AccountProfileRefresh,
        ] {
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
            app.candidate_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::Candidate {
                        credential: credential.clone(),
                        account_id: credential.claims.subject.clone(),
                        device: device.clone(),
                    },
                )
                .expect("previous signed candidate");
            let (link, core) = core_fixture(device.clone(), keys, vec![CoreStep::Invalidate]);
            app.attach_core(link);
            assert!(
                matches!(app.execute(command), Err(Error::Authentication)),
                "invalid_grant is a definitive OAuth rejection"
            );
            assert!(matches!(
                app.candidate_store()
                    .expect("store")
                    .load::<crate::license_remote::Candidate>("license-candidate"),
                Err(Error::NotFound)
            ));
            assert!(app.account.as_ref().expect("account").identity().is_none());
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
            core.join().expect("durable invalidation ACK");
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
            app.candidate_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::Candidate {
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
                app.candidate_store()
                    .expect("store")
                    .load::<crate::license_remote::Candidate>("license-candidate")
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
    fn definitive_online_license_rejection_removes_the_previous_candidate() {
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
            app.candidate_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::Candidate {
                        credential: credential.clone(),
                        account_id: credential.claims.subject.clone(),
                        device: device.clone(),
                    },
                )
                .expect("previous signed candidate");
            let (link, core) = core_fixture(device.clone(), keys, vec![CoreStep::Invalidate]);
            app.attach_core(link);
            assert!(app.execute(Command::LicenseRenew).is_err());
            assert!(
                matches!(
                    app.candidate_store()
                        .expect("store")
                        .load::<crate::license_remote::Candidate>("license-candidate"),
                    Err(Error::NotFound)
                ),
                "online rejection retained the previous license"
            );
            core.join().expect("revocation ACK");
            server.finish();
            drop(app);
            crate::cleanup_store(&root, "app-online-denial", &[]);
        }
    }

    #[cfg(windows)]
    #[test]
    fn transient_online_license_failures_preserve_the_previous_candidate() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        for status in [429, 503] {
            let server = crate::test_http::Server::start(vec![
                (200, serde_json::json!({"access_token":"fixture-rotated", "refresh_token":"fixture-refresh", "token_type":"Bearer", "expires_in":3600}).to_string()),
                (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
                (status, "{}".into()),
            ]);
            let (root, store) = crate::test_store("app-transient-license");
            let account = crate::account::fixture(&server.base, &store);
            let mut config = BuildConfig::load();
            config.supabase = Some(server.base.clone());
            config.anon_key = Some("public-test-key");
            config.license_keys = Some(keys);
            let mut app = App::new(config, root.clone());
            app.account = Some(account);
            app.store = Some(store);
            let (link, core) = core_fixture(device.clone(), keys, vec![]);
            app.attach_core(link);
            app.candidate_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::Candidate {
                        credential: credential.clone(),
                        account_id: credential.claims.subject.clone(),
                        device: device.clone(),
                    },
                )
                .expect("previous signed candidate");
            assert!(matches!(
                app.execute(Command::LicenseRenew),
                Err(Error::Offline)
            ));
            assert!(
                app.candidate_store()
                    .expect("store")
                    .load::<crate::license_remote::Candidate>("license-candidate")
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
        ReadRecovery,
        #[cfg(windows)]
        Install,
        InstallOnline,
        VersionMismatch,
        Invalidate,
        #[cfg(windows)]
        RejectInstall,
        #[cfg(windows)]
        DisconnectInstall,
        RejectInvalidate,
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
                    CoreStep::Read | CoreStep::ReadRecovery | CoreStep::VersionMismatch
                );
                #[cfg(not(windows))]
                let read_only = matches!(step, CoreStep::VersionMismatch);
                if read_only {
                    assert!(
                        matches!(request.command, control::Command::Read),
                        "untrusted cached license never reaches Install"
                    );
                } else if matches!(step, CoreStep::Invalidate | CoreStep::RejectInvalidate) {
                    assert!(matches!(request.command, control::Command::Invalidate));
                } else {
                    let credential = match request.command {
                        control::Command::Install { credential } => {
                            assert!(
                                !matches!(step, CoreStep::InstallOnline),
                                "renew must preserve online provenance"
                            );
                            credential
                        }
                        control::Command::InstallOnline { credential } => {
                            assert!(
                                matches!(step, CoreStep::InstallOnline),
                                "disk candidate cannot claim online provenance"
                            );
                            credential
                        }
                        _ => panic!("signed credential required"),
                    };
                    let proof = crate::license::Verifier::public_keys(keys)
                        .expect("keys")
                        .proof(&credential, &device, "unused-v2-installation")
                        .expect("signed v1");
                    assert!(proof.grants().is_empty());
                }
                #[cfg(windows)]
                if matches!(step, CoreStep::DisconnectInstall) {
                    // Explicit close after receiving Install, without an ACK.
                    drop(pipe);
                    continue;
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
                            online_recovery_required: matches!(step, CoreStep::ReadRecovery),
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
    fn unsupported_or_retired_candidate_is_archived_before_the_initial_core_ack() {
        use sha2::{Digest, Sha256};
        for case in 0..3 {
            let old_format = case == 1;
            let device = crate::license::installation::legacy_fingerprint().expect("fingerprint");
            let (mut credential, old_keys) = crate::license_remote::tests::signed_fixture(&device);
            // The cached signature is genuine under the old ring. The current
            // ring deliberately retires its id, without introducing real secrets.
            crate::license::Verifier::public_keys(old_keys)
                .expect("old ring")
                .v1(&credential, &credential.claims.subject, &device)
                .expect("old signature");
            let (_, encoded) = old_keys.split_once(':').expect("key");
            let keys: &'static str = if case == 2 {
                credential.signature = "invalid-signature-fixture".into();
                old_keys
            } else {
                Box::leak(format!("current-fixture:{encoded}").into_boxed_str())
            };
            let name = if old_format {
                "app-old-candidate"
            } else {
                "app-retired-candidate"
            };
            let (root, store) = crate::test_store(name);
            drop(store);
            let config = BuildConfig {
                supabase: None,
                anon_key: None,
                license_keys: Some(keys),
                channel: Some("test"),
                native_oauth: None,
            };
            let mut app = App::new(config, root.clone());
            if old_format {
                app.candidate_store()
                    .expect("store")
                    .save("license-candidate", &serde_json::json!({"legacy":true}))
                    .expect("old fixture");
            } else {
                app.candidate_store()
                    .expect("store")
                    .save(
                        "license-candidate",
                        &crate::license_remote::Candidate {
                            account_id: credential.claims.subject.clone(),
                            device: device.clone(),
                            credential,
                        },
                    )
                    .expect("cache fixture");
            }
            let context = crate::license_remote::candidate_context(None, Some("test"));
            let namespace = root.join(format!("{:x}", Sha256::digest(context.as_bytes())));
            let original = namespace.join("license-candidate.dpapi");
            let before = std::fs::read(&original).expect("protected bytes");
            let (link, core) = core_fixture(device, keys, vec![CoreStep::Read, CoreStep::Read]);
            app.attach_core(link);
            for _ in 0..2 {
                assert!(
                    matches!(app.handle(Command::TransferRights), Reply::License { policy, .. } if !policy.overlays_advanced),
                    "initial ACK remains available for recovery, without granting rights"
                );
            }
            assert!(!original.exists());
            let archived: Vec<_> = std::fs::read_dir(&namespace)
                .expect("archive")
                .filter_map(std::result::Result::ok)
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with("license-candidate-")
                        && entry
                            .path()
                            .extension()
                            .is_some_and(|extension| extension == "corrupto")
                })
                .collect();
            assert_eq!(
                archived.len(),
                1,
                "one dated archive; repeated transfer never overwrites it"
            );
            assert_eq!(
                std::fs::read(archived[0].path()).expect("preserved bytes"),
                before
            );
            core.join().expect("read-only core fixture");
            drop(app);
            crate::cleanup_store(&root, name, &[]);
        }
    }

    #[cfg(windows)]
    #[test]
    fn corrupt_transfer_marker_is_quarantined_without_blocking_transfer_or_logout() {
        use sha2::{Digest, Sha256};
        for unreadable in [false, true] {
            let (root, store) = crate::test_store("corrupt-transfer-marker");
            drop(store);
            let mut app = App::new(
                BuildConfig {
                    supabase: None,
                    anon_key: None,
                    license_keys: None,
                    channel: Some("test"),
                    native_oauth: None,
                },
                root.clone(),
            );
            app.candidate_store()
                .expect("store")
                .save(
                    "license-transfer-pending",
                    &serde_json::json!({"wrong":"format"}),
                )
                .expect("protected fixture");
            let context = crate::license_remote::candidate_context(None, Some("test"));
            let namespace = root.join(format!("{:x}", Sha256::digest(context.as_bytes())));
            let marker = namespace.join("license-transfer-pending.dpapi");
            if unreadable {
                std::fs::write(&marker, b"fixture-unreadable-dpapi").expect("corrupt only fixture");
            }
            let original = std::fs::read(&marker).expect("fixture bytes");
            let (_, keys) = crate::license_remote::tests::signed_fixture("test-device");
            let (link, core) = core_fixture(
                "test-device".into(),
                keys,
                vec![CoreStep::Read, CoreStep::Invalidate],
            );
            app.attach_core(link);
            assert!(
                matches!(app.handle(Command::TransferRights), Reply::License { policy, .. } if !policy.overlays_advanced),
                "bad hint cannot block admission or grant rights"
            );
            assert!(
                !app.pending_renewal_transfer()
                    .expect("absent after quarantine")
            );
            assert!(!marker.exists());
            let preserved: Vec<_> = std::fs::read_dir(namespace)
                .expect("namespace")
                .flatten()
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with("license-transfer-pending-")
                        && entry
                            .path()
                            .extension()
                            .is_some_and(|ext| ext == "corrupto")
                })
                .map(|entry| std::fs::read(entry.path()).expect("quarantine bytes"))
                .collect();
            assert_eq!(preserved, vec![original]);
            assert!(matches!(
                app.handle(Command::Logout),
                Reply::Account {
                    signed_in: false,
                    ..
                }
            ));
            core.join().expect("read then durable invalidation");
            drop(app);
            crate::cleanup_store(&root, "corrupt-transfer-marker", &[]);
        }
    }

    #[cfg(windows)]
    #[test]
    fn orphan_transfer_marker_cannot_replace_http_renewal_with_a_verified_read() {
        for bootstrap in [false, true] {
            for success in [false, true] {
                orphan_marker_renews(bootstrap, success);
            }
        }
    }

    #[cfg(windows)]
    fn orphan_marker_renews(bootstrap: bool, success: bool) {
        let device = crate::license::installation::legacy_fingerprint().expect("device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        let server = crate::test_http::Server::start_observed(vec![
            (200, serde_json::json!({"access_token":"fixture-access", "refresh_token":"fixture-refresh", "token_type":"Bearer", "expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
            (if success { 200 } else { 503 }, serde_json::json!({"credential":credential,"online_capabilities":[]}).to_string()),
        ]);
        let (root, store) = crate::test_store("orphan-transfer-marker");
        let account = crate::account::fixture(&server.base, &store);
        let mut app = App::new(
            BuildConfig {
                supabase: Some(server.base.clone()),
                anon_key: Some("public-test-key"),
                license_keys: Some(keys),
                channel: Some("test"),
                native_oauth: None,
            },
            root.clone(),
        );
        app.account = Some(account);
        app.store = Some(store);
        app.candidate_store()
            .expect("store")
            .save("license-transfer-pending", &true)
            .expect("orphan hint");
        let steps = if success {
            vec![CoreStep::Read, CoreStep::Install]
        } else {
            vec![CoreStep::Read]
        };
        let (link, core) = core_fixture(device, keys, steps);
        app.attach_core(link);
        if bootstrap {
            assert!(matches!(
                app.handle(Command::TransferRights),
                Reply::License { .. }
            ));
            assert!(
                !app.pending_renewal_transfer()
                    .expect("orphan hint retired at bootstrap")
            );
        }
        let reply = app.handle(Command::LicenseRenewAutomatic);
        if success {
            assert!(matches!(reply, Reply::License { .. }));
        } else {
            assert!(
                matches!(
                    reply,
                    Reply::LicenseFailure {
                        outcome: crate::protocol::RenewalOutcome::Transient,
                        ..
                    }
                ),
                "Read alone is not a successful renewal"
            );
        }
        assert!(
            !app.pending_renewal_transfer()
                .expect("orphan marker retired")
        );
        assert_eq!(
            server.finish_observed().len(),
            3,
            "a real issuance attempt is mandatory"
        );
        core.join().expect("only the required local requests");
        drop(app);
        crate::cleanup_store(&root, "orphan-transfer-marker", &[]);
    }

    #[cfg(windows)]
    #[test]
    fn automatic_transfer_eof_is_transient_and_cached_candidate_recovers_without_http_replay() {
        for restart in [false, true] {
            automatic_transfer_recovers(restart);
        }
    }

    #[cfg(windows)]
    fn automatic_transfer_recovers(restart: bool) {
        let device = crate::license::installation::legacy_fingerprint().expect("device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        let server = crate::test_http::Server::start_observed(vec![
            (200, serde_json::json!({"access_token":"fixture-access", "refresh_token":"fixture-refresh", "token_type":"Bearer", "expires_in":3600}).to_string()),
            (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
            (200, serde_json::json!({"credential":credential,"online_capabilities":[]}).to_string()),
        ]);
        let (root, store) = crate::test_store("automatic-transfer-eof");
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
        let (link, core) = core_fixture(
            device,
            keys,
            if restart {
                vec![
                    CoreStep::DisconnectInstall,
                    CoreStep::Install,
                    CoreStep::Install,
                ]
            } else {
                vec![CoreStep::DisconnectInstall, CoreStep::Install]
            },
        );
        app.attach_core(link);
        assert!(matches!(
            app.handle(Command::LicenseRenewAutomatic),
            Reply::LicenseFailure {
                outcome: crate::protocol::RenewalOutcome::Transient,
                ..
            }
        ));
        assert!(
            app.candidate_store()
                .expect("store")
                .load::<crate::license_remote::Candidate>("license-candidate")
                .is_ok()
        );
        if restart {
            let link = app.core.clone().expect("core link");
            drop(app);
            app = App::new(
                BuildConfig {
                    supabase: Some(server.base.clone()),
                    anon_key: Some("public-test-key"),
                    license_keys: Some(keys),
                    channel: Some("test"),
                    native_oauth: None,
                },
                root.clone(),
            );
            app.attach_core(link);
            assert!(
                matches!(app.handle(Command::TransferRights), Reply::License { .. }),
                "bootstrap recovers before the automatic command"
            );
        }
        assert!(matches!(
            app.handle(Command::LicenseRenewAutomatic),
            Reply::License { .. }
        ));
        assert!(
            !app.pending_renewal_transfer()
                .expect("ACK cleared pending stage")
        );
        core.join().expect("closed peer then durable ACK");
        assert_eq!(
            server.finish_observed().len(),
            3,
            "listener remains open: a fourth HTTP request would be recorded"
        );
        drop(app);
        crate::cleanup_store(&root, "automatic-transfer-eof", &[]);
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
            app.candidate_store()
                .expect("store")
                .save(
                    "license-candidate",
                    &crate::license_remote::Candidate {
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
                app.candidate_store()
                    .expect("store")
                    .load::<crate::license_remote::Candidate>("license-candidate")
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
    fn automatic_new_key_rejection_preserves_the_verified_binding_and_candidate() {
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
        app.candidate_store()
            .expect("store")
            .save(
                "license-candidate",
                &crate::license_remote::Candidate {
                    account_id: credential.claims.subject.clone(),
                    device: device.clone(),
                    credential,
                },
            )
            .expect("valid previous cache");
        let (link, core) = core_fixture(device, keys, vec![CoreStep::Install, CoreStep::Read]);
        app.attach_core(link);
        assert!(matches!(
            app.execute(Command::TransferRights),
            Ok(Reply::License { .. })
        ));
        assert!(app.execute(Command::LicenseRenewAutomatic).is_err());
        assert!(
            matches!(
                app.execute(Command::LicenseStatus),
                Ok(Reply::License { .. })
            ),
            "automatic verification failure cannot revoke a valid binding"
        );
        assert!(
            app.candidate_store()
                .expect("store")
                .load::<crate::license_remote::Candidate>("license-candidate")
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
            vec![
                CoreStep::InstallOnline,
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
        let (link, core) = core_fixture(device, keys, vec![CoreStep::Invalidate]);
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
        core.join().expect("device limit revocation ACK");
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
    fn detached_identity_switch_requires_ack_then_managed_retry_retires_candidate() {
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
        app.candidate_store()
            .expect("candidate store")
            .save(
                "license-candidate",
                &crate::license_remote::Candidate {
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
            let candidate = app
                .candidate_store()
                .expect("candidate store")
                .load::<crate::license_remote::Candidate>("license-candidate");
            if managed {
                assert!(
                    matches!(candidate, Err(Error::NotFound)),
                    "old candidate must be absent after ACK"
                );
            } else {
                assert!(
                    candidate.is_ok(),
                    "detached rejection must preserve A candidate"
                );
            }
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
    fn authority_recovery_admits_helper_without_rights_then_renews_online() {
        let device = crate::license::installation::legacy_fingerprint().expect("test fingerprint");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
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
                    redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("redirect"),
                }),
            },
            root.clone(),
        );
        app.account = Some(account);
        app.store = Some(store);
        app.candidate_store()
            .expect("store")
            .save(
                "license-candidate",
                &crate::license_remote::Candidate {
                    account_id: credential.claims.subject.clone(),
                    device: device.clone(),
                    credential,
                },
            )
            .expect("old disk candidate");
        let (link, core) = core_fixture(
            device,
            keys,
            vec![
                CoreStep::RejectInstall,
                CoreStep::ReadRecovery,
                CoreStep::InstallOnline,
            ],
        );
        app.attach_core(link);
        assert!(
            matches!(app.execute(Command::TransferRights), Ok(Reply::License { policy, .. })
            if policy.online_recovery_required && !policy.overlays_advanced),
            "helper can be admitted without rights"
        );
        assert!(
            server.requests.try_recv().is_err(),
            "disk transfer never renews or claims online provenance"
        );
        assert!(
            matches!(
                app.execute(Command::LicenseRenew),
                Ok(Reply::License { .. })
            ),
            "normal renewal remains reachable after denied disk transfer"
        );
        core.join()
            .expect("ordinary Install then Read then newly completed InstallOnline");
        server.finish();
        drop(app);
        crate::cleanup_store(&root, "authority-helper-admission", &[]);
    }

    #[test]
    fn authority_recovery_control_version_mismatch_is_transient_without_invalidation() {
        let (link, core) = core_fixture(String::new(), "unused", vec![CoreStep::VersionMismatch]);
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
        assert!(matches!(
            app.core_command(vantare_ipc::control::Command::Read),
            Err(Error::Offline)
        ));
        assert!(matches!(
            App::automatic_failure(Error::Offline),
            Reply::LicenseFailure {
                outcome: crate::protocol::RenewalOutcome::Transient,
                ..
            }
        ));
        core.join().expect("one read, no invalidate or replay");
    }
}
