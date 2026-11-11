//! Pure reducer copied from frozen hub/services/access.rs at 5aa554f80. No GPUI.
use super::identity::SessionState;
use vantare_ipc::services_protocol::{Command, EmailAction, Reply, Session};
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Transition {
    Idle,
    Login,
    Renewal,
    Logout,
    Cancel,
    Choose,
}

#[derive(Default)]
pub(super) struct ManualLink {
    pub(super) available: bool,
    pub(super) copied: bool,
}

pub(super) struct State {
    pub(super) configured: bool,
    pub(super) session_checked: bool,
    pub(super) login_requested: bool,
    pub(super) error: Option<String>,
    pub(super) manual: ManualLink,
    pub(super) policy: Option<vantare_ipc::control::Policy>,
    pub(super) session: SessionState,
    pub(super) transition: Transition,
}

pub(super) fn follow_up(
    pending: bool,
    cancel: &mut Option<Command>,
    check_session: bool,
) -> Option<Command> {
    if let Some(command) = cancel.take() {
        Some(command)
    } else if pending || check_session {
        Some(Command::AccountPoll)
    } else {
        None
    }
}

impl State {
    pub(super) fn from_build() -> Self {
        Self {
            // Solo reserva la pantalla durante el primer IPC. Status confirma
            // la configuración real del binario de servicios (native_oauth).
            configured: [
                option_env!("VANTARE_CLERK_ISSUER"),
                option_env!("VANTARE_CLERK_CLIENT_ID"),
                option_env!("VANTARE_CLERK_REDIRECT"),
            ]
            .iter()
            .all(|value| value.is_some_and(|value| !value.is_empty())),
            session_checked: false,
            login_requested: false,
            error: None,
            manual: ManualLink::default(),
            policy: None,
            session: SessionState::Confirmed(Session::SignedOut),
            transition: Transition::Idle,
        }
    }

    pub(super) fn requested(&mut self, command: &Command) {
        if matches!(
            command,
            Command::AccountBegin
                | Command::AccountCancel
                | Command::Logout
                | Command::AccountEmail { .. }
        ) {
            self.error = None;
            self.manual = ManualLink::default();
        }
        if let Command::AccountEmail { action } = command {
            self.error = None;
            self.login_requested = false;
            if matches!(action, EmailAction::Begin { .. } | EmailAction::Finish {}) {
                self.policy = None;
                self.transition = Transition::Login;
            } else if matches!(action, EmailAction::Cancel {}) {
                self.transition = Transition::Idle;
            }
        }
        if matches!(command, Command::Logout | Command::AccountBegin) {
            if matches!(command, Command::Logout) {
                self.invalidate();
            } else {
                self.policy = None;
            }
            self.transition = if matches!(command, Command::AccountBegin) {
                Transition::Login
            } else {
                Transition::Logout
            };
            self.login_requested = true;
        }
        if matches!(command, Command::AccountCancel) {
            self.transition = Transition::Cancel;
            self.login_requested = false;
        }
    }

    pub(super) fn renewal_acknowledged(&mut self, reply: &Reply) -> Option<Command> {
        if self.transition == Transition::Logout {
            return None;
        }
        match reply {
            Reply::Error { message } | Reply::DeviceLimit { message } => {
                self.transition = Transition::Idle;
                self.error = Some(message.clone());
            }
            Reply::License { policy, .. } => {
                self.transition = Transition::Idle;
                self.error = (policy.state.requires_attention()
                    || policy.version != vantare_ipc::control::VERSION
                    || policy.revision == 0)
                    .then(|| {
                        vantare_services::outcome::policy_message(policy)
                            .unwrap_or_else(|| "No se pudo verificar la política de acceso".into())
                    });
                // OAuth may have rotated; AccountPoll only observes the session.
                return self.error.is_none().then_some(Command::AccountPoll);
            }
            _ => {}
        }
        None
    }

