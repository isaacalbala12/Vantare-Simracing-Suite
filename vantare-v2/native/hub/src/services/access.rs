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
                if policy.error.is_none() && policy.version == 1 && policy.revision > 0)
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

    pub(super) fn navigation(
        &self,
        signed_in: bool,
        now_ms: u64,
    ) -> crate::shell::navigation::Access {
        use crate::shell::navigation::{Access, Plan};
        if !signed_in || self.login_requested || !self.session_known() {
            return Access::default();
        }
        let Some(policy) = &self.policy else {
            return Access::default();
        };
        if policy.error.is_some() {
            return Access {
                blocked: true,
                ..Access::default()
            };
        }
        if !policy.current_at(now_ms) {
            return Access::default();
        }
        // Combinaciones para la matriz UI; nunca se deduce Free de derechos ausentes.
        Access {
            plan: match (policy.overlays_advanced, policy.engineer) {
                (true, true) => Plan::Suite,
                (true, false) => Plan::Overlays,
                (false, true) => Plan::Engineer,
                (false, false) => Plan::Unknown,
            },
            ..Access::default()
        }
    }

    fn required(&self, signed_in: bool) -> bool {
        self.configured
            && (!self.session_checked
                || !signed_in
                || self.login_requested
                || self.transition == Transition::Logout)
    }

    pub(super) fn observe(&mut self, reply: &Reply, account: bool) {
        if matches!(reply, Reply::Error { .. } | Reply::Closed) {
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
                self.invalidate();
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
                self.expires_at = None;
                self.login_requested = false;
                self.error = Some(format!("No se pudo completar el acceso: {message}"));
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

fn portal_url(issuer: Option<&str>, page: Portal) -> Option<String> {
    let base = issuer?.trim_end_matches('/');
    // La URL es pública de build, pero nunca se abre un esquema arbitrario ni
    // una autoridad con credenciales. Solo un origen HTTPS de nombre DNS.
    let host = base.strip_prefix("https://")?;
    if host.is_empty()
        || !host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
    {
        return None;
    }
    // En desarrollo FAPI y Account Portal tienen dominios distintos.
    // Verificado contra display_config de la instancia; un dominio productivo
    // requiere su URL explícita de portal, no una ruta inventada en el issuer.
    let instance = host.strip_suffix(".clerk.accounts.dev")?;
    if instance.is_empty() || instance.contains('.') {
        return None;
    }
    Some(format!(
        "https://{instance}.accounts.dev{}",
        match page {
            Portal::SignUp => "/sign-up",
            // Intent del SignIn alojado; no requiere identificar al usuario aquí.
            Portal::Reset => "/sign-in?__clerk_reset_password=true",
        }
    ))
}

impl Remote {
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
        if let Some(url) = portal_url(option_env!("VANTARE_CLERK_ISSUER"), page) {
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
        assert_eq!(
            state.navigation(true, 1000).plan,
            crate::shell::navigation::Plan::Unknown,
            "OAuth success alone cannot unlock modules"
        );
        let rights = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: 1,
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
        assert_eq!(
            state.navigation(true, 1000).plan,
            crate::shell::navigation::Plan::Suite
        );
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
                version: 1,
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
        assert_eq!(
            state.navigation(true, 1000).plan,
            crate::shell::navigation::Plan::Unknown
        );
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
                version: 1,
                revision: 1,
                checked_at_ms: 2000,
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
        assert_eq!(
            state.navigation(true, 2000).plan,
            crate::shell::navigation::Plan::Engineer
        );
        let refreshed = account_reply(true, false, None);
        state.observe(&refreshed, true);
        assert!(state.next_command(&refreshed, &mut false).is_none());
        state.observe(&rights, false); // Heartbeat de la política ya confirmada.
        assert_eq!(
            state.navigation(true, 2000).plan,
            crate::shell::navigation::Plan::Engineer
        );
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
            assert!(portal_url(issuer, Portal::SignUp).is_none());
        }
        let issuer = Some("https://enabled-lionfish-1336.clerk.accounts.dev/");
        assert_eq!(
            portal_url(issuer, Portal::SignUp).as_deref(),
            Some("https://enabled-lionfish-1336.accounts.dev/sign-up")
        );
        assert_eq!(
            portal_url(issuer, Portal::Reset).as_deref(),
            Some("https://enabled-lionfish-1336.accounts.dev/sign-in?__clerk_reset_password=true")
        );
    }
}

#[cfg(test)]
mod navigation_tests {
    use super::*;
    use crate::{
        Section,
        shell::navigation::{Access, Command as NavigationCommand, Plan, commands},
    };
    use vantare_ipc::control::Policy;

    fn valid() -> Policy {
        Policy {
            version: 1,
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
                    version: 1,
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
    fn observed_capabilities_reach_navigation_palette_and_content_locks() {
        for (overlays, engineer, plan) in [
            (true, false, Plan::Overlays),
            (false, true, Plan::Engineer),
            (true, true, Plan::Suite),
            (false, false, Plan::Unknown),
        ] {
            let access = state(overlays, engineer).navigation(true, 1000);
            assert_eq!(access.plan, plan);
            for (section, allowed) in [
                (Section::Studio, overlays),
                (Section::Strategy, overlays || engineer),
                (Section::Analysis, overlays || engineer),
                (Section::Engineer, engineer),
            ] {
                assert_eq!(access.lock(section).is_none(), allowed);
                let mut current = Section::Home;
                assert_eq!(access.navigate(&mut current, section).is_ok(), allowed);
                assert_eq!(current, if allowed { section } else { Section::Home });
                let item = commands(access, "")
                    .into_iter()
                    .find(|item| item.command == NavigationCommand::Navigate(section))
                    .expect("destino");
                assert_eq!(item.locked.is_none(), allowed);
            }
        }
    }
    #[test]
    fn logout_error_missing_session_and_expiry_never_grant_navigation() {
        let mut state = state(true, true);
        assert_eq!(state.navigation(true, 2999).plan, Plan::Suite);
        for (signed_in, time) in [(false, 1000), (true, 999), (true, 3000), (true, 10000)] {
            assert_eq!(state.navigation(signed_in, time).plan, Plan::Unknown);
        }
        state.observe(
            &Reply::Error {
                message: "IPC desconectado".into(),
            },
            false,
        );
        assert_eq!(state.navigation(true, 1000).plan, Plan::Unknown);
        state = self::state(true, true);
        state.requested(&Command::Logout); // Antes del ACK.
        assert_eq!(state.navigation(true, 1000).plan, Plan::Unknown);
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
        assert_eq!(state.navigation(true, 1000).plan, Plan::Unknown);
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
        assert_eq!(state.navigation(true, 1000).plan, Plan::Unknown);
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
        assert_eq!(state.navigation(true, 1999).plan, Plan::Suite);
        // Regresión: el candado volvía al caducar el access token OAuth (renovable).
        assert_eq!(state.navigation(true, 2000).plan, Plan::Suite);
        assert_eq!(state.navigation(false, 2000).plan, Plan::Unknown);
        state.observe(&Reply::Closed, false);
        assert_eq!(state.navigation(true, 1000).plan, Plan::Unknown);
    }

    #[test]
    fn malformed_or_revoked_policy_cannot_turn_into_a_free_plan() {
        for policy in [
            Policy {
                version: 2,
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
            assert_eq!(state.navigation(true, 1000).plan, Plan::Unknown);
        }
        assert_eq!(
            state(false, false).navigation(true, 1000),
            Access::default()
        );
    }
}
