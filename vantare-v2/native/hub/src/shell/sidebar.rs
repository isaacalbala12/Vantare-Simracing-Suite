//! Barra expansible. Los permisos proceden de la política verificada del núcleo.
use super::{Hub, navigation};
use crate::{Section, orbit};
use gpui::{Context, Div, div, prelude::*, px, rgb, rgba};
impl Hub {
    pub(super) fn sidebar_width(&self, cx: &gpui::App) -> f32 {
        let geometry = &cx.global::<orbit::design::Tokens>().geometry;
        if self.shell.sidebar_open {
            geometry.sidebar
        } else {
            geometry.sidebar_collapsed
        }
    }
    #[allow(clippy::too_many_lines)] // Composición de la barra; reutiliza los controles y permisos del shell.
    pub(super) fn redesign_rail(&self, cx: &mut Context<Self>) -> Div {
        let expanded = self.shell.sidebar_open;
        let mut items = div()
            .id("rail-sections")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .track_scroll(&self.shell.rail_scroll)
            .flex()
            .flex_col()
            .gap(px(4.0));
        for (index, &section) in self.shell.rail_sections.iter().enumerate() {
            if !self.shell.access.beta_visible(section) {
                continue;
            }
            if matches!(section, Section::Testing | Section::Strategy) {
                items = items.child(
                    div()
                        .mt(px(20.0))
                        .mb(px(8.0))
                        .px(px(10.0))
                        .when(expanded, |heading| {
                            heading
                                .flex()
                                .items_center()
                                .justify_between()
                                .child(orbit::text(
                                    if section == Section::Testing {
                                        "Para testers"
                                    } else {
                                        "Módulos"
                                    },
                                    12.0,
                                    400,
                                    orbit::ink_muted(cx),
                                    cx,
                                ))
                                .when(
                                    section == Section::Testing && self.shell.access.tester,
                                    |heading| {
                                        heading.child(orbit::chip(
                                            "Tester",
                                            orbit::Tone::Accent,
                                            cx,
                                        ))
                                    },
                                )
                        })
                        .when(!expanded, |heading| {
                            heading.border_t_1().border_color(rgba(orbit::line(cx)))
                        }),
                );
            }
            let label = navigation::title(section);
            let lock = self.shell.access.beta_lock(section);
            let button = orbit::rail_button(
                navigation::title(section),
                navigation::icon(section),
                label,
                self.section == section,
                if expanded { None } else { lock },
                cx,
            )
            .h(px(40.0))
            .flex_none()
            .w(px(if expanded {
                self.sidebar_width(cx) - 24.0
            } else {
                48.0
            }))
            .rounded(px(8.0))
            .when(self.section == section, |button| {
                button
                    .bg(orbit::gradient(
                        cx.global::<orbit::design::Tokens>().gradients.active,
                        180.0,
                    ))
                    .border_color(rgba(orbit::line(cx)))
            })
            .when(expanded, |button| {
                button
                    .justify_start()
                    .px(px(12.0))
                    .gap(px(12.0))
                    .child(orbit::text(label, 14.0, 500, orbit::ink_2(cx), cx).flex_1())
                    .when(section == Section::Launcher, |button| {
                        button.child(orbit::text(
                            self.launcher.read(cx).saved_profiles().len().to_string(),
                            12.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        ))
                    })
                    .when_some(lock, |button, reason| {
                        button.child(
                            div()
                                .flex_none()
                                .flex()
                                .items_center()
                                .gap(px(4.0))
                                .px(px(6.0))
                                .py(px(3.0))
                                .rounded_full()
                                .bg(rgb(orbit::surface_2(cx)))
                                .child(orbit::icon("v-lock", 11.0, orbit::ink_muted(cx)))
                                .child(orbit::text(reason, 10.0, 400, orbit::ink_muted(cx), cx)),
                        )
                    })
            })
            .track_focus(&self.shell.rail_focus[index])
            .on_click(cx.listener(move |hub, _, _, cx| hub.navigate(section, cx)));
            items = items.child(button);
        }
        let profiles = self.launcher.read(cx).saved_profiles();
        if expanded {
            items = items.child(
                div()
                    .mt(px(20.0))
                    .px(px(10.0))
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(orbit::text("Perfiles", 12.0, 400, orbit::ink_muted(cx), cx))
                    .child(orbit::text(
                        profiles.len().to_string(),
                        12.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            );
            for profile in profiles {
                let id = profile.id.clone();
                let subtitle = format!("{} pasos de lanzamiento", profile.steps.len());
                items = items.child(
                    orbit::action_row(gpui::SharedString::from(id.clone()), &profile.name, cx)
                        .w_full()
                        .h(px(54.0))
                        .flex_none()
                        .child(div().size(px(6.0)).flex_none().rounded_full().bg(rgb(
                            if profile.favorite {
                                orbit::coral(cx)
                            } else {
                                orbit::ink_muted(cx)
                            },
                        )))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .child(orbit::text(
                                    profile.name.clone(),
                                    14.0,
                                    500,
                                    orbit::ink_2(cx),
                                    cx,
                                ))
                                .child(orbit::text(subtitle, 12.0, 400, orbit::ink_3(cx), cx)),
                        )
                        .on_click(cx.listener(move |hub, _, _, cx| hub.launch_profile(&id, cx))),
                );
            }
        }
        let favorite = self.launcher.read(cx).default_profile_id();
        let launching = self.launcher.read(cx).launch_progress();
        let launch_name = favorite
            .as_ref()
            .and_then(|id| profiles.iter().find(|profile| profile.id == *id))
            .map_or_else(
                || "Crear perfil".to_owned(),
                |profile| format!("Lanzar {}", profile.name),
            );
        let launch_name = launching.map_or(launch_name, |(ready, total)| {
            format!("Lanzando… {ready} de {total}")
        });
        let launch = orbit::action_row("sidebar-launch", "", cx)
            .relative()
            .h(px(44.0))
            .w_full()
            .flex_none()
            .justify_start()
            .gap(px(8.0))
            .rounded(px(12.0))
            .px(px(10.0))
            .bg(orbit::gradient(
                [orbit::surface_3(cx), orbit::surface_2(cx)],
                180.0,
            ))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .child(orbit::play_circle(26.0, cx))
            .when(expanded, |button| {
                button
                    .child(
                        orbit::text(launch_name.clone(), 13.0, 600, orbit::ink(cx), cx)
                            .flex_1()
                            .min_w_0()
                            .text_ellipsis(),
                    )
                    .child(orbit::keycap("Ctrl L", cx))
            })
            .aria_label(launch_name.clone())
            .aria_keyshortcuts("Control+L")
            .tab_stop(launching.is_none())
            .when(launching.is_some(), |button| {
                orbit::disabled(button, "Lanzamiento en curso")
            })
            .on_click(cx.listener(|hub, _, _, cx| hub.launch_favorite(cx)));
        let collapse = orbit::action_row("sidebar-collapse", "Contraer barra", cx)
            .w_full()
            .flex_none()
            .aria_expanded(expanded)
            .aria_keyshortcuts("Control+B")
            .child(orbit::icon("v-side", 18.0, orbit::ink_3(cx)))
            .when(expanded, |row| {
                row.child(orbit::text("Contraer barra", 14.0, 400, orbit::ink_2(cx), cx).flex_1())
                    .child(orbit::keycap("Ctrl B", cx))
            })
            .on_click(cx.listener(|hub, _, _, cx| {
                hub.shell.sidebar_open = !hub.shell.sidebar_open;
                cx.notify();
            }));
        let settings = orbit::action_row("sidebar-settings", "Ajustes", cx)
            .w_full()
            .aria_selected(self.section == Section::Settings)
            .when(self.section == Section::Settings, |row| {
                row.bg(orbit::gradient(
                    cx.global::<orbit::design::Tokens>().gradients.active,
                    180.0,
                ))
                .border_color(rgba(orbit::line(cx)))
            })
            .child(orbit::icon("v-sliders", 18.0, orbit::ink_3(cx)))
            .when(expanded, |row| {
                row.child(orbit::text("Ajustes", 14.0, 400, orbit::ink_2(cx), cx))
            })
            .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Settings, cx)));
        let initial = self.avatar_initial();
        let account_name = self
            .demo
            .as_ref()
            .map_or("Cuenta", |demo| demo.user.full_name.as_str());
        let account = orbit::action_row("sidebar-account", account_name, cx)
            .w_full()
            .aria_selected(matches!(self.section, Section::Account | Section::Licenses))
            .when(
                matches!(self.section, Section::Account | Section::Licenses),
                |row| {
                    row.bg(orbit::gradient(
                        cx.global::<orbit::design::Tokens>().gradients.active,
                        180.0,
                    ))
                    .border_color(rgba(orbit::line(cx)))
                },
            )
            .h(px(54.0))
            .px(px(8.0))
            .child(
                orbit::avatar(false, &initial, cx)
                    .rounded_full()
                    .flex_none()
                    .role(gpui::Role::GenericContainer)
                    .tab_stop(false),
            )
            .when(expanded, |row| {
                row.child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(2.0))
                        .child(orbit::text(account_name, 14.0, 600, orbit::ink(cx), cx))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .child(
                                    orbit::text("BETA", 10.0, 600, orbit::ink(cx), cx)
                                        .px(px(4.0))
                                        .rounded(px(3.0))
                                        .bg(rgb(orbit::carmine(cx))),
                                )
                                .child(orbit::text(
                                    if self.shell.access.tester {
                                        "Acceso de tester"
                                    } else {
                                        "Acceso gratuito"
                                    },
                                    11.0,
                                    400,
                                    orbit::ink_3(cx),
                                    cx,
                                )),
                        ),
                )
            })
            .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Account, cx)));
        div()
            .w(px(self.sidebar_width(cx)))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .p(px(12.0))
            .gap(px(12.0))
            .bg(rgb(orbit::rail_bg(cx)))
            .border_r_1()
            .border_color(rgba(orbit::line(cx)))
            .child(
                div()
                    .h(px(40.0))
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(orbit::icon("mark", 26.0, orbit::carmine(cx)))
                    .when(expanded, |brand| {
                        brand
                            .child(
                                orbit::text("VANTARE", 23.0, 600, orbit::ink(cx), cx).font_family(
                                    cx.global::<orbit::design::Tokens>().fonts.display.clone(),
                                ),
                            )
                            .child(orbit::chip("BETA", orbit::Tone::Neutral, cx))
                    }),
            )
            .child(launch)
            .child(orbit::scroll_fade(items, orbit::rail_bg(cx)))
            .child(collapse)
            .child(settings)
            .child(account)
    }
}
