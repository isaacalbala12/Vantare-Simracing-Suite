//! Acceso alojado: el estado viene del mismo servicio que la sección Cuenta.
use super::super::protocol::{EmailAction, EmailMode};
use super::{Command, Inflight, Remote, Reply};
use crate::orbit;
use gpui::{Context, Div, Stateful, div, prelude::*, px, rgb, rgba};
use vantare_ipc::services_protocol::Session;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Transition {
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
    queued: Option<ManualAction>,
}
enum ManualAction {
    Copy,
    Retry,
}

pub(super) struct State {
    configured: bool,
    session_checked: bool,
    pub(super) login_requested: bool,
    error: Option<String>,
    pub(super) manual: ManualLink,
    policy: Option<vantare_ipc::control::Policy>,
    session: Session,
    transition: Transition,
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
            session: Session::SignedOut,
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
        if self.transition != Transition::Logout
            && let Reply::Error { message } | Reply::DeviceLimit { message } = reply
        {
            self.transition = Transition::Idle;
            self.error = Some(message.clone());
            return None;
        }
        if self.transition != Transition::Logout
            && let Reply::License { policy, message } = reply
            && (policy.state.requires_attention()
                || policy.version != vantare_ipc::control::VERSION
                || policy.revision == 0)
        {
            self.transition = Transition::Idle;
            self.error = Some(
                if matches!(
                    policy.state,
                    vantare_ipc::control::AccessState::ClockBehind { .. }
                ) {
                    message.clone()
                } else {
                    policy
                        .state
                        .message()
                        .unwrap_or("No se pudo verificar la política de acceso")
                        .into()
                },
            );
            return None;
        }
        if self.transition != Transition::Logout
            && matches!(reply, Reply::License { policy, .. }
                if !policy.state.requires_attention() && policy.version == vantare_ipc::control::VERSION && policy.revision > 0)
        {
            self.transition = Transition::Idle;
            self.error = None;
            // LicenseRenew puede haber rotado OAuth en servicios. Releer su
            // caducidad mediante IPC; AccountPoll no hace refresh ni renovación.
            return Some(Command::AccountPoll);
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
                    stage: super::super::protocol::EmailStage::Authorizing,
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
        if pending && cancel.is_none() {
            match self.manual.queued.take() {
                Some(ManualAction::Retry) => {
                    self.requested(&Command::AccountBegin);
                    return Some(Command::AccountBegin);
                }
                Some(ManualAction::Copy) if self.manual.available => {
                    return Some(Command::AccountCopyLink);
                }
                _ => {}
            }
        }
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
        matches!(self.session, Session::SignedIn | Session::NeedsSignIn)
    }

    pub(super) fn logout_requested(&self) -> bool {
        self.transition == Transition::Logout
    }

    fn logout_failed(&self) -> bool {
        self.logout_requested() && self.error.is_some() && !self.login_requested
    }

