use super::{
    Hub, State,
    view::{heading, text},
};
use crate::{onboarding as model, orbit};
use gpui::{Context, Div, IntoElement, PathBuilder, div, prelude::*, px, rgb};
use vantare_ui::{Kind, performance::Level};
// Gradiente radial y franjas del contrato, SVG local pintado por GPUI; sin HTML.
fn panel_background(state: &State, s: f32) -> Div {
    div()
        .absolute()
        .inset_0()
        .size_full()
        .when_some(state.backgrounds[0].clone(), |d, image| {
            d.child(
                gpui::img(image)
                    .absolute()
                    .inset_0()
                    .size_full()
                    .rounded(px(22.0 * s))
                    .object_fit(gpui::ObjectFit::Fill),
            )
        })
}

pub(super) fn radio_tail(s: f32) -> impl IntoElement {
    gpui::canvas(
        |_, _, _| (),
        move |bounds, (), window, _| {
            let at = |x: f32, y: f32| {
                gpui::point(bounds.origin.x + px(x * s), bounds.origin.y + px(y * s))
            };
            let mut fill = PathBuilder::fill();
            fill.move_to(at(7.0, 0.0));
            fill.line_to(at(0.0, 7.0));
            fill.line_to(at(7.0, 14.0));
            fill.line_to(at(14.0, 7.0));
            fill.close();
            if let Ok(path) = fill.build() {
                window.paint_path(path, rgb(0x0017_1516));
            }
            let mut edge = PathBuilder::stroke(px(s));
            edge.move_to(at(7.0, 0.0));
            edge.line_to(at(0.0, 7.0));
            edge.line_to(at(7.0, 14.0));
            if let Ok(path) = edge.build() {
                window.paint_path(path, orbit::tint(0x00fa_f7f7, 0.14));
            }
        },
    )
    .absolute()
    .left(px(-7.0 * s))
    .top(px(26.0 * s))
    .size(px(14.0 * s))
}

fn radar_beam(s: f32) -> impl IntoElement {
    gpui::canvas(
        |_, _, _| (),
        move |bounds, (), window, _| {
            let at = |x: f32, y: f32| {
                gpui::point(bounds.origin.x + px(x * s), bounds.origin.y + px(y * s))
            };
            for i in 0u8..10 {
                let r = 260.0 - f32::from(i) * 23.0;
                let d = r * std::f32::consts::FRAC_1_SQRT_2;
                let mut path = PathBuilder::fill();
                path.move_to(at(260.0, 260.0));
                path.line_to(at(260.0 + d, 260.0 + d));
                path.cubic_bezier_to(
                    at(260.0 - d, 260.0 + d),
                    at(260.0 + d * 0.44, 260.0 + r * 1.12),
                    at(260.0 - d * 0.44, 260.0 + r * 1.12),
                );
                path.close();
                if let Ok(path) = path.build() {
                    window.paint_path(path, orbit::tint(0x00ff_ffff, 0.017));
                }
            }
        },
    )
    .absolute()
    .left(px(-77.0 * s))
    .top(px(-77.0 * s))
    .size(px(520.0 * s))
}

