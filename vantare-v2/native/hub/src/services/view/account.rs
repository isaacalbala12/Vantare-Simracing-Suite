//! Pantalla de cuenta del Hub: identidad, plan, sesión, dispositivos y novedades.
use super::{Access, Command, Context, Remote, access, orbit, text};
use crate::Section;
use gpui::{div, linear_color_stop, linear_gradient, prelude::*, px, rgb, rgba};

// Solo presentación del banco: no modifica credenciales, permisos ni IPC.
pub(super) fn account_demo() -> Option<&'static crate::demo::DemoData> {
    #[cfg(feature = "parity-capture")]
    {
        static DEMO: std::sync::OnceLock<Option<crate::demo::DemoData>> =
            std::sync::OnceLock::new();
        DEMO.get_or_init(|| {
            let args: Vec<_> = std::env::args().collect();
            if args.iter().any(|arg| arg == "--capture") && args.iter().any(|arg| arg == "--demo") {
                crate::demo::DemoData::load().ok()
            } else {
                None
            }
        })
        .as_ref()
    }
    #[cfg(not(feature = "parity-capture"))]
    None
}

fn account_note(content: &str, cx: &gpui::App) -> gpui::Div {
    div()
        .px(px(17.0))
        .py(px(13.0))
        .rounded(px(14.0))
        .border_1()
        .border_color(rgba(crate::orbit::legacy_rgba(0xff9b_5721, cx)))
        .bg(linear_gradient(
            110.0,
            linear_color_stop(rgba(crate::orbit::legacy_rgba(0xff9b_570f, cx)), 0.0),
            linear_color_stop(rgba(crate::orbit::legacy_rgba(0xd52f_4905, cx)), 1.0),
        ))
        .child(text(content, 12.0, 400, orbit::ink_3(cx), cx).line_height(px(18.0)))
}

fn account_surface(_title: &str, meta: &str, body: gpui::Div, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .gap(px(8.0))
        .child(orbit::meta(meta, 10.0, orbit::ink_3(cx), cx))
        .child(body)
}

fn account_body() -> gpui::Div {
    div().flex().flex_col().gap(px(4.0))
}

fn account_value(label: &str, value: &str, active: bool, cx: &gpui::App) -> gpui::Div {
    div()
        .min_h(px(42.0))
        .flex()
        .items_center()
        .gap(px(10.0))
        .border_b_1()
        .border_color(rgba(orbit::line_row(cx)))
        .child(
            div()
                .w(px(112.0))
                .flex_none()
                .child(text(label, 12.5, 500, orbit::ink_3(cx), cx)),
        )
        .child(
            div()
                .flex()
                .flex_1()
                .min_w_0()
                .items_center()
                .gap(px(7.0))
                .when(label == "Estado", |value| {
                    value.child(if orbit::is_mono(cx) {
                        orbit::status_dot(
                            if active {
                                orbit::Tone::Success
                            } else {
                                orbit::Tone::Neutral
                            },
                            6.0,
                            cx,
                        )
                    } else {
                        div().size(px(6.0)).rounded_full().bg(rgb(if active {
                            orbit::green(cx)
                        } else {
                            orbit::ink_muted(cx)
                        }))
                    })
                })
                .child(
                    text(
                        value,
                        12.5,
                        400,
                        crate::orbit::legacy_rgb(0x00d9_d5d5, cx),
                        cx,
                    )
                    .line_height(px(15.0)),
                ),
        )
}

const ACCOUNT_MODULES: [(Section, &str); 6] = [
    (Section::Studio, "Editor de overlays"),
    (Section::Launcher, "Lanzador"),
    (Section::Calendar, "Carreras y recordatorios"),
    (Section::Strategy, "Estrategia"),
    (Section::Engineer, "Ingeniero"),
    (Section::Analysis, "Telemetría"),
];