    pub(super) fn can_return_after_logout(&self, now_ms: u64) -> bool {
        self.logout_failed()
            && self.policy.as_ref().is_some_and(|policy| {
                crate::shell::navigation::Access::from_session_policy(self.session, policy, now_ms)
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

    pub(super) fn navigation(&self, now_ms: u64) -> crate::shell::navigation::Access {
        use crate::shell::navigation::Access;
        if self.transition != Transition::Idle || self.login_requested || !self.session_known() {
            return Access::default();
        }
        let Some(policy) = &self.policy else {
            return Access::default();
        };
        Access::from_session_policy(self.session, policy, now_ms)
    }

    pub(super) fn policy_denial(&self, now_ms: u64) -> Option<&'static str> {
        match self.policy.as_ref() {
            Some(policy) if policy.state.requires_attention() => policy.state.message(),
            Some(policy) if policy.revision > 0 && !policy.current_at(now_ms) => {
                Some("Política caducada")
            }
            Some(policy) if policy.current_at(now_ms) => None,
            _ => Some("Sin política vigente"),
        }
    }

    fn required(&self) -> bool {
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

    pub(super) fn observe(&mut self, reply: &Reply, account: bool) {
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
                        self.session = *session;
                    }
                    return;
                }
                if self.transition == Transition::Logout {
                    self.transition = Transition::Renewal;
                }
                if self.transition == Transition::Cancel {
                    self.transition = Transition::Idle;
                }
                // Un sondeo pendiente no sustituye una sesión ya confirmada.
                if pending && self.session_known() && self.transition == Transition::Idle {
                    return;
                }
                // Releer una sesión que sigue igual no retira la política vigente:
                // hacerlo dejaba el candado visible hasta la siguiente lectura.
                if !matches!(session, Session::SignedIn | Session::NeedsSignIn) {
                    self.invalidate();
                }
                self.session = *session;
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
            Reply::License { policy, .. }
                if self.transition == Transition::Idle
                    && !self.login_requested
                    && self.session_known() =>
            {
                self.policy = Some(policy.clone());
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
    }
}

#[derive(Clone, Copy)]
enum Portal {
    SignUp,
    Reset,
    Profile,
}

fn portal_url(issuer: Option<&str>, portal: Option<&str>, page: Portal) -> Option<String> {
    let mut url = vantare_services::config::account_portal_origin(issuer, portal)?;
    url.set_path(match page {
        Portal::SignUp => "/sign-up",
        Portal::Reset => "/sign-in",
        Portal::Profile => "/user",
    });
    if matches!(page, Portal::Reset) {
        url.set_query(Some("__clerk_reset_password=true"));
    }
    Some(url.into())
}

pub(super) fn profile_portal() -> Option<String> {
    portal_url(
        option_env!("VANTARE_CLERK_ISSUER"),
        option_env!("VANTARE_CLERK_ACCOUNT_PORTAL_URL"),
        Portal::Profile,
    )
}

impl Remote {
    /// Estado de lectura de acceso para Inicio. Los heartbeats no activan esqueletos.
    pub(crate) fn home_access(&self) -> (bool, Option<&str>) {
        let pending = self.access.configured && !self.access.session_checked
            || self.account.signed_in
                && self.access.session_known()
                && self.access.policy.is_none()
                && self.busy();
        let error = self.access.error.as_deref().or_else(|| {
            self.access
                .policy
                .as_ref()
                .and_then(|policy| policy.state.message())
        });
        (pending, error)
    }
    pub(crate) fn retry_home_access(&mut self, cx: &mut Context<Self>) {
        self.access.error = None;
        self.request(
            if self.account.signed_in {
                Command::LicenseRenew
            } else {
                Command::Status
            },
            cx,
        );
    }
    pub(crate) fn session_notice(&self) -> Option<&'static str> {
        (self.access.session == Session::NeedsSignIn)
            .then_some("Vuelve a iniciar sesión en Cuenta para usar los servicios de tu cuenta.")
    }

    pub fn requires_access(&self) -> bool {
        self.access.required() || (self.email.is_some() && self.can_start_account_login())
    }

    pub(super) fn can_start_account_login(&self) -> bool {
        self.access.configured && self.access.session != Session::SignedIn
    }

    pub(super) fn open_account_login(&mut self, cx: &mut Context<Self>) {
        if self.can_start_account_login() && !self.working() {
            self.email = None;
            self.access.error = None;
            self.access.transition = Transition::Choose;
            cx.notify();
        }
    }

    pub(super) fn begin_access(&mut self, cx: &mut Context<Self>) {
        use std::io::Write;
        if self.canceling_access() {
            return cx.notify();
        }
        let _log = writeln!(std::io::stderr(), "account-access: requested");
        if self.working() {
            if self.access.manual.available {
                self.access.manual.queued = Some(ManualAction::Retry);
                cx.notify();
            }
            let _log = writeln!(
                std::io::stderr(),
                "account-access: waiting-for-current-request"
            );
            return;
        }
        self.access.error = None;
        self.access.login_requested = true;
        self.account.cancel_command = None;
        // OAuth IdP de Clerk no documenta selección de proveedor en authorize:
        // Google, Discord y email usan la misma página alojada con PKCE.
        self.request(Command::AccountBegin, cx);
        self.access.login_requested = self.busy();
    }

    pub(super) fn copy_access_link(&mut self, cx: &mut Context<Self>) {
        if self.access.manual.available && self.access.login_requested {
            if self.busy() {
                self.access.manual.queued = Some(ManualAction::Copy);
                cx.notify();
            } else {
                self.request(Command::AccountCopyLink, cx);
            }
        }
    }

    pub(super) fn accept_login_link(
        &mut self,
        link: &super::super::protocol::LoginLink,
        cx: &mut Context<Self>,
    ) {
        use std::io::Write;
        // Una respuesta tardía tras cancelar/expirar no modifica el portapapeles.
        if !self.access.manual.available || !self.access.login_requested {
            return;
        }
        cx.write_to_clipboard(gpui::ClipboardItem::new_string(link.0.clone()));
        self.access.manual.copied = cx
            .read_from_clipboard()
            .and_then(|item| item.text())
            .is_some_and(|text| text == link.0);
        if !self.access.manual.copied {
            self.access.error = Some(
                "No se pudo copiar el enlace. Comprueba el portapapeles y vuelve a intentarlo."
                    .into(),
            );
            let _log = writeln!(std::io::stderr(), "account-login: clipboard-unavailable");
        }
    }

    pub(super) fn retry_access(&mut self, cx: &mut Context<Self>) {
        if self.access.logout_requested() {
            if !self.working() {
                self.request(Command::Logout, cx);
            }
        } else if self.access.session_checked {
            self.begin_access(cx);
        } else {
            self.access.error = None;
            self.request(Command::Status, cx);
        }
    }

    pub(super) fn canceling_access(&self) -> bool {
        self.access.transition == Transition::Cancel
            || self.inflight == Inflight::Cancel
            || matches!(self.account.cancel_command, Some(Command::AccountCancel))
            || matches!(self.queued, Some(Command::AccountCancel))
    }

    pub(super) fn ignores_during_cancel(&self, command: &Command) -> bool {
        (matches!(command, Command::AccountCancel)
            && (self.inflight == Inflight::Cancel
                || matches!(self.account.cancel_command, Some(Command::AccountCancel))
                || matches!(self.queued, Some(Command::AccountCancel))))
            || (self.canceling_access()
                && matches!(
                    command,
                    Command::AccountBegin | Command::AccountEmail { .. }
                ))
    }

    pub(super) fn access_escape(&mut self, key: &str, cx: &mut Context<Self>) -> bool {
        if key == "escape" && self.access.transition == Transition::Choose && !self.working() {
            self.access.transition = Transition::Idle;
            cx.notify();
            return true;
        }
        false
    }

    fn cancel_access(&mut self, cx: &mut Context<Self>) {
        if self.canceling_access() || self.access_escape("escape", cx) {
            return;
        }
        self.request(Command::AccountCancel, cx);
    }

    pub(super) fn return_after_logout(&mut self, cx: &mut Context<Self>) {
        let can_return = vantare_ipc::control::wall_ms()
            .is_ok_and(|now| self.access.can_return_after_logout(now));
        if !self.working() && can_return {
            self.access.transition = Transition::Idle;
            self.access.error = None;
            cx.notify();
        }
    }

    fn logout_return_button(cx: &mut Context<Self>) -> Stateful<Div> {
        orbit::button("access-logout-back", "Volver", cx)
            .on_click(cx.listener(|this, _, _, cx| this.return_after_logout(cx)))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    this.return_after_logout(cx);
                    cx.stop_propagation();
                }
            }))
    }

    fn open_portal(&mut self, page: Portal, cx: &mut Context<Self>) {
        if let Some(url) = portal_url(
            option_env!("VANTARE_CLERK_ISSUER"),
            option_env!("VANTARE_CLERK_ACCOUNT_PORTAL_URL"),
            page,
        ) {
            cx.open_url(&url);
        } else {
            self.access.error =
                Some("La URL pública de Account Portal no está disponible para este build.".into());
            cx.notify();
        }
    }

    fn access_button(
        &self,
        id: &'static str,
        label: &'static str,
        primary: bool,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let button = if primary {
            orbit::carmine_button(id, label, cx)
        } else {
            orbit::button(id, label, cx)
        };
        button
            .w_full()
            .h(px(44.0))
            .rounded(px(8.0))
            .when(self.working() || self.canceling_access(), |button| {
                button
                    .opacity(orbit::DISABLED)
                    .tab_stop(false)
                    .aria_description("Esperando respuesta")
            })
            .on_click(cx.listener(move |this, _, _, cx| {
                if id == "access-email" {
                    this.select_email(EmailMode::SignInCode, cx);
                } else {
                    this.begin_access(cx);
                }
            }))
            .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    if id == "access-email" {
                        this.select_email(EmailMode::SignInCode, cx);
                    } else {
                        this.begin_access(cx);
                    }
                    cx.stop_propagation();
                }
            }))
    }

    fn portal_link(
        id: &'static str,
        label: &'static str,
        page: Portal,
        color: u32,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        div()
            .id(id)
            .role(gpui::Role::Link)
            .aria_label(label)
            .tab_index(0)
            .cursor_pointer()
            .rounded(px(4.0))
            .focus_visible(|style| style.border_1().border_color(rgb(orbit::carmine(cx))))
            .child(orbit::text(label, 12.0, 400, color, cx))
            .on_click(cx.listener(move |this, _, _, cx| match page {
                Portal::SignUp => this.select_email(EmailMode::SignUpCode, cx),
                Portal::Reset => this.select_email(EmailMode::Recovery, cx),
                Portal::Profile => this.open_portal(page, cx),
            }))
            .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    match page {
                        Portal::SignUp => this.select_email(EmailMode::SignUpCode, cx),
                        Portal::Reset => this.select_email(EmailMode::Recovery, cx),
                        Portal::Profile => this.open_portal(page, cx),
                    }
                    cx.stop_propagation();
                }
            }))
    }

    pub fn access_screen(
        &self,
        focus: &gpui::FocusHandle,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let waiting = self.access.login_requested || self.account.pending;
        let checking = !self.access.session_checked && self.access.error.is_none();
        let mut body = div()
            .flex()
            .flex_col()
            .items_center()
            .gap(px(24.0))
            .w_full()
            .max_w(px(384.0))
            .px(px(16.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(8.0))
                    .child(orbit::icon("i-vantare", 48.0, orbit::carmine(cx)))
                    .child(
                        orbit::text("Bienvenido a Vantare", 20.0, 600, orbit::ink(cx), cx)
                            .mt(px(8.0)),
                    )
                    .child(orbit::text(
                        "Inicia sesión o crea tu cuenta",
                        14.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    )),
            );
        if self.email.is_some() {
            body = body.child(self.email_view(cx));
        } else if self.canceling_access() {
            body = body.child(orbit::text("Cancelando…", 14.0, 400, orbit::ink_2(cx), cx));
        } else if waiting || checking || self.access.logout_requested() {
            body = body.child(orbit::text(
                if self.access.logout_failed() {
                    "El cierre de sesión no se ha confirmado"
                } else if self.access.logout_requested() {
                    "Cerrando sesión…"
                } else if waiting {
                    "Continúa en tu navegador…"
                } else {
                    "Comprobando sesión…"
                },
                14.0,
                400,
                orbit::ink_2(cx),
                cx,
            ));
            if waiting && !self.access.logout_requested() {
                body = body.child(self.access_cancel_button("Cancelar", cx));
            }
        } else {
            body = body.child(self.access_choices(cx));
        }
        if self.access.transition == Transition::Choose && self.email.is_none() {
            body = body.child(self.access_cancel_button("Volver", cx));
        }
        if let Some(error) = &self.access.error {
            body = body
                .child(orbit::callout(error.clone(), cx))
                .child(self.access_retry_button(cx));
        }
        if vantare_ipc::control::wall_ms().is_ok_and(|now| self.access.can_return_after_logout(now))
        {
            body = body.child(Self::logout_return_button(cx));
        }
        body = body.when(self.access.manual.available, |body| {
            body.child(self.access_copy_link(cx))
        });
        body = body.child(
            orbit::text("made by Vantare", 10.0, 600, orbit::ink_muted(cx), cx).mt(px(24.0)),
        );
        Self::access_frame(body, focus, cx)
    }

    fn access_frame(body: Div, focus: &gpui::FocusHandle, cx: &mut Context<Self>) -> Stateful<Div> {
        div()
            .id("hub-access")
            .track_focus(focus)
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if this.access_escape(&event.keystroke.key, cx) {
                    cx.stop_propagation();
                }
            }))
            .tab_group()
            .tab_stop(false)
            .size_full()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .overflow_y_scroll()
            .py(px(24.0))
            .bg(rgb(orbit::canvas(cx)))
            .text_color(rgb(orbit::ink(cx)))
            .font_family(crate::orbit::sans_override("Inter W400", cx))
            .child(body)
    }

    fn access_cancel_button(&self, label: &'static str, cx: &mut Context<Self>) -> Stateful<Div> {
        orbit::button(
            "access-cancel",
            if self.canceling_access() {
                "Cancelando…"
            } else {
                label
            },
            cx,
        )
        .when(self.canceling_access(), |button| {
            button.tab_stop(false).opacity(orbit::DISABLED)
        })
        .on_click(cx.listener(|this, _, _, cx| this.cancel_access(cx)))
        .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                this.cancel_access(cx);
                cx.stop_propagation();
            }
        }))
    }

    fn access_retry_button(&self, cx: &mut Context<Self>) -> Stateful<Div> {
        let label = if self.access.logout_failed() {
            "Reintentar cierre de sesión"
        } else {
            "Reintentar"
        };
        orbit::button("access-retry", label, cx)
            .on_click(cx.listener(|this, _, _, cx| this.retry_access(cx)))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    this.retry_access(cx);
                    cx.stop_propagation();
                }
            }))
    }

    fn access_copy_link(&self, cx: &mut Context<Self>) -> Div {
        let mut body = div().w_full().flex().flex_col().gap(px(8.0));
        body = body.child(
            orbit::button("access-copy-link", "Copiar enlace", cx)
                .on_click(cx.listener(|this, _, _, cx| this.copy_access_link(cx)))
                .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                    if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                        this.copy_access_link(cx);
                        cx.stop_propagation();
                    }
                })),
        );
        if self.access.manual.copied {
            body = body.child(orbit::text(
                "Enlace copiado. Pégalo en tu navegador para continuar.",
                12.0,
                400,
                orbit::ink_2(cx),
                cx,
            ));
        }
        body
    }

    fn access_choices(&self, cx: &mut Context<Self>) -> Div {
        div()
            .w_full()
            .flex()
            .flex_col()
            .items_center()
            .gap(px(24.0))
            .child(
                div()
                    .w_full()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(self.access_button("access-google", "CONTINUAR CON GOOGLE", true, cx))
                    .child(self.access_button(
                        "access-discord",
                        "CONTINUAR CON DISCORD",
                        false,
                        cx,
                    )),
            )
            .child(
                div()
                    .w_full()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(div().flex_1().h(px(1.0)).bg(rgba(orbit::line(cx))))
                    .child(orbit::text("o", 10.0, 400, orbit::ink_3(cx), cx))
                    .child(div().flex_1().h(px(1.0)).bg(rgba(orbit::line(cx)))),
            )
            .child(self.access_button("access-email", "INICIAR SESIÓN CON EMAIL", false, cx))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(8.0))
                    .child(Self::portal_link(
                        "access-signup",
                        "¿No tienes cuenta? Crear cuenta",
                        Portal::SignUp,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(Self::portal_link(
                        "access-reset",
                        "¿Olvidaste tu contraseña?",
                        Portal::Reset,
                        orbit::ink_3(cx),
                        cx,
                    )),
            )
            .child(orbit::text(
                "Discord y Google continúan en el navegador de Clerk.",
                10.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account_reply(signed_in: bool, pending: bool, error: Option<String>) -> Reply {
        Reply::Account {
            session: if pending {
                vantare_ipc::services_protocol::Session::Pending
            } else if signed_in {
                vantare_ipc::services_protocol::Session::SignedIn
            } else {
                vantare_ipc::services_protocol::Session::SignedOut
            },
            copy_link: false,
            profile: None,
            signed_in,
            pending,
            expires_at: signed_in.then_some(10),
            message: String::new(),
            error,
        }
    }

    #[test]
    fn isa1548_unrelated_ipc_error_during_login_does_not_consume_renewal() {
        // app::tests verifies that an unconfigured non-account request returns
        // Error while the OAuth listener survives and its next callback signs in.
        let mut state = State::from_build();
        state.requested(&Command::AccountBegin);
        for (sequence, reply) in [
            Reply::Error {
                message: "servicio no configurado".into(),
            },
            account_reply(false, true, None),
            account_reply(true, false, None),
        ]
        .into_iter()
        .enumerate()
        {
            let response = vantare_ipc::services_protocol::Response {
                version: vantare_ipc::services_protocol::VERSION,
                sequence: u64::try_from(sequence + 1).expect("sequence"),
                reply,
            };
            let mut wire = Vec::new();
            vantare_ipc::services_protocol::write(&mut wire, &response).expect("IPC write");
            let decoded: vantare_ipc::services_protocol::Response =
                vantare_ipc::services_protocol::read(&mut wire.as_slice()).expect("IPC read");
            state.observe(&decoded.reply, sequence != 0);
            let next = state.next_command(&decoded.reply, &mut None);
            match sequence {
                0 => assert!(next.is_none()),
                1 => assert!(matches!(next, Some(Command::AccountPoll))),
                _ => assert!(next.is_none(), "supervisor owns license renewal"),
            }
            assert!(!state.navigation(1000).verified);
        }
        assert!(
            state
                .next_command(&account_reply(true, false, None), &mut None)
                .is_none()
        );
    }

    #[test]
    fn login_and_restore_consume_core_policy_without_duplicate_license_requests() {
        let mut state = State::from_build();
        let restored = account_reply(true, false, None);
        state.observe(&restored, true);
        for _ in 0..3 {
            assert!(state.next_command(&restored, &mut None).is_none());
        }
        state.requested(&Command::AccountBegin);
        let pending = account_reply(false, true, None);
        for _ in 0..3 {
            state.observe(&pending, true);
            assert!(matches!(
                state.next_command(&pending, &mut None),
                Some(Command::AccountPoll)
            ));
        }
        state.observe(&restored, true);
        assert!(state.next_command(&restored, &mut None).is_none());
        assert!(state.next_command(&restored, &mut None).is_none());
        assert!(
            !state.navigation(1000).verified,
            "OAuth success alone cannot unlock modules"
        );
        let rights = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state: vantare_ipc::control::AccessState::Active,
                engineer: true,
                ..vantare_ipc::control::Policy::default()
            },
            message: String::new(),
        };
        let failed = Reply::Error {
            message: "fixture offline".into(),
        };
        state.observe(&failed, false);
        assert!(state.next_command(&failed, &mut None).is_none());
        let Reply::License { policy, .. } = rights else {
            unreachable!()
        };
        state.observe_core_policy(policy);
        assert!(state.navigation(1000).verified);
        assert!(
            !state.navigation(3000).verified,
            "the core feed TTL still expires"
        );
    }

    #[test]
    fn failed_renewal_accepts_the_next_fresh_core_policy_and_exposes_the_error() {
        for reply in [
            Reply::Error {
                message: vantare_services::Error::Clock.to_string(),
            },
            Reply::DeviceLimit {
                message: "device limit".into(),
            },
        ] {
            let mut state = State::from_build();
            state.requested(&Command::AccountBegin);
            let account = account_reply(true, false, None);
            state.observe(&account, true);
            assert!(state.next_command(&account, &mut None).is_none());
            assert!(state.renewal_acknowledged(&reply).is_none());
            assert!(state.error.is_some());
            assert!(
                !state.navigation(1000).verified,
                "an error cannot grant access"
            );
            state.observe_core_policy(vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state: vantare_ipc::control::AccessState::Active,
                ..vantare_ipc::control::Policy::default()
            });
            assert!(
                state.navigation(1000).verified,
                "fresh core policy is no longer ignored after failure"
            );
            assert!(
                !state.navigation(4000).verified,
                "expired policy remains denied"
            );
            assert!(
                state.next_command(&account, &mut None).is_none(),
                "failure does not loop license HTTP"
            );
        }
    }

    #[test]
    fn failed_login_or_logout_during_callback_never_renews_or_accepts_late_rights() {
        let mut state = State::from_build();
        state.configured = true; // Esta prueba representa un build con OAuth.
        state.requested(&Command::AccountBegin);
        let failed = account_reply(false, false, Some("denied fixture".into()));
        state.observe(&failed, true);
        assert!(state.next_command(&failed, &mut None).is_none());
        state.requested(&Command::AccountBegin);
        state.requested(&Command::Logout);
        let completed = account_reply(true, false, None);
        state.observe(&completed, true);
        assert!(state.required());
        let mut cancel = Some(Command::Logout);
        assert!(matches!(
            state.next_command(&completed, &mut cancel),
            Some(Command::Logout)
        ));
        assert!(cancel.is_none());
        let late = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state: vantare_ipc::control::AccessState::Active,
                engineer: true,
                ..vantare_ipc::control::Policy::default()
            },
            message: String::new(),
        };
        state.observe(&late, false);
        assert!(state.policy.is_none());
        let closed = account_reply(false, false, None);
        state.observe(&closed, true);
        assert!(state.next_command(&closed, &mut None).is_none());
        state.observe(&late, false);
        assert!(
            state.policy.is_none(),
            "no license response can undo logout"
        );
        assert!(!state.navigation(1000).verified);
    }

    #[test]
    fn renewal_reloads_oauth_expiry_without_another_license_request() {
        let mut state = State::from_build();
        let expired = Reply::Account {
            session: vantare_ipc::services_protocol::Session::SignedIn,
            copy_link: false,
            profile: None,
            signed_in: true,
            pending: false,
            expires_at: Some(1),
            message: String::new(),
            error: None,
        };
        state.observe(&expired, true);
        let rights = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 2000,
                state: vantare_ipc::control::AccessState::Active,
                engineer: true,
                ..vantare_ipc::control::Policy::default()
            },
            message: String::new(),
        };
        assert!(matches!(
            state.renewal_acknowledged(&rights),
            Some(Command::AccountPoll)
        ));
        state.observe(&rights, false);
        // Un access token OAuth caducado no bloquea: decide la política del núcleo.
        assert!(state.navigation(2000).verified);
        let refreshed = account_reply(true, false, None);
        state.observe(&refreshed, true);
        assert!(state.next_command(&refreshed, &mut None).is_none());
        state.observe(&rights, false); // Heartbeat de la política ya confirmada.
        assert!(state.navigation(2000).verified);
    }

    #[test]
    fn cancel_before_first_reply_or_completed_callback_always_cancels_only_the_attempt() {
        for pending in [false, true] {
            let mut cancel = Some(Command::AccountCancel);
            assert!(matches!(
                follow_up(pending, &mut cancel, false),
                Some(Command::AccountCancel)
            ));
            assert!(cancel.is_none());
        }
        assert!(follow_up(false, &mut None, false).is_none());
        assert!(matches!(
            follow_up(false, &mut None, true),
            Some(Command::AccountPoll)
        ));
        assert!(matches!(
            follow_up(true, &mut None, false),
            Some(Command::AccountPoll)
        ));
    }

    #[test]
    fn startup_requires_configured_services_and_no_confirmed_session() {
        for configured in [false, true] {
            for signed_in in [false, true] {
                let state = State {
                    configured,
                    session_checked: true,
                    login_requested: false,
                    error: None,
                    manual: ManualLink::default(),
                    policy: None,
                    session: if signed_in {
                        Session::SignedIn
                    } else {
                        Session::SignedOut
                    },
                    transition: Transition::Idle,
                };
                assert_eq!(state.required(), configured && !signed_in);
            }
        }
    }

    #[test]
    fn restore_login_logout_and_errors_preserve_the_access_gate() {
        let mut state = State {
            configured: true,
            session_checked: false,
            login_requested: false,
            error: None,
            manual: ManualLink::default(),
            policy: None,
            session: Session::SignedOut,
            transition: Transition::Idle,
        };
        assert!(state.required());
        for signed_in in [true, false] {
            let reply = Reply::Account {
                session: if signed_in {
                    vantare_ipc::services_protocol::Session::SignedIn
                } else {
                    vantare_ipc::services_protocol::Session::SignedOut
                },
                copy_link: false,
                profile: None,
                signed_in,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            };
            state.observe(&reply, true);
            assert_eq!(state.required(), !signed_in);
        }
        // No se entra al Hub entre un callback tardío y el ACK de Cancelar.
        state.login_requested = true;
        assert!(state.required());
        state.observe(
            &Reply::Error {
                message: "sin red".into(),
            },
            true,
        );
        assert!(state.required());
        assert!(state.error.is_some());
        state.observe(
            &Reply::Status {
                account_configured: false,
                message: String::new(),
            },
            true,
        );
        assert!(!state.required());
    }

    #[test]
    fn account_error_keeps_polling_only_while_the_attempt_exists() {
        let mut state = State {
            configured: true,
            session_checked: false,
            login_requested: true,
            error: None,
            manual: ManualLink::default(),
            policy: None,
            session: Session::SignedOut,
            transition: Transition::Idle,
        };
        let mut cancel = None;
        for pending in [true, false] {
            let reply = Reply::Account {
                session: if pending {
                    vantare_ipc::services_protocol::Session::Pending
                } else {
                    vantare_ipc::services_protocol::Session::SignedOut
                },
                copy_link: false,
                profile: None,
                signed_in: false,
                expires_at: None,
                pending,
                message: "error de prueba".into(),
                error: Some("error de prueba".into()),
            };
            state.observe(&reply, true);
            assert_eq!(state.login_requested, pending);
            assert!(state.error.is_some());
            assert!(state.required());
            assert_eq!(
                matches!(
                    follow_up(pending, &mut cancel, false),
                    Some(Command::AccountPoll)
                ),
                pending
            );
        }
    }

    #[test]
    fn hosted_links_use_only_the_public_https_origin() {
        for issuer in [
            None,
            Some("http://example.com"),
            Some("https://user:password@example.com"),
            Some("https://example.com?key=x"),
            Some("https://example.com/path"),
        ] {
            assert!(portal_url(issuer, None, Portal::SignUp).is_none());
        }
        let issuer = Some("https://enabled-lionfish-1336.clerk.accounts.dev/");
        assert_eq!(
            portal_url(issuer, None, Portal::SignUp).as_deref(),
            Some("https://enabled-lionfish-1336.accounts.dev/sign-up")
        );
        assert_eq!(
            portal_url(issuer, None, Portal::Reset).as_deref(),
            Some("https://enabled-lionfish-1336.accounts.dev/sign-in?__clerk_reset_password=true")
        );
    }

    #[test]
    fn production_hosted_links_use_the_explicit_account_portal() {
        let issuer = Some("https://clerk.vantare.app");
        let portal = Some("https://accounts.vantare.app/");
        assert_eq!(
            portal_url(issuer, portal, Portal::Profile).as_deref(),
            Some("https://accounts.vantare.app/user")
        );
        assert_eq!(
            portal_url(issuer, portal, Portal::SignUp).as_deref(),
            Some("https://accounts.vantare.app/sign-up")
        );
        assert_eq!(
            portal_url(issuer, portal, Portal::Reset).as_deref(),
            Some("https://accounts.vantare.app/sign-in?__clerk_reset_password=true")
        );
        assert!(portal_url(issuer, None, Portal::SignUp).is_none());
        assert!(portal_url(issuer, Some("http://accounts.vantare.app"), Portal::Reset).is_none());
    }
}

