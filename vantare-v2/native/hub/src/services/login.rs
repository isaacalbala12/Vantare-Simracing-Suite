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
            EmailStage::HostedRequired => return None,
        })
    }
}
impl Remote {
    pub(super) fn prepare_account_command(&mut self, command: &Command) {
        self.access.requested(command);
        if matches!(
            command,
            Command::Logout | Command::AccountBegin | Command::AccountEmail { .. }
        ) {
            self.clear_pilot();
            self.clear_participation();
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
            if error.is_none() || stage == EmailStage::HostedRequired {
                form.stage = stage;
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
        if stage == EmailStage::HostedRequired {
            panel = panel.child(
                orbit::button("email-hosted", "Continuar en el navegador", cx)
                    .on_click(cx.listener(|this, _, _, cx| this.begin_access(cx))),
            );
        } else {
            panel = panel.child(
                orbit::carmine_button(
                    "email-submit",
                    if self.working() {
                        "Esperando…"
                    } else {
                        match stage {
                            EmailStage::Form if matches!(form.mode, EmailMode::SignInPassword) => {
                                "Entrar"
                            }
                            EmailStage::Form => "Continuar",
                            EmailStage::Code => "Verificar código",
                            EmailStage::NewPassword => "Guardar contraseña",
                            EmailStage::Consent => "Autorizar Vantare y entrar",
                            EmailStage::HostedRequired => unreachable!(),
                        }
                    },
                    cx,
                )
                .w_full()
                .tab_stop(enabled)
                .when(!enabled, |b| b.opacity(orbit::DISABLED))
                .on_click(cx.listener(|this, _, _, cx| this.email_submit(cx)))
                .on_key_down(cx.listener(
                    |this, event: &gpui::KeyDownEvent, _, cx| {
                        if event.keystroke.key == "enter" {
                            this.email_submit(cx);
                            cx.stop_propagation();
                        }
                    },
                )),
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
                .tab_stop(!self.working())
                .on_click(cx.listener(|this, _, _, cx| this.email_cancel(cx))),
        )
    }
}
