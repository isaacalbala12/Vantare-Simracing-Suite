//! Barra izquierda §2 + R10.8. Los permisos proceden de la política verificada del núcleo.
use super::{Hub, navigation};
use crate::{Section, orbit};
use gpui::{Context, Div, div, prelude::*, px, rgb};

/// Grupos de la barra: el de testers solo existe con rol tester u owner.
pub(super) fn groups(access: navigation::Access) -> Vec<(Option<&'static str>, Vec<Section>)> {
    let mut groups = vec![(
        None,
        vec![
            Section::Home,
            Section::Launcher,
            Section::Studio,
            Section::Roadmap,
        ],
    )];
    let testers: Vec<Section> = [Section::Testing, Section::Calendar]
        .into_iter()
        .filter(|section| access.beta_visible(*section))
        .collect();
    if !testers.is_empty() {
        groups.push((Some("Para testers"), testers));
    }
    groups.push((Some("Módulos"), vec![Section::Strategy, Section::Engineer]));
    groups
}

impl Hub {
    pub(super) fn toggle_sidebar(&mut self, cx: &mut Context<Self>) {
        self.shell.sidebar_pref = Some(!self.shell.adapt.sidebar_open);
        cx.notify();
    }

    fn group_heading(title: &str, tester: bool, cx: &gpui::App) -> Div {
        let skin = orbit::skin(cx);
        div()
            .flex_none()
            .pt(px(20.0))
            .pb(px(6.0))
            .px(px(10.0))
            .flex()
            .items_center()
            .justify_between()
            .child(orbit::caps(title, 11.0, skin.cap, cx))
            .when(tester, |heading| {
                heading.child(
                    div()
                        .px(px(6.0))
                        .rounded(px(skin.radius.xs))
                        .bg(orbit::alpha(skin.accent_tint))
                        .text_size(px(10.0))
                        .line_height(px(16.0))
                        .font_weight(gpui::FontWeight(600.0))
                        .text_color(rgb(skin.accent_bright))
                        .child("TESTER"),
                )
            })
    }

    fn separator(cx: &gpui::App) -> Div {
        div()
            .flex_none()
            .h(px(1.0))
            .mx(px(6.0))
            .my(px(12.0))
            .bg(orbit::alpha(orbit::skin(cx).line1))
    }

    fn nav_entry(
        &self,
        section: Section,
        expanded: bool,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let locked = matches!(section, Section::Strategy | Section::Engineer);
        let active = self.section == section;
        let skin = orbit::skin(cx).clone();
        // La barra usa los nombres de producto de los módulos (regla 8 de la espec).
        let label = match section {
            Section::Strategy => "Strategy",
            Section::Engineer => "Engineer",
            other => navigation::title(other),
        };
        let mut item = orbit::nav_item(
            navigation::title(section),
            navigation::icon(section),
            label,
            active,
            locked,
            expanded,
            cx,
        );
        if expanded {
            if locked {
                item = item.child(orbit::soon(cx));
            } else if section == Section::Launcher {
                let count = self.launcher.read(cx).saved_profiles().len();
                if count > 0 {
                    item = item.child(
                        div()
                            .text_size(px(12.0))
                            .text_color(rgb(skin.text3))
                            .child(count.to_string()),
                    );
                }
            }
        }
        if let Some(index) = self
            .shell
            .rail_sections
            .iter()
            .position(|candidate| *candidate == section)
        {
            item = item.track_focus(&self.shell.rail_focus[index]);
        }
        item.on_click(cx.listener(move |hub, _, _, cx| hub.navigate(section, cx)))
            .into_any_element()
    }