#[cfg(test)]
mod navigation_tests {
    use super::*;
    use crate::{Section, shell::navigation::Access};
    use vantare_ipc::control::Policy;

    #[test]
    fn manual_clock_boundary_message_is_preserved_without_granting_navigation() {
        let mut state = state(true, true);
        let message = "Frontera guardada: 2030-01-01T00:00:00Z; espera y comprueba la fecha.";
        let reply = Reply::License {
            policy: Policy {
                state: vantare_ipc::control::AccessState::ClockBehind { until_ms: 9000 },
                ..valid()
            },
            message: message.into(),
        };
        assert!(state.renewal_acknowledged(&reply).is_none());
        assert_eq!(state.error.as_deref(), Some(message));
        state.observe_core_policy(match reply {
            Reply::License { policy, .. } => policy,
            _ => unreachable!(),
        });
        assert!(!state.navigation(1000).verified);
    }

    #[test]
    fn confirmed_session_keeps_account_recovery_when_policy_is_denied() {
        let fresh = valid();
        let mut revoked = fresh.clone();
        revoked.state = vantare_ipc::control::AccessState::Revoked;
        let mut expired = fresh.clone();
        expired.signed_until_ms = Some(1500);
        for (policy, now, reason) in [
            (revoked, 1500, "Acceso bloqueado"),
            (expired, 1500, "Política caducada"),
            (fresh.clone(), 3000, "Política caducada"),
            (Policy::default(), 1500, "Sin política vigente"),
        ] {
            let mut session = state(true, true);
            session.configured = true;
            session.observe_core_policy(policy);
            let access = session.navigation(now);
            assert!(
                !session.required(),
                "la sesión confirmada no se convierte en login"
            );
            assert!(!access.verified);
            assert_eq!(session.policy_denial(now), Some(reason));
            for origin in [Section::Account, Section::Studio] {
                let mut current = origin;
                assert_eq!(access.beta_lock(Section::Account), None, "composición");
                access
                    .beta_navigate(&mut current, Section::Account)
                    .expect("recuperación por navegación");
                assert_eq!(current, Section::Account);
                let item = crate::shell::navigation::beta_commands(access, "Cuenta")
                    .into_iter()
                    .find(|item| {
                        item.command
                            == crate::shell::navigation::Command::Navigate(Section::Account)
                    })
                    .expect("recuperación por teclado");
                assert_eq!(item.locked, None);
                for protected in [
                    Section::Studio,
                    Section::Launcher,
                    Section::Settings,
                    Section::Roadmap,
                    Section::Testing,
                    Section::Calendar,
                ] {
                    assert!(access.beta_lock(protected).is_some());
                    assert!(access.beta_navigate(&mut current, protected).is_err());
                    assert_eq!(current, Section::Account);
                }
            }
            session.observe_core_policy(fresh.clone());
            assert!(session.navigation(1500).verified);
            session.requested(&Command::Logout);
            session.observe_core_policy(fresh.clone());
            assert!(session.required(), "logout vuelve al gate");
            assert!(!session.navigation(1500).verified);
        }
        let mut no_session = State::from_build();
        no_session.configured = true;
        no_session.observe(
            &Reply::Error {
                message: "OAuth falló".into(),
            },
            true,
        );
        no_session.observe_core_policy(fresh);
        assert!(no_session.required());
        assert!(!no_session.navigation(1500).verified);
    }

