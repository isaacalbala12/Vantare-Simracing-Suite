use super::{Hub, art};
use crate::{onboarding as model, orbit};
use gpui::{Context, Div, SharedString, Stateful, Window, div, prelude::*, px, rgb};
use vantare_ui::performance::Level;

pub(super) fn text(
    value: impl Into<SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> Div {
    orbit::text(value, size, weight, color, cx)
}
pub(super) fn heading(value: impl Into<SharedString>, size: f32, cx: &gpui::App) -> Div {
    text(value, size, 600, orbit::ink(cx), cx)
        .font_family("Rajdhani")
        .line_height(px(size * 0.9))
}
fn button(
    id: impl Into<SharedString>,
    label: impl Into<SharedString>,
    light: bool,
    s: f32,
    cx: &gpui::App,
) -> Stateful<Div> {
    let label: SharedString = label.into();
    div()
        .id(id.into())
        .role(gpui::Role::Button)
        .aria_label(label.to_string())
        .cursor_pointer()
        .tab_stop(true)
        .h(px(52.0 * s))
        .px(px(26.0 * s))
        .rounded(px(10.0 * s))
        .border_1()
        .border_color(rgb(if light { 0x00f3_eeee } else { 0x003e_3538 }))
        .bg(rgb(if light { 0x00f3_eeee } else { 0x0012_1011 }))
        .flex()
        .items_center()
        .justify_center()
        .when(!label.is_empty(), |button| {
            button.child(text(
                label,
                16.0 * s,
                600,
                if light { 0x001c_1719 } else { orbit::ink(cx) },
                cx,
            ))
        })
        .focus_visible(|style| style.border_2().border_color(rgb(0x00fa_f7f7)))
}
fn card(
    id: String,
    title: &str,
    description: &str,
    selected: bool,
    icon: &'static str,
    s: f32,
    cx: &gpui::App,
) -> Stateful<Div> {
    div()
        .id(SharedString::from(id))
        .role(gpui::Role::Button)
        .aria_label(title.to_owned())
        .aria_selected(selected)
        .relative()
        .cursor_pointer()
        .tab_stop(true)
        .rounded(px(14.0 * s))
        .border_1()
        .border_color(rgb(if selected { 0x00d8_0000 } else { 0x0029_2325 }))
        .bg(rgb(if selected { 0x0019_0d0e } else { 0x0012_1011 }))
        .p(px(18.0 * s))
        .flex()
        .flex_col()
        .gap(px(8.0 * s))
        .child(
            div()
                .size(px(40.0 * s))
                .bg(rgb(if selected { 0x00d8_0000 } else { 0x0024_1e20 }))
                .rounded(px(10.0 * s))
                .flex()
                .items_center()
                .justify_center()
                .child(orbit::icon(icon, 22.0 * s, orbit::ink(cx))),
        )
        .child(text(title.to_owned(), 16.0 * s, 700, orbit::ink(cx), cx))
        .child(text(
            description.to_owned(),
            13.0 * s,
            400,
            orbit::ink_3(cx),
            cx,
        ))
        .child(
            check(selected, s, cx)
                .absolute()
                .right(px(16.0 * s))
                .top(px(16.0 * s)),
        )
        .focus_visible(|style| style.border_2().border_color(rgb(0x00fa_f7f7)))
}
fn check(on: bool, s: f32, cx: &gpui::App) -> Div {
    div()
        .size(px(24.0 * s))
        .rounded_full()
        .border_1()
        .border_color(rgb(if on { 0x00d8_0000 } else { 0x0051_464a }))
        .when(on, |d| {
            d.bg(rgb(0x00d8_0000))
                .child(text("✓", 15.0 * s, 700, 0x00ff_ffff, cx))
        })
        .flex()
        .items_center()
        .justify_center()
}
impl Hub {
    #[allow(clippy::too_many_lines)] // Una raíz de render para el marco, contenido y navegación del contrato visual.
    pub(in crate::shell) fn onboarding_view(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let s = (f32::from(window.viewport_size().width) / 1600.0)
            .min(f32::from(window.viewport_size().height) / 900.0)
            .max(0.5);
        let state = self.onboarding.as_ref().expect("onboarding visible");
        let backdrop = state.backgrounds[1].clone();
        let step = state.step;
        let mut copy = div()
            .w(px(600.0 * s))
            .flex_none()
            .flex()
            .flex_col()
            .gap(px(22.0 * s));
        copy = copy.child(self.onboarding_radio(s, cx));
        let titles = [
            "LO QUE NECESITAS\nVER EN PISTA.",
            "¿A QUÉ CORRES?",
            "¿CÓMO CORRES?",
            "GUARDA TU\nCONFIGURACIÓN.",
            "SIN QUITARTE FPS.",
            "TÚ DECIDES.",
            "TODO LISTO.",
        ];
        let leads = [
            "Cinco preguntas rápidas y tu overlay queda hecho a tu medida.",
            "Hemos mirado tu PC. Marca los simuladores que usas.",
            "Elige uno o varios. Te preparamos los widgets.",
            "Entra con tu cuenta. Tu configuración se guarda en este PC.",
            "Elige la cadencia de los widgets para que el juego vaya siempre fluido.",
            "¿Nos ayudas a mejorar Vantare con datos de uso anónimos? Viene apagado.",
            "Tu overlay está preparado. Ábrelo o ajústalo a tu gusto.",
        ];
        copy = copy.child(heading(titles[step], 76.0 * s, cx)).child(
            text(leads[step], 18.4 * s, 400, orbit::ink_2(cx), cx).line_height(px(27.6 * s)),
        );
        copy = match step {
            0 => copy.child(text(
                "Puedes cambiarlo todo después en Ajustes.",
                13.6 * s,
                400,
                orbit::ink_3(cx),
                cx,
            )),
            1 => copy.child(self.onboarding_simulators(s, cx)),
            2 => copy.child(self.onboarding_styles(s, cx)),
            3 => copy.child(self.onboarding_account(s, cx)),
            4 => copy.child(self.onboarding_performance(s, cx)),
            5 => copy.child(self.onboarding_usage(s, cx)),
            _ => copy.child(self.onboarding_summary(s, cx)).child(
                div()
                    .flex()
                    .gap(px(12.0 * s))
                    .child(
                        button("onboarding-open", "Abrir mi overlay", true, s, cx)
                            .on_click(cx.listener(|hub, _, window, cx| {
                                hub.onboarding_finish(true, window, cx);
                            }))
                            .on_key_down(cx.listener(
                                |hub, event: &gpui::KeyDownEvent, window, cx| {
                                    if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                        hub.onboarding_finish(true, window, cx);
                                        cx.stop_propagation();
                                    }
                                },
                            )),
                    )
                    .child(
                        button("onboarding-edit", "Editar en Overlays Studio", false, s, cx)
                            .on_click(cx.listener(|hub, _, window, cx| {
                                hub.onboarding_finish(false, window, cx);
                            }))
                            .on_key_down(cx.listener(
                                |hub, event: &gpui::KeyDownEvent, window, cx| {
                                    if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                        hub.onboarding_finish(false, window, cx);
                                        cx.stop_propagation();
                                    }
                                },
                            )),
                    ),
            ),
        };
        if let Some(error) = &self.onboarding.as_ref().expect("visible").error {
            copy = copy.child(text(error.clone(), 13.0 * s, 600, 0x00ff_6b6b, cx));
        }
        let art = self.onboarding_art(step, s, cx);
        let next = match step {
            0 => "Empezar",
            3 if !self.onboarding.as_ref().expect("visible").signed => "Ahora no",
            5 => "Terminar",
            _ => "Continuar",
        };
        let can = self
            .onboarding
            .as_ref()
            .expect("visible")
            .choices
            .can_advance(step);
        let footer = div()
            .h(px(96.0 * s))
            .flex_none()
            .border_t_1()
            .border_color(rgb(0x0024_1e20))
            .px(px(40.0 * s))
            .flex()
            .items_center()
            .justify_between()
            .child(
                button("onboarding-back", "← Atrás", false, s, cx)
                    .bg(gpui::transparent_black())
                    .border_0()
                    .justify_start()
                    .px(px(16.0 * s))
                    .w(px(200.0 * s))
                    .opacity(if step == 0 { 0.0 } else { 1.0 })
                    .tab_stop(step > 0)
                    .on_click(cx.listener(|hub, _, _, cx| {
                        if let Some(state) = &mut hub.onboarding {
                            state.page(state.step.saturating_sub(1));
                            cx.notify();
                        }
                    })),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(12.0 * s))
                    .child(div().flex().gap(px(6.0 * s)).children((0..5).map(|i| {
                        div()
                            .w(px(46.0 * s))
                            .h(px(5.0 * s))
                            .rounded_full()
                            .bg(rgb(if i < step { 0x00d8_0000 } else { 0x0022_1d1f }))
                    })))
                    .child(text(
                        if step == 0 {
                            "5 PASOS · MENOS DE 1 MINUTO".into()
                        } else if step == 6 {
                            "LISTO".into()
                        } else {
                            format!("PASO {step} DE 5")
                        },
                        11.0 * s,
                        600,
                        orbit::ink_3(cx),
                        cx,
                    )),
            )
            .child(
                button("onboarding-next", next, true, s, cx)
                    .w(px(200.0 * s))
                    .gap(px(12.0 * s))
                    .child(
                        text("Enter", 10.0 * s, 600, 0x001c_1719, cx)
                            .p(px(4.0 * s))
                            .bg(rgb(0x00de_d9db))
                            .rounded(px(4.0 * s)),
                    )
                    .opacity(if step == 6 {
                        0.0
                    } else if can {
                        1.0
                    } else {
                        0.45
                    })
                    .tab_stop(step < 6 && can)
                    .on_click(cx.listener(|hub, _, window, cx| hub.onboarding_next(window, cx))),
            );
        div()
            .id("onboarding")
            .size_full()
            .bg(rgb(0x000a_0909))
            .relative()
            .when_some(backdrop, |d, image| {
                d.child(
                    gpui::img(image)
                        .absolute()
                        .inset_0()
                        .size_full()
                        .object_fit(gpui::ObjectFit::Fill),
                )
            })
            .track_focus(&self.focus)
            .flex()
            .flex_col()
            .capture_key_down(cx.listener(|hub, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "enter"
                    && hub.onboarding.as_ref().is_some_and(|state| state.step < 6)
                {
                    hub.onboarding_next(window, cx);
                    cx.stop_propagation();
                } else if event.keystroke.key == "escape" {
                    if let Some(state) = &mut hub.onboarding {
                        state.page(state.step.saturating_sub(1));
                        cx.notify();
                    }
                    cx.stop_propagation();
                }
            }))
            .on_key_down(cx.listener(|hub, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "enter" {
                    hub.onboarding_next(window, cx);
                    cx.stop_propagation();
                }
            }))
            .on_mouse_move(
                cx.listener(move |hub, event: &gpui::MouseMoveEvent, _, cx| {
                    if let Some(state) = &mut hub.onboarding {
                        let center = if state.step == 0 {
                            (1136.0 * s, 416.0 * s)
                        } else {
                            (148.0 * s, 216.0 * s)
                        };
                        let dx = f32::from(event.position.x) - center.0;
                        let dy = f32::from(event.position.y) - center.1;
                        let length = dx.hypot(dy).max(1.0);
                        state.pointer = (dx / length * 9.0, dy / length * 6.0);
                        cx.notify();
                    }
                }),
            )
            .child(
                div()
                    .h(px(68.0 * s))
                    .flex_none()
                    .px(px(40.0 * s))
                    .flex()
                    .items_center()
                    .gap(px(24.0 * s))
                    .border_b_1()
                    .border_color(rgb(0x0024_1e20))
                    .child(
                        div()
                            .flex()
                            .flex_none()
                            .w(px(113.0 * s))
                            .h(px(20.0 * s))
                            .items_center()
                            .gap(px(7.0 * s))
                            .child(orbit::icon("mark", 16.0 * s, 0x00ff_ffff))
                            .child(
                                gpui::svg()
                                    .path("brand/wordmark.svg")
                                    .text_color(rgb(0x00ff_ffff))
                                    .flex_none()
                                    .w(px(90.0 * s))
                                    .h(px(16.0 * s)),
                            ),
                    )
                    .child(div().flex_1())
                    .child(text(
                        "◷  MENOS DE 1 MINUTO",
                        11.0 * s,
                        600,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(
                        button("onboarding-skip", "Saltar", false, s, cx)
                            .bg(gpui::transparent_black())
                            .border_0()
                            .h(px(36.0 * s))
                            .px(px(12.0 * s))
                            .opacity(if step >= 5 { 0.0 } else { 1.0 })
                            .tab_stop(step < 5)
                            .on_click(cx.listener(|hub, _, _, cx| {
                                if let Some(state) = &mut hub.onboarding {
                                    state.page(6);
                                    cx.notify();
                                }
                            })),
                    ),
            )
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .gap(px(40.0 * s))
                    .pl(px(88.0 * s))
                    .pr(px(40.0 * s))
                    .py(px(28.0 * s))
                    .child(
                        div()
                            .w(px(600.0 * s))
                            .flex_none()
                            .h_full()
                            .flex()
                            .items_center()
                            .child(copy),
                    )
                    .child(art),
            )
            .child(footer)
    }
    fn onboarding_radio(&self, s: f32, cx: &gpui::App) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let reduced = state.system_reduced
            || cx
                .try_global::<vantare_ui::MotionPolicy>()
                .is_some_and(|p| p.0);
        let length = if reduced || state.capture {
            state.text.chars().count()
        } else {
            usize::try_from(state.spoken.elapsed().as_millis() / 16).unwrap_or(usize::MAX)
        };
        let writing = length < state.text.chars().count();
        let bubble = div()
            .relative()
            .flex_1()
            .min_w_0()
            .px(px(20.0 * s))
            .pt(px(14.0 * s))
            .pb(px(16.0 * s))
            .rounded(px(18.0 * s))
            .border_1()
            .border_color(orbit::tint(0x00fa_f7f7, 0.14))
            .bg(orbit::gradient([0x0020_1e1f, 0x0017_1516], 180.0))
            .shadow(vec![gpui::BoxShadow {
                color: orbit::tint(0x0000_0000, 0.35),
                offset: gpui::point(px(0.0), px(24.0 * s)),
                blur_radius: px(50.0 * s),
                spread_radius: px(0.0),
                inset: false,
            }])
            .child(art::radio_tail(s))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0 * s))
                    .line_height(px(10.0 * s))
                    .child(div().size(px(7.0 * s)).rounded_full().bg(rgb(if writing {
                        0x00ff_6b6b
                    } else {
                        0x0088_7f82
                    })))
                    .child(orbit::tracked_text(
                        "VANTA · ASISTENTE",
                        9.6 * s,
                        700,
                        orbit::ink_3(cx),
                        1.7 * s,
                        cx,
                    )),
            )
            .child(
                text(
                    format!(
                        "{}{}",
                        state.text.chars().take(length).collect::<String>(),
                        if writing { "▌" } else { "" }
                    ),
                    16.96 * s,
                    500,
                    orbit::ink(cx),
                    cx,
                )
                .mt(px(8.0 * s))
                .line_height(px(23.0 * s)),
            );
        if state.step == 0 {
            div().w(px(440.0 * s)).child(bubble)
        } else {
            div()
                .flex()
                .items_center()
                .gap(px(18.0 * s))
                .h(px(120.0 * s))
                .child(art::helmet(state, 132.0 * s, reduced))
                .child(bubble)
        }
    }
    fn onboarding_simulators(&self, s: f32, cx: &mut Context<Self>) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        div().flex().flex_col().gap(px(12.0 * s)).children(
            [
                ("LMU", "Le Mans Ultimate"),
                ("ACC", "Assetto Corsa Competizione"),
            ]
            .into_iter()
            .enumerate()
            .map(|(index, (abbr, name))| {
                let on = state.choices.simulators[index];
                let found = state.found[index] || state.capture && index == 0;
                div()
                    .id(("onboarding-sim", index))
                    .role(gpui::Role::Button)
                    .aria_label(name)
                    .aria_selected(on)
                    .tab_stop(true)
                    .cursor_pointer()
                    .h(px(96.0 * s))
                    .p(px(18.0 * s))
                    .rounded(px(14.0 * s))
                    .border_1()
                    .border_color(rgb(if on { 0x00d8_0000 } else { 0x0029_2325 }))
                    .bg(rgb(0x0012_1011))
                    .flex()
                    .items_center()
                    .gap(px(16.0 * s))
                    .child(text(abbr, 17.0 * s, 700, 0x00f3_eeee, cx).w(px(64.0 * s)))
                    .child(
                        div()
                            .flex_1()
                            .child(text(name, 16.0 * s, 700, orbit::ink(cx), cx))
                            .child(text(
                                if found {
                                    "Encontrado · En tu biblioteca"
                                } else {
                                    "No encontrado · Márcalo si lo vas a instalar"
                                },
                                13.0 * s,
                                400,
                                if found { 0x0022_c55e } else { orbit::ink_3(cx) },
                                cx,
                            )),
                    )
                    .child(check(on, s, cx))
                    .on_click(cx.listener(move |hub, _, _, cx| {
                        if let Some(state) = &mut hub.onboarding {
                            state.simulators_touched = true;
                            state.choices.simulators[index] = !state.choices.simulators[index];
                            state.say(state.choices.simulator_reaction(index));
                            cx.notify();
                        }
                    }))
            }),
        )
    }
    fn onboarding_styles(&self, s: f32, cx: &mut Context<Self>) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let descriptions = [
            "Servidores públicos y ránking",
            "Campeonatos con tus rivales de siempre",
            "Carreras largas, relevos y combustible",
            "Emites en Twitch o YouTube",
        ];
        let icons = ["route", "star", "clock", "v-camera"];
        div()
            .flex()
            .flex_col()
            .gap(px(12.0 * s))
            .children((0..2).map(|row| {
                div()
                    .flex()
                    .gap(px(12.0 * s))
                    .children((row * 2..row * 2 + 2).map(|i| {
                        card(
                            format!("onboarding-style-{i}"),
                            model::STY_NAMES[i],
                            descriptions[i],
                            state.choices.styles[i],
                            icons[i],
                            s,
                            cx,
                        )
                        .w(px(294.0 * s))
                        .h(px(136.0 * s))
                        .on_click(cx.listener(move |hub, _, _, cx| {
                            if let Some(state) = &mut hub.onboarding {
                                state.choices.styles[i] = !state.choices.styles[i];
                                state.say(state.choices.style_reaction(i));
                                cx.notify();
                            }
                        }))
                    }))
            }))
    }
    fn onboarding_account(&self, s: f32, cx: &mut Context<Self>) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let mut column = div().w(px(440.0 * s)).flex().flex_col().gap(px(12.0 * s));
        if state.signed {
            column = column.child(text("Tu plan: Gratis", 22.0 * s, 600, orbit::ink(cx), cx));
        } else {
            for (i, label) in [
                "Continuar con Discord",
                "Continuar con Google",
                "Continuar con email",
            ]
            .into_iter()
            .enumerate()
            {
                column = column.child(
                    button(format!("onboarding-account-{i}"), "", false, s, cx)
                        .aria_label(label)
                        .justify_start()
                        .gap(px(12.0 * s))
                        .child(
                            gpui::img(format!(
                                "onboarding/{}.svg",
                                ["discord", "google", "email"][i]
                            ))
                            .size(px(18.0 * s))
                            .flex_none(),
                        )
                        .child(text(label, 16.0 * s, 600, orbit::ink(cx), cx))
                        .child(div().flex_1())
                        .child(text("→", 16.0 * s, 400, orbit::ink_3(cx), cx))
                        .on_click(cx.listener(|hub, _, _, cx| {
                            if !hub.onboarding.as_ref().is_some_and(|s| s.capture) {
                                hub.remote.update(cx, |remote, cx| {
                                    remote.request(
                                        crate::services::protocol::Command::AccountBegin,
                                        cx,
                                    );
                                });
                            }
                        })),
                );
            }
            if !state.capture {
                column = column.child(text(
                    self.remote.read(cx).onboarding_session().1.to_owned(),
                    12.0 * s,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ));
            }
        }
        column.child(text(
            "Sin cuenta también funciona: la configuración se guarda solo en este PC.",
            13.6 * s,
            400,
            orbit::ink_3(cx),
            cx,
        ))
    }
    fn onboarding_levels(&self, s: f32, cx: &mut Context<Self>) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let mut levels = div()
            .flex()
            .h(px(52.0 * s))
            .rounded(px(10.0 * s))
            .border_1()
            .border_color(rgb(0x0029_2325))
            .bg(rgb(0x0012_1011));
        for (i, level) in Level::ALL.into_iter().enumerate() {
            let selected = !state.choices.automatic && state.choices.level == level;
            levels = levels.child(
                button(format!("onboarding-level-{i}"), level.label(), false, s, cx)
                    .flex_1()
                    .px(px(2.0 * s))
                    .border_0()
                    .bg(if selected {
                        orbit::tint(0x00d8_0000, 0.18)
                    } else {
                        gpui::transparent_black()
                    })
                    .on_click(cx.listener(move |hub, _, _, cx| {
                        if let Some(state) = &mut hub.onboarding {
                            state.choices.automatic = false;
                            state.choices.level = level;
                            state.say(match level {
                                Level::Maximum => "Máximo: usa más recursos del PC.".into(),
                                Level::Minimum => "Mínimo: usa los menos recursos posibles.".into(),
                                _ => format!("Nivel fijado: {}.", level.label()),
                            });
                            cx.notify();
                        }
                    })),
            );
        }
        levels
    }
    fn onboarding_performance(&self, s: f32, cx: &mut Context<Self>) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let levels = self.onboarding_levels(s, cx);
        div()
            .flex()
            .flex_col()
            .gap(px(22.0 * s))
            .child(text(
                state.equipment.summary(),
                13.0 * s,
                600,
                orbit::ink_3(cx),
                cx,
            ))
            .child(
                div()
                    .id("onboarding-auto")
                    .role(gpui::Role::Button)
                    .cursor_pointer()
                    .h(px(85.0 * s))
                    .p(px(20.0 * s))
                    .rounded(px(14.0 * s))
                    .border_1()
                    .border_color(rgb(if state.choices.automatic {
                        0x00d8_0000
                    } else {
                        0x0029_2325
                    }))
                    .bg(rgb(0x0012_1011))
                    .flex()
                    .items_center()
                    .gap(px(18.0 * s))
                    .child(
                        div()
                            .size(px(42.0 * s))
                            .rounded(px(10.0 * s))
                            .bg(rgb(0x00d8_0000))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(orbit::icon("v-gauge", 24.0 * s, 0x00ff_ffff)),
                    )
                    .child(
                        div()
                            .flex_1()
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(10.0 * s))
                                    .child(text("Automático", 17.0 * s, 700, orbit::ink(cx), cx))
                                    .child(text("RECOMENDADO", 10.0 * s, 700, 0x0022_c55e, cx)),
                            )
                            .child(text(
                                "Elige Equilibrado o Ahorro según los núcleos y la RAM de tu PC.",
                                13.0 * s,
                                400,
                                orbit::ink_3(cx),
                                cx,
                            )),
                    )
                    .child(check(state.choices.automatic, s, cx))
                    .tab_stop(true)
                    .on_click(cx.listener(|hub, _, _, cx| {
                        if let Some(state) = &mut hub.onboarding {
                            state.choices.select_automatic(&state.equipment);
                            state.say(model::SAY[4]);
                            cx.notify();
                        }
                    })),
            )
            .child(levels)
            .child(text(
                "O fija tú un nivel.",
                13.0 * s,
                400,
                orbit::ink_3(cx),
                cx,
            ))
    }
    fn onboarding_usage(&self, s: f32, cx: &mut Context<Self>) -> Stateful<Div> {
        let on = self.onboarding.as_ref().expect("visible").choices.usage;
        div()
            .id("onboarding-usage")
            .role(gpui::Role::Switch)
            .aria_label("Enviar datos de uso anónimos")
            .aria_description(if on { "Activado" } else { "Apagado" })
            .cursor_pointer()
            .tab_stop(true)
            .p(px(20.0 * s))
            .rounded(px(14.0 * s))
            .border_1()
            .border_color(rgb(if on { 0x0022_c55e } else { 0x0029_2325 }))
            .bg(rgb(0x0012_1011))
            .flex()
            .items_center()
            .gap(px(18.0 * s))
            .child(
                div()
                    .flex_1()
                    .child(text(
                        "Enviar datos de uso anónimos",
                        16.0 * s,
                        700,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(text(
                        "Lo cambias cuando quieras en Ajustes.",
                        13.0 * s,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            )
            .child(
                div()
                    .relative()
                    .w(px(58.0 * s))
                    .h(px(32.0 * s))
                    .rounded_full()
                    .bg(rgb(if on { 0x0022_c55e } else { 0x0022_1d1f }))
                    .border_1()
                    .border_color(rgb(0x0051_464a))
                    .child(
                        div()
                            .absolute()
                            .left(px(if on { 29.0 * s } else { 3.0 * s }))
                            .top(px(3.0 * s))
                            .size(px(24.0 * s))
                            .rounded_full()
                            .bg(rgb(if on { 0x00ff_ffff } else { 0x00a3_9a9c })),
                    ),
            )
            .on_click(cx.listener(|hub, _, _, cx| hub.onboarding_toggle_usage(cx)))
            .on_key_down(cx.listener(|hub, event: &gpui::KeyDownEvent, _, cx| {
                if event.keystroke.key == "space" {
                    hub.onboarding_toggle_usage(cx);
                    cx.stop_propagation();
                }
            }))
    }
    fn onboarding_summary(&self, s: f32, cx: &gpui::App) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let choices = &state.choices;
        let sims = ["Le Mans Ultimate", "ACC"]
            .into_iter()
            .zip(choices.simulators)
            .filter_map(|(name, on)| on.then_some(name))
            .collect::<Vec<_>>()
            .join(" y ");
        let styles = model::STY_NAMES
            .into_iter()
            .zip(choices.styles)
            .filter_map(|(name, on)| on.then_some(name))
            .collect::<Vec<_>>()
            .join(", ");
        div()
            .rounded(px(14.0 * s))
            .border_1()
            .border_color(rgb(0x0029_2325))
            .w(px(480.0 * s))
            .overflow_hidden()
            .children(
                [
                    ("Simuladores", sims),
                    ("Estilo", styles),
                    ("Widgets", choices.widgets_summary()),
                    (
                        "Plan",
                        if state.signed {
                            "Gratis · cuenta conectada"
                        } else {
                            "Gratis · sin cuenta"
                        }
                        .into(),
                    ),
                    (
                        "Rendimiento",
                        if choices.automatic {
                            "Automático"
                        } else {
                            choices.level.label()
                        }
                        .into(),
                    ),
                    (
                        "Datos de uso",
                        if choices.usage {
                            "Activados"
                        } else {
                            "Apagados"
                        }
                        .into(),
                    ),
                ]
                .into_iter()
                .map(|(label, value)| {
                    div()
                        .flex()
                        .items_center()
                        .gap(px(12.0 * s))
                        .px(px(16.0 * s))
                        .py(px(12.0 * s))
                        .border_b_1()
                        .border_color(rgb(0x0029_2325))
                        .child(text(label, 14.0 * s, 400, orbit::ink_3(cx), cx).w(px(135.0 * s)))
                        .child(text(value, 14.0 * s, 600, orbit::ink(cx), cx).flex_1())
                        .child(text("✓", 16.0 * s, 600, 0x0022_c55e, cx))
                }),
            )
    }
}