pub(super) fn purchase_disabled_reason(signed_in: bool, working: bool) -> Option<&'static str> {
    if !signed_in {
        Some("Inicia sesión para comprar")
    } else if working {
        Some("Operación en curso")
    } else {
        None
    }
}

pub(super) fn account_plan_label(verified: bool) -> &'static str {
    if verified {
        "Acceso verificado"
    } else {
        "Acceso sin verificar"
    }
}

pub(super) fn account_module_access(access: Access, demo: bool) -> [bool; 6] {
    std::array::from_fn(|index| {
        !access.blocked
            && access.verified
            && access.lock(ACCOUNT_MODULES[index].0).is_none()
            // La captura congelada anuncia Telemetría como «próximamente».
            && !(demo && index == 5)
    })
}

pub(super) fn account_module_status(section: Section, included: bool) -> &'static str {
    if matches!(section, Section::Strategy | Section::Engineer) {
        "Próximamente"
    } else if included {
        "Incluido"
    } else {
        "Sin verificar"
    }
}

impl Remote {
    fn account_access(&self) -> Access {
        if account_demo().is_some() {
            // Fixture visual explícita; no alcanza la navegación ni el núcleo.
            Access {
                verified: true,
                calendar: true,
                strategy: true,
                ..Access::default()
            }
        } else {
            self.navigation_access()
        }
    }

