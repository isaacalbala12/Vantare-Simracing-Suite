use super::{Action, Hub, Page, updates::LocalUpdate};
use crate::{Section, orbit};
use gpui::{
    Context, Div, IntoElement, Window, div, linear_color_stop, linear_gradient, prelude::*, px,
    rgb, rgba,
};
use orbit::{Tone, setting_row, text};

fn stack() -> Div {
    div().flex().flex_col().w_full().min_w_0().gap(px(21.0))
}
fn columns() -> Div {
    div().flex().w_full().min_w_0().gap(px(21.0)).items_start()
}
fn section_text(content: &str, size: f32, weight: u16, color: u32, line_height: f32) -> Div {
    text(content, size, weight, color).line_height(px(line_height))
}
fn section_row(label: &str, help: &str, control: impl IntoElement) -> Div {
    div()
        .min_h(px(54.0))
        .py(px(6.0))
        .flex()
        .items_center()
        .justify_between()
        .gap(px(16.0))
        .border_b_1()
        .border_color(rgba(orbit::LINE_ROW))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(2.5))
                .child(section_text(label, 13.5, 650, orbit::INK, 16.0))
                .child(section_text(help, 12.0, 400, orbit::INK_3, 16.8)),
        )
        .child(control)
}
fn section_palette_row(label: &str, help: &str, palettes: Div) -> Div {
    div()
        .w_full()
        .min_h(px(54.0))
        .py(px(6.0))
        .flex()
        .flex_col()
        .border_b_1()
        .border_color(rgba(orbit::LINE_ROW))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(2.5))
                .child(section_text(label, 13.5, 650, orbit::INK, 16.0))
                .child(section_text(help, 12.0, 400, orbit::INK_3, 16.8)),
        )
        .child(palettes)
}
fn section_body() -> Div {
    div().flex().flex_col().px(px(21.0)).py(px(21.0))
}
fn section_surface(title: &str, meta: Option<&str>, body: Div) -> Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .overflow_hidden()
        .rounded(px(orbit::RADIUS))
        .border_1()
        .border_color(rgba(orbit::LINE))
        .bg(rgb(orbit::SURFACE_1))
        .child(
            div()
                .min_h(px(60.0))
                .px(px(20.0))
                .py(px(13.0))
                .flex()
                .items_center()
                .gap(px(12.0))
                .border_b_1()
                .border_color(rgba(0xffff_ff0d))
                .child(text(title, 15.0, 700, orbit::INK))
                .when_some(meta, |head, value| {
                    let meta = if title == "Nivel de rendimiento" {
                        section_status(value, orbit::EMBER)
                    } else {
                        text(value, 12.0, 500, orbit::INK_3)
                    };
                    head.child(div().flex_1()).child(meta)
                }),
        )
        .child(body)
}
fn section_note(content: &str) -> Div {
    div()
        .px(px(17.0))
        .py(px(13.0))
        .rounded(px(14.0))
        .border_1()
        .border_color(rgba(0xff9b_5721))
        .bg(linear_gradient(
            110.0,
            linear_color_stop(rgba(0xff9b_570f), 0.0),
            linear_color_stop(rgba(0xd52f_4905), 1.0),
        ))
        .child(section_text(content, 12.0, 400, orbit::INK_3, 18.0))
}
fn section_status(content: &str, color: u32) -> Div {
    div()
        .h(px(29.0))
        .px(px(12.0))
        .flex_none()
        .flex()
        .items_center()
        .rounded_full()
        .border_1()
        .border_color(rgba(if color == orbit::EMBER {
            0xff9b_5722
        } else {
            0x78d6_8b38
        }))
        .bg(rgba(0xffff_ff06))
        .child(section_text(
            &content.to_uppercase(),
            10.0,
            750,
            color,
            13.0,
        ))
}
fn small_button(id: &'static str, label: &str) -> gpui::Stateful<Div> {
    orbit::button(id, label)
        .h(px(30.0))
        .px(px(12.0))
        .rounded(px(10.0))
}
fn privacy_bullet(content: &str) -> Div {
    div()
        .flex()
        .items_start()
        .gap(px(10.0))
        .child(text("•", 16.0, 400, orbit::INK_2))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(text(content, 16.0, 400, orbit::INK_2).line_height(px(24.0))),
        )
}
fn palette_card(
    index: usize,
    name: &str,
    light: u32,
    dark: u32,
    active: bool,
    scheme: Option<usize>,
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
            rgb(orbit::CARMINE)
        } else {
            rgba(orbit::LINE)
        })
        .bg(rgb(orbit::SURFACE_1))
        .child(
            div()
                .id(("settings-palette", index))
                .size(px(52.0))
                .flex_none()
                .p(px(4.0))
                .rounded_full()
                .border_1()
                .border_color(if active {
                    rgba(0xf047_5599)
                } else {
                    rgba(orbit::LINE_STRONG)
                })
                .bg(rgba(0x0000_0000))
                .when(active, |swatch| {
                    swatch.shadow(vec![gpui::BoxShadow {
                        color: rgba(0xf047_5526).into(),
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
        .child(text(name, 12.0, 400, orbit::INK_2))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(10.0))
                .child(palette_variant(light, active && scheme == Some(1)))
                .child(palette_variant(dark, active && scheme == Some(2))),
        )
        .aria_description("Pendiente: sin contrato nativo")
}
fn palette_variant(color: u32, active: bool) -> Div {
    div()
        .size(px(23.0))
        .flex_none()
        .rounded_full()
        .border_2()
        .border_color(if active {
            rgb(orbit::CARMINE)
        } else {
            rgba(orbit::LINE_STRONG)
        })
        .bg(rgb(color))
        .when(active, |variant| {
            variant.shadow(vec![gpui::BoxShadow {
                color: rgba(orbit::CARMINE).into(),
                offset: gpui::point(px(0.0), px(0.0)),
                blur_radius: px(0.0),
                spread_radius: px(2.0),
                inset: false,
            }])
        })
}
fn disabled_toggle(id: &'static str, label: &str, value: bool) -> gpui::Stateful<Div> {
    orbit::toggle(id, label, value, false).tab_stop(false)
}
fn disabled_slider(value: f32, min: f32, max: f32, label: &'static str) -> gpui::Stateful<Div> {
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
        .aria_description("Pendiente: sin contrato nativo")
        .child(div().w(px(45.0)).flex_none().text_right().child(
            text(format!("{value:.0}%"), 12.0, 500, orbit::INK_2).font_family("Cascadia Code"),
        ))
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
                        .bg(rgb(orbit::PRIMARY_BG)),
                )
                .child(
                    div()
                        .absolute()
                        .left_0()
                        .top(px(7.0))
                        .w(px(fill))
                        .h(px(6.0))
                        .rounded(px(3.0))
                        .bg(rgb(orbit::CARMINE)),
                )
                .child(
                    div()
                        .absolute()
                        .left(px(fill - 8.0))
                        .top(px(2.0))
                        .size(px(14.0))
                        .rounded_full()
                        .bg(rgb(orbit::CARMINE)),
                ),
        )
}
fn performance_choice(
    index: usize,
    title: &str,
    rate: &str,
    description: &str,
    selected: bool,
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
                        orbit::CARMINE
                    } else {
                        orbit::INK_4
                    }
                } else {
                    orbit::LINE
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
        .min_h(px(157.0))
        .px(px(15.0))
        .pt(px(14.0))
        .pb(px(13.0))
        .flex()
        .flex_col()
        .gap(px(7.0))
        .rounded(px(14.0))
        .border_1()
        .border_color(if selected {
            rgba(0xf047_5559)
        } else {
            rgba(orbit::LINE)
        })
        .bg(if selected {
            rgba(0xd52f_491a)
        } else {
            rgb(orbit::SURFACE_1)
        })
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(text(title, 15.0, 720, orbit::INK))
                .child(div().size(px(7.0)).rounded_full().bg(rgb(if selected {
                    orbit::GREEN
                } else {
                    orbit::INK_MUTED
                }))),
        )
        .child(meter)
        .child(
            text(
                rate,
                11.0,
                600,
                if selected { orbit::INK_2 } else { orbit::INK_3 },
            )
            .font_family("Cascadia Code"),
        )
        .child(text(description, 12.0, 400, orbit::INK_3).line_height(px(18.0)))
}
fn performance_mode(title: &str, rate: &str, description: &str, selected: bool) -> Div {
    div()
        .flex_1()
        .min_w_0()
        .min_h(px(98.0))
        .px(px(15.0))
        .pt(px(14.0))
        .pb(px(13.0))
        .flex()
        .flex_col()
        .gap(px(7.0))
        .rounded(px(14.0))
        .border_1()
        .border_color(if selected {
            rgba(0xf047_5559)
        } else {
            rgba(orbit::LINE)
        })
        .bg(if selected {
            rgba(0xd52f_491a)
        } else {
            rgb(orbit::SURFACE_1)
        })
        .opacity(0.62)
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(text(title, 15.0, 720, orbit::INK))
                .child(if selected {
                    div().size(px(8.0)).rounded_full().bg(rgb(orbit::GREEN))
                } else {
                    div()
                        .size(px(8.0))
                        .rounded_full()
                        .border_1()
                        .border_color(rgba(orbit::INK_3))
                }),
        )
        .child(text(rate, 11.0, 600, orbit::INK_3).font_family("Cascadia Code"))
        .child(text(description, 12.0, 400, orbit::INK_3))
}
fn disabled_button(id: &'static str, label: &str) -> gpui::Stateful<Div> {
    orbit::button(id, label)
        .tab_stop(false)
        .opacity(orbit::DISABLED)
        .aria_description("Pendiente: sin contrato nativo")
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
        orbit::button(id, label)
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
    pub(in crate::shell) fn settings_header(&self) -> Div {
        div()
            .flex()
            .flex_col()
            .mt(px(-4.0))
            .child(orbit::eyebrow("Preferencias"))
            .child(text(self.settings.page.title(), 34.0, 700, orbit::INK).mt(px(6.0)))
            .child(text(self.settings.page.description(), 13.5, 400, orbit::INK_2).mt(px(7.0)))
    }
    pub(in crate::shell) fn settings_column(&self, window: &Window, cx: &mut Context<Self>) -> Div {
        let query = super::search_text(&self.settings.query.read(cx).value);
        let mut rows = stack().gap_1();
        let mut found = false;
        for (index, (section, label, subtitle)) in [
            (Section::Account, "Cuenta", "Sesión, plan y dispositivos"),
            (Section::Licenses, "Licencias", "Plan y módulos"),
        ]
        .into_iter()
        .enumerate()
        {
            if super::search_text(&format!("{label} {subtitle}")).contains(&query) {
                found = true;
                rows = rows.child(
                    orbit::nav_item(label, label, subtitle, false)
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
                    )
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
            ));
        }
        orbit::column("Ajustes", env!("CARGO_PKG_VERSION"))
            .w(px(orbit::column_width(f32::from(
                window.viewport_size().width,
            ))))
            .child(
                div()
                    .px(px(24.0))
                    .pt(px(24.0))
                    .child(orbit::eyebrow("Secciones")),
            )
            .child(
                div()
                    .px(px(14.0))
                    .py(px(18.0))
                    .child(orbit::text(
                        "Buscar ajustes…",
                        orbit::SECONDARY,
                        400,
                        orbit::INK_3,
                    ))
                    .child(self.settings.query.clone()),
            )
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
            .when_some(self.settings.status.clone(), |view, status| {
                view.child(orbit::callout(status))
            })
            .child(match self.settings.page {
                Page::Application => self.settings_application(),
                Page::Appearance => self.settings_appearance(cx),
                Page::Performance => Self::settings_performance(),
                Page::Updates => self.settings_updates(),
                Page::Hotkeys => Self::settings_hotkeys(),
                Page::Privacy => Self::settings_privacy(),
                Page::Diagnostics => self.settings_diagnostics(cx),
            });
        div()
            .id("settings-panel")
            .mt(px(-9.0))
            .flex_1()
            .min_h_0()
            .w_full()
            .overflow_y_scroll()
            .track_scroll(&self.settings.panel_scroll)
            .child(content)
    }
    fn settings_application(&self) -> Div {
        let zoom = div()
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
            .border_color(rgba(orbit::LINE_STRONG))
            .bg(rgb(orbit::SURFACE_2))
            .opacity(orbit::DISABLED)
            .child(
                div()
                    .size(px(44.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(text("−", 16.0, 700, orbit::INK_MUTED)),
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
                    .border_color(rgba(orbit::LINE_ROW))
                    .child(text("100%", 13.0, 700, orbit::INK)),
            )
            .child(
                div()
                    .size(px(44.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(text("+", 16.0, 700, orbit::INK)),
            );
        let interface = section_surface(
            "Interfaz",
            None,
            section_body()
                .child(section_row(
                    "Zoom de la interfaz",
                    "Amplía o reduce toda la app. Atajos: Ctrl +, Ctrl −, Ctrl 0 o Ctrl + rueda.",
                    zoom,
                ))
                .child(section_row(
                    "Idioma",
                    "Idioma de la interfaz del hub.",
                    self.settings.hub_language.clone(),
                ))
                .child(
                    section_row(
                        "Densidad",
                        "Altura de filas, espaciado y radios.",
                        self.settings.density.clone(),
                    )
                    .border_b_0(),
                ),
        )
        .flex_1();
        let system = Self::settings_system();
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
                    .child(Self::settings_language_menu()),
            );
        }
        view
    }
    fn settings_language_menu() -> Div {
        let mut menu = div()
            .absolute()
            .top(px(180.0))
            .left(px(300.0))
            .w(px(168.0))
            .p(px(6.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::LINE_STRONG))
            .bg(rgb(orbit::SURFACE_2))
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
                    .px(px(14.0))
                    .flex()
                    .items_center()
                    .justify_between()
                    .rounded(px(8.0))
                    .when(index == 0, |item| item.bg(rgba(orbit::LINE_ROW)))
                    .child(text(language, orbit::BODY, 500, orbit::INK_2))
                    .when(index == 0, |item| {
                        item.child(text("✓", orbit::SECONDARY, 650, orbit::CORAL))
                    }),
            );
        }
        menu
    }
    fn settings_system() -> Div {
        section_surface(
            "Sistema",
            None,
            section_body()
                .child(section_row(
                    "Inicio con Windows",
                    "Esta plataforma no permite abrir Vantare al iniciar sesión.",
                    disabled_toggle("settings-startup", "Inicio con Windows", false),
                ))
                .child(section_row(
                    "Empezar minimizado",
                    "Arranca en la bandeja, sin abrir la ventana.",
                    disabled_toggle("settings-minimized", "Empezar minimizado", false),
                ))
                .child(section_row(
                    "Avisos de actualización",
                    "Banner en la shell cuando hay una versión nueva.",
                    disabled_toggle("settings-notify-update", "Avisos de actualización", true),
                ))
                .child(section_row(
                    "Avisos del Launcher",
                    "Toast cuando termina una cadena de arranque.",
                    disabled_toggle("settings-notify-launcher", "Avisos del Launcher", true),
                ))
                .child(section_row(
                    "Notificaciones del sistema",
                    "Esta plataforma no admite notificaciones de escritorio.",
                    disabled_toggle(
                        "settings-notify-system",
                        "Notificaciones del sistema",
                        false,
                    ),
                ))
                .child(
                    section_row(
                        "Probar notificación",
                        "Envía un aviso ahora sin cambiar tus preferencias.",
                        disabled_button("settings-notify-test", "Enviar prueba"),
                    )
                    .border_b_0(),
                )
                .child(section_note(
                    "«Cerrar a la bandeja» y «Unidades» no existen todavía en la configuración de la app, así que no se pintan: no habría nada que guardar detrás del control.",
                )),
        )
        .flex_1()
    }
    fn settings_appearance(&self, cx: &Context<Self>) -> Div {
        let colors = [
            ("Vantare", 0x00f6_e8e8, 0x00a9_1d3e),
            ("Rosa", 0x00f8_dbe9, 0x00a8_316c),
            ("Bosque", 0x00db_f0e1, 0x0026_714d),
            ("Océano", 0x00d9_eff5, 0x0024_6a91),
            ("Ámbar", 0x00f7_e4d4, 0x00a6_5b30),
            ("Iris", 0x00e8_def8, 0x0066_46a8),
            ("Grises", 0x00e9_e9e9, 0x0030_3030),
        ];
        let selected_scheme = self.settings.scheme.read(cx).state.selected;
        let mut palettes = div().w_full().mt(px(18.0)).flex().flex_wrap().gap(px(6.0));
        for (index, (name, light, dark)) in colors.into_iter().enumerate() {
            palettes = palettes.child(palette_card(
                index,
                name,
                light,
                dark,
                index == 0,
                selected_scheme,
            ));
        }
        let contrast = disabled_slider(100.0, 80.0, 120.0, "Contraste");
        let opacity = disabled_slider(80.0, 50.0, 100.0, "Opacidad del cristal");
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
                ))
                .child(section_row(
                    "Apariencia",
                    "Elige claro, oscuro o sigue el ajuste de Windows.",
                    self.settings.scheme.clone(),
                ))
                .child(section_row(
                    "Contraste",
                    "Ajusta la legibilidad del texto secundario y los bordes.",
                    contrast,
                ))
                .child(section_row(
                    "Opacidad del cristal",
                    "Controla cuánto dejan ver el fondo los paneles y la cabecera.",
                    opacity,
                ))
                .child(section_row(
                    "Fuente de interfaz",
                    "Se aplica a menús, controles y textos de la aplicación.",
                    self.settings.font.clone(),
                ))
                .child(
                    section_row(
                        "Fuente monoespaciada",
                        "Se aplica a cifras y textos técnicos de la interfaz.",
                        self.settings.mono.clone(),
                    )
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
                        .border_color(rgba(orbit::LINE))
                        .bg(rgb(orbit::SURFACE_1))
                        .child(text(
                            "Vista previa de la interfaz y sus cifras",
                            12.0,
                            400,
                            orbit::INK,
                        ))
                        .child(
                            div()
                                .font_family("Cascadia Code")
                                .child(
                                    text("01:23.456 · LMU / Vantare", 12.0, 500, orbit::INK_2)
                                        .font_family("Cascadia Code"),
                                ),
                        ),
                )
                .child(section_row(
                    "Reducir animaciones",
                    "Preferencia local de esta app; la del sistema se respeta siempre.",
                    disabled_toggle("settings-motion", "Reducir animaciones", false),
                ))
                .child(section_note(
                    "La apariencia de los widgets del overlay se configura por separado en Overlay Studio.",
                )),
            ))
    }
    fn settings_performance() -> Div {
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
            levels = levels.child(performance_choice(index, name, rate, description, false));
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
            ))
            .child(performance_mode(
                "Automático",
                "Próximamente",
                "Vantare mide tu PC en carrera y se ajusta solo (entre Alto y Mínimo).",
                true,
            ));
        section_surface(
            "Nivel de rendimiento",
            Some("Sin estado de rendimiento nativo"),
            section_body()
                .gap(px(12.0))
                .child(levels)
                .child(custom_auto)
                .child(text(
                    "Personalizado se guarda en el perfil activo; los cinco niveles son el valor predeterminado de la app.",
                    orbit::SECONDARY,
                    400,
                    orbit::INK_3,
                )),
        )
    }
    fn settings_updates(&self) -> Div {
        let (version, state, channel) = match &self.settings.update {
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
        };
        let news = section_surface(
            "Novedades",
            Some("docs/releases"),
            section_body().child(section_note(
                "Todavía no hay ninguna nota de versión empaquetada.",
            )),
        );
        stack()
            .child(Self::settings_update_hero(version, state))
            .child(Self::settings_update_channels(channel))
            .child(news)
    }
    fn settings_update_hero(version: String, state: String) -> Div {
        div()
            .w_full()
            .flex()
            .items_center()
            .gap(px(20.0))
            .px(px(22.0))
            .py(px(20.0))
            .rounded(px(orbit::RADIUS))
            .border_1()
            .border_color(rgba(orbit::LINE))
            .bg(rgb(orbit::SURFACE_1))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(orbit::eyebrow("Versión instalada"))
                    .child(
                        div()
                            .font_family("Cascadia Code")
                            .child(text(version, 30.0, 750, orbit::INK).mt(px(4.0))),
                    )
                    .child(text(state, 12.5, 400, orbit::INK_3).mt(px(4.0))),
            )
            .child(
                div()
                    .flex()
                    .flex_none()
                    .items_center()
                    .gap(px(12.0))
                    .child(disabled_button(
                        "settings-update-install",
                        "Instalar actualización",
                    ))
                    .child(disabled_button(
                        "settings-update-check",
                        "Buscar actualizaciones",
                    )),
            )
    }
    fn settings_update_channels(channel: Option<&str>) -> Div {
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
                    .p(px(16.0))
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .rounded(px(orbit::RADIUS))
                    .border_1()
                    .border_color(if active {
                        rgba(0xf047_5559)
                    } else {
                        rgba(orbit::LINE)
                    })
                    .bg(if active {
                        rgba(0xd52f_4910)
                    } else {
                        rgb(orbit::SURFACE_1)
                    })
                    .opacity(orbit::DISABLED)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(text(name, 15.0, 700, orbit::INK))
                            .child(if active {
                                orbit::chip("Canal local", Tone::Neutral).into_any_element()
                            } else if index > 0 {
                                orbit::icon("i-lock", 13.0, orbit::INK_3).into_any_element()
                            } else {
                                orbit::icon("i-chevron", 13.0, orbit::INK_3).into_any_element()
                            }),
                    )
                    .child(text(description, 12.0, 400, orbit::INK_3))
                    .child(text("sin versión publicada", 11.0, 600, orbit::INK_3)),
            );
        }
        channels
    }
    fn settings_hotkeys() -> Div {
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
            let mut keycaps = div().flex().flex_none().items_center().gap(px(5.0));
            for (key_index, key) in keys.into_iter().enumerate() {
                if key_index > 0 {
                    keycaps = keycaps.child(text("+", 11.0, 500, orbit::INK_3));
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
                        .border_color(rgba(orbit::LINE_STRONG))
                        .bg(rgb(orbit::SURFACE_2))
                        .opacity(orbit::DISABLED)
                        .child(text(key, 10.5, 600, orbit::INK_2)),
                );
            }
            body = body.child(section_row(label, help, keycaps).id(("settings-hotkey", index)));
        }
        stack()
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
                            .child(orbit::eyebrow("Atajos globales"))
                            .child(text(
                                "Funcionan aunque Vantare esté en segundo plano. Pulsa una fila y después la combinación para reasignarla; los conflictos se marcan en ámbar.",
                                orbit::BODY,
                                400,
                                orbit::INK_2,
                            ).line_height(px(20.9))),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(10.0))
                            .child(disabled_button(
                                "settings-hotkeys-reset",
                                "Restablecer todos",
                            ))
                            .child(section_status("Sin conflictos", orbit::GREEN)),
                    ),
            )
            .child(
                div()
                    .w_full()
                    .max_w(px(490.0))
                    .child(section_surface("Overlay", Some("4 combinaciones"), body)),
            )
            .child(section_note(
                "El Hub nativo todavía no registra atajos globales. Las combinaciones se muestran como referencia y no se pueden reasignar aquí.",
            ))
    }
    fn settings_privacy_consent() -> Div {
        let shared_bullets = div()
            .flex()
            .flex_col()
            .child(privacy_bullet(
                "Consumos, stints, pits, estrategias observadas y calidad ya derivados.",
            ))
            .child(privacy_bullet(
                "Combinación del catálogo y semana ISO, nunca fecha u hora exactas.",
            ))
            .child(privacy_bullet(
                "Un identificador administrativo separado para cuota y borrado.",
            ));
        let never_bullets = div()
            .flex()
            .flex_col()
            .child(privacy_bullet("Telemetría cruda ni archivos de sesión."))
            .child(privacy_bullet(
                "Nombres, SteamID, correo ni rutas del equipo.",
            ))
            .child(privacy_bullet(
                "Voz, audio, estrategias editables ni perfiles completos.",
            ));
        let shared = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .child(text("Se comparte", 16.0, 700, orbit::INK))
            .child(shared_bullets);
        let never = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .child(text("Nunca se comparte", 16.0, 700, orbit::INK))
            .child(never_bullets);
        section_surface(
            "Consentimiento de contribución",
            None,
            section_body()
                .child(text(
                    "Si aceptas, Vantare puede preparar y subir automáticamente paquetes seudonimizados de Strategy. Cada paquete queda visible e inspeccionable antes del envío.",
                    16.0,
                    400,
                    orbit::INK_2,
                ).line_height(px(24.0)))
                .child(columns().child(shared).child(never))
                .child(section_note(
                    "Los paquetes son seudonimizados, no anónimos. Los secretos de subida y borrado se generan al aceptar y permanecen en el almacén protegido de Windows.",
                ))
                .child(
                    div()
                        .mt(px(10.0))
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .gap(px(8.0))
                        .child(disabled_button(
                            "settings-consent",
                            "Aceptar y participar",
                        ))
                        .child(disabled_button("settings-revoke", "Revocar consentimiento"))
                        .child(disabled_button(
                            "settings-delete-remote",
                            "Solicitar borrado remoto",
                        )),
                )
                .child(
                    div()
                        .mt(px(12.0))
                        .flex()
                        .items_start()
                        .child(section_status(
                            "Sin consentimiento activo: no se prepara ni envía nada",
                            orbit::EMBER,
                        )),
                ),
        )
    }
    fn settings_privacy_queue() -> Div {
        section_surface(
            "Cola e historial de envíos",
            Some("no disponible"),
            section_body()
                .child(section_note(
                    "La cola de Strategy no está disponible en el Hub nativo.",
                ))
                .child(
                    div()
                        .mt(px(2.0))
                        .flex()
                        .items_start()
                        .child(disabled_button("settings-send-next", "Enviar siguiente")),
                ),
        )
    }
    fn settings_privacy_history() -> Div {
        section_surface(
            "Historial de borrado remoto",
            None,
            section_body()
                .child(section_note(
                    "No hay un contrato nativo para consultar borrados remotos.",
                ))
                .child(section_note(
                    "El borrado alcanza bundles, copias, índices, cachés e informes derivados. Los agregados irreversibles de cohortes ya publicadas no se pueden retirar individualmente.",
                )),
        )
    }
    fn settings_privacy() -> Div {
        div()
            .flex()
            .flex_col()
            .w_full()
            .min_w_0()
            .gap(px(15.0))
            .child(Self::settings_privacy_consent())
            .child(Self::settings_privacy_queue())
            .child(Self::settings_privacy_history())
    }
    fn settings_events(&self, cx: &mut Context<Self>) -> Div {
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
            ));
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
            match table.render() {
                Ok(table) => events = events.child(table),
                Err(error) => events = events.child(orbit::callout(error)),
            }
        }
        section_surface("Últimos eventos", Some("sesión actual"), events).flex_1()
    }
    fn settings_diagnostics(&self, cx: &mut Context<Self>) -> Div {
        let tiles = [
            ("Telemetry Core", "—", "sin fuente conectada"),
            ("Overlay", "—", "sin perfil activo"),
            ("CPU · memoria", "—", "muestreo no disponible"),
            ("Datos locales", "—", "medición no disponible"),
        ];
        let mut stats = div().flex().w_full().gap(px(12.0));
        for (label, value, help) in tiles {
            stats = stats.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .min_h(px(108.0))
                    .p(px(16.0))
                    .flex()
                    .flex_col()
                    .justify_between()
                    .rounded(px(orbit::RADIUS))
                    .border_1()
                    .border_color(rgba(orbit::LINE))
                    .bg(rgb(orbit::SURFACE_1))
                    .child(orbit::eyebrow(label))
                    .child(text(value, 23.0, 700, orbit::INK))
                    .child(text(help, 12.0, 400, orbit::INK_3)),
            );
        }
        let data = section_surface(
            "Datos y registros",
            None,
            section_body()
                .child(section_row(
                    "Carpeta de datos",
                    &self.settings.data.display().to_string(),
                    small_button("settings-data-open", "Abrir")
                        .tab_stop(false)
                        .opacity(orbit::DISABLED)
                        .aria_description("Sin acción nativa para abrir esta carpeta"),
                ))
                .child(section_row(
                    "Carpeta de registros",
                    "Sin contrato nativo de registro del Hub.",
                    small_button("settings-logs-open", "Abrir")
                        .tab_stop(false)
                        .opacity(orbit::DISABLED)
                        .aria_description("Sin ruta de registros disponible"),
                ))
                .child(section_row(
                    "Muestreo de CPU",
                    "Métrica de diagnóstico local.",
                    disabled_toggle("settings-cpu", "Muestreo de CPU", false),
                ))
                .child(
                    section_row(
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
                        .h(px(30.0))
                        .px(px(12.0)),
                    )
                    .border_b_0(),
                ),
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
                ),
            ));
        }
        report.push(section_surface("Informe de diagnóstico local", None, body));
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
                        .child(text(json, orbit::SECONDARY, 400, orbit::INK_2))
                        .child(copy),
                ));
            }
            Err(_) => report.push(orbit::callout("No se pudo serializar el diagnóstico.")),
        }
        report
    }
}
