//! Proyección efímera. Una petición a la vez; ningún reintento de escrituras.
use super::{Command, Remote, Reply};
use crate::services::protocol::{EmailAction, MailSource};
#[derive(Default)]
pub(crate) struct State {
    pub consent: Option<bool>,
    pub error: Option<String>,
    pub pending: bool,
    pub onboarding_saved: bool,
    requested: bool,
    source: Option<MailSource>,
    pub desired: Option<bool>,
}
impl State {
    /// Reintentar conserva la intención; solo un ACK permite volver a alternarla.
    pub(crate) fn settings_action(&self) -> (&'static str, bool) {
        if let Some(desired) = self.desired {
            ("Reintentar guardar el permiso de correos", desired)
        } else if self.consent == Some(true) {
            ("Desactivar novedades y ofertas", false)
        } else {
            ("Activar novedades y ofertas", true)
        }
    }
    pub(super) fn dispatched(&mut self, command: &Command) {
        match command {
            Command::MailConsentGet => {
                self.pending = true;
                self.source = None;
            }
            Command::MailConsentSet { source, consent } => {
                self.desired = Some(*consent);
                self.pending = true;
                self.source = Some(*source);
                self.onboarding_saved = false;
            }
            Command::Logout
            | Command::AccountBegin
            | Command::AccountEmail {
                action: EmailAction::Begin { .. } | EmailAction::Finish {},
            } => *self = Self::default(),
            _ => {}
        }
    }
    pub(super) fn complete(&mut self, reply: &Reply) {
        if matches!(
            reply,
            Reply::Account {
                signed_in: false,
                pending: false,
                ..
            }
        ) {
            *self = Self::default();
            return;
        }
        if matches!(
            reply,
            Reply::Account {
                signed_in: true,
                pending: false,
                ..
            }
        ) && self.consent.is_none()
        {
            self.requested = false;
        }
        if !self.pending {
            return;
        }
        match reply {
            Reply::MailConsent { consent, .. } => {
                self.consent = Some(*consent);
                self.desired = None;
                self.onboarding_saved = self.source == Some(MailSource::Onboarding);
                self.error = None;
            }
            Reply::Error { message } => self.error = Some(message.clone()),
            _ => return,
        }
        self.pending = false;
    }
}
impl Remote {
    pub(crate) fn refresh_mail(&mut self, cx: &mut gpui::Context<Self>) {
        self.mail.requested = false;
        self.poll_mail(cx);
    }
    pub(crate) fn poll_mail(&mut self, cx: &mut gpui::Context<Self>) {
        if self.account.signed_in && !self.mail.requested && !self.busy() && self.queued.is_none() {
            self.mail_command(Command::MailConsentGet, cx);
        }
    }
    pub(crate) fn mail_command(&mut self, command: Command, cx: &mut gpui::Context<Self>) {
        if !self.account.signed_in || self.busy() || self.queued.is_some() {
            self.mail.error = Some(
                "Inicia sesión o espera a que termine la operación y vuelve a intentarlo.".into(),
            );
            cx.notify();
            return;
        }
        self.mail.error = None;
        self.mail.requested = true;
        self.request(command, cx);
        if !self.busy() {
            self.mail.pending = false;
            self.mail.error = Some(self.message.clone());
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn acknowledged_retry_returns_to_toggling_the_confirmed_permission() {
        let mut state = State {
            consent: Some(true),
            desired: Some(true),
            ..State::default()
        };
        assert!(state.settings_action().1);
        state.dispatched(&Command::MailConsentSet {
            consent: true,
            source: MailSource::Settings,
        });
        state.complete(&Reply::MailConsent {
            consent: true,
            locale: None,
            revision: 2,
        });
        assert_eq!(state.desired, None);
        assert_eq!(
            state.settings_action(),
            ("Desactivar novedades y ofertas", false)
        );
    }
    #[test]
    fn native_email_login_does_not_inherit_the_previous_accounts_marketing_choice() {
        for action in [
            EmailAction::Begin {
                mode: crate::services::protocol::EmailMode::SignInCode,
                email: "new-account@example.invalid".into(),
                password: String::new(),
            },
            EmailAction::Finish {},
        ] {
            let mut state = State {
                consent: Some(true),
                onboarding_saved: true,
                requested: true,
                desired: Some(true),
                ..State::default()
            };
            state.dispatched(&Command::AccountEmail { action });
            assert_eq!(state.consent, None);
            assert_eq!(state.desired, None);
            assert!(!state.requested && !state.onboarding_saved);
            state.complete(&Reply::Account {
                signed_in: true,
                profile: None,
                expires_at: Some(1000),
                pending: false,
                message: String::new(),
                error: None,
            });
            assert!(
                !state.requested,
                "the new session must fetch its own permission"
            );
            state.dispatched(&Command::MailConsentGet);
            state.complete(&Reply::MailConsent {
                consent: false,
                locale: None,
                revision: 0,
            });
            assert_eq!(state.consent, Some(false));
            assert!(!state.onboarding_saved);
        }
    }
    #[test]
    fn only_ack_changes_consent_and_errors_require_explicit_retry() {
        let mut state = State::default();
        state.dispatched(&Command::MailConsentSet {
            consent: true,
            source: MailSource::Onboarding,
        });
        assert_eq!(state.consent, None);
        assert!(state.pending && !state.onboarding_saved);
        state.complete(&Reply::Error {
            message: "sin conexión".into(),
        });
        assert_eq!(state.consent, None);
        assert!(!state.pending && !state.onboarding_saved);
        assert_eq!(
            state.desired,
            Some(true),
            "explicit retry retains the failed choice"
        );
        state.dispatched(&Command::MailConsentSet {
            consent: false,
            source: MailSource::Onboarding,
        });
        state.complete(&Reply::MailConsent {
            consent: false,
            locale: Some("es".into()),
            revision: 1,
        });
        assert_eq!(state.consent, Some(false));
        assert!(state.onboarding_saved);
        state.dispatched(&Command::MailConsentSet {
            consent: true,
            source: MailSource::Settings,
        });
        state.complete(&Reply::Error {
            message: "verifica el correo".into(),
        });
        assert_eq!(state.consent, Some(false));
        state.dispatched(&Command::Logout);
        assert_eq!(state.consent, None);
        assert!(!state.onboarding_saved);
    }
}