    fn account_badges(&self, cx: &gpui::App) -> gpui::Div {
        let access = self.account_access();
        let verified = access.verified && !access.blocked;
        div().mt(px(8.0)).flex().child(orbit::pill(
            if verified {
                "Acceso verificado · activo"
            } else {
                self.account_access_label()
            },
            if verified {
                orbit::Tone::Success
            } else {
                orbit::Tone::Neutral
            },
            cx,
        ))
    }
    fn account_access_label(&self) -> &'static str {
        if self.account_access().verified
            && self.account_access().catalog == vantare_ipc::control::CatalogAccess::Founders
        {
            self.founders_language.copy().owned
        } else if account_demo().is_some() {
            account_plan_label(self.account_access().verified)
        } else {
            self.access
                .policy_denial(vantare_ipc::control::wall_ms().unwrap_or(u64::MAX))
                .unwrap_or_else(|| account_plan_label(self.account_access().verified))
        }
    }
    fn purchase_status(&self, cx: &mut Context<Self>) -> gpui::Div {
        div().when_some(self.purchase_message.as_ref(), |body, message| {
            body.child(account_note(message, cx))
                .when(self.purchase_wait.is_some(), |body| {
                    body.child(
                        orbit::small_button("purchase-stop-wait", "Dejar de comprobar", cx)
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.purchase_wait = None;
                                this.purchase_message = Some(
                                    "Espera detenida. Puedes comprobar el acceso manualmente."
                                        .into(),
                                );
                                cx.notify();
                            })),
                    )
                })
        })
    }
    fn profile_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        let signed_in = self.account.signed_in && account_demo().is_none();
        div().flex().gap(px(6.0)).when(signed_in, |body| {
            body.when_some(access::profile_portal(), |body, url| {
                body.child(
                    orbit::small_button("services-profile-edit", "Cambiar foto", cx)
                        .on_click(cx.listener(move |_, _, _, cx| cx.open_url(&url))),
                )
            })
            .child(
                orbit::small_button("services-profile-refresh", "Actualizar foto", cx)
                    .tab_stop(!self.working())
                    .when(self.working(), |button| {
                        orbit::disabled(button, "Operación en curso")
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.working() && this.account.signed_in {
                            this.request(Command::AccountProfileRefresh, cx);
                        }
                    })),
            )
        })
    }

    fn account_identity(&self, cx: &mut Context<Self>) -> gpui::Div {
        let demo = account_demo();
        let signed_in = self.account.signed_in;
        let identity_actions = self.account_identity_actions(cx);
        orbit::hero_surface(cx)
            .flex_row()
            .flex_1()
            .flex_basis(gpui::relative(1.3 / 2.3))
            .min_w_0()
            .min_h(px(if self.adapt.show_notes() {
                124.0
            } else {
                100.0
            }))
            .px(px(22.0))
            .py(px(16.0))
            .flex()
            .items_center()
            .gap(px(16.0))
            .child(if let Some(demo) = demo {
                div()
                    .size(px(64.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded_full()
                    .bg(linear_gradient(
                        160.0,
                        linear_color_stop(rgb(crate::orbit::legacy_rgb(0x002a_2a30, cx)), 0.0),
                        linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0017_171b, cx)), 1.0),
                    ))
                    .child(text(
                        orbit::initials(&demo.user.full_name),
                        26.0,
                        750,
                        orbit::ink(cx),
                        cx,
                    ))
            } else {
                self.profile_avatar(64.0, 32.0, cx)
            })
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(2.0))
                    .child(
                        orbit::display(
                            if let Some(demo) = demo {
                                &demo.user.full_name
                            } else if signed_in && !self.profile_name().is_empty() {
                                self.profile_name()
                            } else if signed_in {
                                "Cuenta conectada"
                            } else {
                                "Sin sesión"
                            },
                            if self.adapt.show_optional() {
                                32.0
                            } else {
                                26.0
                            },
                            orbit::ink(cx),
                            cx,
                        )
                        .line_height(px(if self.adapt.show_optional() {
                            36.0
                        } else {
                            30.0
                        })),
                    )
                    .child(text(
                        if demo.is_some() {
                            "Correo oculto por privacidad"
                        } else {
                            "Tu sesión de Vantare"
                        },
                        12.5,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(self.account_badges(cx))
                    .child(self.profile_actions(cx)),
            )
            .child(identity_actions)
    }
    fn account_modules(included: [bool; 6], compact: bool, cx: &gpui::App) -> gpui::Div {
        let mut modules = div().flex().flex_col().w_full().gap(px(4.0));
        for (index, (section, label)) in ACCOUNT_MODULES.into_iter().enumerate() {
            if section == Section::Analysis {
                continue;
            }
            let soon = matches!(section, Section::Strategy | Section::Engineer);
            let (icon, description) = match section {
                Section::Studio => ("v-studio", "Editor de diseños y widgets"),
                Section::Launcher => ("v-launch", "Perfiles y aplicaciones"),
                Section::Calendar => ("v-calendar", "Horario y recordatorios para testers"),
                Section::Strategy => ("v-strategy", "Plan de paradas y combustible"),
                _ => ("v-engineer", "Ingeniero de radio con voz"),
            };
            modules = modules.child(
                div()
                    .flex()
                    .flex_none()
                    .items_center()
                    .justify_between()
                    .gap(px(12.0))
                    .border_b_1()
                    .border_color(rgba(orbit::line_row(cx)))
                    .when(compact, |row| {
                        row.h(px(32.0)).child(
                            div()
                                .id(label)
                                .role(gpui::Role::Group)
                                .aria_label(label)
                                .flex()
                                .flex_1()
                                .items_center()
                                .gap(px(12.0))
                                .child(orbit::icon(icon, 18.0, orbit::ink_3(cx)))
                                .child(text(label, 13.0, 500, orbit::ink(cx), cx)),
                        )
                    })
                    .when(!compact, |row| {
                        row.child(
                            orbit::summary_row(label, description, icon, cx)
                                .border_0()
                                .flex_1(),
                        )
                    })
                    .child(orbit::pill(
                        account_module_status(section, included[index]),
                        if !soon && included[index] {
                            orbit::Tone::Success
                        } else {
                            orbit::Tone::Neutral
                        },
                        cx,
                    )),
            );
        }
        modules
    }
    fn account_plan(&self, cx: &gpui::App) -> gpui::Div {
        let access = self.account_access();
        let compact = self.adapt.density >= orbit::adapt::Density::B;
        orbit::neo_card(cx)
            .when(compact, |card| card.p(px(16.0)).gap(px(8.0)))
            .child(orbit::neo_header("Módulos", "v-studio", cx))
            .when(!compact, |card| card.child(text("Acceso gratuito durante la beta. Estrategia e Ingeniero estarán disponibles próximamente.", 13.0, 400, orbit::ink_2(cx), cx)))
            .child(Self::account_modules(account_module_access(access, account_demo().is_some()), compact, cx).id("account-modules-scroll")
                .when(compact, |list| list.flex_none().h_auto())
                .when(!compact, |list| list.flex_none().min_h_0())
                .overflow_y_scroll())
    }
    fn account_session(&self, cx: &gpui::App) -> gpui::Div {
        let demo = account_demo().is_some();
        let signed_in = self.account.signed_in;
        account_surface(
            "Estado de la cuenta",
            "Tu sesión",
            account_body()
                .child(account_value(
                    "Estado",
                    if demo {
                        "Activo"
                    } else if signed_in {
                        "Conectada"
                    } else {
                        "Sin sesión"
                    },
                    signed_in || demo,
                    cx,
                ))
                .child(account_value("Último acceso", "—", false, cx))
                .child(account_value(
                    "Durante la beta",
                    "Acceso gratuito para testers",
                    false,
                    cx,
                ))
                .child(account_value("Canal", crate::product::CHANNEL, false, cx).border_b_0()),
            cx,
        )
        .flex_1()
    }
    fn account_devices(&self, cx: &mut Context<Self>) -> gpui::Div {
        let demo = account_demo().is_some();
        let access = self.account_access();
        let verified = access.verified && !access.blocked;
        let device = div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .w_full()
            .px(px(12.0))
            .py(px(10.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(if verified { 0x78d6_8b33 } else { 0xffff_ff0d }))
            .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff04, cx)))
            .child(
                div()
                    .size(px(34.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(9.0))
                    .bg(rgb(orbit::surface_2(cx)))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .child(text("PC", 10.5, 700, orbit::ink_3(cx), cx)),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(3.0))
                    .child(text("Este dispositivo", 13.0, 650, orbit::ink(cx), cx))
                    .child(text(
                        if verified {
                            "Acceso verificado en este equipo"
                        } else {
                            "Acceso sin verificar"
                        },
                        11.5,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            )
            .child(div().size(px(6.0)).rounded_full().bg(rgb(if verified {
                orbit::green(cx)
            } else {
                orbit::ink_muted(cx)
            })));
        account_surface(
            "Dispositivos",
            "Este equipo",
            account_body()
                .items_start().gap(px(10.0))
                .child(device)
                .when(self.adapt.show_notes(), |body| body.child(account_note(
                    "Restablecer libera la activación de este equipo (una vez cada 24 h). La lista de otros dispositivos no está disponible aquí.", cx)))
                .child(
                    // Con el límite alcanzado, liberar el activo es la salida: se
                    // reutiliza el botón principal de Orbit, sin texto nuevo.
                    (if self.device_limit {
                        orbit::carmine_button("services-device-reset", "Restablecer dispositivo", cx)
                    } else {
                        orbit::small_button("services-device-reset", "Restablecer dispositivo", cx)
                    })
                    .tab_stop(!self.working() && !demo)
                    .when(self.working(), |button| button.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.working() && account_demo().is_none() {
                            this.request(Command::DeviceReset, cx);
                        }
                    })),
                ),
         cx)
        .flex_1()
    }
    pub fn account(&self, _window: &gpui::Window, cx: &mut Context<Self>) -> gpui::Div {
        let access = orbit::neo_card(cx).p(px(16.0)).flex_1().min_w_0()
            .child(text("Acceso beta", 16.0, 600, orbit::ink(cx), cx))
            .child(text("Acceso gratuito durante la beta para testers. La sesión valida tu acceso; no muestra ni copia claves privadas.", 13.0, 400, orbit::ink_2(cx), cx))
            .child(orbit::pill(self.account_access_label(), orbit::Tone::Neutral, cx).self_start())
            .child(self.founders_details(cx));
        let contribution = orbit::neo_card(cx)
            .p(px(16.0))
            .flex_1()
            .min_w_0()
            .child(text("Tu aporte a la beta", 16.0, 600, orbit::ink(cx), cx))
            .child(text(
                "Los informes y cuestionarios viven en Testing Center.",
                13.0,
                400,
                orbit::ink_2(cx),
                cx,
            ))
            .child(text(
                "Totales de tu cuenta · Próximamente",
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        div()
            .flex_1()
            .min_h_0()
            .w_full()
            .flex()
            .flex_col()
            .gap(px(self.adapt.gap()))
            .when(
                account_demo().is_none() && !self.message.is_empty(),
                |page| page.child(orbit::callout(self.message.clone(), cx)),
            )
            .child(self.account_identity(cx).flex_none().w_full())
            .child(self.purchase_status(cx))
            .child(
                div()
                    .flex()
                    .flex_none()
                    .gap(px(self.adapt.gap()))
                    .child(access)
                    .when(self.adapt.show_optional(), |row| row.child(contribution)),
            )
            .child(self.account_plan(cx).flex_none().min_h_0())
            .child(Self::account_news(cx))
    }

    fn account_news(cx: &gpui::App) -> gpui::Div {
        let mut list = div()
            .id("account-news")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll();
        match crate::shell::news_for_channel(crate::product::CHANNEL) {
            Ok(news) if news.is_empty() => {
                list = list.child(text(
                    "Sin notas publicadas para este canal",
                    13.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ));
            }
            Ok(news) => {
                for release in news {
                    list = list.child(orbit::summary_row(
                        release.title,
                        release.summary,
                        "v-download",
                        cx,
                    ));
                }
            }
            Err(error) => list = list.child(text(error, 13.0, 400, orbit::ink_3(cx), cx)),
        }
        orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .child(orbit::neo_header("Novedades de la beta", "v-download", cx))
            .child(list)
    }

    pub fn account_rail(&self, cx: &mut Context<Self>) -> Vec<orbit::RailSection> {
        vec![
            orbit::RailSection::new("Estado de la cuenta", "key", self.account_session(cx)),
            orbit::RailSection::new("Dispositivos", "v-monitor", self.account_devices(cx)),
            orbit::RailSection::new(
                "Avisos por email",
                "v-bell",
                text(
                    "Preferencias de email · Próximamente",
                    13.0,
                    400,
                    orbit::ink_2(cx),
                    cx,
                ),
            ),
            orbit::RailSection::new(
                "Tus datos",
                "v-shield",
                text(
                    "Perfiles y ajustes locales. Exportación y borrado de cuenta · Próximamente",
                    13.0,
                    400,
                    orbit::ink_2(cx),
                    cx,
                ),
            ),
        ]
    }

    pub fn licenses(&self, window: &gpui::Window, cx: &mut Context<Self>) -> gpui::Div {
        self.account(window, cx)
    }
}

#[cfg(test)]
mod tests {
    use super::super::purchase_tests::fixture;
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn founders_account_label_is_preserved_and_removed_when_logging_out() {
        gpui_platform::headless().run(|cx| {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                let now = vantare_ipc::control::wall_ms().expect("clock");
                remote.observe_core_policy(
                    vantare_ipc::control::Policy {
                        version: vantare_ipc::control::VERSION,
                        revision: 1,
                        checked_at_ms: now,
                        catalog: vantare_ipc::control::CatalogAccess::Founders,
                        overlays_advanced: true,
                        ..Default::default()
                    },
                    now,
                    cx,
                );
                assert_eq!(
                    remote.account_access_label(),
                    "Founders · todo para siempre"
                );
                remote.request(Command::Logout, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
                assert!(!remote.navigation_access().verified);
                assert_eq!(remote.account_access_label(), "Sin política vigente");
            });
            crate::quit_headless_test(cx);
        });
    }
}
