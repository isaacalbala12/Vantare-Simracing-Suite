//! Acceso alojado: el estado viene del mismo servicio que la sección Cuenta.
use super::{Command, Remote, Reply};
use crate::orbit;
use gpui::{Context, Div, Stateful, div, prelude::*, px, rgb, rgba};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Transition {
    Idle,
    Login,
    Renewal,
    Logout,
}

pub(super) struct State {
    configured: bool,
    session_checked: bool,
    pub(super) login_requested: bool,
    error: Option<String>,
    policy: Option<vantare_ipc::control::Policy>,
    expires_at: Option<u64>,
    transition: Transition,
}

pub(super) fn follow_up(pending: bool, cancel: &mut bool, check_session: bool) -> Option<Command> {
    if std::mem::take(cancel) {
        Some(Command::Logout)
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
            policy: None,
            expires_at: None,
            transition: Transition::Idle,
        }
    }

    pub(super) fn requested(&mut self, command: &Command) {
        if matches!(command, Command::Logout | Command::AccountBegin) {
            self.invalidate();
            self.transition = if matches!(command, Command::AccountBegin) {
                Transition::Login
            } else {
                Transition::Logout
            };
            self.login_requested = true;
        }
    }

    pub(super) fn renewal_acknowledged(&mut self, reply: &Reply) -> Option<Command> {
        if self.transition != Transition::Logout
            && matches!(reply, Reply::License { policy, .. }
                if policy.error.is_none() && policy.version == vantare_ipc::control::VERSION && policy.revision > 0)
        {
            self.transition = Transition::Idle;
            // LicenseRenew puede haber rotado OAuth en servicios. Releer su
            // caducidad mediante IPC; AccountPoll no hace refresh ni renovación.
            return Some(Command::AccountPoll);
        }
        None
    }

    pub(super) fn next_command(&mut self, reply: &Reply, cancel: &mut bool) -> Option<Command> {
        let pending = matches!(reply, Reply::Account { pending: true, .. });
        let check_session = matches!(
            reply,
            Reply::Status {
                account_configured: true,
                ..
            }
        );
        if let Some(command) = follow_up(pending, cancel, check_session) {
            self.requested(&command);
            return Some(command);
        }
        if let Reply::Account {
            signed_in,
            pending: false,
            error,
            ..
        } = reply
            && self.transition == Transition::Login
        {
            self.transition = Transition::Renewal;
            if *signed_in && error.is_none() {
                return Some(Command::LicenseRenew);
            }
        }
        None
    }

    fn invalidate(&mut self) {
        self.policy = None;
        self.expires_at = None;
    }

    /// Sesión iniciada y confirmada por servicios. La caducidad del access
    /// token OAuth no cierra sesión (servicios lo renueva con refresh) y los
    /// derechos los decide la política fresca del núcleo, no ese token.
    pub(super) fn session_known(&self) -> bool {
        self.expires_at.is_some()
    }

    pub(super) fn observe_core_policy(&mut self, policy: vantare_ipc::control::Policy) {
        if self.transition == Transition::Idle && !self.login_requested && self.session_known() {
            self.policy = Some(policy);
        }
    }

    pub(super) fn navigation(
        &self,
        signed_in: bool,
        now_ms: u64,
    ) -> crate::shell::navigation::Access {
        use crate::shell::navigation::Access;
        if !signed_in || self.login_requested || !self.session_known() {
            return Access::default();
        }
        let Some(policy) = &self.policy else {
            return Access::default();
        };
        Access::from_policy(policy, now_ms)
    }

    fn required(&self, signed_in: bool) -> bool {
        self.configured
            && (!self.session_checked
                || !signed_in
                || self.login_requested
                || self.transition == Transition::Logout)
    }

    pub(super) fn observe(&mut self, reply: &Reply, account: bool) {
        // Un error de transporte no revoca la última política. navigation sigue
        // aplicando su caducidad; el resultado definitivo sí retira el acceso.
        if matches!(reply, Reply::DeviceLimit { .. } | Reply::Closed) {
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
                pending,
                error,
                signed_in,
                expires_at,
                ..
            } => {
                // Un callback tardío no revierte una solicitud explícita de logout.
                if self.transition == Transition::Logout && *signed_in {
                    self.error = error
                        .as_ref()
                        .map(|message| format!("No se pudo cerrar la sesión: {message}"));
                    self.login_requested = error.is_none();
                    return;
                }
                if self.transition == Transition::Logout {
                    self.transition = Transition::Renewal;
                }
                // Un sondeo pendiente no sustituye una sesión ya confirmada.
                if *pending && self.session_known() && self.transition == Transition::Idle {
                    return;
                }
                // Releer una sesión que sigue igual no retira la política vigente:
                // hacerlo dejaba el candado visible hasta la siguiente lectura.
                if !*signed_in || *pending || self.expires_at.is_none() {
                    self.invalidate();
                }
                self.expires_at = if *signed_in && !pending {
                    *expires_at
                } else {
                    None
                };
                self.session_checked = true;
                self.login_requested = *pending;
                self.error = error
                    .as_ref()
                    .map(|message| format!("No se pudo completar el acceso: {message}"));
            }
            Reply::License { policy, .. }
                if self.transition == Transition::Idle
                    && !self.login_requested
                    && self.expires_at.is_some() =>
            {
                self.policy = Some(policy.clone());
            }
            Reply::Closed => self.invalidate(),
            Reply::Error { message } if account => {
                self.login_requested = false;
                if self.transition == Transition::Login {
                    self.transition = Transition::Renewal;
                }
                self.error = Some(format!("No se pudo completar el acceso: {message}"));
            }
            Reply::Error { .. } if self.transition == Transition::Login => {
                self.transition = Transition::Renewal;
            }
            _ => {}
        }
    }
}