    fn sidebar_profiles(&self, cx: &mut Context<Self>) -> Div {
        let skin = orbit::skin(cx).clone();
        let launcher = self.launcher.read(cx);
        let profiles = launcher.saved_profiles().to_vec();
        let mut list = div()
            .id("rail-profiles")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .track_scroll(&self.shell.rail_scroll)
            .flex()
            .flex_col()
            .gap(px(2.0));
        for profile in &profiles {
            let id = profile.id.clone();
            let live = self
                .launcher
                .read(cx)
                .profile_progress(&profile.id)
                .is_some();
            let chain = self.launcher.read(cx).profile_route(profile);
            let hover = skin.hover;
            list = list.child(
                div()
                    .id(gpui::SharedString::from(format!(
                        "rail-profile-{}",
                        profile.id
                    )))
                    .role(gpui::Role::Button)
                    .aria_label(format!("Lanzar {}", profile.name))
                    .tab_index(0)
                    .h(px(42.0))
                    .flex_none()
                    .px(px(10.0))
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .rounded(px(skin.radius.sm))
                    .cursor_pointer()
                    .hover(move |s| s.bg(orbit::alpha(hover)))
                    .child(if live {
                        orbit::live_dot(cx)
                    } else {
                        div()
                            .size(px(7.0))
                            .flex_none()
                            .rounded_full()
                            .bg(rgb(skin.el))
                    })
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .child(
                                div()
                                    .text_size(px(14.0))
                                    .line_height(px(18.0))
                                    .font_weight(gpui::FontWeight(500.0))
                                    .text_color(rgb(skin.text2))
                                    .whitespace_nowrap()
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .child(profile.name.clone()),
                            )
                            .child(
                                div()
                                    .text_size(px(12.0))
                                    .line_height(px(16.0))
                                    .text_color(rgb(skin.text3))
                                    .whitespace_nowrap()
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .child(chain),
                            ),
                    )
                    .on_click(cx.listener(move |hub, _, _, cx| hub.launch_profile(&id, cx))),
            );
        }
        div()
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .when(!profiles.is_empty(), |block| {
                block
                    .child(
                        Self::group_heading("Perfiles", false, cx).child(
                            div()
                                .text_size(px(11.0))
                                .text_color(rgb(skin.cap))
                                .child(profiles.len().to_string()),
                        ),
                    )
                    .child(orbit::scroll_fade(list, skin.sidebar.to))
            })
    }

    fn sidebar_avatar(&self, cx: &gpui::App) -> Div {
        let skin = orbit::skin(cx).clone();
        if self.demo.is_none() {
            self.remote.read(cx).profile_avatar(30.0, 15.0, cx)
        } else {
            div()
                .size(px(30.0))
                .flex_none()
                .rounded_full()
                .bg(orbit::ramp(
                    orbit::skin::Ramp {
                        from: skin.l3,
                        to: skin.l2,
                        end: 1.0,
                    },
                    135.0,
                ))
                .shadow(vec![orbit::kit_shadow(skin.line2, 0.0, 0.0, 1.0, false)])
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(12.0))
                .font_weight(gpui::FontWeight(600.0))
                .text_color(rgb(skin.text2))
                .child(self.avatar_initial())
        }
    }

    fn sidebar_account(&self, expanded: bool, cx: &mut Context<Self>) -> gpui::Stateful<Div> {
        let skin = orbit::skin(cx).clone();
        let active = matches!(self.section, Section::Account | Section::Licenses);
        let name = self
            .demo
            .as_ref()
            .map_or_else(
                || {
                    let name = self.remote.read(cx).profile_name();
                    if name.is_empty() { "Cuenta" } else { name }
                },
                |demo| demo.user.full_name.as_str(),
            )
            .to_owned();
        let hover = skin.hover;
        let avatar = self.sidebar_avatar(cx);
        let row = div()
            .id("sidebar-account")
            .role(gpui::Role::Button)
            .aria_label(name.clone())
            .aria_selected(active)
            .tab_index(0)
            .flex_none()
            .mt(px(4.0))
            .py(px(8.0))
            .flex()
            .items_center()
            .gap(px(10.0))
            .rounded(px(skin.radius.md))
            .cursor_pointer()
            .child(avatar)
            .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Account, cx)));
        let row = if active {
            orbit::nav_active(row, cx)
        } else {
            row.hover(move |s| s.bg(orbit::alpha(hover)))
        };
        if !expanded {
            return row.justify_center();
        }
        row.px(px(10.0))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .text_size(px(14.0))
                            .line_height(px(18.0))
                            .font_weight(gpui::FontWeight(500.0))
                            .text_color(rgb(skin.text1))
                            .whitespace_nowrap()
                            .overflow_hidden()
                            .text_ellipsis()
                            .child(name),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .text_size(px(12.0))
                            .text_color(rgb(skin.text3))
                            .child(
                                div()
                                    .px(px(5.0))
                                    .rounded(px(skin.radius.xs))
                                    .bg(orbit::ramp(skin.button, 135.0))
                                    .text_size(px(10.0))
                                    .font_weight(gpui::FontWeight(700.0))
                                    .text_color(rgb(0x00ff_ffff))
                                    .child("BETA"),
                            )
                            .child(if self.shell.access.tester {
                                "Acceso de tester"
                            } else {
                                "Beta gratuita"
                            }),
                    ),
            )
            .child(orbit::icon("right", 16.0, skin.text3))
    }

    #[allow(clippy::too_many_lines)] // Composición de la barra; los permisos vienen del shell.
    pub(super) fn redesign_rail(&self, cx: &mut Context<Self>) -> Div {
        let adapt = self.shell.adapt;
        let expanded = adapt.sidebar_open;
        let skin = orbit::skin(cx).clone();
        let mut nav = div().flex_none().flex().flex_col().gap(px(2.0));
        for (index, (heading, sections)) in groups(self.shell.access).into_iter().enumerate() {
            if let Some(heading) = heading {
                nav = nav.child(if expanded {
                    Self::group_heading(heading, heading == "Para testers", cx)
                } else {
                    Self::separator(cx)
                });
            } else if index > 0 && !expanded {
                nav = nav.child(Self::separator(cx));
            }
            for section in sections {
                nav = nav.child(self.nav_entry(section, expanded, cx));
            }
        }
        let collapse = orbit::nav_item(
            "sidebar-collapse",
            "v-side",
            if expanded {
                "Contraer barra"
            } else {
                "Expandir barra"
            },
            false,
            false,
            expanded,
            cx,
        )
        .aria_expanded(expanded)
        .aria_keyshortcuts("Control+B")
        .when(expanded, |row| row.child(orbit::keycap("Ctrl B", cx)))
        .on_click(cx.listener(|hub, _, _, cx| hub.toggle_sidebar(cx)));
        let settings = orbit::nav_item(
            "sidebar-settings",
            "v-sliders",
            "Ajustes",
            self.section == Section::Settings,
            false,
            expanded,
            cx,
        )
        .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Settings, cx)));
        let logo = div()
            .h(px(52.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(10.0))
            .when(expanded, |logo| logo.px(px(8.0)))
            .when(!expanded, gpui::Styled::justify_center)
            .when(!expanded, |logo| {
                logo.child(orbit::icon("mark", 26.0, 0x00d8_0000))
            })
            .when(expanded, |logo| {
                logo.child(
                    orbit::icon_button(
                        "sidebar-toggle",
                        "v-side",
                        "Contraer barra (Ctrl B)",
                        28.0,
                        cx,
                    )
                    .on_click(cx.listener(|hub, _, _, cx| hub.toggle_sidebar(cx))),
                )
                .child(orbit::wordmark(cx))
            });
        div()
            .w(px(adapt.sidebar_width()))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .pb(px(12.0))
            .px(px(if expanded { 12.0 } else { 14.0 }))
            .bg(orbit::ramp(skin.sidebar, 180.0))
            .border_r_1()
            .border_color(orbit::alpha(skin.sidebar_line))
            .child(logo)
            .child(nav)
            .when(expanded, |rail| rail.child(self.sidebar_profiles(cx)))
            .when(!expanded, |rail| rail.child(div().flex_1()))
            .child(
                div()
                    .flex_none()
                    .flex()
                    .flex_col()
                    .gap(px(2.0))
                    .child(collapse)
                    .child(settings),
            )
            .child(self.sidebar_account(expanded, cx))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tester_group_is_not_painted_without_the_role() {
        let user = navigation::Access {
            verified: true,
            ..Default::default()
        };
        let groups_user = groups(user);
        assert!(
            groups_user
                .iter()
                .all(|(heading, _)| *heading != Some("Para testers"))
        );
        assert!(
            !groups_user
                .iter()
                .flat_map(|(_, sections)| sections)
                .any(|section| matches!(section, Section::Testing | Section::Calendar))
        );
        let tester = navigation::Access {
            verified: true,
            tester: true,
            ..Default::default()
        };
        let groups_tester = groups(tester);
        assert_eq!(
            groups_tester[1],
            (
                Some("Para testers"),
                vec![Section::Testing, Section::Calendar]
            )
        );
        assert_eq!(
            groups_tester.last(),
            Some(&(Some("Módulos"), vec![Section::Strategy, Section::Engineer]))
        );
        // Sin «Lanzar» en la barra (R10.8) y con los cuatro destinos para todos.
        assert_eq!(
            groups_user[0].1,
            vec![
                Section::Home,
                Section::Launcher,
                Section::Studio,
                Section::Roadmap
            ]
        );
    }
}