    pub(super) fn next_command(
        &mut self,
        reply: &Reply,
        cancel: &mut Option<Command>,
    ) -> Option<Command> {
        let pending = matches!(reply, Reply::AccountLink { .. }) && self.login_requested
            || matches!(
                reply,
                Reply::Account {
                    session: Session::Pending,
                    ..
                } | Reply::Email {
                    stage: vantare_ipc::services_protocol::EmailStage::Authorizing,
                    ..
                }
            );
        // A failed renewal may have changed Session; read it instead of guessing.
        let check_session = (self.transition != Transition::Logout
            && matches!(reply, Reply::LicenseFailure { .. }))
            || matches!(
                reply,
                Reply::Status {
                    account_configured: true,
                    ..
                }
            );
        // The host service queue owns deferred UI intents.
        if let Some(command) = follow_up(pending, cancel, check_session) {
            self.requested(&command);
            return Some(command);
        }
        if let Reply::Account {
            session: Session::SignedOut | Session::SignedIn | Session::NeedsSignIn,
            ..
        } = reply
            && self.transition == Transition::Login
        {
            // The supervisor timer renews after the session is confirmed.
            // The Hub consumes its core feed; never start a duplicate HTTP grant.
            self.transition = Transition::Idle;
        }
        None
    }

    fn invalidate(&mut self) {
        self.policy = None;
        // Solo Reply::Account publica Session. Una intención local o un cierre
        // de transporte no equivale a escribir SignedOut en services.
    }

    /// Identidad confirmada por services, aunque necesite nueva autenticación.
    /// Solo la política fresca del núcleo decide los derechos locales.
    pub(super) fn session_known(&self) -> bool {
        matches!(
            self.session.current(),
            Session::SignedIn | Session::NeedsSignIn
        )
    }

    /// A cached background observation is not a login/cancel/logout reply.
    pub(super) fn observe_cached_session(&mut self, session: Option<Session>) -> Option<Session> {
        if self.transition != Transition::Idle || self.login_requested {
            return None;
        }
        let session = session.filter(|session| *session != Session::Pending)?;
        if session == Session::SignedOut {
            self.invalidate();
        }
        self.session.observe(session, false);
        self.session_checked = true;
        Some(session)
    }

    pub(super) fn logout_requested(&self) -> bool {
        self.transition == Transition::Logout
    }

    pub(super) fn logout_failed(&self) -> bool {
        self.logout_requested() && self.error.is_some() && !self.login_requested
    }

    pub(super) fn can_return_after_logout(&self, now_ms: u64) -> bool {
        self.logout_failed()
            && self.policy.as_ref().is_some_and(|policy| {
                super::navigation::Access::from_session_policy(
                    self.session.current(),
                    policy,
                    now_ms,
                )
                .verified
            })
    }

    pub(super) fn observe_core_policy(&mut self, policy: vantare_ipc::control::Policy) {
        if (self.transition == Transition::Idle || self.logout_failed())
            && !self.login_requested
            && self.session_known()
        {
            self.policy = Some(policy);
        }
    }

    #[cfg(test)]
    pub(super) fn navigation(&self, now_ms: u64) -> super::navigation::Access {
        use super::navigation::Access;
        if self.transition != Transition::Idle || self.login_requested || !self.session_known() {
            return Access::default();
        }
        let Some(policy) = &self.policy else {
            return Access::default();
        };
        Access::from_session_policy(self.session.current(), policy, now_ms)
    }

    pub(super) fn policy_denial(&self, now_ms: u64) -> Option<String> {
        match self.policy.as_ref() {
            Some(policy) if policy.state.requires_attention() => {
                vantare_services::outcome::policy_message(policy)
            }
            Some(policy) if policy.revision > 0 && !policy.current_at(now_ms) => {
                Some("Política caducada".into())
            }
            Some(policy) if policy.current_at(now_ms) => None,
            _ => Some("Sin política vigente".into()),
        }
    }

    pub(super) fn required(&self) -> bool {
        self.configured
            && (!self.session_checked
                || !self.session_known()
                || self.login_requested
                || matches!(
                    self.transition,
                    Transition::Logout
                        | Transition::Cancel
                        | Transition::Choose
                        | Transition::Login
                ))
    }