    #[test]
    fn needs_sign_in_preserves_core_navigation_without_granting_or_extending_rights() {
        use crate::Section;
        let mut state = state(true, true);
        state.configured = true;
        let mut reply = Reply::Account {
            session: Session::SignedOut,
            signed_in: false,
            pending: false,
            expires_at: None,
            profile: None,
            copy_link: false,
            message: String::new(),
            error: Some("login requerido".into()),
        };
        if let Reply::Account { session, .. } = &mut reply {
            *session = Session::NeedsSignIn;
        }
        state.observe(&reply, true);
        assert!(!state.required());
        let access = state.navigation(1500);
        assert!(access.verified);
        for section in [
            Section::Studio,
            Section::Workshop,
            Section::Launcher,
            Section::Settings,
        ] {
            assert_eq!(access.lock(section), None, "{section:?}");
        }
        assert!(
            !state.navigation(3000).verified,
            "policy TTL remains unchanged"
        );
        state.observe_core_policy(Policy {
            state: vantare_ipc::control::AccessState::Revoked,
            ..valid()
        });
        assert!(state.navigation(1500).blocked);
        state.observe_core_policy(Policy {
            state: vantare_ipc::control::AccessState::NoCredential,
            ..valid()
        });
        assert!(!state.navigation(1500).verified);
        state.requested(&Command::Logout);
        assert!(state.required());
        assert!(!state.navigation(1500).verified);
    }

