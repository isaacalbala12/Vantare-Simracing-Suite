//! Formularios GPUI. No red, sesión del proveedor ni persistencia de inputs.
use super::super::protocol::{EmailAction, EmailMode, EmailStage};
use super::{Command, Remote, Reply};
use crate::orbit;
use gpui::{Context, Entity, div, prelude::*, px};
use std::time::{Duration, Instant};

pub(super) struct Form {
    mode: EmailMode,
    stage: EmailStage,
    email: Entity<orbit::Input>,
    password: Entity<orbit::Input>,
    code: Entity<orbit::Input>,
    message: String,
    retry_at: Instant,
    retry_notified: bool,
    sign_out_others: bool,
    /// El servicio perdió el login (caducó o se reinició): pedir otro código.
    restarted: bool,
}

/// Etapa del formulario tras una respuesta. `Form` con error significa que el
/// servicio ya no tiene el login: se vuelve al formulario en vez de quedarse
/// esperando un código que nadie puede verificar.
fn next_stage(current: EmailStage, reply: EmailStage, failed: bool) -> (EmailStage, bool) {
    (
        reply,
        failed && reply == EmailStage::Form && current != EmailStage::Form,
    )
}
impl Form {
    fn new(mode: EmailMode, cx: &mut Context<Remote>) -> Self {
        Self {
            mode,
            stage: EmailStage::Form,
            email: cx.new(|cx| orbit::Input::new(String::new(), "Email", cx)),
            password: cx.new(|cx| orbit::Input::password("Contraseña", cx)),
            code: cx.new(|cx| orbit::Input::new(String::new(), "Código de seis dígitos", cx)),
            message: String::new(),
            retry_at: Instant::now(),
            retry_notified: true,
            sign_out_others: false,
            restarted: false,
        }
    }
    fn set_enabled(&self, enabled: bool, cx: &mut Context<Remote>) {
        for field in [&self.email, &self.password, &self.code] {
            field.update(cx, |input, cx| input.set_enabled(enabled, cx));
        }
    }
    fn clear_secrets(&self, cx: &mut Context<Remote>) {
        self.password
            .update(cx, |input, cx| input.set_value(String::new(), cx));
        self.code
            .update(cx, |input, cx| input.set_value(String::new(), cx));
    }
    fn action(&self, cx: &gpui::App) -> Option<EmailAction> {
        Some(match self.stage {
            EmailStage::Form => EmailAction::Begin {
                mode: self.mode,
                email: self.email.read(cx).value.clone(),
                password: self.password.read(cx).value.clone(),
            },
            EmailStage::Code => EmailAction::Verify {
                code: self.code.read(cx).value.clone(),
            },
            EmailStage::NewPassword => EmailAction::Reset {
                password: self.password.read(cx).value.clone(),
                sign_out_of_other_sessions: self.sign_out_others,
            },
            EmailStage::Consent => EmailAction::Finish {},
            EmailStage::Authorizing | EmailStage::HostedRequired => return None,
        })
    }
    fn submit_label(&self, working: bool) -> &'static str {
        if working {
            return "Esperando…";
        }
        match self.stage {
            EmailStage::Form if matches!(self.mode, EmailMode::SignInPassword) => "Entrar",
            EmailStage::Form if self.restarted => "Pedir otro código",
            EmailStage::Form => "Continuar",
            EmailStage::Code => "Verificar código",
            EmailStage::NewPassword => "Guardar contraseña",
            EmailStage::Consent => "Autorizar Vantare y entrar",
            EmailStage::HostedRequired | EmailStage::Authorizing => unreachable!(),
        }
    }
}
impl Remote {
    /// La acción no cabe en la cola del refresco automático; Logout tiene prioridad.
    pub(super) fn background_discard_message(
        queued: Option<&Command>,
        command: &Command,
    ) -> Option<&'static str> {
        (queued.is_some() && !matches!(command, Command::Logout)).then_some("Operación en curso")
    }
    #[cfg(feature = "parity-capture")]
    pub(crate) fn capture_email(&mut self, scene: &str, cx: &mut Context<Self>) {
        use super::Inflight;
        self.select_email(
            if scene == "password" {
                EmailMode::SignUpPassword
            } else {
                EmailMode::SignInCode
            },
            cx,
        );
        let form = self.email.as_mut().expect("formulario de captura");
        form.email.update(cx, |input, cx| {
            input.set_value("piloto@example.invalid".into(), cx);
        });
        form.stage = match scene {
            "code" => EmailStage::Code,
            "consent" => EmailStage::Consent,
            "pending" => EmailStage::Authorizing,
            _ => EmailStage::Form,
        };
        form.message = match scene {
            "expired" => {
                "El código ha caducado o el acceso se reinició. Pide otro código para continuar."
            }
            "password" => {
                "Esta contraseña apareció en una filtración. Elige una contraseña diferente."
            }
            "queue" => "Operación en curso",
            "pending" => "Esperando la confirmación de Clerk. Puedes volver para cancelar.",
            _ => "Ejemplo visual local. Sin conexión con Clerk.",
        }
        .into();
        form.restarted = scene == "expired";
        if scene == "waiting" {
            form.set_enabled(false, cx);
            self.inflight = Inflight::User;
        }
        // El harness pinta los componentes productivos con datos ficticios;
        // nunca envía comandos ni credenciales durante estas capturas.
        self.stop.store(true, std::sync::atomic::Ordering::Release);
    }

    pub(super) fn prepare_account_command(&mut self, command: &Command, cx: &mut Context<Self>) {
        self.access.requested(command);
        if matches!(
            command,
            Command::Logout | Command::AccountBegin | Command::AccountEmail { .. }
        ) {
            self.clear_pilot();
            self.clear_participation(cx);
        }
        if matches!(command, Command::Logout | Command::AccountBegin) {
            self.email = None;
        }
        if matches!(command, Command::Logout) {
            self.purchase_wait = None;
            self.purchase_product = None;
            self.purchase_message = None;
        }
    }
    /// Una acción de email se descartó por cola llena: reactiva el formulario.
    pub(super) fn email_discarded(&mut self, message: &str, cx: &mut Context<Self>) {
        if let Some(form) = &mut self.email {
            form.set_enabled(true, cx);
            form.message = message.into();
        }
    }
    pub(super) fn select_email(&mut self, mode: EmailMode, cx: &mut Context<Self>) {
        if self.working() {
            return;
        }
        self.email = Some(Form::new(mode, cx));
        self.access.login_requested = false;
        self.account.cancel_login = false;
        cx.notify();
    }
    pub(super) fn email_reply(&mut self, reply: Reply, cx: &mut Context<Self>) {
        let Reply::Email {
            stage,
            retry_after_seconds: retry,
            message,
            error,
        } = reply
        else {
            return;
        };
        if let Some(form) = &mut self.email {
            form.set_enabled(true, cx);
            let (next, restarted) = next_stage(form.stage, stage, error.is_some());
            form.stage = next;
            form.restarted = restarted || (form.restarted && next == EmailStage::Form);
            if restarted {
                form.clear_secrets(cx);
            }
            form.message = message;
            form.retry_notified = retry == 0;
            form.retry_at = Instant::now() + Duration::from_secs(retry.min(600));
            if error.is_none() && stage != EmailStage::Form {
                form.clear_secrets(cx);
            }
        }
    }
    pub(super) fn email_tick(&mut self, cx: &mut Context<Self>) {
        if let Some(form) = &mut self.email
            && !form.retry_notified
            && Instant::now() >= form.retry_at
        {
            form.retry_notified = true;
            cx.notify();
        }
    }
    fn email_action(&mut self, action: EmailAction, cx: &mut Context<Self>) {
        if self.working() {
            return;
        }
        if let Some(form) = &self.email {
            form.set_enabled(false, cx);
        }
        self.request(Command::AccountEmail { action }, cx);
    }
    fn email_submit(&mut self, cx: &mut Context<Self>) {
        if self.working() {
            return;
        }
        let Some(action) = self.email.as_ref().and_then(|form| form.action(cx)) else {
            return;
        };
        if let Some(form) = &self.email {
            form.clear_secrets(cx);
        }
        self.email_action(action, cx);
    }
    fn email_cancel(&mut self, cx: &mut Context<Self>) {
        if self.working() {
            // Cancela la espera de red: se descarta la respuesta pendiente y
            // el cierre de sesión posterior deja servicios sin login a medias.
            if let Some(form) = self.email.take() {
                form.clear_secrets(cx);
            }
            self.request(Command::Logout, cx);
            cx.notify();
            return;
        }
        if let Some(form) = self.email.take() {
            form.clear_secrets(cx);
        }
        self.email_action(EmailAction::Cancel {}, cx);
    }
    fn email_fields(&self, form: &Form, cx: &mut Context<Self>) -> gpui::Div {
        let stage = form.stage;
        let mut panel = div()
            .w_full()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .child(orbit::text(
                match form.mode {
                    EmailMode::SignInCode => "Entrar con un código por email",
                    EmailMode::SignInPassword => "Entrar con contraseña",
                    EmailMode::SignUpCode => "Crear cuenta con un código por email",
                    EmailMode::SignUpPassword => "Crear cuenta con contraseña",
                    EmailMode::Recovery => "Recuperar contraseña",
                },
                14.0,
                600,
                orbit::ink(cx),
                cx,
            ));
        if stage == EmailStage::Form {
            panel = panel
                .child(orbit::text("Email", 12.0, 500, orbit::ink_2(cx), cx))
                .child(form.email.clone());
        }
        if stage == EmailStage::NewPassword
            || (stage == EmailStage::Form
                && matches!(
                    form.mode,
                    EmailMode::SignInPassword | EmailMode::SignUpPassword
                ))
        {
            panel = panel
                .child(orbit::text(
                    if stage == EmailStage::NewPassword {
                        "Nueva contraseña"
                    } else {
                        "Contraseña"
                    },
                    12.0,
                    500,
                    orbit::ink_2(cx),
                    cx,
                ))
                .child(form.password.clone());
        }
        if stage == EmailStage::Code {
            panel = panel
                .child(orbit::text(
                    "Código de seis dígitos",
                    12.0,
                    500,
                    orbit::ink_2(cx),
                    cx,
                ))
                .child(form.code.clone());
            let resend = Instant::now() >= form.retry_at && !self.working();
            panel = panel.child(
                orbit::button("email-resend", "Reenviar código", cx)
                    .tab_stop(resend)
                    .when(!resend, |b| b.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if this
                            .email
                            .as_ref()
                            .is_some_and(|form| Instant::now() >= form.retry_at)
                        {
                            this.email_action(EmailAction::Resend {}, cx);
                        }
                    })),
            );
        }
        if stage == EmailStage::NewPassword {
            panel = panel.child(
                orbit::button(
                    "email-other-sessions",
                    if form.sign_out_others {
                        "✓ Cerrar otras sesiones de Clerk"
                    } else {
                        "Cerrar otras sesiones de Clerk"
                    },
                    cx,
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    if !this.working()
                        && let Some(form) = &mut this.email
                    {
                        form.sign_out_others = !form.sign_out_others;
                        cx.notify();
                    }
                })),
            );
        }
        panel
    }
    pub(super) fn email_view(&self, cx: &mut Context<Self>) -> gpui::Div {
        let Some(form) = &self.email else {
            return div();
        };
        let stage = form.stage;
        let mut panel = self.email_fields(form, cx);
        if stage == EmailStage::Consent {
            panel = panel.child(orbit::text("Permites a Vantare acceder a tu identidad y perfil, y mantener la sesión en este equipo. Puedes cancelar.", 12.0, 400, orbit::ink_2(cx), cx));
        }
        if !form.message.is_empty() {
            panel = panel.child(orbit::callout(form.message.clone(), cx));
        }
        let enabled = !self.working() && Instant::now() >= form.retry_at
            || (!self.working()
                && matches!(
                    stage,
                    EmailStage::Code | EmailStage::NewPassword | EmailStage::Consent
                ));
        if stage == EmailStage::Authorizing {
            panel = panel.child(orbit::text(
                "Esperando la autorización…",
                12.0,
                500,
                orbit::ink_2(cx),
                cx,
            ));
        } else if stage == EmailStage::HostedRequired {
            panel = panel.child(
                orbit::button("email-hosted", "Continuar en el navegador", cx)
                    .on_click(cx.listener(|this, _, _, cx| this.begin_access(cx))),
            );
        } else {
            panel = panel.child(
                orbit::carmine_button("email-submit", form.submit_label(self.working()), cx)
                    .w_full()
                    .tab_stop(enabled)
                    .when(!enabled, |b| b.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| this.email_submit(cx)))
                    .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                        if event.keystroke.key == "enter" {
                            this.email_submit(cx);
                            cx.stop_propagation();
                        }
                    })),
            );
        }
        if stage == EmailStage::Form {
            for (index, mode, label) in [
                (
                    "email-mode-code",
                    EmailMode::SignInCode,
                    "Entrar con código",
                ),
                (
                    "email-mode-password",
                    EmailMode::SignInPassword,
                    "Entrar con contraseña",
                ),
                (
                    "email-mode-signup",
                    EmailMode::SignUpCode,
                    "Crear cuenta sin contraseña",
                ),
                (
                    "email-mode-signup-password",
                    EmailMode::SignUpPassword,
                    "Crear cuenta con contraseña",
                ),
                (
                    "email-mode-reset",
                    EmailMode::Recovery,
                    "¿Olvidaste tu contraseña?",
                ),
            ] {
                if mode != form.mode {
                    panel =
                        panel.child(orbit::button(index, label, cx).on_click(
                            cx.listener(move |this, _, _, cx| this.select_email(mode, cx)),
                        ));
                }
            }
        }
        panel.child(
            orbit::button("email-cancel", "Volver", cx)
                .on_click(cx.listener(|this, _, _, cx| this.email_cancel(cx))),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::super::{Inflight, purchase_tests::fixture};
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn expired_reply_preserves_email_and_clears_secrets_before_a_new_request() {
        gpui_platform::headless().run(|cx| {
            let file = crate::document::tests::File::new();
            let (send, _requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                remote.select_email(EmailMode::SignInCode, cx);
                let form = remote.email.as_mut().expect("form");
                form.stage = EmailStage::Code;
                form.email.update(cx, |input, cx| input.set_value("pilot@example.invalid".into(), cx));
                form.code.update(cx, |input, cx| input.set_value("123456".into(), cx));
                remote.email_reply(Reply::Email { stage: EmailStage::Form, retry_after_seconds: 0, message: "El código ha caducado. Pide otro código.".into(), error: Some("expired".into()) }, cx);
                let form = remote.email.as_ref().expect("form");
                assert_eq!(form.stage, EmailStage::Form);
                assert!(form.restarted);
                assert_eq!(form.submit_label(false), "Pedir otro código");
                assert!(form.code.read(cx).value.is_empty());
                assert!(matches!(form.action(cx), Some(EmailAction::Begin { email, .. }) if email == "pilot@example.invalid"));
                assert!(form.email.read(cx).enabled);
            });
            crate::quit_headless_test(cx);
        });
    }

    #[test]
    fn discarded_email_and_failed_dispatch_release_inputs() {
        gpui_platform::headless().run(|cx| {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                remote.select_email(EmailMode::SignInCode, cx);
                remote.inflight = Inflight::Background;
                remote.queued = Some(Command::DraftLoad);
                remote.email_submit(cx);
                let form = remote.email.as_ref().expect("form");
                assert!(
                    form.email.read(cx).enabled,
                    "cola llena: se puede editar de nuevo"
                );
                assert!(!form.message.is_empty());
                remote.inflight = Inflight::Idle;
                remote.queued = None;
                drop(requests);
                remote.email_submit(cx);
                assert!(
                    remote.email.as_ref().expect("form").email.read(cx).enabled,
                    "IPC fallido: se puede reintentar"
                );
            });
            crate::quit_headless_test(cx);
        });
    }

    #[test]
    fn back_during_network_wait_discards_late_reply_and_sends_logout() {
        gpui_platform::headless().run(|cx| {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                remote.select_email(EmailMode::SignInCode, cx);
                remote.email_submit(cx);
                assert!(matches!(
                    requests.try_recv(),
                    Ok(Command::AccountEmail { .. })
                ));
                remote.email_cancel(cx);
                assert!(remote.email.is_none(), "Volver responde durante la red");
                remote.complete(
                    Reply::Email {
                        stage: EmailStage::Code,
                        retry_after_seconds: 30,
                        message: "respuesta tardía".into(),
                        error: None,
                    },
                    cx,
                );
                assert!(
                    remote.email.is_none(),
                    "la respuesta tardía no restaura el formulario"
                );
                assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
                assert!(!remote.navigation_access().verified);
            });
            crate::quit_headless_test(cx);
        });
    }

    #[test]
    fn expired_or_lost_login_returns_the_form_to_its_first_step() {
        for current in [
            EmailStage::Code,
            EmailStage::NewPassword,
            EmailStage::Consent,
        ] {
            assert_eq!(
                next_stage(current, EmailStage::Form, true),
                (EmailStage::Form, true),
                "el servicio ya no tiene login: pedir otro código"
            );
        }
    }

    #[test]
    fn recoverable_errors_keep_the_current_step() {
        assert_eq!(
            next_stage(EmailStage::Code, EmailStage::Code, true),
            (EmailStage::Code, false)
        );
        assert_eq!(
            next_stage(EmailStage::Form, EmailStage::Form, true),
            (EmailStage::Form, false)
        );
        assert_eq!(
            next_stage(EmailStage::Code, EmailStage::HostedRequired, true),
            (EmailStage::HostedRequired, false)
        );
        assert_eq!(
            next_stage(EmailStage::Form, EmailStage::Code, false),
            (EmailStage::Code, false)
        );
        assert_eq!(
            next_stage(EmailStage::Authorizing, EmailStage::Consent, true),
            (EmailStage::Consent, false),
            "al agotar la espera debe permitir Autorizar de nuevo"
        );
    }
}