    pub(super) fn reduce(&mut self, reply: &Reply, account: bool, profile: bool) -> bool {
        let mut accepted = false;
        let previous_error = self.error.clone();
        // Un error de transporte no revoca la última política. navigation sigue
        // aplicando su caducidad; el resultado definitivo sí retira el acceso.
        if matches!(reply, Reply::Closed) {
            self.policy = None;
            if self.transition == Transition::Login {
                self.transition = Transition::Renewal;
            }
        }
        match reply {
            Reply::Status {
                account_configured, ..
            } => {
                self.configured = *account_configured;
                if !account_configured {
                    self.invalidate();
                }
                self.error = None;
            }
            Reply::Account {
                copy_link,
                error,
                session,
                ..
            } => {
                let pending = *session == Session::Pending;
                // Un callback tardío no revierte una solicitud explícita de logout.
                if self.transition == Transition::Logout && *session != Session::SignedOut {
                    self.error = error
                        .as_ref()
                        .map(|message| format!("No se pudo cerrar la sesión: {message}"));
                    self.login_requested = error.is_none();
                    if error.is_some() {
                        self.session.observe(*session, false);
                    }
                    return error.is_some();
                }
                if profile && *session == Session::SignedIn {
                    return true;
                }
                accepted = true;
                if self.transition == Transition::Logout {
                    self.transition = Transition::Renewal;
                }
                if self.transition == Transition::Cancel {
                    self.transition = Transition::Idle;
                }
                // Un sondeo pendiente no sustituye una sesión ya confirmada.
                if pending && self.session_known() && self.transition == Transition::Idle {
                    self.session.observe(*session, true);
                    return true;
                }
                // Releer una sesión que sigue igual no retira la política vigente:
                // hacerlo dejaba el candado visible hasta la siguiente lectura.
                if !matches!(session, Session::SignedIn | Session::NeedsSignIn) {
                    self.invalidate();
                }
                self.session.observe(*session, false);
                self.session_checked = true;
                self.manual.available = pending && *copy_link;
                if !self.manual.available {
                    self.manual.copied = false;
                }
                self.login_requested = pending;
                self.error = if *session == Session::NeedsSignIn {
                    None // El aviso de sesión se muestra aparte de los errores de acceso.
                } else {
                    error
                        .as_ref()
                        .map(|message| format!("No se pudo completar el acceso: {message}"))
                };
            }
            Reply::LicenseStatus { session, .. } => {
                accepted = self.observe_cached_session(*session).is_some();
            }
            Reply::Email { .. } => {
                self.login_requested = false;
                self.error = None;
            }
            Reply::Closed => {
                self.manual.available = false;
                self.manual.copied = false;
                self.invalidate();
            }
            Reply::Error { message } if account => {
                self.login_requested = false;
                if matches!(self.transition, Transition::Login | Transition::Cancel) {
                    self.transition = Transition::Idle;
                }
                // Un error genérico no confirma el fin del callback. Solo
                // Account sin pending o un cierre definitivo consume el login.
                self.error = Some(if self.logout_requested() {
                    format!("No se pudo cerrar la sesión: {message}")
                } else {
                    format!("No se pudo completar el acceso: {message}")
                });
            }
            _ => {}
        }
        if self.error.is_some() && self.error != previous_error {
            use std::io::Write;
            // El texto se presenta en pantalla; el log no copia datos IPC.
            let _log = writeln!(
                std::io::stderr(),
                "account-access: failed; user-message-visible"
            );
        }
        accepted
    }

    pub(super) fn signed_in(&self) -> bool {
        self.session.identity() == Session::SignedIn
    }
    pub(super) fn pending(&self) -> bool {
        self.session.pending()
    }
    pub(super) fn finish_reply(&mut self) {
        self.session.finish_reply();
    }

    #[cfg(test)]
    pub(super) fn fixture_session(&mut self, session: Session) {
        self.session.observe(session, session == Session::Pending);
    }

    #[cfg(test)]
    pub(super) fn observe(&mut self, reply: &Reply, account: bool) {
        // Existing state fixtures inject a fresh core policy, like Feed in Remote.
        if let Reply::License { policy, .. } = reply {
            if self.transition == Transition::Idle && !self.login_requested && self.session_known()
            {
                self.observe_core_policy(policy.clone());
            }
        } else {
            let _ = self.reduce(reply, account, false);
        }
    }
}

#[cfg(test)]
#[path = "reducer_tests.rs"]
mod copied_tests;

#[cfg(test)]
#[path = "native_email_tests.rs"]
mod copied_email_tests;