    fn valid() -> Policy {
        Policy {
            version: vantare_ipc::control::VERSION,
            revision: 1,
            checked_at_ms: 1000,
            state: vantare_ipc::control::AccessState::Active,
            engineer: true,
            ..Policy::default()
        }
    }

    fn state(overlays: bool, engineer: bool) -> State {
        let mut state = State::from_build();
        state.observe(
            &Reply::Account {
                session: vantare_ipc::services_protocol::Session::SignedIn,
                copy_link: false,
                profile: None,
                signed_in: true,
                pending: false,
                expires_at: Some(10),
                message: String::new(),
                error: None,
            },
            true,
        );
        state.observe(
            &Reply::License {
                policy: Policy {
                    version: vantare_ipc::control::VERSION,
                    revision: 1,
                    checked_at_ms: 1000,
                    signed_until_ms: Some(9000),
                    state: if overlays {
                        vantare_ipc::control::AccessState::Active
                    } else {
                        vantare_ipc::control::AccessState::NoCredential
                    },
                    engineer,
                    ..Policy::default()
                },
                message: String::new(),
            },
            false,
        );
        state
    }
    #[test]
    fn transient_ipc_errors_preserve_only_the_last_current_access() {
        for account in [false, true] {
            let mut state = state(true, true);
            let before = state.navigation(1500);
            state.observe(
                &Reply::Error {
                    message: "IPC temporal".into(),
                },
                account,
            );
            assert_eq!(state.navigation(1500), before);
            assert!(state.session_known());
            assert!(!state.navigation(3000).verified, "no extiende el heartbeat");
            state.policy.as_mut().expect("policy").signed_until_ms = Some(1600);
            assert!(
                !state.navigation(1600).verified,
                "no extiende la credencial"
            );
        }
        let mut initial = State::from_build();
        initial.observe(
            &Reply::Error {
                message: "offline".into(),
            },
            true,
        );
        assert!(!initial.navigation(1500).verified);
    }

