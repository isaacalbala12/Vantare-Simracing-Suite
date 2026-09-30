//! Acceso alojado: el estado viene del mismo servicio que la sección Cuenta.
use super::{Command, Remote, Reply};
use crate::orbit;
use gpui::{Context, Div, Stateful, div, prelude::*, px, rgb, rgba};

pub(super) struct State {
    configured: bool,
    session_checked: bool,
    pub(super) login_requested: bool,
    error: Option<String>,
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
        }
    }

    fn required(&self, signed_in: bool) -> bool {
        self.configured && (!self.session_checked || !signed_in || self.login_requested)
    }

    pub(super) fn observe(&mut self, reply: &Reply, account: bool) {
        match reply {
            Reply::Status {
                account_configured, ..
            } => {
                self.configured = *account_configured;
                self.error = None;
            }
            Reply::Account { pending, .. } => {
                self.session_checked = true;
                self.login_requested = *pending;
                self.error = None;
            }
            Reply::Error { message } if account => {
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
        if self.busy {
            return;
        }
        self.access.error = None;
        self.access.login_requested = true;
        self.account.cancel_login = false;
        // OAuth IdP de Clerk no documenta selección de proveedor en authorize:
        // Google, Discord y email usan la misma página alojada con PKCE.
        self.request(Command::AccountBegin, cx);
        self.access.login_requested = self.busy;
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
            orbit::carmine_button(id, label)
        } else {
            orbit::button(id, label)
        };
        button
            .w_full()
            .h(px(44.0))
            .rounded(px(8.0))
            .when(self.busy, |button| {
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
            .focus_visible(|style| style.border_1().border_color(rgb(orbit::CARMINE)))
            .child(orbit::text(label, 12.0, 400, color))
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
                    .child(orbit::icon("i-vantare", 48.0, orbit::CARMINE))
                    .child(orbit::text("Welcome to Vantare", 20.0, 600, orbit::INK).mt(px(8.0)))
                    .child(orbit::text(
                        "Sign in or create an account",
                        14.0,
                        400,
                        orbit::INK_2,
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
                orbit::INK_2,
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
            body = body.child(orbit::callout(error.clone())).child(
                orbit::button("access-retry", "Reintentar")
                    .on_click(cx.listener(|this, _, _, cx| this.retry_access(cx)))
                    .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            this.retry_access(cx);
                            cx.stop_propagation();
                        }
                    })),
            );
        }
        body = body.child(orbit::text("made by Vantare", 10.0, 600, orbit::INK_MUTED).mt(px(24.0)));
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
            .bg(rgb(orbit::CANVAS))
            .text_color(rgb(orbit::INK))
            .font_family("Inter W400")
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
                    .child(div().flex_1().h(px(1.0)).bg(rgba(orbit::LINE)))
                    .child(orbit::text("o", 10.0, 400, orbit::INK_3))
                    .child(div().flex_1().h(px(1.0)).bg(rgba(orbit::LINE))),
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
                        orbit::INK_2,
                        cx,
                    ))
                    .child(Self::portal_link(
                        "access-reset",
                        "¿Olvidaste tu contraseña?",
                        Portal::Reset,
                        orbit::INK_3,
                        cx,
                    )),
            )
            .child(orbit::text(
                "Google es el acceso recomendado para la beta pública.",
                10.0,
                400,
                orbit::INK_3,
            ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        };
        assert!(state.required(false));
        for signed_in in [true, false] {
            let reply = Reply::Account {
                signed_in,
                pending: false,
                expires_at: None,
                message: String::new(),
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
