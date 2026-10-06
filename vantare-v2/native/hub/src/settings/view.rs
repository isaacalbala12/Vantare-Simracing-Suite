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
use orbit::{Tone, eyebrow, setting_row};

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

fn stack() -> Div {
    div()
        .flex()
        .flex_col()
        .w_full()
        .min_w_0()
        .min_h_0()
        .gap(px(21.0))
}
fn columns(compact: bool) -> Div {
    div()
        .flex()
        .w_full()
        .min_w_0()
        .gap(px(21.0))
        .items_start()
        .when(compact, |element| element.flex_col().items_stretch())
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
    div().flex().flex_col()
}
fn section_surface(title: &str, meta: Option<&str>, body: Div, cx: &gpui::App) -> Div {
    orbit::neo_card(cx)
        .flex_shrink_0()
        .gap(px(12.0))
        .child(
            orbit::neo_header(title.to_owned(), "gear", cx)
                .flex_wrap()
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
                    };
                    head.child(div().flex_1()).child(meta.flex_none()).when(
                        title == "Últimos eventos" && value == "8 en esta sesión",
                        |head| {
                            head.child(
                                orbit::small_button("settings-demo-copy-events", "Copiar", cx)
                                    .tab_stop(false),
                            )
                        },
                    )
                }),
        )
        .child(
            body.id(format!("settings-body-{title}"))
                .flex_grow(1.0)
                .min_h_0()
                .overflow_y_scroll(),
        )
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
        .child(section_text(content, 10.0, 750, color, 13.0, cx))
}