#[derive(Clone, Copy)]
enum Portal {
    SignUp,
    Reset,
}

fn portal_url(issuer: Option<&str>, portal: Option<&str>, page: Portal) -> Option<String> {
    let mut url = vantare_services::config::account_portal_origin(issuer, portal)?;
    url.set_path(match page {
        Portal::SignUp => "/sign-up",
        Portal::Reset => "/sign-in",
    });
    if matches!(page, Portal::Reset) {
        url.set_query(Some("__clerk_reset_password=true"));
    }
    Some(url.into())
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
                .and_then(|policy| policy.error.as_deref())
        });
        (pending, error)
    }
    pub(crate) fn retry_home_access(&mut self, cx: &mut Context<Self>) {
        self.access.error = None;
        self.request(
            if self.account.signed_in {
                Command::LicenseStatus
            } else {
                Command::Status
            },
            cx,
        );
    }
    pub fn requires_access(&self) -> bool {
        self.access.required(self.account.signed_in)
    }

    fn begin_access(&mut self, cx: &mut Context<Self>) {
        if self.working() {
            return;
        }
        self.access.error = None;
        self.access.login_requested = true;
        self.account.cancel_login = false;
        // OAuth IdP de Clerk no documenta selección de proveedor en authorize:
        // Google, Discord y email usan la misma página alojada con PKCE.
        self.request(Command::AccountBegin, cx);
        self.access.login_requested = self.busy();
    }

    fn retry_access(&mut self, cx: &mut Context<Self>) {
        if self.access.session_checked {
            self.begin_access(cx);
        } else {
            self.access.error = None;
            self.request(Command::Status, cx);
        }
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
            .when(self.working(), |button| {
                button
                    .opacity(orbit::DISABLED)
                    .tab_stop(false)
                    .aria_description("Esperando respuesta")
            })
            .on_click(cx.listener(|this, _, _, cx| this.begin_access(cx)))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    this.begin_access(cx);
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
            .on_click(cx.listener(move |this, _, _, cx| this.open_portal(page, cx)))
            .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    this.open_portal(page, cx);
                    cx.stop_propagation();
                }
            }))
    }

    pub fn access_screen(
        &self,
        focus: &gpui::FocusHandle,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let waiting =
            (self.access.login_requested || self.account.pending) && self.access.error.is_none();
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
                        orbit::text("Welcome to Vantare", 20.0, 600, orbit::ink(cx), cx)
                            .mt(px(8.0)),
                    )
                    .child(orbit::text(
                        "Sign in or create an account",
                        14.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    )),
            );
        if waiting || checking {
            body = body.child(orbit::text(
                if waiting {
                    "Continúa en tu navegador…"
                } else {
                    "Comprobando sesión…"
                },
                14.0,
                400,
                orbit::ink_2(cx),
                cx,
            ));
            if waiting {
                body = body.child(
                    orbit::button(
                        "access-cancel",
                        if self.account.cancel_login {
                            "Cancelando…"
                        } else {
                            "Cancelar"
                        },
                        cx,
                    )
                    .on_click(cx.listener(|this, _, _, cx| this.request(Command::Logout, cx)))
                    .on_key_down(cx.listener(
                        |this, event: &gpui::KeyDownEvent, _, cx| {
                            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                this.request(Command::Logout, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
                );
            }
        } else {
            body = body.child(self.access_choices(cx));
        }
        if let Some(error) = &self.access.error {
            body = body.child(orbit::callout(error.clone(), cx)).child(
                orbit::button("access-retry", "Reintentar", cx)
                    .on_click(cx.listener(|this, _, _, cx| this.retry_access(cx)))
                    .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            this.retry_access(cx);
                            cx.stop_propagation();
                        }
                    })),
            );
        }
        body = body.child(
            orbit::text("made by Vantare", 10.0, 600, orbit::ink_muted(cx), cx).mt(px(24.0)),
        );
        div()
            .id("hub-access")
            .track_focus(focus)
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
                "Google es el acceso recomendado para la beta pública.",
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
            signed_in,
            pending,
            expires_at: signed_in.then_some(10),
            message: String::new(),
            error,
        }
    }

    #[test]
    fn one_explicit_login_renews_once_but_restore_and_poll_never_renew() {
        let mut state = State::from_build();
        let restored = account_reply(true, false, None);
        state.observe(&restored, true);
        for _ in 0..3 {
            assert!(state.next_command(&restored, &mut false).is_none());
        }
        state.requested(&Command::AccountBegin);
        let pending = account_reply(false, true, None);
        for _ in 0..3 {
            state.observe(&pending, true);
            assert!(matches!(
                state.next_command(&pending, &mut false),
                Some(Command::AccountPoll)
            ));
        }
        state.observe(&restored, true);
        assert!(matches!(
            state.next_command(&restored, &mut false),
            Some(Command::LicenseRenew)
        ));
        assert!(state.next_command(&restored, &mut false).is_none());
        assert!(
            !state.navigation(true, 1000).verified,
            "OAuth success alone cannot unlock modules"
        );
        let rights = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                overlays_advanced: true,
                engineer: true,
                ..vantare_ipc::control::Policy::default()
            },
            message: String::new(),
        };
        let failed = Reply::Error {
            message: "fixture offline".into(),
        };
        state.observe(&failed, false);
        assert!(state.next_command(&failed, &mut false).is_none());
        state.observe(&rights, false); // Un heartbeat previo no es el ACK de renovar.
        assert!(state.policy.is_none());
        assert!(matches!(
            state.renewal_acknowledged(&rights),
            Some(Command::AccountPoll)
        ));
        state.observe(&rights, false);
        assert!(state.navigation(true, 1000).verified);
    }

    #[test]
    fn failed_login_or_logout_during_callback_never_renews_or_accepts_late_rights() {
        let mut state = State::from_build();
        state.configured = true; // Esta prueba representa un build con OAuth.
        state.requested(&Command::AccountBegin);
        let failed = account_reply(false, false, Some("denied fixture".into()));
        state.observe(&failed, true);
        assert!(state.next_command(&failed, &mut false).is_none());
        state.requested(&Command::AccountBegin);
        state.requested(&Command::Logout);
        let completed = account_reply(true, false, None);
        state.observe(&completed, true);
        assert!(state.required(true));
        let mut cancel = true;
        assert!(matches!(
            state.next_command(&completed, &mut cancel),
            Some(Command::Logout)
        ));
        assert!(!cancel);
        let late = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                overlays_advanced: true,
                engineer: true,
                ..vantare_ipc::control::Policy::default()
            },
            message: String::new(),
        };
        state.observe(&late, false);
        assert!(state.policy.is_none());
        let closed = account_reply(false, false, None);
        state.observe(&closed, true);
        assert!(state.next_command(&closed, &mut false).is_none());
        state.observe(&late, false);
        assert!(
            state.policy.is_none(),
            "no license response can undo logout"
        );
        assert!(!state.navigation(true, 1000).verified);
    }

    #[test]
    fn renewal_reloads_oauth_expiry_without_another_license_request() {
        let mut state = State::from_build();
        let expired = Reply::Account {
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
                overlays_advanced: true,
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
        assert!(state.navigation(true, 2000).verified);
        let refreshed = account_reply(true, false, None);
        state.observe(&refreshed, true);
        assert!(state.next_command(&refreshed, &mut false).is_none());
        state.observe(&rights, false); // Heartbeat de la política ya confirmada.
        assert!(state.navigation(true, 2000).verified);
    }

    #[test]
    fn cancel_before_first_reply_or_completed_callback_always_sends_logout() {
        for pending in [false, true] {
            let mut cancel = true;
            assert!(matches!(
                follow_up(pending, &mut cancel, false),
                Some(Command::Logout)
            ));
            assert!(!cancel);
        }
        assert!(follow_up(false, &mut false, false).is_none());
        assert!(matches!(
            follow_up(false, &mut false, true),
            Some(Command::AccountPoll)
        ));
        assert!(matches!(
            follow_up(true, &mut false, false),
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
                    policy: None,
                    expires_at: None,
                    transition: Transition::Idle,
                };
                assert_eq!(state.required(signed_in), configured && !signed_in);
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
            policy: None,
            expires_at: None,
            transition: Transition::Idle,
        };
        assert!(state.required(false));
        for signed_in in [true, false] {
            let reply = Reply::Account {
                signed_in,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            };
            state.observe(&reply, true);
            assert_eq!(state.required(signed_in), !signed_in);
        }
        // No se entra al Hub entre un callback tardío y el ACK de Cancelar.
        state.login_requested = true;
        assert!(state.required(true));
        state.observe(
            &Reply::Error {
                message: "sin red".into(),
            },
            true,
        );
        assert!(state.required(false));
        assert!(state.error.is_some());
        state.observe(
            &Reply::Status {
                account_configured: false,
                message: String::new(),
            },
            true,
        );
        assert!(!state.required(false));
    }

    #[test]
    fn account_error_keeps_polling_only_while_the_attempt_exists() {
        let mut state = State {
            configured: true,
            session_checked: false,
            login_requested: true,
            error: None,
            policy: None,
            expires_at: None,
            transition: Transition::Idle,
        };
        let mut cancel = false;
        for pending in [true, false] {
            let reply = Reply::Account {
                signed_in: false,
                expires_at: None,
                pending,
                message: "error de prueba".into(),
                error: Some("error de prueba".into()),
            };
            state.observe(&reply, true);
            assert_eq!(state.login_requested, pending);
            assert!(state.error.is_some());
            assert!(state.required(false));
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

    fn valid() -> Policy {
        Policy {
            version: vantare_ipc::control::VERSION,
            revision: 1,
            checked_at_ms: 1000,
            overlays_advanced: true,
            engineer: true,
            ..Policy::default()
        }
    }

    fn state(overlays: bool, engineer: bool) -> State {
        let mut state = State::from_build();
        state.observe(
            &Reply::Account {
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
                    valid_until_ms: Some(9000),
                    overlays_advanced: overlays,
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
            let before = state.navigation(true, 1500);
            state.observe(
                &Reply::Error {
                    message: "IPC temporal".into(),
                },
                account,
            );
            assert_eq!(state.navigation(true, 1500), before);
            assert!(state.session_known());
            assert!(
                !state.navigation(true, 3000).verified,
                "no extiende el heartbeat"
            );
            state.policy.as_mut().expect("policy").valid_until_ms = Some(1600);
            assert!(
                !state.navigation(true, 1600).verified,
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
        assert!(!initial.navigation(true, 1500).verified);
    }

    #[test]
    fn pending_poll_preserves_access_but_definitive_logout_and_device_limit_drop_it() {
        let mut state = state(true, true);
        state.observe(
            &Reply::Account {
                signed_in: false,
                pending: true,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(state.navigation(state.session_known(), 1500).verified);
        assert!(!state.login_requested);
        state.observe(
            &Reply::Account {
                signed_in: false,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(!state.navigation(true, 1500).verified);
        let mut state = self::state(true, true);
        state.observe(
            &Reply::DeviceLimit {
                message: "límite".into(),
            },
            false,
        );
        assert!(!state.navigation(true, 1500).verified);
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
            let access = state.navigation(true, 1000);
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
        let access = state(true, false).navigation(true, 1000);
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
        assert!(state.navigation(true, 2999).verified);
        for (signed_in, time) in [(false, 1000), (true, 999), (true, 3000), (true, 10000)] {
            assert!(!state.navigation(signed_in, time).verified);
        }
        state.observe(
            &Reply::Error {
                message: "IPC desconectado".into(),
            },
            false,
        );
        assert!(state.navigation(true, 1000).verified);
        assert!(!state.navigation(true, 3000).verified);
        state = self::state(true, true);
        state.requested(&Command::Logout); // Antes del ACK.
        assert!(!state.navigation(true, 1000).verified);
        state = self::state(true, true);
        state.observe(
            &Reply::Account {
                signed_in: true,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(!state.navigation(true, 1000).verified);
        state = self::state(true, true);
        state.observe(
            &Reply::Account {
                signed_in: false,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(!state.navigation(true, 1000).verified);
    }
    #[test]
    fn oauth_expiry_keeps_fresh_policy_but_closed_reply_revokes_it() {
        let mut state = state(true, true);
        state.observe(
            &Reply::Account {
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
        assert!(state.navigation(true, 1999).verified);
        // Regresión: el candado volvía al caducar el access token OAuth (renovable).
        assert!(state.navigation(true, 2000).verified);
        assert!(!state.navigation(false, 2000).verified);
        state.observe(&Reply::Closed, false);
        assert!(!state.navigation(true, 1000).verified);
    }

    #[test]
    fn rereading_the_same_session_keeps_the_policy_but_logout_drops_it() {
        let mut state = state(true, true);
        assert!(state.navigation(true, 1000).verified);
        // Regresión: cada AccountPoll retiraba la política y el candado
        // aparecía al repintar (p. ej. al pasar el ratón por una pestaña).
        state.observe(
            &Reply::Account {
                signed_in: true,
                pending: false,
                expires_at: Some(10),
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(state.navigation(true, 1000).verified);
        state.observe(
            &Reply::Account {
                signed_in: false,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            },
            true,
        );
        assert!(!state.navigation(true, 1000).verified);
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
                valid_until_ms: Some(1000),
                ..valid()
            },
            Policy {
                error: Some("revocada".into()),
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
            assert!(!state.navigation(true, 1000).verified);
        }
        assert_eq!(
            state(false, false).navigation(true, 1000),
            Access::default()
        );
    }
}