pub(super) fn helmet(state: &State, width: f32, reduced: bool) -> Div {
    let s = width / 210.0;
    let elapsed = state.spoken.elapsed().as_secs_f32();
    let hop = if reduced || state.capture || elapsed > 0.46 {
        0.0
    } else {
        (elapsed / 0.46 * std::f32::consts::PI).sin() * -8.0 * s
    };
    let blink = !reduced && !state.capture && elapsed % 4.2 > 4.06;
    let (x, y) = if reduced { (0.0, 0.0) } else { state.pointer };
    let surprised = state.text.starts_with("Selecciona al menos");
    let eye_width = if surprised { 20.0 } else { 16.0 };
    let eye_height = if surprised { 20.0 } else { 24.0 };
    let happy = state.text.starts_with("Sesión iniciada.");
    let eyes = div()
        .absolute()
        .left(px((70.0 + x) * s))
        .top(px((94.0 + y) * s))
        .flex()
        .opacity(if happy { 0.0 } else { 1.0 })
        .gap(px(28.0 * s))
        .children((0..2).map(|_| {
            div()
                .w(px(eye_width * s))
                .h(px(if blink { 3.0 * s } else { eye_height * s }))
                .rounded(px(8.0 * s))
                .bg(rgb(0x00ff_5b64))
                .shadow(vec![gpui::BoxShadow {
                    color: orbit::tint(0x00ff_3d4a, 0.65),
                    offset: gpui::point(px(0.0), px(0.0)),
                    blur_radius: px(11.0 * s),
                    spread_radius: px(1.0 * s),
                    inset: false,
                }])
        }));
    let mut result = div()
        .relative()
        .w(px(width))
        .h(px(width * 196.0 / 210.0))
        .mt(px(hop))
        .child(gpui::img("onboarding/helmet.svg").size_full())
        .child(eyes);
    if happy {
        result = result.child(
            gpui::canvas(
                |_, _, _| (),
                move |bounds, (), window, _| {
                    let at = |x: f32, y: f32| {
                        gpui::point(bounds.origin.x + px(x * s), bounds.origin.y + px(y * s))
                    };
                    for x in [0.0, 44.0] {
                        let mut path = PathBuilder::stroke(px(6.0 * s));
                        path.move_to(at(x, 16.0));
                        path.cubic_bezier_to(
                            at(x + 20.0, 16.0),
                            at(x + 6.0, 4.0),
                            at(x + 14.0, 4.0),
                        );
                        if let Ok(path) = path.build() {
                            window.paint_path(path, rgb(0x00ff_5b64));
                        }
                    }
                },
            )
            .absolute()
            .left(px((68.0 + x) * s))
            .top(px((96.0 + y) * s))
            .w(px(66.0 * s))
            .h(px(28.0 * s)),
        );
    }
    result
}
fn gauge(level: Level, s: f32) -> impl IntoElement {
    gpui::canvas(
        |_, _, _| (),
        move |bounds, (), window, _| {
            let at = |x: f32, y: f32| {
                gpui::point(bounds.origin.x + px(x * s), bounds.origin.y + px(y * s))
            };
            let selected: u8 = match level {
                Level::Maximum => 0,
                Level::High => 1,
                Level::Balanced => 2,
                Level::Economy => 3,
                Level::Minimum => 4,
            };
            for i in 0u8..5 {
                let mut path = PathBuilder::stroke(px(34.0 * s));
                for p in 0u8..=24 {
                    let angle = std::f32::consts::PI
                        + (f32::from(i) + (f32::from(p) / 24.0) * 0.9 + 0.05)
                            * std::f32::consts::PI
                            / 5.0;
                    let pos = at(280.0 + 230.0 * angle.cos(), 290.0 + 230.0 * angle.sin());
                    if p == 0 {
                        path.move_to(pos);
                    } else {
                        path.line_to(pos);
                    }
                }
                if let Ok(path) = path.build() {
                    window.paint_path(
                        path,
                        orbit::tint(0x00ff_ffff, if i == selected { 1.0 } else { 0.35 }),
                    );
                }
            }
            let angle = (-162.0 + f32::from(selected) * 36.0).to_radians();
            let mut needle = PathBuilder::fill();
            needle.move_to(at(271.0, 290.0));
            needle.line_to(at(280.0 + 180.0 * angle.cos(), 290.0 + 180.0 * angle.sin()));
            needle.line_to(at(289.0, 290.0));
            needle.close();
            if let Ok(path) = needle.build() {
                window.paint_path(path, rgb(0x00ff_ffff));
            }
            for (r, color) in [(18.0, 0x00ff_ffff), (7.0, 0x00b3_101d)] {
                window.paint_quad(gpui::quad(
                    gpui::Bounds::new(
                        at(280.0 - r, 290.0 - r),
                        gpui::size(px(r * 2.0 * s), px(r * 2.0 * s)),
                    ),
                    gpui::Corners::all(px(r * s)),
                    rgb(color),
                    gpui::Edges::default(),
                    gpui::transparent_black(),
                    gpui::BorderStyle::default(),
                ));
            }
        },
    )
    .w(px(560.0 * s))
    .h(px(330.0 * s))
}
impl Hub {
    pub(super) fn onboarding_art(&mut self, step: usize, s: f32, cx: &mut Context<Self>) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let reduced = state.system_reduced
            || cx
                .try_global::<vantare_ui::MotionPolicy>()
                .is_some_and(|p| p.0);
        let panel = div()
            .relative()
            .flex_1()
            .min_w_0()
            .h_full()
            .rounded(px(22.0 * s))
            .overflow_hidden()
            .bg(rgb(0x007a_0b15))
            .shadow(vec![gpui::BoxShadow {
                color: orbit::tint(0x0028_0008, 0.45),
                offset: gpui::point(px(0.0), px(40.0 * s)),
                blur_radius: px(100.0 * s),
                spread_radius: px(0.0),
                inset: false,
            }])
            .child(panel_background(state, s));
        let content = match step {
            0 => div()
                .size_full()
                .relative()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(24.0 * s))
                .child(
                    heading("VANTA", 300.0 * s, cx)
                        .text_color(rgb(0x0000_0000))
                        .absolute()
                        .top(px(180.0 * s))
                        .opacity(0.15),
                )
                .child(helmet(state, 330.0 * s, reduced))
                .child(
                    orbit::tracked_text(
                        "VANTA · ASISTENTE DE CONFIGURACIÓN",
                        10.88 * s,
                        700,
                        0x00ff_ffff,
                        1.08 * s,
                        cx,
                    )
                    .px(px(14.0 * s))
                    .py(px(8.0 * s))
                    .rounded(px(6.0 * s))
                    .border_1()
                    .border_color(rgb(0x0089_565d))
                    .bg(orbit::tint(0x0000_0000, 0.4)),
                ),
            1 => self.onboarding_radar(s, cx),
            2 | 6 => self.onboarding_kit(s, cx),
            3 => Self::onboarding_plans(s, cx),
            4 => {
                let automatic = state.choices.automatic;
                let level = state.choices.level;
                div()
                    .size_full()
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(px(24.0 * s))
                    .child(gauge(level, s))
                    .child(heading(
                        if automatic {
                            "AUTOMÁTICO"
                        } else {
                            level.label()
                        },
                        60.0 * s,
                        cx,
                    ))
                    .child(text(
                        if automatic {
                            format!("Ahora en {} · recomendado para tu PC", level.label())
                        } else {
                            "Nivel de cadencia de los widgets".into()
                        },
                        15.0 * s,
                        500,
                        0x00f3_eeee,
                        cx,
                    ))
            }
            _ => self.onboarding_feed(s, cx),
        };
        panel.child(content)
    }
    fn onboarding_radar(&self, s: f32, cx: &gpui::App) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let mut radar = div()
            .relative()
            .size(px(366.0 * s))
            .child(radar_beam(s))
            .flex()
            .items_center()
            .justify_center();
        for diameter in [366.0, 184.0, 92.0] {
            radar = radar.child(
                div()
                    .absolute()
                    .size(px(diameter * s))
                    .rounded_full()
                    .border_1()
                    .border_color(orbit::tint(0x00ff_ffff, 0.24)),
            );
        }
        radar = radar.child(
            div()
                .size(px(102.0 * s))
                .border(px(5.0 * s))
                .border_color(orbit::tint(0x0000_0000, 0.24))
                .bg(rgb(0x00f3_eeee))
                .rounded_full()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .child(orbit::icon("monitor", 32.0 * s, 0x001c_1719))
                .child(text("TU PC", 11.0 * s, 700, 0x001c_1719, cx)),
        );
        for (i, name) in ["Le Mans Ultimate", "ACC"].into_iter().enumerate() {
            if state.choices.simulators[i] {
                radar = radar.child(
                    div()
                        .absolute()
                        .left(px(if i == 0 { 270.0 * s } else { -15.0 * s }))
                        .top(px(if i == 0 { 38.0 * s } else { 242.0 * s }))
                        .bg(orbit::tint(0x0000_0000, 0.42))
                        .border_1()
                        .border_color(orbit::tint(0x00ff_ffff, 0.2))
                        .rounded(px(8.0 * s))
                        .px(px(12.0 * s))
                        .py(px(8.0 * s))
                        .child(text(
                            if state.found[i] || state.capture && i == 0 {
                                "ENCONTRADO"
                            } else {
                                "AÑADIDO"
                            },
                            8.8 * s,
                            700,
                            0x00d6_cfd0,
                            cx,
                        ))
                        .child(text(name, 14.4 * s, 600, 0x00ff_ffff, cx))
                        .child(
                            div()
                                .absolute()
                                .left(px(-24.0 * s))
                                .top(px(17.0 * s))
                                .size(px(13.0 * s))
                                .rounded_full()
                                .bg(rgb(0x00ff_ffff)),
                        ),
                );
            }
        }
        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .child(radar)
    }
    #[allow(clippy::too_many_lines)] // Composición de una preview, con el renderer productivo compartido.
    fn onboarding_kit(&mut self, s: f32, cx: &mut Context<Self>) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let kit = state.choices.kit();
        let mut screen = div()
            .relative()
            .w_full()
            .flex_1()
            .min_h_0()
            .rounded(px(14.0 * s))
            .overflow_hidden()
            .bg(rgb(0x0030_3a46))
            .border_1()
            .border_color(rgb(0x0072_6066));
        // Ilustración de pista aprobada; los widgets conservan su renderer productivo.
        screen = screen.when_some(state.backgrounds[2].clone(), |d, image| {
            d.child(
                gpui::img(image)
                    .absolute()
                    .inset_0()
                    .size_full()
                    .rounded(px(14.0 * s))
                    .object_fit(gpui::ObjectFit::Fill),
            )
        });
        let scale = 0.48 * s;
        let resize = (state.preview_scale.replace(scale) - scale).abs() > f32::EPSILON;
        for (kind, view) in &state.previews {
            if !kit.contains(kind) {
                continue;
            }
            if resize {
                let widget_scale = s * match kind {
                    Kind::Relative => 0.8,
                    Kind::Delta => 1.0,
                    Kind::RacingFlags => 0.35,
                    _ => 0.48,
                };
                view.update(cx, |overlay, cx| {
                    let _ = overlay.set_preview_scale(widget_scale);
                    cx.notify();
                });
            }
            let (x, y) = match kind {
                Kind::Standings => (24.0, 26.0),
                Kind::Relative => (264.0, 348.0),
                Kind::Delta => (286.0, 26.0),
                Kind::RacingFlags => (286.0, 125.0),
                Kind::Pedals => (640.0, 325.0),
                Kind::BroadcastTower => (580.0, 26.0),
                Kind::HeadToHead => (280.0, 240.0),
                Kind::FuelStrategy => (24.0, 230.0),
                Kind::TrackWeather => (24.0, 390.0),
                _ => (555.0, 240.0),
            };
            screen = screen.child(
                div()
                    .absolute()
                    .left(px(x * s))
                    .top(px(y * s))
                    .child(view.clone()),
            );
        }
        div()
            .relative()
            .size_full()
            .px(px(34.0 * s))
            .pt(px(34.0 * s))
            .pb(px(30.0 * s))
            .flex()
            .flex_col()
            .gap(px(18.0 * s))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        heading(
                            if state.step == 6 {
                                "TU OVERLAY"
                            } else {
                                "TUS WIDGETS"
                            },
                            28.0 * s,
                            cx,
                        )
                        .line_height(px(28.0 * s)),
                    )
                    .child(
                        text(
                            state.choices.widgets_summary().to_uppercase(),
                            10.0 * s,
                            700,
                            0x00ff_ffff,
                            cx,
                        )
                        .px(px(9.0 * s))
                        .py(px(6.0 * s))
                        .rounded(px(6.0 * s))
                        .border_1()
                        .border_color(orbit::tint(0x00ff_ffff, 0.22))
                        .bg(orbit::tint(0x0000_0000, 0.3)),
                    ),
            )
            .child(screen)
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(8.0 * s))
                    .children(kit.into_iter().map(|kind| {
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.0 * s))
                            .px(px(10.0 * s))
                            .py(px(7.0 * s))
                            .h(px(32.0 * s))
                            .border_1()
                            .border_color(orbit::tint(0x00ff_ffff, 0.18))
                            .rounded(px(8.0 * s))
                            .bg(orbit::tint(0x0000_0000, 0.3))
                            .child(text(model::label(kind), 13.12 * s, 600, 0x00ff_ffff, cx))
                            .when(!model::free(kind), |d| {
                                d.child(
                                    text("PRO", 8.32 * s, 700, 0x00b3_101d, cx)
                                        .px(px(4.0 * s))
                                        .py(px(3.0 * s))
                                        .rounded(px(4.0 * s))
                                        .bg(rgb(0x00ff_ffff)),
                                )
                            })
                    })),
            )
    }

    #[allow(clippy::too_many_lines)] // Dos tarjetas y el banner de la misma pantalla aprobada.
    fn onboarding_plans(s: f32, cx: &mut Context<Self>) -> Div {
        let mut plans = div().flex().gap(px(16.0 * s));
        for (name, image, price, normal, features) in [
            (
                "Vantare Pro",
                "pro",
                "3,99 €",
                "5,99 €",
                [
                    "Todos los widgets",
                    "Sin la marca Vantare",
                    "Soporte en Discord",
                ],
            ),
            (
                "Vantare Pro Plus",
                "plus",
                "6,99 €",
                "9,99 €",
                [
                    "Todo lo de Pro",
                    "Versiones nightly antes que nadie",
                    "Tests y previews",
                ],
            ),
        ] {
            plans = plans.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .p(px(18.0 * s))
                    .bg(orbit::tint(0x0008_0606, 0.76))
                    .rounded(px(16.0 * s))
                    .border_1()
                    .border_color(orbit::tint(0x00ff_ffff, 0.18))
                    .flex()
                    .flex_col()
                    .gap(px(12.0 * s))
                    .child(
                        div()
                            .flex()
                            .gap(px(12.0 * s))
                            .items_center()
                            .child(
                                gpui::img(format!("onboarding/{image}.png"))
                                    .size(px(58.0 * s))
                                    .rounded(px(10.0 * s)),
                            )
                            .child(
                                div()
                                    .child(heading(
                                        name.strip_prefix("Vantare ")
                                            .unwrap_or(name)
                                            .to_uppercase(),
                                        24.0 * s,
                                        cx,
                                    ))
                                    .child(text("PRIMER MES", 10.0 * s, 600, 0x00cf_c6c7, cx)),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .items_end()
                            .gap(px(12.0 * s))
                            .child(
                                text(price, 38.0 * s, 700, 0x00ff_ffff, cx)
                                    .line_height(px(46.0 * s)),
                            )
                            .child(text(normal, 17.0 * s, 400, 0x00a3_9a9c, cx).line_through()),
                    )
                    .children(
                        features
                            .into_iter()
                            .map(|f| text(format!("✓  {f}"), 13.0 * s, 400, 0x00f3_eeee, cx)),
                    )
                    .child(
                        div()
                            .id(gpui::SharedString::from(format!("onboarding-plan-{image}")))
                            .cursor_pointer()
                            .tab_index(0)
                            .h(px(48.0 * s))
                            .rounded(px(10.0 * s))
                            .bg(rgb(if image == "pro" {
                                0x00f3_eeee
                            } else {
                                0x0012_1011
                            }))
                            .border_1()
                            .border_color(orbit::tint(0x00ff_ffff, 0.14))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(text(
                                format!("Elegir {}", name.strip_prefix("Vantare ").unwrap_or(name)),
                                14.0 * s,
                                600,
                                if image == "pro" {
                                    0x001c_1719
                                } else {
                                    0x00ff_ffff
                                },
                                cx,
                            ))
                            .on_click(cx.listener(move |hub, _, _, cx| {
                                hub.onboarding_plan(
                                    (image == "pro").then_some(
                                        crate::services::protocol::BillingProduct::ProMonthly,
                                    ),
                                    cx,
                                );
                            })),
                    ),
            );
        }
        div()
            .relative()
            .size_full()
            .p(px(48.0 * s))
            .flex()
            .flex_col()
            .justify_center()
            .gap(px(20.0 * s))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .child(heading("PRECIO DE LANZAMIENTO", 30.0 * s, cx))
                    .child(text("HASTA EL 26 NOV", 10.0 * s, 700, 0x00ff_ffff, cx)),
            )
            .child(plans)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(16.0 * s))
                    .p(px(14.0 * s))
                    .rounded(px(14.0 * s))
                    .bg(orbit::tint(0x0000_0000, 0.5))
                    .border_1()
                    .border_color(orbit::tint(0x00ff_ffff, 0.2))
                    .child(
                        gpui::img("onboarding/launch.png")
                            .size(px(48.0 * s))
                            .rounded(px(10.0 * s)),
                    )
                    .child(
                        div()
                            .flex_1()
                            .child(heading("LAUNCH EDITION", 22.0 * s, cx))
                            .child(text(
                                "Pago único · Edición de lanzamiento",
                                13.0 * s,
                                400,
                                0x00cf_c6c7,
                                cx,
                            )),
                    )
                    .child(heading("30 €", 40.0 * s, cx))
                    .id("onboarding-launch-plan")
                    .role(gpui::Role::Button)
                    .cursor_pointer()
                    .tab_index(0)
                    .on_click(cx.listener(|hub, _, _, cx| {
                        hub.onboarding_plan(
                            Some(crate::services::protocol::BillingProduct::LaunchLifetime),
                            cx,
                        );
                    })),
            )
            .child(text(
                "Gratis para siempre: Standings, Relative, Delta y Pedals",
                13.0 * s,
                600,
                0x00ff_ffff,
                cx,
            ))
    }
    #[allow(clippy::too_many_lines)] // Lista blanca de uso y exclusiones en una tarjeta de privacidad.
    fn onboarding_feed(&self, s: f32, cx: &gpui::App) -> Div {
        let state = self.onboarding.as_ref().expect("visible");
        let usage = state.choices.usage;
        let crashes = state.choices.crashes;
        let mut yes = div()
            .rounded(px(14.0 * s))
            .overflow_hidden()
            .border_1()
            .border_color(orbit::tint(0x00ff_ffff, 0.2))
            .bg(orbit::tint(0x000f_0d0e, 0.9));
        for (name, value) in [
            ("Páginas y funciones", "Uso de la app"),
            ("Tipos de widgets", "Sin contenido"),
            ("Tiempo de uso", "Solo con permiso"),
            (
                "Versión, canal y simulador",
                "Instalación, cuenta y licencia",
            ),
        ] {
            yes = yes.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0 * s))
                    .p(px(16.0 * s))
                    .border_b_1()
                    .border_color(rgb(0x0029_2325))
                    .opacity(if usage { 1.0 } else { 0.4 })
                    .child(div().size(px(9.0 * s)).rounded_full().bg(rgb(if usage {
                        0x0022_c55e
                    } else {
                        0x007a_7173
                    })))
                    .child(text(name, 15.0 * s, 400, 0x00f3_eeee, cx).flex_1())
                    .child(text(value, 14.0 * s, 600, 0x00d6_cfd0, cx)),
            );
        }
        let mut no = div()
            .rounded(px(14.0 * s))
            .overflow_hidden()
            .border_1()
            .border_color(orbit::tint(0x00ff_ffff, 0.2))
            .bg(orbit::tint(0x0000_0000, 0.3));
        for name in [
            "Tu nombre y tu email",
            "Tus vueltas y tu telemetría",
            "Tus archivos",
        ] {
            no = no.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .p(px(16.0 * s))
                    .border_b_1()
                    .border_color(rgb(0x0029_2325))
                    .child(text(name, 15.0 * s, 400, 0x00f3_eeee, cx).line_through())
                    .child(text("NO SE ENVÍA", 10.0 * s, 700, 0x00ff_6b6b, cx)),
            );
        }
        div()
            .relative()
            .size_full()
            .px(px(70.0 * s))
            .flex()
            .flex_col()
            .justify_center()
            .gap(px(18.0 * s))
            .child(text(
                "LO QUE ENVIARÍA VANTARE",
                11.0 * s,
                700,
                0x00f3_eeee,
                cx,
            ))
            .child(heading(
                match (usage, crashes) {
                    (true, true) => "ESTO Y FALLOS, CON PERMISO.",
                    (true, false) => "SOLO ESTO, Y ANÓNIMO.",
                    (false, true) => "SOLO FALLOS, CON PERMISO.",
                    (false, false) => "NADA. ESTÁ APAGADO.",
                },
                46.0 * s,
                cx,
            ))
            .child(text(
                "Identificador aleatorio de instalación · sin nombre",
                14.0 * s,
                400,
                0x00f3_eeee,
                cx,
            ))
            .child(yes)
            .child(text(
                "Fallos: versión, sistema y código del fallo; se cambia aquí o en Ajustes. No se mide fluidez.",
                12.0 * s,
                400,
                0x00f3_eeee,
                cx,
            ))
            .child(text(
                "ESTOS DATOS NO SE ENVÍAN EN LA ANALÍTICA",
                11.0 * s,
                700,
                0x00ff_ffff,
                cx,
            ))
            .child(no)
    }
}
