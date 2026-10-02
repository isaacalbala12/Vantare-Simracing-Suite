use super::{
    Action, Hub, Page,
    text_rendering::{Grayscale, Paragraph},
    updates::LocalUpdate,
};
use crate::{Section, orbit};
use gpui::{
    Context, Div, IntoElement, Window, div, linear_color_stop, linear_gradient, prelude::*, px,
    rgb, rgba,
};
use orbit::{Tone, setting_row};

// El texto hereda 1,5 em del Hub Wails; las excepciones del CSS son explícitas.
fn text(
    content: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> Div {
    let weight = match weight {
        720 => 700,
        850 => 800,
        other => other,
    };
    // Las familias Inter W* ya contienen el peso; DirectWrite las registra
    // como Regular. Pedir además negrita sintetiza un segundo engrosado.
    orbit::text(content, size, weight, color, cx)
        .font_weight(
            if cx.global::<orbit::theme::Theme>().interface_font
                == orbit::theme::InterfaceFont::Inter
            {
                gpui::FontWeight::NORMAL
            } else {
                gpui::FontWeight(f32::from(weight))
            },
        )
        .font_features(gpui::FontFeatures(std::sync::Arc::new(vec![(
            "kern".into(),
            1,
        )])))
        .line_height(px(size * 1.5))
        .relative()
}

fn font(family: impl Into<gpui::SharedString>) -> gpui::Font {
    gpui::Font {
        features: gpui::FontFeatures(std::sync::Arc::new(vec![("kern".into(), 1)])),
        ..gpui::font(family)
    }
}

fn paragraph(content: &str, size: f32, weight: u16, color: u32, cx: &gpui::App) -> Div {
    div()
        .text_size(px(size))
        .line_height(px(size * 1.5))
        .child(Paragraph {
            text: content.to_owned().into(),
            runs: vec![gpui::TextRun {
                len: content.len(),
                font: gpui::Font {
                    weight: if cx.global::<orbit::theme::Theme>().interface_font
                        == orbit::theme::InterfaceFont::Inter
                    {
                        gpui::FontWeight::NORMAL
                    } else {
                        gpui::FontWeight(f32::from(weight))
                    },
                    ..font(orbit::sans_family(weight, cx))
                },
                color: rgb(color).into(),
                background_color: None,
                underline: None,
                strikethrough: None,
            }],
        })
}

fn tracked_text(
    content: &str,
    size: f32,
    weight: u16,
    color: u32,
    tracking: f32,
    cx: &gpui::App,
) -> Div {
    div().flex().gap(px(tracking)).children(
        content
            .chars()
            .map(|ch| text(ch.to_string(), size, weight, color, cx).flex_none()),
    )
}
// El kit de texto compartido conserva el kerning antes de aplicar el tracking.
// Div por carácter redondea cada avance y ensancha títulos largos.
fn page_title(label: &'static str) -> Div {
    div().h(px(51.0)).w_full().child(
        gpui::canvas(
            |bounds, _, _| bounds,
            move |_, bounds, window, cx| {
                use crate::orbit::typography::{baseline, draw, ink};
                draw(
                    window,
                    cx,
                    label,
                    f32::from(bounds.left()),
                    baseline(f32::from(bounds.top()), 51.0, 34.0),
                    &ink(34.0, 700.0, -0.035, rgb(orbit::ink(cx)).into()),
                );
            },
        )
        .size_full(),
    )
}

// KPIs y versión usan tracking negativo en orbit-kit/settings.css.
// El cursor conserva el kerning de Cascadia, sin redondear cada avance.
fn mono_tracked(content: String, size: f32, weight: f32, tracking: f32, color: u32) -> Div {
    div().h(px(size * 1.5)).w_full().child(
        gpui::canvas(
            |bounds, _, _| bounds,
            move |_, bounds, window, cx| {
                let run = gpui::TextRun {
                    len: content.len(),
                    font: gpui::Font {
                        weight: gpui::FontWeight(weight),
                        ..font("Cascadia Code")
                    },
                    color: rgb(color).into(),
                    background_color: None,
                    underline: None,
                    strikethrough: None,
                };
                let line =
                    window
                        .text_system()
                        .shape_line(content.clone().into(), px(size), &[run], None);
                let base = vantare_ui::efficiency::text::baseline(
                    f32::from(bounds.top()),
                    size * 1.5,
                    size,
                );
                let height = line.ascent + line.descent;
                let mut cursor = line.cursor();
                let mut spacing = px(0.0);
                for (byte, ch) in content.char_indices() {
                    let x = bounds.left() + cursor.x_offset() + spacing;
                    spacing += px(tracking);
                    let part = cursor.take_until(byte + ch.len_utf8());
                    if let Err(error) = part.paint(
                        gpui::point(x, px(base) - line.ascent),
                        height,
                        gpui::TextAlign::Left,
                        None,
                        window,
                        cx,
                    ) {
                        eprintln!("No se pudo pintar el valor monoespaciado: {error}");
                    }
                }
            },
        )
        .size_full(),
    )
}

fn eyebrow(content: &str, cx: &gpui::App) -> Div {
    tracked_text(
        &content.to_uppercase(),
        11.0,
        700,
        orbit::ink_3(cx),
        0.44,
        cx,
    )
}

fn stack() -> Div {
    div().flex().flex_col().w_full().min_w_0().gap(px(21.0))
}
fn columns() -> Div {
    div().flex().w_full().min_w_0().gap(px(21.0)).items_start()
}
fn section_text(
    content: &str,
    size: f32,
    weight: u16,
    color: u32,
    line_height: f32,
    cx: &gpui::App,
) -> Div {
    text(content, size, weight, color, cx).line_height(px(line_height))
}
fn section_row(label: &str, help: &str, control: impl IntoElement, cx: &gpui::App) -> Div {
    section_row_hint(label, help, control, 12.0, cx)
}
fn section_row_hint(
    label: &str,
    help: &str,
    control: impl IntoElement,
    hint_size: f32,
    cx: &gpui::App,
) -> Div {
    div()
        .min_h(px(54.0))
        .py(px(6.0))
        .flex()
        .items_center()
        .justify_between()
        .gap(px(16.0))
        .border_b_1()
        .border_color(rgba(orbit::line_row(cx)))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(2.5))
                .child(section_text(label, 13.5, 650, orbit::ink(cx), 20.25, cx))
                .child(section_text(
                    help,
                    hint_size,
                    400,
                    orbit::ink_3(cx),
                    if hint_size < 12.0 {
                        17.25
                    } else {
                        hint_size * 1.4
                    },
                    cx,
                )),
        )
        .child(control)
}
fn section_palette_row(label: &str, help: &str, palettes: Div, cx: &gpui::App) -> Div {
    div()
        .w_full()
        .min_h(px(54.0))
        .py(px(6.0))
        .flex()
        .flex_col()
        .border_b_1()
        .border_color(rgba(orbit::line_row(cx)))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(2.5))
                .child(section_text(label, 13.5, 650, orbit::ink(cx), 20.25, cx))
                .child(section_text(help, 12.0, 400, orbit::ink_3(cx), 16.8, cx)),
        )
        .child(palettes)
}
fn section_body() -> Div {
    div().flex().flex_col().px(px(21.0)).py(px(21.0))
}
fn section_surface(title: &str, meta: Option<&str>, body: Div, cx: &gpui::App) -> Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .overflow_hidden()
        .rounded(px(orbit::RADIUS))
        .border_1()
        .border_color(rgba(orbit::line(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0x1011_14c9, cx)))
        .child(
            div()
                .min_h(px(60.0))
                .px(px(20.0))
                .py(px(13.0))
                .flex()
                .items_center()
                .gap(px(12.0))
                .border_b_1()
                .border_color(rgba(crate::orbit::legacy_rgba(0xffff_ff0d, cx)))
                .child(text(title, 15.0, 700, orbit::ink(cx), cx))
                .when_some(meta, |head, value| {
                    let meta = if title == "Nivel de rendimiento" {
                        section_status(
                            value,
                            if value.starts_with("Activo") {
                                orbit::green(cx)
                            } else {
                                orbit::ember(cx)
                            },
                            cx,
                        )
                    } else {
                        text(value, 12.0, 500, orbit::ink_3(cx), cx)
                            .font_family(crate::orbit::mono_family(cx))
                    };
                    head.child(div().flex_1()).child(meta).when(
                        title == "Últimos eventos" && value == "8 en esta sesión",
                        |head| {
                            head.child(
                                small_button("settings-demo-copy-events", "Copiar", cx)
                                    .tab_stop(false),
                            )
                        },
                    )
                }),
        )
        .child(body)
}
fn section_note(content: &str, cx: &gpui::App) -> Div {
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
        .child(section_text(content, 12.0, 400, orbit::ink_3(cx), 18.0, cx))
}
fn section_status(content: &str, color: u32, cx: &gpui::App) -> Div {
    if orbit::is_mono(cx) {
        return orbit::pill(
            content,
            if color == orbit::ember(cx) {
                Tone::Warning
            } else {
                Tone::Success
            },
            cx,
        );
    }
    div()
        .h(px(29.0))
        .px(px(12.0))
        .flex_none()
        .flex()
        .items_center()
        .rounded_full()
        .border_1()
        .border_color(rgba(if color == orbit::ember(cx) {
            0xff9b_5722
        } else {
            0x78d6_8b38
        }))
        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff06, cx)))
        .child(section_text(
            &content.to_uppercase(),
            10.0,
            750,
            color,
            13.0,
            cx,
        ))
}
fn small_button(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .flex_none()
        .h(px(34.0))
        .px(px(12.0))
        .rounded(px(10.0))
        .border_1()
        .border_color(rgba(orbit::line(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff04, cx)))
        .flex()
        .items_center()
        .justify_center()
        .child(text(label, 12.0, 600, orbit::ink_3(cx), cx))
}
fn reference_choice(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_stop(false)
        .aria_description("Pendiente: sin contrato nativo")
        .w(px(168.0))
        .h(px(39.0))
        .px(px(13.0))
        .flex_none()
        .flex()
        .items_center()
        .justify_between()
        .rounded(px(12.0))
        .border_1()
        .border_color(rgba(orbit::line(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0xf5f3_f207, cx)))
        .child(text(label, 14.0, 500, orbit::ink_2(cx), cx))
        .child(text("⌄", 16.0, 400, orbit::ink_3(cx), cx))
}
fn reference_schemes(selected: usize, hub: &Hub, cx: &mut Context<Hub>) -> Div {
    let mut schemes = div().flex().flex_none().gap(px(6.0));
    for (index, label) in ["Sistema", "Claro", "Oscuro"].into_iter().enumerate() {
        schemes = schemes.child(
            div()
                .id(("settings-scheme", index))
                .role(gpui::Role::Button)
                .aria_label(label)
                .aria_selected(index == selected)
                .track_focus(&hub.settings.appearance_focus[7 + index])
                .tab_index(0)
                .cursor_pointer()
                .on_click(
                    cx.listener(move |hub, _, window, cx| hub.settings_scheme(index, window, cx)),
                )
                .on_key_down(
                    cx.listener(move |hub, event: &gpui::KeyDownEvent, window, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            hub.settings_scheme(index, window, cx);
                            cx.stop_propagation();
                        }
                    }),
                )
                .h(px(34.0))
                .px(px(12.0))
                .flex()
                .items_center()
                .rounded(px(9.0))
                .border_1()
                .border_color(if index == selected {
                    rgb(orbit::carmine(cx))
                } else {
                    rgba(orbit::line(cx))
                })
                .bg(if index == selected {
                    linear_gradient(
                        90.0,
                        linear_color_stop(rgba(crate::orbit::legacy_rgba(0xd52f_491c, cx)), 0.0),
                        linear_color_stop(rgba(crate::orbit::legacy_rgba(0xd52f_4905, cx)), 1.0),
                    )
                } else {
                    gpui::Background::from(rgb(orbit::surface_1(cx)))
                })
                .child(text(
                    label,
                    16.0,
                    400,
                    if index == selected {
                        orbit::ink(cx)
                    } else {
                        orbit::ink_2(cx)
                    },
                    cx,
                )),
        );
    }
    schemes
}
fn reference_primary(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_stop(false)
        .aria_description("Pendiente: sin contrato nativo")
        .flex_none()
        .h(px(39.0))
        .px(px(14.0))
        .rounded(px(12.0))
        .border_1()
        .border_color(rgba(0x0000_0000))
        .bg(rgb(orbit::primary_bg(cx)))
        .flex()
        .items_center()
        .justify_center()
        .child(text(
            label,
            12.0,
            600,
            cx.global::<crate::orbit::theme::Theme>().primary_ink,
            cx,
        ))
}
fn privacy_bullet(content: &str, cx: &gpui::App) -> Div {
    div()
        .flex()
        .items_start()
        .ml(px(18.0))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(paragraph(content, 16.0, 400, orbit::ink_2(cx), cx)),
        )
}
fn palette_card(
    index: usize,
    name: &str,
    light: u32,
    dark: u32,
    active: bool,
    scheme: Option<usize>,
    cx: &gpui::App,
) -> gpui::Stateful<Div> {
    div()
        .id(("settings-palette-card", index))
        .role(gpui::Role::Button)
        .aria_label(name)
        .aria_selected(active)
        .tab_stop(false)
        .w(px(166.4))
        .flex_none()
        .p(px(10.0))
        .flex()
        .flex_col()
        .items_center()
        .gap(px(7.0))
        .rounded(px(12.0))
        .border_1()
        .border_color(if active {
            rgb(orbit::carmine(cx))
        } else {
            rgba(orbit::line(cx))
        })
        .bg(rgb(orbit::surface_1(cx)))
        .child(
            div()
                .id(("settings-palette", index))
                .size(px(52.0))
                .flex_none()
                .p(px(4.0))
                .rounded_full()
                .border_1()
                .border_color(if active {
                    rgba(crate::orbit::legacy_rgba(0xf047_5599, cx))
                } else {
                    rgba(orbit::line_strong(cx))
                })
                .bg(rgba(0x0000_0000))
                .when(active, |swatch| {
                    swatch.shadow(vec![gpui::BoxShadow {
                        color: rgba(crate::orbit::legacy_rgba(0xf047_5526, cx)).into(),
                        offset: gpui::point(px(0.0), px(0.0)),
                        blur_radius: px(0.0),
                        spread_radius: px(2.0),
                        inset: false,
                    }])
                })
                .child(div().size_full().rounded_full().bg(linear_gradient(
                    135.0,
                    linear_color_stop(rgb(light), 0.5),
                    linear_color_stop(rgb(dark), 0.5),
                ))),
        )
        .child(text(name, 12.0, 400, orbit::ink_2(cx), cx).line_height(px(18.0)))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(10.0))
                .child(palette_variant(light, active && scheme == Some(1), cx))
                .child(palette_variant(dark, active && scheme == Some(2), cx)),
        )
        .aria_description("Pendiente: sin contrato nativo")
}
fn palette_variant(color: u32, active: bool, cx: &gpui::App) -> Div {
    div()
        .relative()
        .size(px(23.0))
        .flex_none()
        .rounded_full()
        .border_2()
        .border_color(rgba(orbit::line_strong(cx)))
        .bg(rgb(color))
        .when(active, |variant| {
            variant.child(
                div()
                    .absolute()
                    .left(px(-6.0))
                    .top(px(-6.0))
                    .size(px(31.0))
                    .rounded_full()
                    .border_2()
                    .border_color(rgb(orbit::carmine(cx))),
            )
        })
}
fn disabled_toggle(
    id: &'static str,
    label: &str,
    value: bool,
    cx: &gpui::App,
) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Switch)
        .aria_label(label)
        .tab_stop(false)
        .aria_description("Pendiente: sin contrato nativo")
        .w(px(44.0))
        .h(px(24.0))
        .flex_none()
        .p(px(3.0))
        .rounded_full()
        .flex()
        .when(value, |toggle| {
            toggle.justify_end().bg(linear_gradient(
                130.0,
                linear_color_stop(rgb(orbit::red(cx)), 0.0),
                linear_color_stop(rgb(orbit::carmine(cx)), 1.0),
            ))
        })
        .when(!value, |toggle| {
            toggle.bg(rgb(crate::orbit::legacy_rgb(0x0015_1619, cx)))
        })
        .child(div().size(px(18.0)).rounded_full().bg(rgb(if value {
            0x001e_171c
        } else {
            orbit::ink_muted(cx)
        })))
}
fn appearance_slider(
    value: f32,
    min: f32,
    max: f32,
    label: &'static str,
    cx: &gpui::App,
) -> gpui::Stateful<Div> {
    let fraction = ((value - min) / (max - min)).clamp(0.0, 1.0);
    let fill = 128.0 * fraction;
    div()
        .id(if label == "Contraste" {
            "settings-contrast-slider"
        } else {
            "settings-glass-slider"
        })
        .role(gpui::Role::Slider)
        .aria_label(label)
        .w(px(185.0))
        .flex()
        .flex_none()
        .items_center()
        .gap(px(12.0))
        .child(
            div().w(px(45.0)).flex_none().text_right().child(
                text(format!("{value:.0}%"), 16.0, 400, orbit::ink_2(cx), cx)
                    .font_family(crate::orbit::mono_family(cx)),
            ),
        )
        .child(
            div()
                .relative()
                .w(px(128.0))
                .h(px(20.0))
                .child(
                    div()
                        .absolute()
                        .left_0()
                        .top(px(7.0))
                        .w(px(128.0))
                        .h(px(6.0))
                        .rounded(px(3.0))
                        .bg(rgb(orbit::primary_bg(cx))),
                )
                .child(
                    div()
                        .absolute()
                        .left_0()
                        .top(px(7.0))
                        .w(px(fill))
                        .h(px(6.0))
                        .rounded(px(3.0))
                        .bg(rgb(orbit::carmine(cx))),
                )
                .child(
                    div()
                        .absolute()
                        .left(px(fill - 8.0))
                        .top(px(2.0))
                        .size(px(14.0))
                        .rounded_full()
                        .bg(rgb(orbit::carmine(cx))),
                ),
        )
}
fn performance_choice(
    index: usize,
    title: &str,
    rate: &str,
    description: &str,
    selected: bool,
    cx: &gpui::App,
) -> gpui::Stateful<Div> {
    let meter = (0..5).fold(
        div()
            .w_full()
            .mt(px(1.0))
            .flex()
            .items_center()
            .gap(px(4.0)),
        |bars, step| {
            bars.child(div().flex_1().min_w_0().h(px(5.0)).rounded(px(2.0)).bg(rgb(
                if step < 5 - index {
                    if selected {
                        orbit::carmine(cx)
                    } else {
                        orbit::ink_4(cx)
                    }
                } else {
                    0x002a_2a2f
                },
            )))
        },
    );
    div()
        .id(("settings-performance", index))
        .role(gpui::Role::Button)
        .aria_label(title)
        .aria_selected(selected)
        .aria_description("Pendiente: sin contrato nativo")
        .tab_stop(false)
        .flex_1()
        .min_w_0()
        .h(px(167.0))
        .px(px(15.0))
        .pt(px(14.0))
        .pb(px(13.0))
        .flex()
        .flex_col()
        .gap(px(7.0))
        .rounded(px(14.0))
        .border_1()
        .border_color(if selected {
            rgba(crate::orbit::legacy_rgba(0xf047_5559, cx))
        } else {
            rgba(orbit::line(cx))
        })
        .bg(if selected {
            linear_gradient(
                160.0,
                linear_color_stop(rgba(crate::orbit::legacy_rgba(0x2412_15ff, cx)), 0.0),
                linear_color_stop(rgba(crate::orbit::legacy_rgba(0x0e0f_11ff, cx)), 0.7),
            )
        } else {
            gpui::Background::from(rgba(crate::orbit::legacy_rgba(0x1011_14c9, cx)))
        })
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(text(title, 15.0, 720, orbit::ink(cx), cx))
                .child(
                    div()
                        .size(px(7.0))
                        .rounded_full()
                        .border_1()
                        .border_color(rgb(orbit::ink_3(cx))),
                ),
        )
        .child(meter)
        .child(
            text(
                rate,
                11.0,
                600,
                if selected {
                    orbit::ink_2(cx)
                } else {
                    orbit::ink_3(cx)
                },
                cx,
            )
            .font_family(crate::orbit::mono_family(cx)),
        )
        .child(
            text(description, 12.0, 400, orbit::ink_3(cx), cx)
                .line_height(px(18.0))
                .top(px(1.0)),
        )
}
fn performance_mode(
    title: &str,
    rate: &str,
    description: &str,
    selected: bool,
    cx: &gpui::App,
) -> Div {
    div()
        .flex_1()
        .min_w_0()
        .h(px(100.0))
        .px(px(15.0))
        .pt(px(14.0))
        .pb(px(13.0))
        .flex()
        .flex_col()
        .gap(px(7.0))
        .rounded(px(14.0))
        .border_1()
        .border_color(if selected {
            rgba(crate::orbit::legacy_rgba(0xf047_5559, cx))
        } else {
            rgba(orbit::line(cx))
        })
        .bg(if selected {
            linear_gradient(
                160.0,
                linear_color_stop(rgba(crate::orbit::legacy_rgba(0x2412_15ff, cx)), 0.0),
                linear_color_stop(rgba(crate::orbit::legacy_rgba(0x0e0f_11ff, cx)), 0.7),
            )
        } else {
            gpui::Background::from(rgba(crate::orbit::legacy_rgba(0x1011_14c9, cx)))
        })
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(text(title, 15.0, 720, orbit::ink(cx), cx))
                .child(if selected {
                    orbit::status_dot(Tone::Success, 8.0, cx)
                } else {
                    div()
                        .size(px(8.0))
                        .rounded_full()
                        .border_1()
                        .border_color(rgb(orbit::ink_3(cx)))
                }),
        )
        .child(
            text(rate, 11.0, 600, orbit::ink_3(cx), cx).font_family(crate::orbit::mono_family(cx)),
        )
        .child(text(description, 12.0, 400, orbit::ink_3(cx), cx))
}
fn disabled_button(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<Div> {
    small_button(id, label, cx)
        .tab_stop(false)
        .opacity(0.55)
        .aria_description("Pendiente: sin contrato nativo")
}
fn hotkey_keycaps(keys: [&str; 3], cx: &gpui::App) -> Div {
    let mut keycaps = div().flex().flex_none().items_center().gap(px(4.0));
    for (key_index, key) in keys.into_iter().enumerate() {
        if key_index > 0 {
            keycaps = keycaps.child(div().px(px(3.0)).child(text(
                "+",
                16.0,
                400,
                orbit::ink_muted(cx),
                cx,
            )));
        }
        keycaps = keycaps.child(
            div()
                .min_w(px(30.0))
                .h(px(28.0))
                .px(px(9.0))
                .flex()
                .items_center()
                .justify_center()
                .rounded(px(7.0))
                .border_1()
                .border_color(rgba(orbit::line_strong(cx)))
                .border_b(px(2.5))
                .border_color(rgba(crate::orbit::legacy_rgba(0xffff_ff38, cx)))
                .bg(linear_gradient(
                    180.0,
                    linear_color_stop(rgb(orbit::surface_3(cx)), 0.0),
                    linear_color_stop(rgb(orbit::surface_2(cx)), 1.0),
                ))
                .child(
                    text(key, 12.0, 700, orbit::ink_2(cx), cx)
                        .font_family(crate::orbit::mono_family(cx))
                        .font_weight(gpui::FontWeight(700.0)),
                ),
        );
    }
    keycaps
}
impl Hub {
    fn settings_button(
        &self,
        id: &'static str,
        label: &str,
        action: Action,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<Div> {
        let enabled = match action {
            Action::PrepareDiagnostic => !self.settings.busy,
            Action::CopyDiagnostic => self.settings.diagnostic.is_some(),
        };
        (if matches!(action, Action::PrepareDiagnostic) {
            reference_primary(id, label, cx)
                .aria_description("Preparar informe de diagnóstico local")
        } else {
            small_button(id, label, cx)
        })
        .track_focus(&self.settings.action_focus[action as usize])
        .tab_stop(enabled)
        .when(!enabled, |button| button.opacity(orbit::DISABLED))
        .on_click(cx.listener(move |this, _, window, cx| {
            if enabled {
                this.settings.action_focus[action as usize].focus(window, cx);
                this.settings_action(action, cx);
            }
        }))
        .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
            if enabled && matches!(event.keystroke.key.as_str(), "enter" | "space") {
                this.settings_action(action, cx);
                cx.stop_propagation();
            }
        }))
    }
    pub(in crate::shell) fn settings_header(&self, cx: &gpui::App) -> Div {
        div().ml(px(-1.0)).child(Grayscale(
            div()
                .flex()
                .flex_col()
                .mt(px(-1.0))
                .child(eyebrow("Preferencias", cx).line_height(px(13.2)))
                .child(page_title(self.settings.page.title()).mt(px(8.0)))
                .child(
                    text(
                        self.settings.page.description(),
                        13.5,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    )
                    .line_height(px(20.925))
                    .mt(px(9.0)),
                )
                .into_any_element(),
        ))
    }
    fn settings_search(&self, cx: &Context<Self>) -> Div {
        div().px(px(14.0)).py(px(18.0)).child(
            div()
                .relative()
                .rounded_full()
                .overflow_hidden()
                .child(self.settings.query.clone())
                .when(self.settings.query.read(cx).value.is_empty(), |search| {
                    search.child(div().absolute().left(px(13.0)).top(px(10.0)).child(text(
                        "Buscar ajustes...",
                        13.5,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )))
                }),
        )
    }
    pub(in crate::shell) fn settings_column(&self, window: &Window, cx: &mut Context<Self>) -> Div {
        let query = super::search_text(&self.settings.query.read(cx).value);
        let mut rows = stack().gap_1();
        let mut found = false;
        for (index, (section, label, subtitle)) in
            [(Section::Account, "Cuenta", "Sesión, plan y dispositivos")]
                .into_iter()
                .enumerate()
        {
            if super::search_text(&format!("{label} {subtitle}")).contains(&query) {
                found = true;
                rows = rows.child(
                    orbit::nav_item(
                        label,
                        label,
                        subtitle,
                        self.settings.page == Page::Account,
                        cx,
                    )
                    .mx(px(0.0))
                    .px(px(11.0))
                    .py(px(7.0))
                    .h(px(52.0))
                    .track_focus(&self.settings.nav_focus[index])
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.settings.nav_focus[index].focus(window, cx);
                        this.navigate(section, cx);
                    }))
                    .on_key_down(cx.listener(
                        move |this, event: &gpui::KeyDownEvent, _, cx| {
                            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                this.navigate(section, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
                );
            }
        }
        for (index, page) in Page::ALL.into_iter().enumerate() {
            let focus_index = index + 2;
            if page.matches(&query) {
                found = true;
                rows = rows.child(
                    orbit::nav_item(
                        page.label(),
                        page.label(),
                        page.subtitle(),
                        page == self.settings.page,
                        cx,
                    )
                    .mx(px(0.0))
                    .px(px(11.0))
                    .py(px(7.0))
                    .h(px(52.0))
                    .track_focus(&self.settings.nav_focus[focus_index])
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.settings.nav_focus[focus_index].focus(window, cx);
                        this.select_settings_page(page, cx);
                    }))
                    .on_key_down(cx.listener(
                        move |this, event: &gpui::KeyDownEvent, _, cx| {
                            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                this.select_settings_page(page, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
                );
            }
        }
        if !found {
            rows = rows.child(orbit::empty_state(
                "Sin resultados",
                "Busca otra sección o ajuste.",
                cx,
            ));
        }
        orbit::column(
            "Ajustes",
            if self.demo.is_some() {
                "v0.3.10"
            } else {
                env!("CARGO_PKG_VERSION")
            },
            cx,
        )
        .w(px(orbit::column_width(f32::from(
            window.viewport_size().width,
        ))))
        .child(
            div()
                .px(px(24.0))
                .pt(px(24.0))
                .child(eyebrow("Secciones", cx)),
        )
        .child(self.settings_search(cx))
        .child(
            div()
                .id("settings-nav")
                .flex_1()
                .min_w_0()
                .min_h_0()
                .overflow_y_scroll()
                .child(rows),
        )
    }
    pub(in crate::shell) fn settings(&self, cx: &mut Context<Self>) -> gpui::Stateful<Div> {
        self.sync_settings_preferences(cx);
        if self.capture.as_ref().is_some_and(|capture| {
            matches!(
                capture.name.as_str(),
                "ajustes-apariencia-detalle"
                    | "ajustes-rendimiento-detalle"
                    | "ajustes-diagnostico-detalle"
            )
        }) {
            self.settings.panel_scroll.scroll_to_bottom();
        }
        let content = stack()
            .when(
                matches!(self.settings.page, Page::Updates | Page::Privacy),
                |content| content.pr(px(10.0)),
            )
            .when_some(self.settings.status.clone(), |view, status| {
                view.child(orbit::callout(status, cx))
            })
            .child(match self.settings.page {
                Page::Application => self.settings_application(cx),
                Page::Account => {
                    div().child(self.remote.update(cx, |remote, cx| remote.account(cx)))
                }
                Page::Appearance => self.settings_appearance(cx),
                Page::Performance => self.settings_performance(cx),
                Page::Updates => self.settings_updates(cx),
                Page::Hotkeys => self.settings_hotkeys(cx),
                Page::Privacy => self.settings_privacy(cx),
                Page::Diagnostics => self.settings_diagnostics(cx),
            });
        div()
            .id("settings-panel")
            .mx(px(-1.0))
            .mt(px(-9.0))
            // La shell permite altura intrínseca: el panel reserva el viewport
            // menos topbar, cabecera, separación y pie, como `.orbit-set`.
            .h(px(self.settings.panel_height))
            .flex_none()
            .min_h_0()
            .w_auto()
            .overflow_y_scroll()
            .track_scroll(&self.settings.panel_scroll)
            .child(Grayscale(content.into_any_element()))
    }
    fn settings_zoom(cx: &gpui::App) -> gpui::Stateful<Div> {
        div()
            .id("settings-zoom-control")
            .role(gpui::Role::Group)
            .aria_label("Zoom de la interfaz")
            .w(px(156.0))
            .h(px(44.0))
            .flex()
            .items_center()
            .overflow_hidden()
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::line_strong(cx)))
            .bg(rgb(orbit::surface_2(cx)))
            .child(
                div()
                    .size(px(44.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(text("−", 16.0, 700, orbit::ink_muted(cx), cx)),
            )
            .child(
                div()
                    .w(px(68.0))
                    .h_full()
                    .flex()
                    .items_center()
                    .justify_center()
                    .border_l_1()
                    .border_r_1()
                    .border_color(rgba(orbit::line_row(cx)))
                    .child(text("100%", 13.0, 700, orbit::ink(cx), cx)),
            )
            .child(
                div()
                    .size(px(44.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(text("+", 16.0, 700, orbit::ink(cx), cx)),
            )
    }
    fn settings_application(&self, cx: &Context<Self>) -> Div {
        let zoom = Self::settings_zoom(cx);
        let interface = section_surface(
            "Interfaz",
            None,
            section_body()
                .child(section_row(
                    "Zoom de la interfaz",
                    "Amplía o reduce toda la app. Atajos: Ctrl +, Ctrl −, Ctrl 0 o Ctrl + rueda.",
                    zoom,
                    cx,
                ))
                .child(section_row(
                    "Idioma",
                    "Idioma de la interfaz del hub.",
                    reference_choice(
                        "settings-hub-language",
                        &self.settings.hub_language.read(cx).state.options[0].label,
                        cx,
                    ),
                    cx,
                ))
                .child(
                    section_row(
                        "Densidad",
                        "Altura de filas, espaciado y radios.",
                        reference_choice(
                            "settings-density",
                            &self.settings.density.read(cx).state.options[1].label,
                            cx,
                        ),
                        cx,
                    )
                    .border_b_0(),
                )
                .when(self.demo.is_none(), |body| {
                    body.child(section_row(
                        "Idioma de widgets",
                        "Se guarda en el layout compartido de Overlay Studio.",
                        self.settings.language.clone(),
                        cx,
                    ))
                    .child(
                        section_row(
                            "Unidades de widgets",
                            "Preferencias reales del layout activo.",
                            self.settings.units.clone(),
                            cx,
                        )
                        .border_b_0(),
                    )
                }),
            cx,
        )
        .flex_1();
        let system = Self::settings_system(cx);
        let open_language = self
            .capture
            .as_ref()
            .is_some_and(|capture| capture.name == "ajustes-idioma-desplegado");
        let mut view = columns().child(interface).child(system);
        if open_language {
            // El banco incluye un estado con el selector abierto. Las opciones
            // se dibujan como vista de referencia inerte porque el Hub nativo
            // todavía no guarda el idioma de interfaz.
            view = view.relative().child(
                div()
                    .absolute()
                    .size_full()
                    .child(Self::settings_language_menu(cx)),
            );
        }
        view
    }
    fn settings_language_menu(cx: &gpui::App) -> Div {
        let mut menu = div()
            .absolute()
            .top(px(205.0))
            .left(px(301.0))
            .w(px(168.0))
            .h(px(160.0))
            .overflow_hidden()
            .p(px(6.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::line_strong(cx)))
            .bg(rgb(orbit::surface_2(cx)))
            .shadow(vec![gpui::BoxShadow {
                color: rgba(0x0000_0099).into(),
                offset: gpui::point(px(0.0), px(24.0)),
                blur_radius: px(70.0),
                spread_radius: px(0.0),
                inset: false,
            }]);
        for (index, language) in ["Español", "English", "Português", "Italiano"]
            .into_iter()
            .enumerate()
        {
            menu = menu.child(
                div()
                    .h(px(38.0))
                    .px(px(10.0))
                    .flex()
                    .items_center()
                    .justify_between()
                    .rounded(px(8.0))
                    .when(index == 0, |item| item.bg(rgba(orbit::line_row(cx))))
                    .child(text(
                        language,
                        orbit::BODY,
                        if index == 0 { 650 } else { 400 },
                        if index == 0 {
                            orbit::ink(cx)
                        } else {
                            orbit::ink_2(cx)
                        },
                        cx,
                    ))
                    .when(index == 0, |item| {
                        item.child(text("✓", orbit::SECONDARY, 650, orbit::coral(cx), cx))
                    }),
            );
        }
        menu.child(
            div()
                .absolute()
                .right(px(2.0))
                .top(px(4.0))
                .w(px(6.0))
                .h(px(148.0))
                .rounded_full()
                .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff24, cx))),
        )
    }
    fn settings_system(cx: &gpui::App) -> Div {
        section_surface(
            "Sistema",
            None,
            section_body()
                .child(section_row(
                    "Inicio con Windows",
                    "Esta plataforma no permite abrir Vantare al iniciar sesión.",
                    disabled_toggle("settings-startup", "Inicio con Windows", false, cx),
                 cx))
                .child(section_row(
                    "Empezar minimizado",
                    "Arranca en la bandeja, sin abrir la ventana.",
                    disabled_toggle("settings-minimized", "Empezar minimizado", false, cx),
                 cx))
                .child(section_row(
                    "Avisos de actualización",
                    "Banner en la shell cuando hay una versión nueva.",
                    disabled_toggle("settings-notify-update", "Avisos de actualización", true, cx),
                 cx))
                .child(section_row(
                    "Avisos del Launcher",
                    "Toast cuando termina una cadena de arranque.",
                    disabled_toggle("settings-notify-launcher", "Avisos del Launcher", true, cx),
                 cx))
                .child(section_row(
                    "Notificaciones del sistema",
                    "Esta plataforma no admite notificaciones de escritorio.",
                    disabled_toggle(
                        "settings-notify-system",
                        "Notificaciones del sistema",
                        false,
                     cx),
                 cx))
                .child(
                    section_row(
                        "Probar notificación",
                        "Envía un aviso ahora sin cambiar tus preferencias.",
                        disabled_button("settings-notify-test", "Enviar prueba", cx),
                     cx)
                    .border_b_0(),
                )
                .child(section_note(
                    "«Cerrar a la bandeja» y «Unidades» no existen todavía en la configuración de la app, así que no se pintan: no habría nada que guardar detrás del control.",
                 cx)),
         cx)
        .flex_1()
    }
    fn settings_appearance(&self, cx: &mut Context<Self>) -> Div {
        let colors = [
            ("Vantare", 0x00f6_e8e8, 0x00a9_1d3e),
            ("Rosa", 0x00f8_dbe9, 0x00a8_316c),
            ("Bosque", 0x00db_f0e1, 0x0026_714d),
            ("Océano", 0x00d9_eff5, 0x0024_6a91),
            ("Ámbar", 0x00f7_e4d4, 0x00a6_5b30),
            ("Iris", 0x00e8_def8, 0x0066_46a8),
            ("Grises", 0x00e9_e9e9, 0x0030_3030),
        ];
        let settings = self.settings.appearance.settings;
        let selected_scheme = Some(match settings.scheme {
            orbit::theme::Scheme::System => 0,
            orbit::theme::Scheme::Light => 1,
            orbit::theme::Scheme::Dark => 2,
        });
        let mut palettes = div().w_full().mt(px(16.0)).flex().flex_wrap().gap(px(6.0));
        for (index, (name, light, dark)) in colors.into_iter().enumerate() {
            palettes = palettes.child(
                palette_card(
                    index,
                    name,
                    light,
                    dark,
                    index == settings.palette as usize,
                    selected_scheme,
                    cx,
                )
                .track_focus(&self.settings.appearance_focus[index])
                .tab_index(0)
                .cursor_pointer()
                .on_click(
                    cx.listener(move |hub, _, window, cx| hub.settings_palette(index, window, cx)),
                )
                .on_key_down(cx.listener(
                    move |hub, event: &gpui::KeyDownEvent, window, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            hub.settings_palette(index, window, cx);
                            cx.stop_propagation();
                        }
                    },
                )),
            );
        }
        let contrast = self.settings_slider(0, cx);
        let opacity = self.settings_slider(1, cx);
        div()
            .w_full()
            .max_w(px(900.0))
            .child(section_surface(
                "Apariencia",
                None,
                section_body()
                    .child(section_palette_row(
                    "Paleta de colores",
                    "Cambia los colores de la interfaz sin alterar su diseño.",
                    palettes,
                 cx))
                .child(section_row(
                    "Apariencia",
                    "Elige claro, oscuro o sigue el ajuste de Windows.",
                    reference_schemes(selected_scheme.unwrap_or(2), self, cx),
                 cx))
                .child(section_row(
                    "Contraste",
                    "Ajusta la legibilidad del texto secundario y los bordes.",
                    contrast,
                 cx))
                .child(section_row(
                    "Opacidad del cristal",
                    "Controla cuánto dejan ver el fondo los paneles y la cabecera.",
                    opacity,
                 cx))
                .child(section_row(
                    "Fuente de interfaz",
                    "Se aplica a menús, controles y textos de la aplicación.",
                    self.settings.font.clone(),
                 cx))
                .child(
                    section_row(
                        "Fuente monoespaciada",
                        "Se aplica a cifras y textos técnicos de la interfaz.",
                        self.settings.mono.clone(),
                     cx)
                    .border_b_0(),
                )
                .child(
                    div()
                        .w_full()
                        .px(px(15.0))
                        .py(px(12.0))
                        .flex()
                        .flex_col()
                        .gap(px(5.0))
                        .rounded(px(10.0))
                        .border_1()
                        .border_color(rgba(orbit::line(cx)))
                        .bg(rgb(orbit::surface_1(cx)))
                        .child(text(
                            "Vista previa de la interfaz y sus cifras",
                            16.0,
                            400,
                            orbit::ink(cx),
                         cx))
                        .child(
                            div()
                                .font_family(crate::orbit::mono_family(cx))
                                .child(
                                    text("01:23.456 · LMU / Vantare", 16.0, 400, orbit::ink_2(cx), cx)
                                        .font_family(crate::orbit::mono_family(cx)),
                                ),
                        ),
                )
                .child(section_row(
                    "Reducir animaciones",
                    "Preferencia local de esta app; la del sistema se respeta siempre.",
                    disabled_toggle("settings-motion", "Reducir animaciones", false, cx),
                 cx).border_b_0())
                .child(section_note(
                    "La apariencia de los widgets del overlay se configura por separado en Overlay Studio.",
                 cx)),
             cx))
    }
    fn settings_slider(&self, index: usize, cx: &mut Context<Self>) -> gpui::Stateful<Div> {
        let settings = self.settings.appearance.settings;
        let (value, min, max, label) = if index == 0 {
            (settings.contrast, 80.0, 120.0, "Contraste")
        } else {
            (settings.glass_opacity, 50.0, 100.0, "Opacidad del cristal")
        };
        let entity = cx.entity();
        appearance_slider(f32::from(value), min, max, label, cx)
            .relative()
            .track_focus(&self.settings.appearance_focus[10 + index])
            .tab_index(0)
            .cursor_pointer()
            .child(
                gpui::canvas(
                    move |bounds, _, cx| {
                        entity.update(cx, |hub, _| {
                            hub.settings.appearance_bounds[index] = Some(bounds)
                        });
                    },
                    |_, (), _, _| {},
                )
                .absolute()
                .size_full(),
            )
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(move |hub, event: &gpui::MouseDownEvent, window, cx| {
                    hub.settings.appearance_focus[10 + index].focus(window, cx);
                    if hub.settings.appearance_bounds[index]
                        .is_some_and(|bounds| event.position.x >= bounds.left() + px(57.0))
                    {
                        hub.settings.appearance_dragging[index] = true;
                        hub.settings_slider_pointer(index, event.position.x, window, cx);
                    }
                }),
            )
            .on_mouse_move(
                cx.listener(move |hub, event: &gpui::MouseMoveEvent, window, cx| {
                    if hub.settings.appearance_dragging[index]
                        && event.pressed_button == Some(gpui::MouseButton::Left)
                    {
                        hub.settings_slider_pointer(index, event.position.x, window, cx);
                    }
                }),
            )
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(move |hub, _, _, _| hub.settings.appearance_dragging[index] = false),
            )
            .on_mouse_up_out(
                gpui::MouseButton::Left,
                cx.listener(move |hub, _, _, _| hub.settings.appearance_dragging[index] = false),
            )
            .on_key_down(
                cx.listener(move |hub, event: &gpui::KeyDownEvent, window, cx| {
                    let current = if index == 0 {
                        hub.settings.appearance.settings.contrast
                    } else {
                        hub.settings.appearance.settings.glass_opacity
                    };
                    let (min, max) = if index == 0 { (80, 120) } else { (50, 100) };
                    let value = match event.keystroke.key.as_str() {
                        "left" | "down" => current.saturating_sub(1).max(min),
                        "right" | "up" => current.saturating_add(1).min(max),
                        "home" => min,
                        "end" => max,
                        _ => return,
                    };
                    hub.settings_slider_value(index, value, window, cx);
                    cx.stop_propagation();
                }),
            )
    }
    fn settings_performance(&self, cx: &gpui::App) -> Div {
        let choices = [
            (
                "Máximo",
                "Frecuencia del monitor",
                "Sin recortes. Todo a la tasa de tu monitor. Para PCs sobrados.",
            ),
            (
                "Alto",
                "60 fps",
                "Frescura máxima. Sin animaciones de adorno.",
            ),
            (
                "Equilibrado",
                "40 fps",
                "Recorta lo que el ojo no distingue. Recomendado.",
            ),
            (
                "Ahorro",
                "30 fps",
                "Solo datos, sin efectos. Para portátiles y gráficas integradas.",
            ),
            (
                "Mínimo",
                "20 fps",
                "Vantare casi invisible para el sistema. Para VR, streaming en el mismo PC o PCs apurados.",
            ),
        ];
        let mut levels = div().flex().w_full().min_w_0().gap(px(12.0));
        for (index, (name, rate, description)) in choices.into_iter().enumerate() {
            levels = levels.child(performance_choice(
                index,
                name,
                rate,
                description,
                false,
                cx,
            ));
        }
        let custom_auto = div()
            .flex()
            .w_full()
            .min_w_0()
            .gap(px(12.0))
            .child(performance_mode(
                "Personalizado",
                "Sin perfil activo",
                "Elige la cadencia widget a widget; cada aumento muestra su coste de CPU.",
                false,
                cx,
            ))
            .child(performance_mode(
                "Automático",
                "Próximamente",
                "Vantare mide tu PC en carrera y se ajusta solo (entre Alto y Mínimo).",
                true,
                cx,
            ));
        section_surface(
            "Nivel de rendimiento",
            Some(if self.demo.is_some() { "Activo ahora · Equilibrado · 40 fps · elegido por ti" } else { "Sin estado de rendimiento nativo" }),
            section_body()
                .gap(px(12.0))
                .child(levels)
                .child(custom_auto)
                .child(text(
                    "Personalizado se guarda en el perfil activo; los cinco niveles son el valor predeterminado de la app.",
                    orbit::SECONDARY,
                    400,
                    orbit::ink_3(cx),
                 cx).mt(px(-8.0)).line_height(px(18.0))),
         cx)
    }
    fn settings_updates(&self, cx: &gpui::App) -> Div {
        let (version, state, channel) = if let Some(demo) = &self.demo {
            (
                demo.versions.current.clone(),
                format!("Stable · {} disponible", demo.versions.pending),
                Some("Stable"),
            )
        } else {
            match &self.settings.update {
                LocalUpdate::Unread => ("—".into(), "sin respuesta del actualizador".into(), None),
                LocalUpdate::Development => (
                    format!("v{}", env!("CARGO_PKG_VERSION")),
                    "build de desarrollo · sin instalación local detectada".to_owned(),
                    None,
                ),
                LocalUpdate::Package {
                    version,
                    channel,
                    previous,
                } => (
                    format!("v{version}"),
                    format!(
                        "estado local leído · referencia anterior {}",
                        if *previous { "presente" } else { "ausente" }
                    ),
                    Some(match channel.as_str() {
                        "master" | "stable" => "Stable",
                        "testers" => "Testers",
                        "nightly" => "Nightly",
                        _ => "",
                    }),
                ),
                LocalUpdate::Invalid => (
                    "—".into(),
                    "estado local inválido o no legible".into(),
                    None,
                ),
            }
        };
        let news = section_surface(
            "Novedades",
            Some("docs/releases"),
            self.settings_release_news(cx),
            cx,
        );
        stack()
            .child(Self::settings_update_hero(
                version,
                state,
                self.demo.is_some(),
                cx,
            ))
            .child(Self::settings_update_channels(
                channel,
                self.demo.is_some(),
                cx,
            ))
            .child(news)
    }
    fn settings_release_news(&self, cx: &gpui::App) -> Div {
        let mut body = section_body().mt(px(-2.5));
        match super::releases::news() {
            Ok(releases) => {
                for release in releases {
                    body = body.child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(14.0))
                            .min_h(px(46.0))
                            .border_b_1()
                            .border_color(rgba(orbit::line_row(cx)))
                            .child(
                                div().w(px(96.0)).flex_none().child(
                                    text(
                                        release.tag.replace('-', "-\n"),
                                        12.0,
                                        700,
                                        orbit::coral(cx),
                                        cx,
                                    )
                                    .font_family(crate::orbit::mono_family(cx))
                                    .font_weight(gpui::FontWeight(700.0))
                                    .line_height(px(18.0)),
                                ),
                            )
                            .child(
                                div().flex_1().min_w_0().child(
                                    div()
                                        .text_size(px(12.5))
                                        .font_family(crate::orbit::sans_override("Inter W400", cx))
                                        .text_color(rgb(crate::orbit::legacy_rgb(0x00c9_c4c6, cx)))
                                        .line_height(px(18.75))
                                        .relative()
                                        .top(px(0.0))
                                        .child(Paragraph {
                                            text: format!(
                                                "{} — {}",
                                                release.title, release.summary
                                            )
                                            .into(),
                                            runs: vec![
                                                gpui::TextRun {
                                                    len: release.title.len(),
                                                    font: font("Inter W700"),
                                                    color: rgb(orbit::ink(cx)).into(),
                                                    background_color: None,
                                                    underline: None,
                                                    strikethrough: None,
                                                },
                                                gpui::TextRun {
                                                    len: 5 + release.summary.len(),
                                                    font: font("Inter W400"),
                                                    color: rgb(crate::orbit::legacy_rgb(
                                                        0x00c9_c4c6,
                                                        cx,
                                                    ))
                                                    .into(),
                                                    background_color: None,
                                                    underline: None,
                                                    strikethrough: None,
                                                },
                                            ],
                                        }),
                                ),
                            )
                            .child(
                                div()
                                    .flex_none()
                                    .px(px(8.0))
                                    .py(px(3.0))
                                    .rounded_full()
                                    .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff0d, cx)))
                                    .child(div().flex().gap(px(0.8)).children(
                                        release.channel.to_uppercase().chars().map(|ch| {
                                            text(ch.to_string(), 10.0, 750, orbit::ink_3(cx), cx)
                                                .w(px(6.0))
                                                .font_family(crate::orbit::mono_family(cx))
                                                .font_weight(gpui::FontWeight(750.0))
                                        }),
                                    )),
                            ),
                    );
                }
            }
            Err(error) => body = body.child(section_note(error, cx)),
        }
        // Wails reparte el espacio restante de Novedades y desplaza su cuerpo.
        div().child(
            div()
                .id("settings-release-news")
                .h(px((self.settings.panel_height - 367.0).max(80.0)))
                .overflow_y_scroll()
                .child(body),
        )
    }
    fn settings_update_hero(version: String, state: String, demo: bool, cx: &gpui::App) -> Div {
        div()
            .h(px(139.0))
            .w_full()
            .flex()
            .items_center()
            .gap(px(20.0))
            .px(px(22.0))
            .py(px(20.0))
            .rounded(px(orbit::RADIUS))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgb(orbit::surface_1(cx)))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(eyebrow("Versión instalada", cx))
                    .child(div().font_family(crate::orbit::mono_family(cx)).child(
                        mono_tracked(version, 30.0, 700.0, -1.2, orbit::ink(cx)).mt(px(4.0)),
                    ))
                    .child(text(state, 12.5, 400, orbit::ink_3(cx), cx).mt(px(4.0))),
            )
            .child(
                div()
                    .flex()
                    .flex_none()
                    .items_center()
                    .gap(px(12.0))
                    .child(reference_primary(
                        "settings-update-install",
                        if demo {
                            "Instalar v0.1.0.2"
                        } else {
                            "Instalar actualización"
                        },
                        cx,
                    ))
                    .child(reference_primary(
                        "settings-update-check",
                        "Buscar actualizaciones",
                        cx,
                    )),
            )
    }
    fn settings_update_channels(channel: Option<&str>, demo: bool, cx: &gpui::App) -> Div {
        let mut channels = div().flex().w_full().gap(px(21.0));
        for (index, (name, description)) in [
            ("Stable", "Versiones probadas para todo el mundo."),
            (
                "Testers",
                "Candidatas a Stable con el Testing Center activo.",
            ),
            ("Nightly", "Cada cambio publicado. Puede romperse."),
        ]
        .into_iter()
        .enumerate()
        {
            let active = channel == Some(name);
            channels = channels.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .min_h(px(125.0))
                    .px(px(18.0))
                    .py(px(16.0))
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .rounded(px(orbit::RADIUS))
                    .border_1()
                    .border_color(if active {
                        rgba(crate::orbit::legacy_rgba(0xf047_5559, cx))
                    } else {
                        rgba(orbit::line(cx))
                    })
                    .bg(if active {
                        rgba(crate::orbit::legacy_rgba(0xd52f_4910, cx))
                    } else {
                        rgb(orbit::surface_1(cx))
                    })
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(text(name, 15.0, 700, orbit::ink(cx), cx))
                            .child(if active {
                                orbit::status_dot(Tone::Success, 7.0, cx).into_any_element()
                            } else if index > 0 {
                                orbit::icon("i-lock", 13.0, orbit::ink_3(cx)).into_any_element()
                            } else {
                                text("⌄", 16.0, 400, orbit::ink_3(cx), cx).into_any_element()
                            }),
                    )
                    .child(
                        text(
                            format!(
                                "{description}{}",
                                if demo && index > 0 {
                                    " Requiere invitación."
                                } else {
                                    ""
                                }
                            ),
                            12.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        )
                        .line_height(px(18.0)),
                    )
                    .child(
                        text(
                            if demo {
                                [
                                    "v0.1.0.2 · 2/6/2026",
                                    "v0.1.0.7-testers.1 · 3/6/2026",
                                    "v0.1.0.7-nightly.11 · 5/6/2026",
                                ][index]
                            } else {
                                "sin versión publicada"
                            },
                            11.0,
                            600,
                            orbit::ink_3(cx),
                            cx,
                        )
                        .font_family(crate::orbit::mono_family(cx)),
                    ),
            );
        }
        channels
    }
    fn settings_hotkeys(&self, cx: &gpui::App) -> Div {
        let mut body = section_body();
        for (index, (label, help, keys)) in [
            (
                "Toggle overlay",
                "Muestra u oculta el overlay activo.",
                ["Ctrl", "Shift", "V"],
            ),
            (
                "Siguiente perfil",
                "Cambia al siguiente perfil guardado.",
                ["Ctrl", "Shift", "→"],
            ),
            (
                "Perfil anterior",
                "Cambia al perfil anterior.",
                ["Ctrl", "Shift", "←"],
            ),
            (
                "Cambiar referencia Delta",
                "Rota la referencia del widget Delta.",
                ["Ctrl", "Shift", "D"],
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let keycaps = hotkey_keycaps(keys, cx);
            body = body.child(
                section_row_hint(label, help, keycaps, 11.5, cx)
                    .id(("settings-hotkey", index))
                    .px(px(8.0))
                    .py(px(8.0))
                    .min_h(px(56.5))
                    .when(index == 3, gpui::Stateful::<Div>::border_b_0),
            );
        }
        stack().mt(px(7.0))
            .child(
                div()
                    .flex()
                    .w_full()
                    .items_start()
                    .justify_between()
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .max_w(px(520.0))
                            .flex()
                            .flex_col()
                            .gap(px(7.0))
                            .child(eyebrow("Atajos globales", cx).line_height(px(13.2)))
                            .child(text(
                                "Funcionan aunque Vantare esté en segundo plano. Pulsa una fila y después la combinación para reasignarla; los conflictos se marcan en ámbar.",
                                orbit::BODY,
                                400,
                                orbit::ink_2(cx),
                             cx).line_height(px(20.9))),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(10.0))
                            .child(disabled_button(
                                "settings-hotkeys-reset",
                                "Restablecer todos",
                             cx))
                            .child(section_status("Sin conflictos", orbit::green(cx), cx)),
                    ),
            )
            .child(
                div()
                    .w_full()
                    .max_w(px(490.0))
                    .child(section_surface("Overlay", Some("4 combinaciones"), body, cx)),
            )
            .child(section_note(
                if self.demo.is_some() { "La app registra estas cuatro combinaciones y ninguna más. Los grupos «Launcher y carrera», «Studio» y «Global» del prototipo no tienen atajos registrados todavía, así que no se pintan." } else { "El Hub nativo todavía no registra atajos globales. Las combinaciones se muestran como referencia y no se pueden reasignar aquí." },
             cx))
    }
    fn settings_privacy_consent(cx: &gpui::App) -> Div {
        let shared_bullets = div()
            .flex()
            .flex_col()
            .child(privacy_bullet(
                "Consumos, stints, pits, estrategias observadas y calidad ya derivados.",
                cx,
            ))
            .child(privacy_bullet(
                "Combinación del catálogo y semana ISO, nunca fecha u hora exactas.",
                cx,
            ))
            .child(privacy_bullet(
                "Un identificador administrativo separado para cuota y borrado.",
                cx,
            ));
        let never_bullets = div()
            .flex()
            .flex_col()
            .child(privacy_bullet(
                "Telemetría cruda ni archivos de sesión.",
                cx,
            ))
            .child(privacy_bullet(
                "Nombres, SteamID, correo ni rutas del equipo.",
                cx,
            ))
            .child(privacy_bullet(
                "Voz, audio, estrategias editables ni perfiles completos.",
                cx,
            ));
        let shared = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .child(text("Se comparte", 16.0, 700, orbit::ink(cx), cx))
            .child(shared_bullets);
        let never = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .child(text("Nunca se comparte", 16.0, 700, orbit::ink(cx), cx))
            .child(never_bullets);
        section_surface(
            "Consentimiento de contribución",
            None,
            section_body()
                .child(text(
                    "Si aceptas, Vantare puede preparar y subir automáticamente paquetes seudonimizados de Strategy. Cada paquete queda visible e inspeccionable antes del envío.",
                    16.0,
                    400,
                    orbit::ink(cx),
                 cx).line_height(px(24.0)).mt(px(0.0)))
                .child(columns().gap(px(16.0)).child(shared).child(never))
                .child(section_note(
                    "Los paquetes son seudonimizados, no anónimos. Los secretos de subida y borrado se generan al aceptar y permanecen en el almacén protegido de Windows.",
                 cx))
                .child(
                    div()
                        .mt(px(12.0)).mb(px(12.0))
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .gap(px(8.0))
                        .child(reference_primary(
                            "settings-consent",
                            "Aceptar y participar",
                         cx).opacity(0.55))
                        .child(disabled_button("settings-revoke", "Revocar consentimiento", cx))
                        .child(disabled_button(
                            "settings-delete-remote",
                            "Solicitar borrado remoto",
                         cx)),
                )
                .child(
                    div()
                        .mt(px(0.0))
                        .flex()
                        .items_start()
                        .child(section_status(
                            "Sin consentimiento activo: no se prepara ni envía nada",
                            orbit::ember(cx),
                         cx)),
                ),
         cx)
    }
    fn settings_privacy_queue(&self, cx: &gpui::App) -> Div {
        section_surface(
            "Cola e historial de envíos",
            Some(if self.demo.is_some() {
                "0 sin enviar · 0 enviados"
            } else {
                "no disponible"
            }),
            section_body()
                .child(section_note(
                    if self.demo.is_some() {
                        "Todavía no hay paquetes preparados."
                    } else {
                        "La cola de Strategy no está disponible en el Hub nativo."
                    },
                    cx,
                ))
                .child(
                    div()
                        .mt(px(2.0))
                        .flex()
                        .items_start()
                        .child(disabled_button(
                            "settings-send-next",
                            "Enviar siguiente",
                            cx,
                        )),
                ),
            cx,
        )
    }
    fn settings_privacy_history(&self, cx: &gpui::App) -> Div {
        section_surface(
            "Historial de borrado remoto",
            None,
            section_body()
                .child(section_note(
                    if self.demo.is_some() { "No hay solicitudes de borrado remoto registradas." } else { "No hay un contrato nativo para consultar borrados remotos." },
                 cx))
                .child(section_note(
                    "El borrado alcanza bundles, copias, índices, cachés e informes derivados. Los agregados irreversibles de cohortes ya publicadas no se pueden retirar individualmente.",
                 cx)),
         cx)
    }
    fn settings_privacy(&self, cx: &gpui::App) -> Div {
        div()
            .flex()
            .flex_col()
            .w_full()
            .min_w_0()
            .gap(px(14.0))
            .child(Self::settings_privacy_consent(cx))
            .child(self.settings_privacy_queue(cx))
            .child(self.settings_privacy_history(cx))
    }
    fn settings_events(&self, cx: &mut Context<Self>) -> Div {
        if self.demo.is_some() {
            return Self::settings_demo_events(cx);
        }
        let observed = &self.testing.read(cx).observed;
        let filter = self
            .settings
            .event_filter
            .read(cx)
            .state
            .selected
            .unwrap_or(0);
        let query = self.settings.event_query.read(cx).value.to_lowercase();
        let rows: Vec<_> = observed
            .errors
            .iter()
            .filter(|error| super::event_matches(error, filter, &query))
            .map(|error| {
                vec![
                    error.observed_at_utc.to_string(),
                    "Error".into(),
                    error.module.label().into(),
                    format!("{:?}", error.code),
                ]
            })
            .collect();
        let mut events = section_body();
        if rows.is_empty() {
            events = events.child(section_note(
                "El backend de esta sesión no publica su registro al hub, así que aquí no hay nada que enseñar. El informe de diagnóstico sí incluye el estado completo.",
             cx));
        } else {
            events = events.child(self.settings.event_filter.clone());
            events = events.child(self.settings.event_query.clone());
            let table = orbit::Table {
                headers: vec![
                    "UTC".into(),
                    "Nivel".into(),
                    "Módulo".into(),
                    "Código".into(),
                ],
                rows,
            };
            match table.render(cx) {
                Ok(table) => events = events.child(table),
                Err(error) => events = events.child(orbit::callout(error, cx)),
            }
        }
        section_surface("Últimos eventos", Some("sesión actual"), events, cx).flex_1()
    }
    fn settings_statistics(demo: bool, cx: &gpui::App) -> Div {
        let tiles = if demo {
            [
                (
                    "Telemetry Core",
                    "LMU conectado",
                    "fuente en vivo y disponible",
                ),
                ("Overlay", "Detenido", "sin perfil activo"),
                (
                    "CPU · memoria",
                    "—",
                    "esperando la primera muestra del backend",
                ),
                (
                    "Datos locales",
                    "45 MB",
                    "3 carpetas medidas por el backend",
                ),
            ]
        } else {
            [
                ("Telemetry Core", "—", "sin fuente conectada"),
                ("Overlay", "—", "sin perfil activo"),
                ("CPU · memoria", "—", "muestreo no disponible"),
                ("Datos locales", "—", "medición no disponible"),
            ]
        };
        let mut stats = div().grid().grid_cols(4).w_full().gap(px(21.0));
        for (label, value, help) in tiles {
            stats = stats.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h(px(107.0))
                    .px(px(18.0))
                    .py(px(15.0))
                    .flex()
                    .flex_col()
                    .rounded(px(orbit::RADIUS))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgba(crate::orbit::legacy_rgba(0x1011_14c9, cx)))
                    .child(
                        text(label.to_uppercase(), 11.0, 700, orbit::ink_3(cx), cx)
                            .line_height(px(13.2)),
                    )
                    .child(
                        mono_tracked(
                            value.to_owned(),
                            22.0,
                            700.0,
                            -0.66,
                            if demo && label == "Telemetry Core" {
                                orbit::green(cx)
                            } else {
                                orbit::ink(cx)
                            },
                        )
                        .mt(px(8.0)),
                    )
                    .child(
                        text(help, 11.5, 400, orbit::ink_4(cx), cx)
                            .mt(px(4.0))
                            .whitespace_nowrap()
                            .text_ellipsis(),
                    ),
            );
        }
        stats
    }
    fn settings_diagnostics(&self, cx: &mut Context<Self>) -> Div {
        let demo = self.demo.is_some();
        let stats = Self::settings_statistics(demo, cx);
        let data = section_surface(
            "Datos y registros",
            None,
            section_body()
                .child(section_row_hint(
                    "Carpeta de datos",
                    &if demo {
                        "C:\\Users\\piloto\\AppData\\Roaming\\Vantare\\configs".into()
                    } else {
                        self.settings.data.display().to_string()
                    },
                    small_button("settings-data-open", "Abrir", cx)
                        .tab_stop(false)
                        .aria_description("Sin acción nativa para abrir esta carpeta"),
                    12.0,
                    cx,
                ))
                .child(section_row_hint(
                    "Carpeta de registros",
                    if demo {
                        "C:\\Users\\piloto\\AppData\\Local\\Vantare\\logs"
                    } else {
                        "Sin contrato nativo de registro del Hub."
                    },
                    small_button("settings-logs-open", "Abrir", cx)
                        .tab_stop(false)
                        .aria_description("Sin ruta de registros disponible"),
                    12.0,
                    cx,
                ))
                .child(section_row_hint(
                    "Muestreo de CPU",
                    "Métrica de diagnóstico local.",
                    disabled_toggle("settings-cpu", "Muestreo de CPU", demo, cx),
                    12.0,
                    cx,
                ))
                .child(
                    section_row_hint(
                        "Informe de diagnóstico",
                        "Paquete saneado, listo para copiar o adjuntar.",
                        self.settings_button(
                            "settings-diagnostic-prepare",
                            if self.settings.busy {
                                "Preparando…"
                            } else {
                                "Preparar"
                            },
                            Action::PrepareDiagnostic,
                            cx,
                        )
                        .h(px(34.0))
                        .px(px(12.0)),
                        12.0,
                        cx,
                    )
                    .border_b_0(),
                ),
            cx,
        )
        .flex_1();
        let mut view = stack()
            .child(stats)
            .child(columns().child(data).child(self.settings_events(cx)));
        for detail in self.settings_diagnostic_report(cx) {
            view = view.child(detail);
        }
        view
    }
    fn settings_event_filters(cx: &gpui::App) -> Div {
        let mut filters = div()
            .flex()
            .items_center()
            .gap(px(2.5))
            .p(px(4.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::line_row(cx)));
        for (index, label) in ["Todos 8", "Info 5", "Aviso 2", "Error 1"]
            .into_iter()
            .enumerate()
        {
            filters = filters.child(
                div()
                    .h(px(29.0))
                    .px(px(10.0))
                    .rounded(px(8.0))
                    .flex()
                    .items_center()
                    .when(index == 0, |item| {
                        item.bg(rgba(crate::orbit::legacy_rgba(0xd52f_492e, cx)))
                            .border_1()
                            .border_color(rgba(crate::orbit::legacy_rgba(0xf047_554d, cx)))
                    })
                    .child(text(
                        label,
                        12.0,
                        650,
                        if index == 0 {
                            orbit::ink(cx)
                        } else {
                            orbit::ink_4(cx)
                        },
                        cx,
                    )),
            );
        }
        filters
    }
    fn settings_demo_events(cx: &gpui::App) -> Div {
        // Anillo del harness Wails (`wails-runtime-mock.ts`), sin observaciones
        // productivas ni envío. Las horas son las de la referencia congelada.
        let mut rows = section_body().gap(px(2.0));
        let filters = Self::settings_event_filters(cx);
        rows = rows.child(div().flex().mb(px(8.0)).child(filters));
        for (index, (time, level, message)) in [
            ("16:00:24", "INFO", "launcher: Le Mans Ultimate started"),
            (
                "16:00:02",
                "AVISO",
                "warning: hotkey Ctrl+Alt+O already registered by another app",
            ),
            ("15:59:35", "INFO", "updater: channel nightly selected"),
            (
                "15:59:00",
                "ERROR",
                "storage error: telemetry session chunk could not be written",
            ),
            (
                "15:58:38",
                "INFO",
                "overlay: profile 'Racing' loaded with 7 widgets",
            ),
            (
                "15:58:04",
                "AVISO",
                "warning: configs directory not found — hub profile CRUD disabled",
            ),
            ("15:57:45", "INFO", "telemetry: LMU shared memory attached"),
            (
                "15:57:32",
                "INFO",
                "HTTP server: listening on 127.0.0.1:39261",
            ),
        ]
        .into_iter()
        .enumerate()
        {
            rows = rows.child(
                div()
                    .flex()
                    .items_start()
                    .gap(px(10.0))
                    .px(px(6.0))
                    .py(px(4.0))
                    .rounded(px(5.0))
                    .bg(rgba(if level == "ERROR" {
                        0xff6a_5f14
                    } else if index % 2 == 0 {
                        orbit::line_row(cx)
                    } else {
                        0x0000_0000
                    }))
                    .child(
                        div().w(px(58.0)).flex_none().child(
                            text(time, 12.0, 400, orbit::ink_3(cx), cx)
                                .font_family(crate::orbit::mono_family(cx))
                                .line_height(px(18.0)),
                        ),
                    )
                    .child(
                        div()
                            .w(px(52.0))
                            .flex_none()
                            .relative()
                            .left(px(-1.0))
                            .child(mono_tracked(
                                level.to_owned(),
                                10.0,
                                700.0,
                                0.4,
                                match level {
                                    "ERROR" => orbit::coral(cx),
                                    "AVISO" => orbit::ember(cx),
                                    _ => orbit::ink_3(cx),
                                },
                            )),
                    )
                    .child(
                        div().flex_1().min_w_0().child(
                            text(message, 12.0, 400, orbit::ink_2(cx), cx)
                                .relative()
                                .left(px(-1.0))
                                .font_family(crate::orbit::mono_family(cx))
                                .line_height(px(18.0)),
                        ),
                    ),
            );
        }
        section_surface("Últimos eventos", Some("8 en esta sesión"), rows, cx).flex_1()
    }
    fn settings_diagnostic_report(&self, cx: &mut Context<Self>) -> Vec<Div> {
        let Some(diagnostic) = &self.settings.diagnostic else {
            return Vec::new();
        };
        let mut report = Vec::new();
        let mut body = section_body();
        for binary in &diagnostic.binaries {
            body = body.child(setting_row(
                binary.name,
                binary.state,
                orbit::chip(
                    if binary.sha256.is_some() {
                        "SHA-256 calculado"
                    } else {
                        "Hash no disponible"
                    },
                    Tone::Neutral,
                    cx,
                ),
                cx,
            ));
        }
        report.push(section_surface(
            "Informe de diagnóstico local",
            None,
            body,
            cx,
        ));
        match serde_json::to_string_pretty(diagnostic) {
            Ok(json) => {
                let copy = self.settings_button(
                    "settings-diagnostic-copy",
                    "Copiar informe",
                    Action::CopyDiagnostic,
                    cx,
                );
                report.push(section_surface(
                    "Contenido sanitizado",
                    None,
                    section_body()
                        .child(text(json, orbit::SECONDARY, 400, orbit::ink_2(cx), cx))
                        .child(copy),
                    cx,
                ));
            }
            Err(_) => report.push(orbit::callout("No se pudo serializar el diagnóstico.", cx)),
        }
        report
    }
}