    #[test]
    fn pending_poll_preserves_access_but_definitive_logout_and_device_limit_drop_it() {
        let mut state = state(true, true);
        state.observe(
            &Reply::Account {
                session: vantare_ipc::services_protocol::Session::Pending,
                copy_link: false,
                profile: None,
                signed_in: false,
                pending: true,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(state.navigation(1500).verified);
        assert!(!state.login_requested);
        state.observe(
            &Reply::Account {
                session: vantare_ipc::services_protocol::Session::SignedOut,
                copy_link: false,
                profile: None,
                signed_in: false,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(!state.navigation(1500).verified);
        let mut state = self::state(true, true);
        state.observe(
            &Reply::DeviceLimit {
                message: "límite".into(),
            },
            false,
        );
        assert!(
            state.navigation(1500).verified,
            "an issuance limit cannot revoke the current signed core policy"
        );
    }

    #[test]
    fn policy_module_flags_project_independently() {
        for flags in [
            [false; 4],
            [true, false, false, false],
            [false, true, false, false],
            [false, false, true, false],
            [false, false, false, true],
            [true; 4],
        ] {
            let mut state = state(true, false);
            state.policy = Some(Policy {
                engineer: flags[0],
                strategy: flags[1],
                analysis: flags[2],
                calendar: flags[3],
                ..valid()
            });
            let access = state.navigation(1000);
            assert_eq!(
                [
                    access.engineer,
                    access.strategy,
                    access.analysis,
                    access.calendar
                ],
                flags
            );
            assert!(access.verified);
        }
    }
    #[test]
    fn empty_valid_credential_policy_opens_all_beta_tools_and_keeps_modules_separate() {
        let access = state(true, false).navigation(1000);
        assert!(access.verified);
        for section in [
            Section::Studio,
            Section::Workshop,
            Section::Launcher,
            Section::Settings,
            Section::Account,
            Section::Testing,
        ] {
            assert!(access.lock(section).is_none(), "{section:?}");
        }
        assert_eq!(access.lock(Section::Engineer), Some("Próximamente"));
        assert_eq!(access.lock(Section::Strategy), Some("Próximamente"));
        assert!(!access.visible(Section::Analysis));
        assert!(!access.visible(Section::Calendar));
    }
    #[test]
    fn logout_missing_session_and_expiry_block_but_transport_errors_keep_current_access() {
        let mut state = state(true, true);
        assert!(state.navigation(2999).verified);
        for time in [999, 3000, 10000] {
            assert!(!state.navigation(time).verified);
        }
        state.observe(
            &Reply::Error {
                message: "IPC desconectado".into(),
            },
            false,
        );
        assert!(state.navigation(1000).verified);
        assert!(!state.navigation(3000).verified);
        state = self::state(true, true);
        state.requested(&Command::Logout); // Antes del ACK.
        assert!(!state.navigation(1000).verified);
        state = self::state(true, true);
        state.observe(
            &Reply::Account {
                session: vantare_ipc::services_protocol::Session::SignedIn,
                copy_link: false,
                profile: None,
                signed_in: true,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(
            state.navigation(1000).verified,
            "Session does not depend on token expiry"
        );
        state = self::state(true, true);
        state.observe(
            &Reply::Account {
                session: vantare_ipc::services_protocol::Session::SignedOut,
                copy_link: false,
                profile: None,
                signed_in: false,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(!state.navigation(1000).verified);
    }
    #[test]
    fn oauth_expiry_keeps_fresh_policy_but_closed_reply_revokes_it() {
        let mut state = state(true, true);
        state.observe(
            &Reply::Account {
                session: vantare_ipc::services_protocol::Session::SignedIn,
                copy_link: false,
                profile: None,
                signed_in: true,
                pending: false,
                expires_at: Some(2),
                message: String::new(),
                error: None,
            },
            true,
        );
        state.observe(
            &Reply::License {
                policy: valid(),
                message: String::new(),
            },
            false,
        );
        assert!(state.navigation(1999).verified);
        // Regresión: el candado volvía al caducar el access token OAuth (renovable).
        assert!(state.navigation(2000).verified);
        state.observe(&Reply::Closed, false);
        assert!(!state.navigation(1000).verified);
    }

    #[test]
    fn rereading_the_same_session_keeps_the_policy_but_logout_drops_it() {
        let mut state = state(true, true);
        assert!(state.navigation(1000).verified);
        // Regresión: cada AccountPoll retiraba la política y el candado
        // aparecía al repintar (p. ej. al pasar el ratón por una pestaña).
        state.observe(
            &Reply::Account {
                session: vantare_ipc::services_protocol::Session::SignedIn,
                copy_link: false,
                profile: None,
                signed_in: true,
                pending: false,
                expires_at: Some(10),
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(state.navigation(1000).verified);
        state.observe(
            &Reply::Account {
                session: vantare_ipc::services_protocol::Session::SignedOut,
                copy_link: false,
                profile: None,
                signed_in: false,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(!state.navigation(1000).verified);
    }

    #[test]
    fn malformed_or_revoked_policy_cannot_turn_into_a_free_plan() {
        for policy in [
            Policy {
                version: vantare_ipc::control::VERSION + 1,
                ..valid()
            },
            Policy {
                revision: 0,
                ..valid()
            },
            Policy {
                signed_until_ms: Some(1000),
                ..valid()
            },
            Policy {
                state: vantare_ipc::control::AccessState::Revoked,
                ..valid()
            },
            Policy::default(),
        ] {
            let mut state = state(true, true);
            state.observe(
                &Reply::License {
                    policy,
                    message: String::new(),
                },
                false,
            );
            assert!(!state.navigation(1000).verified);
        }
        assert_eq!(state(false, false).navigation(1000), Access::default());
    }
}

#[cfg(test)]
mod native_email_tests {
    use super::super::super::protocol::{EmailAction, EmailMode, EmailStage};
    use super::*;

    #[test]
    fn pending_device_grant_polls_and_cancel_has_priority_over_a_retry() {
        let mut state = State::from_build();
        state.requested(&Command::AccountEmail {
            action: EmailAction::Finish {},
        });
        let pending = Reply::Email {
            stage: EmailStage::Authorizing,
            retry_after_seconds: 0,
            message: "esperando".into(),
            error: None,
        };
        assert!(matches!(
            state.next_command(&pending, &mut None),
            Some(Command::AccountPoll)
        ));
        let mut cancel = Some(Command::AccountCancel);
        assert!(matches!(
            state.next_command(&pending, &mut cancel),
            Some(Command::AccountCancel)
        ));
        assert!(cancel.is_none());
        let exhausted = Reply::Email {
            stage: EmailStage::Consent,
            retry_after_seconds: 0,
            message: "reintentar".into(),
            error: Some("pendiente".into()),
        };
        assert!(state.next_command(&exhausted, &mut None).is_none());
    }
    #[test]
    fn email_waits_for_consent_and_oauth_before_license_renewal() {
        let mut state = State::from_build();
        state.requested(&Command::AccountEmail {
            action: EmailAction::Begin {
                mode: EmailMode::SignInCode,
                email: "fixture@example.invalid".into(),
                password: String::new(),
            },
        });
        let reply = Reply::Email {
            stage: EmailStage::Code,
            retry_after_seconds: 30,
            message: "fixture".into(),
            error: None,
        };
        state.observe(&reply, true);
        assert!(!state.login_requested);
        assert!(
            state.next_command(&reply, &mut None).is_none(),
            "native input never starts automatic polling/renewal"
        );
        let reply = Reply::Email {
            stage: EmailStage::Consent,
            retry_after_seconds: 0,
            message: "fixture".into(),
            error: None,
        };
        assert!(state.next_command(&reply, &mut None).is_none());
        state.requested(&Command::AccountEmail {
            action: EmailAction::Finish {},
        });
        let reply = Reply::Account {
            session: vantare_ipc::services_protocol::Session::SignedIn,
            copy_link: false,
            signed_in: true,
            profile: None,
            expires_at: Some(500),
            pending: false,
            message: "fixture".into(),
            error: None,
        };
        assert!(
            state.next_command(&reply, &mut None).is_none(),
            "the supervisor renews after native login too"
        );
        state.requested(&Command::AccountEmail {
            action: EmailAction::Cancel {},
        });
        assert_eq!(state.transition as u8, Transition::Idle as u8);
    }
}
