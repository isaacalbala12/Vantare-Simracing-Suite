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

fn stack() -> Div {
    div()
        .flex()
        .flex_col()
        .w_full()
        .min_w_0()
        .min_h_0()
        .gap(px(12.0))
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
        .min_h(px(cx.global::<orbit::Adapt>().setting_height()))
        .py(px(3.0))
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
                .when(cx.global::<orbit::Adapt>().show_optional(), |row| {
                    row.child(section_text(
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
                    ))
                }),
        )
        .child(control)
}
fn section_body() -> Div {
    div().flex().flex_col()
}
fn section_surface(title: &str, meta: Option<&str>, body: Div, cx: &gpui::App) -> Div {
    let number = match title {
        "Inicio" | "Temas" | "En el Hub" | "Canal" | "Diagnóstico local" => 2,
        "Avisos" | "En Studio" | "Notas de versión" | "Registro observado" => 3,
        "Widgets" | "Movimiento" => 4,
        _ => 1,
    };
    section_numbered(number, title, meta, body, cx)
}
fn section_numbered(
    number: usize,
    title: &str,
    meta: Option<&str>,
    body: Div,
    cx: &gpui::App,
) -> Div {
    orbit::settings_group(
        number,
        title,
        orbit::neo_card(cx)
            .p(px(12.0))
            .min_h_0()
            .when_some(meta, |card, meta| {
                card.child(orbit::meta(meta, 10.0, orbit::skin(cx).text3, cx))
            })
            .flex_1()
            .child(
                body.min_h_0()
                    .flex_grow(1.0)
                    .id(format!("settings-body-{title}"))
                    .when(
                        matches!(
                            title,
                            "Notas de versión"
                                | "Registro observado"
                                | "Informe de diagnóstico local"
                        ),
                        gpui::StatefulInteractiveElement::overflow_y_scroll,
                    ),
            ),
        cx,
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

fn reference_choice(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<Div> {
    orbit::pending_select(id, label, label, 210.0, "Próximamente", cx)
}
fn reference_primary(id: &'static str, label: &str, cx: &gpui::App) -> gpui::Stateful<Div> {
    orbit::carmine_button(id, label, cx)
}
/// Tarjeta de tema R10.1: nombre y dos orbes (claro y oscuro) con acento y fondo.
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
        .self_start()
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
        orbit::neo_page_header(
            self.settings.page.title(),
            self.settings.page.description(),
            cx,
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
            .h_full()
            .flex()
            .items_center()
            .gap(px(20.0))
            .min_w_0()
            .overflow_x_scroll();
        for (index, page) in Page::ALL.into_iter().enumerate() {
            if !page.matches(query) {
                continue;
            }
            tabs = tabs.child(
                orbit::topbar_tab(
                    ("settings-tab", index),
                    page.label(),
                    page == self.settings.page,
                    cx,
                )
                .aria_description(page.subtitle())
                .track_focus(&self.settings.nav_focus[index])
                .on_click(cx.listener(move |hub, _, window, cx| {
                    hub.settings.nav_focus[index].focus(window, cx);
                    hub.select_settings_page(page, cx);
                }))
                .on_key_down(cx.listener(
                    move |hub, event: &gpui::KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            hub.select_settings_page(page, cx);
                            cx.stop_propagation();
                        }
                    },
                )),
            );
        }
        tabs
    }

    #[allow(clippy::too_many_lines)] // Composición del carril de las siete páginas, sin lógica de negocio.
    pub(in crate::shell) fn settings_rail(
        &self,
        cx: &mut Context<Self>,
    ) -> Vec<orbit::RailSection> {
        let mut rail = Vec::new();
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
                "Informe de diagnóstico",
                "v-monitor",
                "Prepara un informe del estado de Vantare, sin contraseñas ni datos de la carrera.",
            ),
            Page::Application => (
                "Huella en pista",
                "v-gauge",
                "El consumo de CPU y memoria se mostrará cuando haya una medición disponible.",
            ),
        };
        rail.push(orbit::RailSection::new(
            title,
            icon,
            stack()
                .gap(px(12.0))
                .child(text(note, 13.0, 400, orbit::ink_2(cx), cx))
                .when(self.settings.page == Page::Appearance, |card| {
                    card.child(
                        orbit::small_button("settings-open-studio", "Abrir Overlay Studio", cx)
                            .self_start()
                            .on_click(
                                cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)),
                            ),
                    )
                }),
        ));
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
        for (title, icon, note) in sections {
            rail.push(orbit::RailSection::new(
                *title,
                icon,
                text(*note, 13.0, 400, orbit::ink_2(cx), cx),
            ));
        }
        if self.settings.page == Page::Appearance {
            rail.push(orbit::RailSection::new(
                "Vista previa",
                "v-palette",
                orbit::neo_card(cx)
                    .flex_shrink(0.0)
                    .child(orbit::neo_header("Vantare", "v-home", cx))
                    .child(text(
                        cx.global::<orbit::theme::Theme>().palette.label(),
                        20.0,
                        700,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(text(
                        "Así se ven las tarjetas, los textos y los controles con tu tema.",
                        13.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(orbit::pill("Tema actual", Tone::Accent, cx).self_start())
                    .child(
                        orbit::carmine_button("theme-preview-button", "Botón primario", cx)
                            .self_start()
                            .tab_stop(false)
                            .cursor_default(),
                    )
                    .child(orbit::progress(0.65, cx)),
            ));
        }
        if self.settings.page == Page::Application {
            rail.push(orbit::RailSection::new(
                "Versión",
                "v-download",
                stack()
                    .gap(px(12.0))
                    .child(text(crate::version_label(), 22.0, 700, orbit::ink(cx), cx))
                    .child(
                        orbit::small_button("settings-open-updates", "Actualizaciones", cx)
                            .self_start()
                            .on_click(cx.listener(|hub, _, _, cx| {
                                hub.select_settings_page(Page::Updates, cx);
                            })),
                    ),
            ));
            rail.push(orbit::RailSection::new(
                "Diagnóstico",
                "v-monitor",
                stack()
                    .gap(px(8.0))
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
            ));
            rail.push(orbit::RailSection::new(
                "Atajos del Hub",
                "v-keys",
                stack().children(
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
            ));
        }
        if self.settings.page == Page::Diagnostics {
            let details = self.settings_diagnostic_report(cx);
            if !details.is_empty() {
                rail.push(
                    orbit::RailSection::new(
                        "Contenido del informe",
                        "v-monitor",
                        stack().children(details),
                    )
                    .grow(),
                );
            }
        }
        rail
    }

    pub(in crate::shell) fn settings(
        &self,
        window: &Window,
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
            .gap(px(cx.global::<orbit::Adapt>().gap()))
            .when_some(self.settings.status.clone(), |view, status| {
                view.child(orbit::callout(status, cx))
            })
            .child(
                match self.settings.page {
                    Page::Application => self.settings_application(true, window, cx),
                    Page::Appearance => self.settings_appearance(cx),
                    Page::Performance => Self::settings_performance(true, cx),
                    Page::Updates => self.settings_updates(cx),
                    Page::Hotkeys => Self::settings_hotkeys(cx),
                    Page::Privacy => self.settings_privacy(cx),
                    Page::Diagnostics => self.settings_diagnostics(true, cx),
                }
                .h_full()
                .min_h_0(),
            );
        div()
            .id("settings-panel")
            .flex_1()
            .min_h_0()
            .w_full()
            .flex()
            .child(
                div()
                    .id("settings-main-scroll")
                    .flex_1()
                    .min_w_0()
                    .h_full()
                    .overflow_hidden()
                    .child(content),
            )
    }
    fn settings_zoom(&self, cx: &Context<Self>) -> gpui::Stateful<Div> {
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
                    .id("settings-zoom-less")
                    .cursor_pointer()
                    .on_click(
                        cx.listener(|hub, _, window, cx| hub.settings_zoom_change(-1, window, cx)),
                    )
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
                    .id("settings-zoom-reset")
                    .cursor_pointer()
                    .on_click(
                        cx.listener(|hub, _, window, cx| hub.settings_zoom_change(0, window, cx)),
                    )
                    .child(text(
                        format!("{}%", self.settings.appearance.zoom_percent),
                        13.0,
                        700,
                        orbit::ink(cx),
                        cx,
                    )),
            )
            .child(
                div()
                    .size(px(44.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .id("settings-zoom-more")
                    .cursor_pointer()
                    .on_click(
                        cx.listener(|hub, _, window, cx| hub.settings_zoom_change(1, window, cx)),
                    )
                    .child(text("+", 16.0, 700, orbit::ink(cx), cx)),
            )
    }
    fn settings_application(&self, _compact: bool, _window: &Window, cx: &Context<Self>) -> Div {
        let pending = |label| orbit::pill(label, Tone::Neutral, cx);
        stack()
            .h_full()
            .gap(px(cx.global::<orbit::Adapt>().gap()))
            .child(section_surface(
                "Interfaz",
                None,
                section_body()
                    .child(section_row(
                        "Idioma · Próximamente",
                        "Idioma del Hub · Próximamente",
                        reference_choice(
                            "settings-hub-language",
                            &self.settings.hub_language.read(cx).state.options[0].label,
                            cx,
                        ),
                        cx,
                    ))
                    .child(section_row(
                        "Tamaño de la interfaz",
                        "Ctrl +, Ctrl − y Ctrl 0",
                        self.settings_zoom(cx),
                        cx,
                    ))
                    .when(cx.global::<orbit::Adapt>().show_optional(), |body| {
                        body.child(section_row(
                            "Densidad",
                            &format!(
                                "{} · Próximamente",
                                self.settings.density.read(cx).state.options[1].label
                            ),
                            pending("Próximamente"),
                            cx,
                        ))
                    }),
                cx,
            ))
            .child(section_surface(
                "Inicio",
                None,
                section_body()
                    .child(section_row(
                        "Abrir al iniciar Windows",
                        "Se abre al iniciar sesión en Windows",
                        pending("Próximamente"),
                        cx,
                    ))
                    .child(section_row(
                        "Empezar minimizado",
                        "Arranque sin abrir la ventana",
                        pending("Próximamente"),
                        cx,
                    )),
                cx,
            ))
            .child(section_surface(
                "Avisos",
                None,
                section_body()
                    .child(section_row(
                        "Avisos de actualización",
                        "Cuando hay una versión nueva",
                        pending("Próximamente"),
                        cx,
                    ))
                    .child(section_row(
                        "Avisos del Launcher",
                        "Al terminar de abrir tus aplicaciones",
                        pending("Próximamente"),
                        cx,
                    ))
                    .when(cx.global::<orbit::Adapt>().show_optional(), |body| {
                        body.child(section_row(
                            "Notificaciones de Windows",
                            "Avisos con el Hub minimizado",
                            pending("Próximamente"),
                            cx,
                        ))
                    }),
                cx,
            ))
            .child(section_surface(
                "Widgets",
                None,
                section_body()
                    .child(section_row(
                        "Idioma de los widgets",
                        "Se guarda con el diseño de Studio",
                        self.settings.language.clone(),
                        cx,
                    ))
                    .child(section_row(
                        "Unidades de los widgets",
                        "Combustible, temperatura y velocidad",
                        self.settings.units.clone(),
                        cx,
                    )),
                cx,
            ))
    }
    fn settings_appearance(&self, cx: &mut Context<Self>) -> Div {
        let settings = self.settings.appearance.settings;
        let mut palettes = div().w_full().grid().grid_cols(3).gap(px(10.0));
        for (index, palette) in orbit::theme::Palette::ALL.into_iter().enumerate() {
            palettes = palettes.child(
                orbit::palette_card(index, palette, palette == settings.palette, cx)
                    .track_focus(&self.settings.appearance_focus[index])
                    .tab_index(0)
                    .cursor_pointer()
                    .on_click(cx.listener(move |hub, _, window, cx| {
                        hub.settings_palette(index, window, cx);
                    }))
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
        let mut schemes = div().flex().w_full().gap(px(10.0));
        for (index, scheme) in [
            orbit::theme::Scheme::System,
            orbit::theme::Scheme::Light,
            orbit::theme::Scheme::Dark,
        ]
        .into_iter()
        .enumerate()
        {
            schemes = schemes.child(
                orbit::scheme_card(index, scheme, settings.scheme == scheme, cx)
                    .track_focus(&self.settings.appearance_focus[9 + index])
                    .tab_index(0)
                    .on_click(cx.listener(move |hub, _, window, cx| {
                        hub.settings_scheme(scheme, window, cx);
                    }))
                    .on_key_down(cx.listener(
                        move |hub, event: &gpui::KeyDownEvent, window, cx| {
                            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                hub.settings_scheme(scheme, window, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
            );
        }
        let contrast = self.settings_slider(0, cx);
        let opacity = self.settings_slider(1, cx);
        stack()
            .h_full()
            .gap(px(cx.global::<orbit::Adapt>().gap()))
            .child(orbit::settings_group(1, "Esquema de color", schemes, cx))
            .child(orbit::settings_group(2, "Temas", palettes, cx))
            .child(section_numbered(
                3,
                "Interfaz",
                None,
                section_body()
                    .child(section_row(
                        "Contraste",
                        "Legibilidad del texto secundario y los bordes",
                        contrast,
                        cx,
                    ))
                    .child(section_row(
                        "Opacidad de las superficies",
                        "Solidez de los menús y paneles",
                        opacity,
                        cx,
                    ))
                    .child(section_row(
                        "Fuente de interfaz",
                        "Menús, controles y textos",
                        self.settings.font.clone(),
                        cx,
                    ))
                    .when(cx.global::<orbit::Adapt>().show_optional(), |body| {
                        body.child(section_row(
                            "Fuente monoespaciada",
                            "Cifras y textos técnicos",
                            self.settings.mono.clone(),
                            cx,
                        ))
                    }),
                cx,
            ))
            .when(cx.global::<orbit::Adapt>().show_notes(), |page| {
                page.child(section_surface(
                    "Movimiento",
                    None,
                    section_body().child(section_row(
                        "Reducir animaciones",
                        "Transiciones y latidos",
                        orbit::pill("Próximamente", Tone::Neutral, cx),
                        cx,
                    )),
                    cx,
                ))
            })
    }
    fn settings_slider(&self, index: usize, cx: &mut Context<Self>) -> gpui::Stateful<Div> {
        let settings = self.settings.appearance.settings;
        let (value, min, max, label) = if index == 0 {
            (settings.contrast, 80.0, 120.0, "Contraste")
        } else {
            (settings.glass_opacity, 50.0, 100.0, "Opacidad del cristal")
        };
        let entity = cx.entity();
        orbit::appearance_slider(f32::from(value), min, max, label, cx)
            .relative()
            .track_focus(&self.settings.appearance_focus[12 + index])
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
                    hub.settings.appearance_focus[12 + index].focus(window, cx);
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
    fn settings_performance(_compact: bool, cx: &mut Context<Self>) -> Div {
        let mut levels = div().grid().grid_cols(3).w_full().min_w_0().gap(px(10.0));
        for (index, name) in [
            "Automático",
            "Máximo",
            "Alto",
            "Equilibrado",
            "Ahorro",
            "Mínimo",
        ]
        .into_iter()
        .enumerate()
        {
            levels = levels.child(
                orbit::neo_card(cx)
                    .p(px(12.0))
                    .gap(px(8.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(orbit::caps(name, 16.0, orbit::ink(cx), cx))
                            .child(orbit::meta(
                                &if index == 0 {
                                    "AUTO".into()
                                } else {
                                    index.to_string()
                                },
                                11.0,
                                orbit::skin(cx).accent_bright,
                                cx,
                            )),
                    )
                    .child(orbit::pill("Próximamente", Tone::Neutral, cx).self_start()),
            );
        }
        stack().h_full().child(section_surface("Nivel de rendimiento", Some("La selección nativa aún no está disponible"), levels, cx))
            .child(orbit::neo_card(cx).p(px(12.0)).gap(px(10.0))
                .child(orbit::caps("Personalizado", 16.0, orbit::ink(cx), cx))
                .child(text("La frecuencia por widget pertenece al inspector de Studio. Estará disponible próximamente.", 13.0, 400, orbit::ink_2(cx), cx))
                .child(orbit::small_button("settings-custom-studio", "Abrir Studio", cx).self_start()
                    .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)))))
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
        // Estado externo aislado solo en capturas QA; no modifica la beta real.
        #[cfg(feature = "parity-capture")]
        let beta = if self.capture.is_some() {
            super::updates::beta_status()
        } else {
            beta
        };
        let current = beta
            .as_ref()
            .is_some_and(|status| status.state == "current" && status.version == version);
        stack().h_full()
            .when_some(beta.filter(|status| status.state != "current"), |surface, status| {
                surface.child(
                    Self::settings_beta_notice(status, cx),
                )
            })
            .child(Self::settings_update_hero(
                version,
                state,
                current,
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
        let ready = status.ready_for(crate::version_label());
        section_body()
            .flex_row()
            .flex_wrap()
            .items_center()
            .justify_between()
            .when(ready, |body| {
                body.child(orbit::pill("Hay una versión nueva", Tone::Accent, cx))
            })
            .when(!ready && status.state != "current", |body| {
                body.child(text(status.message, 13.0, 400, orbit::ink_2(cx), cx).min_w_0())
            })
            .when(ready, |body| {
                body.child(
                    orbit::carmine_button("beta-restart-now", "Instalar y reiniciar", cx)
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
        body = body.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .gap(px(12.0))
                .min_h(px(46.0))
                .child(text(crate::version_label(), 14.0, 700, orbit::ink(cx), cx))
                .child(orbit::pill("Instalada", Tone::Success, cx)),
        );

        match super::releases::news_for_channel(crate::product::CHANNEL) {
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
                            .child(orbit::pill(
                                &release.kind,
                                match release.kind.as_str() {
                                    "Nuevo" => Tone::Accent,
                                    "Arreglo" => Tone::Success,
                                    _ => Tone::Neutral,
                                },
                                cx,
                            )),
                    );
                }
            }
            Err(error) => body = body.child(section_note(error, cx)),
        }
        body
    }
    fn settings_update_hero(version: String, state: String, current: bool, cx: &gpui::App) -> Div {
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
                    .child(
                        text(version, 30.0, 600, orbit::ink(cx), cx)
                            .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
                            .mt(px(4.0)),
                    )
                    .child(text(state, 12.5, 400, orbit::ink_3(cx), cx).mt(px(4.0))),
            )
            .when(current, |hero| {
                hero.child(orbit::pill("Estás al día", Tone::Success, cx).self_center())
            })
    }

    fn settings_update_channels(channel: Option<&str>, demo: bool, cx: &gpui::App) -> Div {
        let mut channels = div().flex().w_full().gap(px(12.0));
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
                    .child(text(
                        if active {
                            "Canal instalado"
                        } else {
                            "Canal no seleccionado"
                        },
                        11.0,
                        600,
                        orbit::ink_3(cx),
                        cx,
                    )),
            );
        }
        channels
    }
    fn settings_hotkeys(cx: &gpui::App) -> Div {
        let keys = |items: &[(&str, &str)], help: &str| {
            section_body().children(
                items
                    .iter()
                    .map(|(label, key)| section_row(label, help, orbit::keycap(*key, cx), cx)),
            )
        };
        stack().h_full()
            .child(section_surface("Globales con el juego", Some("Próximamente"),
                section_body().child(text("Las acciones en pista aún no tienen un registro global nativo. No hay combinaciones activas ni edición de atajos aquí.", 13.0, 400, orbit::ink_2(cx), cx)), cx))
            .child(section_surface("En el Hub", None, keys(&[
                ("Lanzar perfil favorito", "Ctrl L"), ("Buscar en Vantare", "Ctrl K"),
                ("Contraer barra izquierda", "Ctrl B"), ("Contraer barra derecha", "Ctrl Alt B"),
            ], "Con la ventana del Hub activa"), cx))
            .child(section_surface("En Studio", None, keys(&[
                ("Deshacer", "Ctrl Z"), ("Rehacer", "Ctrl Mayús Z / Ctrl Y"),
            ], "Con el lienzo de Studio activo"), cx))
    }
    fn settings_privacy(&self, cx: &mut Context<Self>) -> Div {
        stack()
            .child(self.settings_privacy_diagnostics(cx).flex_none())
            .when(self.shell.access.lock(Section::Strategy).is_none(), |page| {
                page.child(section_numbered(2, "Contribución de estrategia", None,
                    section_body().gap(px(12.0))
                        .child(paragraph("Compartir resúmenes de carrera, consultar los envíos y solicitar su borrado estará disponible próximamente.", 14.0, 400, orbit::ink_2(cx), cx))
                        .child(orbit::pill("Próximamente", Tone::Neutral, cx).self_start()), cx).flex_none())
            })
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
                    body = body.child(section_note("Esta versión aún no tiene configurado el envío. Tus preferencias quedan guardadas.", cx));
                }
            }
        }
        section_surface("Lo que compartes", None, body, cx)
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
        section_surface(
            "Registro observado",
            Some("Errores registrados en esta sesión"),
            events,
            cx,
        )
        .flex_1()
        .min_h_0()
    }
    fn settings_statistics(connected: bool, cx: &gpui::App) -> Div {
        let mut stats = div().grid().grid_cols(3).w_full().gap(px(10.0));
        for (label, value) in [
            (
                "Telemetría",
                if connected { "Conectada" } else { "Esperando" },
            ),
            ("Overlays", "Sin observación"),
            ("CPU / memoria", "—"),
        ] {
            stats = stats.child(
                orbit::neo_card(cx)
                    .p(px(12.0))
                    .gap(px(6.0))
                    .child(orbit::caps(label, 14.0, orbit::ink_2(cx), cx))
                    .child(text(value, 16.0, 600, orbit::ink(cx), cx)),
            );
        }
        orbit::settings_group(1, "Estado de Vantare", stats, cx)
    }
    fn settings_diagnostics(&self, _compact: bool, cx: &mut Context<Self>) -> Div {
        stack()
            .h_full()
            .child(Self::settings_statistics(
                self.previous_source == Some(true),
                cx,
            ))
            .child(section_surface(
                "Diagnóstico local",
                None,
                section_body()
                    .child(section_row(
                        "Informe sanitizado",
                        "Sin contraseñas ni datos de carrera",
                        self.settings_button(
                            "settings-diagnostic-prepare",
                            if self.settings.busy {
                                "Preparando…"
                            } else {
                                "Preparar informe"
                            },
                            Action::PrepareDiagnostic,
                            cx,
                        ),
                        cx,
                    ))
                    .when(self.settings.diagnostic.is_some(), |body| {
                        body.child(section_row(
                            "Informe preparado",
                            "Copia local; no envía datos",
                            self.settings_button(
                                "settings-diagnostic-copy",
                                "Copiar informe",
                                Action::CopyDiagnostic,
                                cx,
                            ),
                            cx,
                        ))
                    }),
                cx,
            ))
            .child(self.settings_events(cx).flex_1().min_h_0())
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