fn reference_choice(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_stop(false)
        .aria_description("Próximamente")
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
        .child(orbit::icon("down", 14.0, orbit::ink_3(cx)))
}
fn reference_primary(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_stop(false)
        .aria_description("Próximamente")
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
    surface: u32,
    accent: u32,
    active: bool,
    cx: &gpui::App,
) -> gpui::Stateful<Div> {
    div()
        .id(("settings-palette-card", index))
        .role(gpui::Role::Button)
        .aria_label(name)
        .aria_selected(active)
        .tab_stop(false)
        .flex_1()
        .min_w(px(180.0))
        .p(px(12.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .rounded(px(16.0))
        .border_2()
        .border_color(if active {
            rgb(orbit::carmine(cx))
        } else {
            rgba(orbit::line(cx))
        })
        .bg(rgb(orbit::surface_1(cx)))
        .child(
            div()
                .h(px(100.0))
                .w_full()
                .rounded(px(12.0))
                .bg(rgb(surface))
                .p(px(12.0))
                .flex()
                .gap(px(12.0))
                .child(
                    div()
                        .w(px(32.0))
                        .h_full()
                        .rounded(px(6.0))
                        .bg(orbit::tint(accent, 0.12)),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(12.0))
                        .child(
                            div()
                                .h(px(40.0))
                                .rounded(px(8.0))
                                .bg(orbit::tint(orbit::ink(cx), 0.08)),
                        )
                        .child(div().w(px(64.0)).h(px(18.0)).rounded_full().bg(rgb(accent))),
                ),
        )
        .child(text(name, 14.0, 700, orbit::ink(cx), cx))
        .child(orbit::pill(
            if active { "Actual" } else { "Seleccionar" },
            Tone::Neutral,
            cx,
        ))
        .aria_description("Tema persistido en los ajustes locales de apariencia")
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
        .aria_description("Próximamente")
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
        .aria_description("Próximamente")
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
            gpui::Background::from(rgba(crate::orbit::legacy_rgba(crate::orbit::PANEL_BG, cx)))
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
                        .border_color(rgb(orbit::ink_3(cx)))
                        .when(selected, |mark| {
                            mark.bg(rgb(orbit::carmine(cx)))
                                .border_color(rgb(orbit::carmine(cx)))
                        }),
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
            gpui::Background::from(rgba(crate::orbit::legacy_rgba(crate::orbit::PANEL_BG, cx)))
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
    orbit::disabled(orbit::small_button(id, label, cx), "Próximamente")
}
impl Hub {
    fn settings_button(
        &self,
        id: &'static str,
        label: &str,
        action: Action,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<Div> {
        // Cada acción conserva focos independientes en contenido y carril.
        let focus_index = action as usize + 2 * usize::from(id.starts_with("settings-rail-"));
        let enabled = match action {
            Action::PrepareDiagnostic => !self.settings.busy,
            Action::CopyDiagnostic => self.settings.diagnostic.is_some(),
        };
        (if matches!(action, Action::PrepareDiagnostic) {
            reference_primary(id, label, cx)
                .aria_description("Preparar informe de diagnóstico local")
        } else {
            orbit::small_button(id, label, cx)
        })
        .track_focus(&self.settings.action_focus[focus_index])
        .tab_stop(enabled)
        .when(!enabled, |button| button.opacity(orbit::DISABLED))
        .on_click(cx.listener(move |this, _, window, cx| {
            if enabled {
                this.settings.action_focus[focus_index].focus(window, cx);
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
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(16.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .child(orbit::text(
                        self.settings.page.title(),
                        28.0,
                        700,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(text(
                        self.settings.page.description(),
                        13.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    )),
            )
            .child(
                div()
                    .w(px(300.0))
                    .flex_none()
                    .relative()
                    .child(self.settings.query.clone())
                    .when(self.settings.query.read(cx).value.is_empty(), |search| {
                        search.child(div().absolute().left(px(13.0)).top(px(10.0)).child(text(
                            "Buscar un ajuste…",
                            13.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        )))
                    }),
            )
    }

    pub(in crate::shell) fn settings_tabs(&self, cx: &mut Context<Self>) -> gpui::Stateful<Div> {
        let query = self.settings.query.read(cx).value.as_str();
        let mut tabs = div()
            .id("settings-tabs")
            .flex()
            .items_center()
            .gap(px(6.0))
            .min_w_0()
            .overflow_x_scroll();
        for (index, page) in Page::ALL.into_iter().enumerate() {
            if !page.matches(query) {
                continue;
            }
            tabs = tabs.child(
                orbit::ghost_button(("settings-tab", index), page.label(), cx)
                    .flex_none()
                    .aria_selected(page == self.settings.page)
                    .aria_description(page.subtitle())
                    .h(px(48.0))
                    .text_size(px(11.0))
                    .rounded_none()
                    .px(px(4.0))
                    .border_b_2()
                    .border_color(if page == self.settings.page {
                        rgb(orbit::carmine(cx)).into()
                    } else {
                        gpui::transparent_black()
                    })
                    .track_focus(&self.settings.nav_focus[index])
                    .on_click(cx.listener(move |hub, _, window, cx| {
                        hub.settings.nav_focus[index].focus(window, cx);
                        hub.select_settings_page(page, cx);
                    }))
                    .on_key_down(cx.listener(move |hub, event: &gpui::KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            hub.select_settings_page(page, cx);
                            cx.stop_propagation();
                        }
                    })),
            );
        }
        tabs
    }

    #[allow(clippy::too_many_lines)] // Composición del carril de las siete páginas, sin lógica de negocio.
    fn settings_rail(&self, cx: &mut Context<Self>) -> Div {
        let mut rail = stack().h_full().gap(px(16.0));
        let (title, icon, note) = match self.settings.page {
            Page::Appearance => (
                "Estilo de los overlays",
                "v-studio",
                "Los widgets tienen su propia apariencia en Overlay Studio.",
            ),
            Page::Performance => (
                "Ahora mismo",
                "v-gauge",
                "No hay una medición de CPU, memoria o coste por fotograma disponible. Los niveles automáticos están pendientes.",
            ),
            Page::Hotkeys => (
                "Botones del volante",
                "v-wheel",
                "Próximamente podrás asignar acciones a tu volante.",
            ),
            Page::Privacy => (
                "Qué sale de tu equipo",
                "v-shield",
                "El envío de fallos y uso anónimo depende de tu consentimiento. Los informes de Testing Center solo se envían al confirmarlos.",
            ),
            Page::Updates => (
                "Historial",
                "clock",
                "Próximamente podrás consultar las versiones instaladas anteriormente.",
            ),
            Page::Diagnostics => (
                "Paquete de diagnóstico",
                "v-monitor",
                "Prepara un informe del estado de Vantare, sin contraseñas ni datos de la carrera.",
            ),
            Page::Application => (
                "Huella en pista",
                "v-gauge",
                "El consumo de CPU y memoria se mostrará cuando haya una medición disponible.",
            ),
        };
        rail = rail.child(
            orbit::neo_card(cx)
                .child(orbit::neo_header(title, icon, cx))
                .child(text(note, 13.0, 400, orbit::ink_2(cx), cx))
                .when(self.settings.page == Page::Appearance, |card| {
                    card.child(
                        orbit::small_button("settings-open-studio", "Abrir Overlay Studio", cx)
                            .on_click(
                                cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)),
                            ),
                    )
                }),
        );
        let sections: &[(&str, &str, &str)] = match self.settings.page {
            Page::Performance => &[
                (
                    "Por perfil",
                    "v-launch",
                    "Próximamente podrás elegir un nivel para cada perfil.",
                ),
                (
                    "Últimos 10 minutos",
                    "clock",
                    "Próximamente · el historial de consumo aún no está disponible.",
                ),
            ],
            Page::Hotkeys => &[
                (
                    "Antes de cambiar uno",
                    "v-keys",
                    "Comprueba si otra aplicación ya usa la combinación. Los atajos del Hub funcionan con su ventana activa.",
                ),
                (
                    "Prueba un atajo",
                    "v-keys",
                    "Con Vantare en primer plano, pulsa Ctrl K para abrir la búsqueda.",
                ),
            ],
            Page::Updates => &[
                (
                    "Canales",
                    "v-download",
                    "Nightly recibe cambios en pruebas. Testers recibe el conjunto validado. Estable llegará tras la beta.",
                ),
                (
                    "Si algo va mal",
                    "v-shield",
                    "Reinicia Vantare. Si el problema continúa, prepara un informe en Diagnóstico.",
                ),
            ],
            Page::Privacy => &[
                (
                    "Lo que nunca sale",
                    "v-lock",
                    "Tus contraseñas y claves de acceso no se incluyen en los informes de diagnóstico.",
                ),
                (
                    "Lo último que salió",
                    "clock",
                    "Próximamente · el historial de envíos aún no está disponible aquí.",
                ),
            ],
            Page::Diagnostics => &[
                (
                    "Tu equipo",
                    "v-monitor",
                    "El informe incluye la versión de Vantare y el estado observado en este equipo.",
                ),
                (
                    "Problemas frecuentes",
                    "v-shield",
                    "Si no llegan datos, comprueba que el simulador esté abierto y en pista. Para un fallo repetido, adjunta un informe.",
                ),
            ],
            Page::Appearance | Page::Application => &[],
        };
        for (index, (title, icon, note)) in sections.iter().enumerate() {
            rail = rail.child(
                orbit::neo_card(cx)
                    .when(index + 1 == sections.len(), |card| {
                        card.flex_grow(1.0).min_h_0()
                    })
                    .child(orbit::neo_header(*title, icon, cx))
                    .child(text(*note, 13.0, 400, orbit::ink_2(cx), cx)),
            );
        }
        if self.settings.page == Page::Appearance {
            rail = rail.child(
                orbit::neo_card(cx)
                    .flex_1()
                    .min_h_0()
                    .child(orbit::neo_header("Vista previa", "v-palette", cx))
                    .child(
                        orbit::neo_card(cx)
                            .child(orbit::neo_header("Vantare", "v-home", cx))
                            .child(orbit::progress(0.65, cx))
                            .child(orbit::pill("Tema actual", Tone::Neutral, cx)),
                    ),
            );
        }
        if self.settings.page == Page::Application {
            rail = rail
                .child(
                    orbit::neo_card(cx)
                        .child(orbit::neo_header("Versión", "v-download", cx))
                        .child(text(crate::version_label(), 22.0, 700, orbit::ink(cx), cx))
                        .child(
                            orbit::small_button("settings-open-updates", "Actualizaciones", cx)
                                .on_click(cx.listener(|hub, _, _, cx| {
                                    hub.select_settings_page(Page::Updates, cx);
                                })),
                        ),
                )
                .child(
                    orbit::neo_card(cx)
                        .child(orbit::neo_header("Diagnóstico", "v-monitor", cx))
                        .child(self.settings_button(
                            "settings-rail-prepare",
                            "Preparar informe",
                            Action::PrepareDiagnostic,
                            cx,
                        ))
                        .child(self.settings_button(
                            "settings-rail-copy",
                            "Copiar informe",
                            Action::CopyDiagnostic,
                            cx,
                        )),
                )
                .child(
                    orbit::neo_card(cx)
                        .flex_1()
                        .min_h_0()
                        .child(orbit::neo_header("Atajos del Hub", "v-keys", cx))
                        .children(
                            [
                                ("Lanzar perfil", "Ctrl L"),
                                ("Buscar", "Ctrl K"),
                                ("Contraer barra", "Ctrl B"),
                            ]
                            .map(|(label, key)| {
                                div()
                                    .flex()
                                    .justify_between()
                                    .items_center()
                                    .min_h(px(42.0))
                                    .child(text(label, 13.0, 400, orbit::ink_2(cx), cx))
                                    .child(orbit::keycap(key, cx))
                            }),
                        ),
                );
        }
        rail
    }

    pub(in crate::shell) fn settings(
        &self,
        _window: &Window,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<Div> {
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
            .h_full()
            .min_h_0()
            .gap(px(16.0))
            .when_some(self.settings.status.clone(), |view, status| {
                view.child(orbit::callout(status, cx))
            })
            .child(
                match self.settings.page {
                    Page::Application => self.settings_application(true, cx),
                    Page::Appearance => self.settings_appearance(cx),
                    Page::Performance => self.settings_performance(true, cx),
                    Page::Updates => self.settings_updates(cx),
                    Page::Hotkeys => Self::settings_hotkeys(cx),
                    Page::Privacy => self.settings_privacy(true, cx),
                    Page::Diagnostics => self.settings_diagnostics(true, cx),
                }
                .h_full()
                .min_h_0()
                .id("settings-page-scroll")
                .overflow_y_scroll()
                .track_scroll(&self.settings.panel_scroll),
            );
        let rail = self.settings_rail(cx);
        div()
            .id("settings-panel")
            .flex_1()
            .min_h_0()
            .w_full()
            .flex()
            .gap(px(16.0))
            .child(
                div()
                    .id("settings-main-scroll")
                    .flex_1()
                    .flex_basis(gpui::relative(2.0 / 3.0))
                    .min_w_0()
                    .h_full()
                    .overflow_hidden()
                    .child(content),
            )
            .child(
                div()
                    .id("settings-rail-scroll")
                    .flex_1()
                    .flex_basis(gpui::relative(1.0 / 3.0))
                    .min_w_0()
                    .h_full()
                    .overflow_y_scroll()
                    .child(rail),
            )
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
    fn settings_application(&self, compact: bool, cx: &Context<Self>) -> Div {
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
                ),
            cx,
        )
        .flex_1();
        let system = Self::settings_system(cx);
        let open_language = self
            .capture
            .as_ref()
            .is_some_and(|capture| capture.name == "ajustes-idioma-desplegado");
        let mut view = columns(compact)
            .child(interface.when(compact, gpui::Styled::flex_none))
            .child(system.when(compact, gpui::Styled::flex_none));
        let overlays = section_surface(
            "Overlays",
            None,
            section_body()
                .child(section_row(
                    "Idioma de widgets",
                    "Se guarda con el diseño de Overlay Studio.",
                    self.settings.language.clone(),
                    cx,
                ))
                .child(section_row(
                    "Unidades de widgets",
                    "Unidades del diseño activo.",
                    self.settings.units.clone(),
                    cx,
                )),
            cx,
        );
        let channel = self.settings_general_channel(cx);
        view = stack().gap(px(16.0)).child(view).child(overlays).child(
            section_surface("Canal", None, channel, cx)
                .flex_1()
                .min_h_0(),
        );
        if open_language {
            // El banco incluye un estado con el selector abierto. Las opciones
            // se dibujan como vista de referencia inerte porque el Hub
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
    fn settings_general_channel(&self, cx: &Context<Self>) -> Div {
        let mut channel = section_body().child(section_row(
            "Canal de actualizaciones",
            "Revisa la versión instalada y las novedades.",
            orbit::small_button("settings-general-updates", "Actualizaciones", cx)
                .on_click(cx.listener(|hub, _, _, cx| hub.select_settings_page(Page::Updates, cx))),
            cx,
        ));
        match &self.settings.privacy {
            Ok(store) => {
                channel = channel.child(section_row(
                    "Compartir datos de uso",
                    "Consentimiento de uso anónimo; puedes cambiarlo en Privacidad.",
                    orbit::toggle(
                        "settings-general-usage",
                        "Compartir datos de uso",
                        store.value.usage,
                        true,
                        cx,
                    )
                    .track_focus(&self.settings.privacy_focus[1])
                    .on_click(cx.listener(|hub, _, _, cx| hub.settings_privacy_toggle(true, cx)))
                    .on_key_down(cx.listener(
                        |hub, event: &gpui::KeyDownEvent, _, cx| {
                            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                hub.settings_privacy_toggle(true, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
                    cx,
                ));
            }
            Err(error) => channel = channel.child(orbit::callout(error.clone(), cx)),
        }
        channel
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
                    "Aviso cuando hay una versión nueva.",
                    disabled_toggle("settings-notify-update", "Avisos de actualización", true, cx),
                 cx))
                .child(section_row(
                    "Avisos del Launcher",
                    "Aviso cuando terminan de abrirse tus aplicaciones.",
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
                    "Las preferencias de inicio, bandeja y avisos estarán disponibles próximamente.",
                 cx)),
         cx)
        .flex_1()
    }
    #[allow(clippy::too_many_lines)] // Composición visual; crece al migrar a accesores de tema (#1430).
    fn settings_appearance(&self, cx: &mut Context<Self>) -> Div {
        let settings = self.settings.appearance.settings;
        let mut palettes = div().w_full().grid().grid_cols(2).gap(px(12.0));
        for (index, design) in orbit::design::Design::ALL.into_iter().enumerate() {
            let tokens = match design.compiled() {
                Ok(tokens) => tokens,
                Err(error) => {
                    palettes = palettes.child(orbit::callout(error, cx));
                    continue;
                }
            };
            palettes = palettes.child(
                palette_card(
                    index,
                    &tokens.name,
                    tokens.colors.neo_bottom,
                    tokens.colors.accent,
                    index == settings.design as usize,
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
                    "Cada tema define sus superficies oscuras y su contraste.",
                    orbit::pill("Oscuro", orbit::Tone::Neutral, cx),
                 cx))
                .child(section_row(
                    "Contraste",
                    "Ajusta la legibilidad del texto secundario y los bordes.",
                    contrast,
                 cx))
                .child(section_row(
                    "Opacidad de las superficies",
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
             cx).flex_1().min_h_0())
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
                            hub.settings.appearance_bounds[index] = Some(bounds);
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
    fn settings_performance(&self, compact: bool, cx: &gpui::App) -> Div {
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
        let mut levels = div().grid().grid_cols(3).w_full().min_w_0().gap(px(12.0));
        for (index, (name, rate, description)) in choices.into_iter().enumerate() {
            levels = levels.child(
                performance_choice(
                    index,
                    name,
                    rate,
                    description,
                    self.demo.is_some() && index == 2,
                    cx,
                )
                .when(compact, |element| element.h_auto().min_h(px(167.0))),
            );
        }
        let custom_auto = div()
            .flex()
            .w_full()
            .min_w_0()
            .gap(px(12.0))
            .child(
                performance_mode(
                    "Personalizado",
                    "Sin perfil activo",
                    "Elige la cadencia widget a widget; cada aumento muestra su coste de CPU.",
                    false,
                    cx,
                )
                .when(compact, |element| element.h_auto().min_h(px(100.0))),
            )
            .child(
                performance_mode(
                    "Automático",
                    "Próximamente",
                    "El ajuste automático estará disponible más adelante.",
                    false,
                    cx,
                )
                .when(compact, |element| element.h_auto().min_h(px(100.0))),
            );
        stack().h_full().child(section_surface(
            "Nivel de rendimiento",
            Some(if self.demo.is_some() { "Activo ahora · Equilibrado · 40 fps · elegido por ti" } else { "Nivel activo no disponible" }),
            section_body()
                .gap(px(12.0))
                .child(custom_auto)
                .child(levels)
                .child(text(
                    "Niveles de referencia. Elegir un nivel y ajustar el consumo automáticamente estará disponible próximamente.",
                    orbit::SECONDARY,
                    400,
                    orbit::ink_3(cx),
                 cx).mt(px(-8.0)).line_height(px(18.0))),
         cx)).child(Self::settings_performance_table(cx).flex_grow(1.0).min_h(px(240.0)))
    }
    fn settings_performance_table(cx: &gpui::App) -> Div {
        let mut rows = div().flex().flex_col().gap(px(8.0));
        for (label, values) in [
            (
                "Nivel",
                ["Máximo", "Alto", "Equilibrado", "Ahorro", "Mínimo"],
            ),
            (
                "Cadencia objetivo",
                ["Monitor", "60 fps", "40 fps", "30 fps", "20 fps"],
            ),
            ("Disponibilidad", ["Pendiente"; 5]),
        ] {
            rows = rows.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .min_h(px(38.0))
                    .border_b_1()
                    .border_color(rgba(orbit::line(cx)))
                    .child(text(label, 12.0, 500, orbit::ink_2(cx), cx).w(px(120.0)))
                    .children(
                        values.map(|value| text(value, 11.0, 400, orbit::ink_3(cx), cx).flex_1()),
                    ),
            );
        }
        section_surface(
            "Qué cambia en cada nivel",
            Some("Valores de referencia"),
            rows,
            cx,
        )
    }

    fn settings_updates(&self, cx: &mut Context<Self>) -> Div {
        let version = crate::version_label().to_owned();
        let channel = match crate::product::CHANNEL {
            "master" | "stable" => Some("Estable"),
            "testers" => Some("Testers"),
            "nightly" => Some("Nightly"),
            "beta" => Some("Beta"),
            _ => None,
        };
        let state = match &self.settings.update {
            LocalUpdate::Package { previous: true, .. } => {
                "La versión anterior se conserva por seguridad."
            }
            LocalUpdate::Invalid => "No se pudo comprobar la instalación.",
            _ => "Versión instalada en este equipo.",
        }
        .to_owned();
        let news = section_surface(
            "Notas de versión",
            None,
            Self::settings_release_news(cx),
            cx,
        )
        .flex_1()
        .min_h_0();
        let beta = if self.demo.is_none() {
            self.settings.beta_status.clone()
        } else {
            None
        };
        stack()
            .when_some(beta, |surface, status| {
                surface.child(
                    Self::settings_beta_notice(status, cx),
                )
            })
            .child(Self::settings_update_hero(
                version,
                state,
                self.demo.is_some(),
                cx,
            ))
            .child(if channel == Some("Beta") {
                section_surface("Beta", Some("Actualizaciones automáticas al abrir y cada 6 horas"),
                    section_body().child(text("Las nuevas versiones beta se descargan automáticamente y se aplican al cerrar o reiniciar el Hub.", 13.0, 400, orbit::ink_2(cx), cx)), cx)
            } else {
                Self::settings_update_channels(channel, self.demo.is_some(), cx)
            })
            .child(div().flex_1().min_h_0().child(Grayscale(news.h_full().into_any_element())))
    }
    fn settings_beta_notice(status: super::updates::BetaStatus, cx: &mut Context<Self>) -> Div {
        section_body()
            .flex_row()
            .flex_wrap()
            .items_center()
            .justify_between()
            .child(text(status.message, 13.0, 400, orbit::ink_2(cx), cx).min_w_0())
            .when(status.state == "ready", |body| {
                body.child(
                    reference_primary("beta-restart-now", "Reiniciar ahora", cx)
                        .tab_stop(true)
                        .aria_description("Aplicar la actualización y volver a abrir Vantare")
                        .cursor_pointer()
                        .on_click(cx.listener(
                            |this, _, _, cx| match super::updates::request_restart() {
                                Ok(()) => this.close(cx),
                                Err(error) => {
                                    this.settings.status = Some(error);
                                    cx.notify();
                                }
                            },
                        )),
                )
            })
    }
    fn settings_release_news(cx: &gpui::App) -> Div {
        let mut body = section_body().mt(px(-0.5));
        match super::releases::news() {
            Ok(releases) => {
                for release in releases {
                    body = body.child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(14.0))
                            .min_h(px(46.0))
                            .mb(px(-0.5))
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
                                        release.kind.chars().map(|ch| {
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
        body
    }
    fn settings_update_hero(version: String, state: String, demo: bool, cx: &gpui::App) -> Div {
        div()
            .h(px(138.0))
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
            .when(demo, |hero| {
                hero.child(
                    div()
                        .flex()
                        .flex_none()
                        .items_center()
                        .gap(px(12.0))
                        .child(reference_primary(
                            "settings-update-install",
                            "Actualización disponible",
                            cx,
                        ))
                        .child(reference_primary(
                            "settings-update-check",
                            "Buscar actualizaciones",
                            cx,
                        )),
                )
            })
    }
    fn settings_update_channels(channel: Option<&str>, demo: bool, cx: &gpui::App) -> Div {
        let mut channels = div().flex().w_full().gap(px(21.0));
        for (index, (name, description)) in [
            ("Estable", "Versiones probadas para todo el mundo."),
            (
                "Testers",
                "Candidatas a Estable con el Testing Center activo.",
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
                                orbit::icon("down", 14.0, orbit::ink_3(cx)).into_any_element()
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
                            if active {
                                "Canal instalado"
                            } else {
                                "Canal no seleccionado"
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
    fn settings_hotkeys(cx: &gpui::App) -> Div {
        let hub_keys = section_body().children(
            [
                ("Lanzar perfil favorito", "Ctrl L"),
                ("Buscar en Vantare", "Ctrl K"),
                ("Contraer barra lateral", "Ctrl B"),
            ]
            .map(|(label, key)| {
                section_row(
                    label,
                    "Con la ventana del Hub activa",
                    orbit::keycap(key, cx),
                    cx,
                )
            }),
        );
        let mut body = section_body();
        for (index, (label, help, keys)) in [
            (
                "Mostrar u ocultar overlay",
                "Muestra u oculta el overlay activo.",
                ["Ctrl", "Mayús", "V"],
            ),
            (
                "Siguiente perfil",
                "Cambia al siguiente perfil guardado.",
                ["Ctrl", "Mayús", "→"],
            ),
            (
                "Perfil anterior",
                "Cambia al perfil anterior.",
                ["Ctrl", "Mayús", "←"],
            ),
            (
                "Cambiar referencia Delta",
                "Rota la referencia del widget Delta.",
                ["Ctrl", "Mayús", "D"],
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let keycaps = orbit::keycaps(keys, cx);
            body = body.child(
                section_row_hint(label, help, keycaps, 11.5, cx)
                    .id(("settings-hotkey", index))
                    .px(px(8.0))
                    .py(px(8.0))
                    .min_h(px(56.5))
                    .when(index == 3, gpui::Stateful::<Div>::border_b_0),
            );
        }
        stack().h_full().mt(px(7.0)).child(section_surface("En el Hub", None, hub_keys, cx))
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
                                "Combinaciones de referencia. El registro y la reasignación global todavía no están disponibles en el Hub.",
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
                            .relative()
                            .top(px(-7.0))
                            .child(disabled_button(
                                "settings-hotkeys-reset",
                                "Restablecer todos",
                             cx))
                            .child(section_status("Reasignación pendiente", orbit::ember(cx), cx)),
                    ),
            )
            .child(
                section_surface("En pista · Próximamente", Some("4 combinaciones de referencia"), body, cx).flex_1().min_h_0(),
            )
            .child(section_note(
                "Los atajos en pista estarán disponibles más adelante. Por ahora, usa los atajos del Hub con su ventana activa.",
             cx))
    }
    fn settings_privacy_consent(compact: bool, cx: &gpui::App) -> Div {
        let shared_bullets = div()
            .flex()
            .flex_col()
            .child(privacy_bullet(
                "Consumos, stints, pits, estrategias observadas y calidad ya derivados.",
                cx,
            ))
            .child(privacy_bullet(
                "Tipo de carrera y semana, sin fecha ni hora exactas.",
                cx,
            ))
            .child(privacy_bullet(
                "Una referencia para gestionar tus aportes y borrarlos si lo solicitas.",
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
                    "Próximamente podrás compartir resúmenes de carrera para mejorar las recomendaciones de estrategia. Podrás revisar qué se comparte.",
                    16.0,
                    400,
                    orbit::ink(cx),
                 cx).line_height(px(24.0)).mt(px(0.0)))
                .child(columns(compact).gap(px(16.0))
                    .child(shared.when(compact, gpui::Styled::flex_none))
                    .child(never.when(compact, gpui::Styled::flex_none)))
                .child(section_note(
                    "Tus aportes usarán una referencia que permita borrarlos, sin mostrar tu identidad a otros usuarios.",
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
                            "Sin consentimiento · no se envían aportes",
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
                        "La cola de Strategy no está disponible en el Hub."
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
                    if self.demo.is_some() { "No hay solicitudes de borrado remoto registradas." } else { "El historial de solicitudes de borrado estará disponible próximamente." },
                 cx))
                .child(section_note(
                    "El borrado elimina tus aportes y sus copias. Los resultados conjuntos ya publicados no pueden retirarse por separado.",
                 cx)),
         cx)
    }
    fn settings_privacy(&self, compact: bool, cx: &mut Context<Self>) -> Div {
        div()
            .flex()
            .flex_col()
            .w_full()
            .min_w_0()
            .gap(px(14.0))
            .child(self.settings_privacy_diagnostics(cx).when(
                self.shell.access.lock(Section::Strategy).is_some(),
                |card| card.flex_grow(1.0).min_h_0(),
            ))
            // La contribución solo envía paquetes de Strategy: sin Strategy (beta) sobra.
            .when(
                self.shell.access.lock(Section::Strategy).is_none(),
                |page| {
                    page.child(Self::settings_privacy_consent(compact, cx))
                        .child(self.settings_privacy_queue(cx))
                        .child(self.settings_privacy_history(cx).flex_1().min_h_0())
                },
            )
    }
    fn settings_privacy_diagnostics(&self, cx: &mut Context<Self>) -> Div {
        let mut body = section_body();
        match &self.settings.privacy {
            Err(error) => body = body.child(section_note(error, cx)),
            Ok(store) => {
                for (index, usage, label, help, on) in [
                    (
                        0,
                        false,
                        "Enviar informes de fallos",
                        "Versión de Vantare y detalles del fallo. Se ocultan tus carpetas personales.",
                        store.value.crashes,
                    ),
                    (
                        1,
                        true,
                        "Enviar datos de uso",
                        "Inicio de la app, simulador al entrar en una sesión y tipos de widgets activos. Sin posiciones ni telemetría.",
                        store.value.usage,
                    ),
                ] {
                    let toggle = orbit::toggle(
                        if usage {
                            "settings-usage"
                        } else {
                            "settings-crashes"
                        },
                        label,
                        on,
                        true,
                        cx,
                    )
                    .track_focus(&self.settings.privacy_focus[index])
                    .tab_stop(true)
                    .aria_toggled(if on {
                        gpui::Toggled::True
                    } else {
                        gpui::Toggled::False
                    })
                    .aria_description(if on { "Activado" } else { "Desactivado" })
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.settings_privacy_toggle(usage, cx)),
                    )
                    .on_key_down(cx.listener(
                        move |this, event: &gpui::KeyDownEvent, _, cx| {
                            if matches!(event.keystroke.key.as_str(), "space" | "enter") {
                                this.settings_privacy_toggle(usage, cx);
                                cx.stop_propagation();
                            }
                        },
                    ));
                    body = body.child(section_row(label, help, toggle, cx));
                }
                body = body.child(section_note("Estos datos no se vinculan a tu cuenta y se procesan en la Unión Europea. Puedes cambiar estas opciones cuando quieras.", cx));
                if !vantare_services::diagnostics::configured() {
                    body = body.child(section_note("Este build aún no tiene configurado el envío. Tus preferencias quedan guardadas.", cx));
                }
            }
        }
        section_surface("Diagnóstico y uso", None, body, cx)
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
                    chrono::DateTime::from_timestamp(error.observed_at_utc, 0).map_or_else(
                        || "Hora no disponible".into(),
                        |time| time.format("%H:%M:%S").to_string(),
                    ),
                    "Error".into(),
                    error.module.label().into(),
                    error.code.label().into(),
                ]
            })
            .collect();
        let mut events = section_body();
        if rows.is_empty() {
            events = events.child(section_note(
                "Todavía no hay eventos registrados en esta sesión. Puedes preparar un informe de diagnóstico.",
             cx));
        } else {
            events = events.child(self.settings.event_filter.clone());
            events = events.child(self.settings.event_query.clone());
            let table = orbit::Table {
                headers: vec![
                    "Hora (UTC)".into(),
                    "Nivel".into(),
                    "Módulo".into(),
                    "Mensaje".into(),
                ],
                rows,
            };
            match table.render(cx) {
                Ok(table) => events = events.child(table),
                Err(error) => events = events.child(orbit::callout(error, cx)),
            }
        }
        section_surface("Últimos eventos", Some("sesión actual"), events, cx)
            .flex_1()
            .min_h(px(240.0))
    }
    fn settings_statistics(demo: bool, connected: bool, cx: &gpui::App) -> Div {
        let tiles = if demo {
            [
                (
                    "Telemetría",
                    if connected { "Conectado" } else { "Esperando" },
                    if connected {
                        "Datos del simulador disponibles"
                    } else {
                        "Esperando simulador"
                    },
                ),
                ("Overlay", "Detenido", "sin perfil activo"),
                ("CPU · memoria", "—", "Esperando datos del simulador"),
                ("Datos locales", "45 MB", "3 carpetas revisadas"),
            ]
        } else {
            [
                (
                    "Telemetría",
                    if connected { "Conectado" } else { "Esperando" },
                    "Conexión con el simulador",
                ),
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
                    .bg(rgba(crate::orbit::legacy_rgba(crate::orbit::PANEL_BG, cx)))
                    .child(text(label, 11.0, 700, orbit::ink_3(cx), cx).line_height(px(13.2)))
                    .child(
                        mono_tracked(
                            value.to_owned(),
                            22.0,
                            700.0,
                            -0.66,
                            if connected && label == "Telemetría" {
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
    fn settings_diagnostics(&self, compact: bool, cx: &mut Context<Self>) -> Div {
        let demo = self.demo.is_some();
        let stats = Self::settings_statistics(demo, self.previous_source == Some(true), cx)
            .when(compact, |stats| stats.grid().grid_cols(2));
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
                    orbit::small_button("settings-data-open", "Abrir", cx)
                        .tab_stop(false)
                        .aria_description("Abrir esta carpeta estará disponible próximamente"),
                    12.0,
                    cx,
                ))
                .child(section_row_hint(
                    "Carpeta de registros",
                    if demo {
                        "C:\\Users\\piloto\\AppData\\Local\\Vantare\\logs"
                    } else {
                        "El registro aún no está disponible."
                    },
                    orbit::small_button("settings-logs-open", "Abrir", cx)
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
        let mut view = stack().h_full().child(stats).child(
            columns(compact)
                .flex_1()
                .child(data.when(compact, gpui::Styled::flex_none))
                .child(self.settings_events(cx).flex_1()),
        );
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
                    .px(px(12.0))
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
            ("16:00:24", "Info", "Inicio · Le Mans Ultimate abierto"),
            (
                "16:00:02",
                "Aviso",
                "Atajos · Ctrl+Alt+O ya lo usa otra aplicación",
            ),
            (
                "15:59:35",
                "Info",
                "Actualizaciones · Canal Nightly seleccionado",
            ),
            (
                "15:59:00",
                "Error",
                "Grabaciones · No se pudo guardar una parte de la sesión",
            ),
            (
                "15:58:38",
                "Info",
                "Overlays · Perfil de carrera cargado con 7 widgets",
            ),
            (
                "15:58:04",
                "Aviso",
                "Perfiles · No se encontró la carpeta de ajustes; no se pueden editar perfiles",
            ),
            (
                "15:57:45",
                "Info",
                "Telemetría · Conexión con LMU preparada",
            ),
            ("15:57:32", "Info", "Vantare · Conexión local preparada"),
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
                    .bg(rgba(if level == "Error" {
                        0xff6a_5f14
                    } else if index % 2 == 0 {
                        orbit::line_row(cx)
                    } else {
                        0x0000_0000
                    }))
                    .child(
                        div().w(px(72.0)).flex_none().child(
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
                                    "Error" => orbit::coral(cx),
                                    "Aviso" => orbit::ember(cx),
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
        section_surface("Últimos eventos", Some("8 en esta sesión"), rows, cx)
            .flex_1()
            .min_h(px(240.0))
    }
    fn settings_diagnostic_report(&self, cx: &mut Context<Self>) -> Vec<Div> {
        let Some(diagnostic) = &self.settings.diagnostic else {
            return Vec::new();
        };
        let mut report = Vec::new();
        let mut body = section_body();
        for binary in &diagnostic.binaries {
            body = body.child(setting_row(
                match binary.name {
                    "vantare-hub.exe" => "Hub",
                    "vantare.exe" => "Inicio de Vantare",
                    "vantare-core.exe" => "Datos de carrera",
                    "vantare-overlays.exe" => "Overlays en pista",
                    "vantare-engineer.exe" => "Ingeniero",
                    "vantare-storage.exe" => "Grabaciones",
                    "vantare-workshop.exe" => "Taller de widgets",
                    "vantare-grabar-lmu.exe" => "Grabación de LMU",
                    "vantare-grabar-acc.exe" => "Grabación de ACC",
                    _ => "Componente de Vantare",
                },
                match binary.state {
                    "present" => "Disponible",
                    "missing" => "No instalado",
                    "unreadable" => "No se pudo revisar",
                    _ => "No disponible",
                },
                orbit::chip(
                    if binary.sha256.is_some() {
                        "Huella calculada"
                    } else {
                        "Huella no disponible"
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
            Ok(_) => {
                let copy = self.settings_button(
                    "settings-diagnostic-copy",
                    "Copiar informe",
                    Action::CopyDiagnostic,
                    cx,
                );
                report.push(section_surface(
                    "Contenido del informe",
                    None,
                    section_body()
                        .child(text("Incluye la versión de Vantare, el estado de la conexión y los componentes revisados. No incluye contraseñas ni datos de la carrera.", orbit::SECONDARY, 400, orbit::ink_2(cx), cx))
                        .child(copy),
                    cx,
                ));
            }
            Err(_) => report.push(orbit::callout("No se pudo preparar el informe.", cx)),
        }
        report
    }
}
