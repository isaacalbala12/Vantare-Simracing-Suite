//! Chrome del Workshop; el widget sigue siendo el Overlay productivo.
use super::*;

impl Workshop {
    fn segments(
        control: Control,
        selected: &str,
        choices: &[(&str, &str)],
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        div()
            .flex()
            .gap(px(4.0))
            .children(choices.iter().map(|(id, label)| {
                let value = (*id).to_owned();
                button(format!("segment-{label}"), label, *id == selected)
                    .flex_1()
                    .px(px(3.0))
                    .text_size(px(10.0))
                    .on_click(cx.listener(move |this, _, _, cx| this.select(control, &value, cx)))
            }))
    }
    fn numeric_field(
        &self,
        control: Control,
        label: &str,
        value: f32,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let draft = self
            .numeric
            .as_ref()
            .filter(|(c, _)| *c == control)
            .map_or_else(|| value.to_string(), |(_, s)| format!("{s}▏"));
        div()
            .mt(px(10.0))
            .flex()
            .flex_col()
            .gap(px(8.0))
            .text_size(px(10.0))
            .text_color(rgb(0xacacb2))
            .child(label.to_owned())
            .child(
                button(format!("number-{label}"), &draft, false)
                    .role(gpui::Role::TextInput)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.numeric = Some((control, String::new()));
                        this.open = None;
                        this.focus.focus(window, cx);
                        cx.notify();
                    })),
            )
    }

    fn slider(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let entity = cx.entity();
        let fraction = self.playback.frame as f32 / (self.scene.snapshots.len() - 1).max(1) as f32;
        div()
            .id("phase-slider")
            .tab_index(0)
            .aria_label("Fase de la escena")
            .h(px(22.0))
            .w_full()
            .cursor_pointer()
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseDownEvent, _, cx| {
                    this.dragging = true;
                    this.scrub(event.position.x, cx);
                }),
            )
            .on_mouse_move(cx.listener(|this, event: &gpui::MouseMoveEvent, _, cx| {
                if this.dragging {
                    this.scrub(event.position.x, cx);
                }
            }))
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, _| this.dragging = false),
            )
            .on_mouse_up_out(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, _| this.dragging = false),
            )
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                match event.keystroke.key.as_str() {
                    "left" => this.park(this.playback.frame.saturating_sub(1), cx),
                    "right" => this.park(this.playback.frame + 1, cx),
                    _ => return,
                }
                cx.stop_propagation();
            }))
            .child(
                gpui::canvas(
                    move |bounds, _, cx| {
                        entity.update(cx, |this, _| this.slider_bounds = Some(bounds));
                    },
                    move |bounds, (), window, _| {
                        let x = bounds.left() + px(f32::from(bounds.size.width) * fraction);
                        window.paint_quad(gpui::fill(
                            gpui::Bounds::new(
                                gpui::point(bounds.left(), bounds.top() + px(10.0)),
                                gpui::size(bounds.size.width, px(3.0)),
                            ),
                            rgb(0x44444a),
                        ));
                        window.paint_quad(gpui::fill(
                            gpui::Bounds::new(
                                gpui::point(x - px(5.0), bounds.top() + px(5.0)),
                                gpui::size(px(10.0), px(13.0)),
                            ),
                            rgb(0xc1121f),
                        ));
                    },
                )
                .size_full(),
            )
    }

    fn picker(
        &self,
        control: Control,
        label: &str,
        selected: &str,
        options: Vec<(String, String)>,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let current = options
            .iter()
            .find(|(id, _)| id == selected)
            .map_or(selected, |(_, label)| label.as_str());
        let mut field = div()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .mt(px(10.0))
            .text_size(px(10.0))
            .text_color(rgb(0xacacb2))
            .child(label.to_owned())
            .child(
                button(format!("select-{label}"), &format!("{current}  ▾"), false).on_click(
                    cx.listener(move |this, _, _, cx| {
                        this.open = if this.open == Some(control) {
                            None
                        } else {
                            Some(control)
                        };
                        cx.notify();
                    }),
                ),
            );
        if self.open == Some(control) {
            field = field.child(
                div()
                    .id(format!("options-{label}"))
                    .max_h(px(180.0))
                    .overflow_y_scroll()
                    .bg(rgb(0x232325))
                    .children(options.into_iter().map(|(id, label)| {
                        button(format!("option-{label}-{id}"), &label, id == selected).on_click(
                            cx.listener(move |this, _, _, cx| this.select(control, &id, cx)),
                        )
                    })),
            );
        }
        field
    }

    fn setting(
        &self,
        key: &'static str,
        label: &str,
        options: Vec<(String, String)>,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let settings = serde_json::to_value(&self.settings).unwrap_or_default();
        let value = &settings[key];
        let selected = value
            .as_str()
            .map_or_else(|| value.to_string(), str::to_owned);
        self.picker(Control::Setting(key), label, &selected, options, cx)
    }
}

fn widget_label(kind: Kind) -> &'static str {
    match kind {
        Kind::Standings => "Standings",
        Kind::Relative => "Relative",
        Kind::Delta => "Delta",
        Kind::Pedals => "Pedals",
        Kind::PedalsTelemetry => "Pedales avanzados",
        Kind::FastestLap => "Vuelta rápida",
        Kind::RacingFlags => "Racing Flags",
        Kind::Radar => "Radar de proximidad",
        Kind::BroadcastTower => "Horizontal Standings",
        _ => kind.name(),
    }
}

fn options(values: &[(&str, &str)]) -> Vec<(String, String)> {
    values
        .iter()
        .map(|(id, label)| ((*id).into(), (*label).into()))
        .collect()
}
fn numbers(range: impl Iterator<Item = usize>) -> Vec<(String, String)> {
    range.map(|n| (n.to_string(), n.to_string())).collect()
}
fn button(id: String, label: &str, selected: bool) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_index(0)
        .px(px(8.0))
        .py(px(8.0))
        .rounded(px(3.0))
        .border_1()
        .border_color(rgb(if selected { 0x626268 } else { 0x44444a }))
        .bg(rgb(if selected { 0x353539 } else { 0x232325 }))
        .text_color(rgb(0xdedee2))
        .text_size(px(11.0))
        .focus_visible(|s| s.border_color(rgb(0xc1121f)))
        .cursor_pointer()
        .child(label.to_owned())
}
fn group(label: &str) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .mt(px(28.0))
        .pt(px(18.0))
        .border_t_1()
        .border_color(rgb(0x333336))
        .child(
            div()
                .mb(px(10.0))
                .text_size(px(10.0))
                .font_family("Inter W600")
                .text_color(rgb(0xbdbdc2))
                .child(label.to_owned()),
        )
}

fn paint_context(bounds: gpui::Bounds<gpui::Pixels>, window: &mut Window) {
    let w = f32::from(bounds.size.width);
    let h = f32::from(bounds.size.height);
    let angle = 145_f32.to_radians();
    let dx = angle.sin();
    let dy = -angle.cos();
    let length = w * dx + h * dy;
    for (low, high, from, to) in [
        (0.0, 0.32, 0x97958e, 0x97958e),
        (0.323, 0.63, 0x505051, 0x2c2c2e),
        (0.633, 1.0, 0x797975, 0xc4c2b9),
    ] {
        let mut vertices = vec![(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)];
        for (cut, side) in [(low, 1.0), (high, -1.0)] {
            let input = std::mem::take(&mut vertices);
            if input.is_empty() {
                break;
            }
            let mut previous = input[input.len() - 1];
            let distance = |(x, y): (f32, f32)| side * (dx * x + dy * y - cut * length);
            for next in input {
                let a = distance(previous);
                let b = distance(next);
                if (a >= 0.0) != (b >= 0.0) {
                    let ratio = a / (a - b);
                    vertices.push((
                        previous.0 + (next.0 - previous.0) * ratio,
                        previous.1 + (next.1 - previous.1) * ratio,
                    ));
                }
                if b >= 0.0 {
                    vertices.push(next);
                }
                previous = next;
            }
        }
        let Some(first) = vertices.first() else {
            continue;
        };
        let mut path = gpui::PathBuilder::fill();
        path.move_to(bounds.origin + gpui::point(px(first.0), px(first.1)));
        for (x, y) in vertices.iter().skip(1) {
            path.line_to(bounds.origin + gpui::point(px(*x), px(*y)));
        }
        path.close();
        match path.build() {
            Ok(path) => window.paint_path(
                path,
                gpui::linear_gradient(
                    145.0,
                    gpui::linear_color_stop(rgb(from), 0.0),
                    gpui::linear_color_stop(rgb(to), 1.0),
                ),
            ),
            Err(error) => eprintln!("Workshop fondo: {error}"),
        }
    }
}

fn backdrop(background: &str) -> gpui::Div {
    let background = background.to_owned();
    div().absolute().size_full().child(
        gpui::canvas(
            |_, _, _| (),
            move |bounds, (), window, _| {
                use gpui::{linear_color_stop as stop, linear_gradient};
                match background.as_str() {
                    "context" => paint_context(bounds, window),
                    "transparent" => window.paint_quad(gpui::fill(
                        bounds,
                        linear_gradient(140.0, stop(rgb(0xc9c8c4), 0.0), stop(rgb(0xa5a4a1), 1.0)),
                    )),
                    "grid" => {
                        for x in (0..f32::from(bounds.size.width) as usize).step_by(32) {
                            window.paint_quad(gpui::fill(
                                gpui::Bounds::new(
                                    gpui::point(bounds.left() + px(x as f32), bounds.top()),
                                    gpui::size(px(1.0), bounds.size.height),
                                ),
                                gpui::rgba(0xffffff06),
                            ));
                        }
                        for y in (0..f32::from(bounds.size.height) as usize).step_by(32) {
                            window.paint_quad(gpui::fill(
                                gpui::Bounds::new(
                                    gpui::point(bounds.left(), bounds.top() + px(y as f32)),
                                    gpui::size(bounds.size.width, px(1.0)),
                                ),
                                gpui::rgba(0xffffff06),
                            ));
                        }
                    }
                    _ => {}
                }
            },
        )
        .size_full(),
    )
}

impl Render for Workshop {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let language = if self.prefs.language == vantare_domain::format::Language::En {
            "en"
        } else {
            "es"
        };
        let mut panel = div()
            .id("properties")
            .w(px(248.0))
            .flex_shrink_0()
            .h_full()
            .overflow_y_scroll()
            .px(px(22.0))
            .py(px(40.0))
            .bg(rgb(0x19191b))
            .border_r_1()
            .border_color(rgb(0x333336))
            .child(
                div()
                    .text_size(px(8.0))
                    .text_color(rgb(0xaaaab0))
                    .child("VANTARE / WORKSHOP"),
            )
            .child(
                div()
                    .mt(px(17.0))
                    .mb(px(6.0))
                    .text_size(px(28.0))
                    .font_family("Inter W700")
                    .child("Eficiencia."),
            )
            .child(
                div()
                    .text_size(px(11.0))
                    .text_color(rgb(0xa5a5ab))
                    .child(format!("{} · Sistema Eficiencia", widget_label(self.kind))),
            )
            .child(group("Idioma del widget").child(self.picker(
                Control::Language,
                "Idioma",
                language,
                options(&[("es", "Español"), ("en", "English")]),
                cx,
            )).child(div().text_size(px(10.0)).text_color(rgb(0x95959c)).child("Demostración en este Workshop. El idioma cambia la presentación del widget.")))
            .child(
                group("Widget")
                    .child(
                        self.picker(
                            Control::Widget,
                            "Widget",
                            self.kind.name(),
                            Kind::ALL
                                .iter()
                                .map(|k| (k.name().into(), widget_label(*k).into()))
                                .collect(),
                            cx,
                        ),
                    )
                    .child(
                        div()
                            .mt(px(10.0))
                            .text_size(px(10.0))
                            .text_color(rgb(0xacacb2))
                            .child("Sistema de diseño"),
                    )
                    .child(button("system".into(), "Eficiencia", true))
                    .child(
                        div()
                            .mt(px(6.0))
                            .text_size(px(10.0))
                            .text_color(rgb(0x919197))
                            .child("Fixture: default"),
                    ),
            )
            .child(group("Sesión").child(Self::segments(
                Control::Session,
                match self.session {
                    Some(vantare_domain::SessionKind::Practice) => "practice",
                    Some(vantare_domain::SessionKind::Qualifying) => "qualifying",
                    _ => "race",
                },
                &[
                    ("practice", "Práctica"),
                    ("qualifying", "Clasificación"),
                    ("race", "Carrera"),
                ],
                cx,
            )));
        if self.kind == Kind::Standings {
            panel = panel
                .child(group("Marca").child(Self::segments(
                    Control::Setting("brandVisible"),
                    if let Settings::Standings(settings) = &self.settings {
                        if settings.brand_visible == Some(false) {
                            "false"
                        } else {
                            "true"
                        }
                    } else {
                        "true"
                    },
                    &[("true", "Con marca"), ("false", "Sin marca")],
                    cx,
                )))
                .child(group("Dirección").child(Self::segments(
                    Control::Study,
                    &self.study,
                    &[("v1", "V1"), ("default", "Default"), ("v2-focus", "Foco")],
                    cx,
                )))
                .child(group("Clasificación").child(self.setting(
                    "classificationMode",
                    "Clasificación",
                    options(&[("normal", "Normal"), ("multiclass", "Multiclass")]),
                    cx,
                )))
                .child(
                    group("Filas")
                        .child(self.setting("rowCount", "Pilotos totales", numbers(1..=30), cx))
                        .child(self.setting(
                            "playerWindow",
                            "Ventana del jugador",
                            options(&[("true", "Podio y ventana"), ("false", "Todos")]),
                            cx,
                        ))
                        .child(self.setting(
                            "windowAround",
                            "Pilotos alrededor",
                            numbers((0..=8).step_by(2)),
                            cx,
                        )),
                );
        } else if self.kind == Kind::Relative {
            panel = panel.child(
                group("Ventana")
                    .child(self.setting("rangeAhead", "Delante", numbers(0..=8), cx))
                    .child(self.setting("rangeBehind", "Detrás", numbers(0..=8), cx)),
            );
        } else if self.kind == Kind::Delta {
            panel = panel.child(group("Estilo").child(self.setting(
                "templateId",
                "Estilo",
                options(&[("bar", "Barra"), ("capsule", "Cápsula")]),
                cx,
            )));
        }

        if self.kind == Kind::Standings || self.kind == Kind::Relative {
            if self.kind == Kind::Standings {
                panel = panel.child(group("Posición del jugador").child(self.picker(
                    Control::Player,
                    "Posición del jugador",
                    &self.player_position.unwrap_or(1).to_string(),
                    numbers(1..=30),
                    cx,
                )));
                let columns = if let Settings::Standings(settings) = &self.settings {
                    settings
                        .columns
                        .clone()
                        .unwrap_or_else(|| default_columns(self.kind))
                } else {
                    Vec::new()
                };
                panel = panel.child(
                    group("Módulos")
                        .child(
                            div()
                                .text_size(px(10.0))
                                .text_color(rgb(0x919197))
                                .child("Posición y piloto siempre visibles."),
                        )
                        .children(
                            [
                                ("gap", "Diferencia"),
                                ("bestLap", "Mejor vuelta"),
                                ("lastLap", "Última vuelta"),
                                ("pit", "Estado en boxes"),
                            ]
                            .into_iter()
                            .map(|(id, label)| {
                                let enabled =
                                    columns.iter().any(|c| c.metric_id == id && c.enabled);
                                button(
                                    format!("module-{id}"),
                                    &format!("{label}   {}", if enabled { "●" } else { "○" }),
                                    enabled,
                                )
                                .mt(px(4.0))
                                .on_click(cx.listener(
                                    move |this, _, _, cx| this.select(Control::Module(id), "", cx),
                                ))
                            }),
                        ),
                );
            }
            let slots = match &self.settings {
                Settings::Standings(settings) => settings.footer_slots.clone().unwrap_or_default(),
                Settings::Relative(settings) => settings.footer_slots.clone(),
                _ => Vec::new(),
            };
            panel = panel
                .child(group("Nombre").child(self.picker(
                    Control::Name,
                    "Nombre",
                    &self.name_mode,
                    options(&[
                        ("full", "Completo"),
                        ("initial", "N. Apellido"),
                        ("surname", "Apellido"),
                    ]),
                    cx,
                )))
                .child(
                    group("Pie de datos").children(
                        [
                            ("time", "Tiempo"),
                            ("lap", "Vuelta"),
                            ("position", "Posición"),
                            ("gap", "Diferencia"),
                            ("bestLap", "Mejor vuelta"),
                            ("lastLap", "Última vuelta"),
                            ("track", "Pista"),
                            ("ambient", "Aire"),
                            ("wind", "Viento"),
                        ]
                        .into_iter()
                        .map(|(id, label)| {
                            let enabled = slots.iter().any(|s| s == id);
                            button(
                                format!("footer-{id}"),
                                &format!("{label}   {}", if enabled { "●" } else { "○" }),
                                enabled,
                            )
                            .mt(px(4.0))
                            .on_click(cx.listener(
                                move |this, _, _, cx| this.select(Control::Footer(id), "", cx),
                            ))
                        }),
                    ),
                );
        } else if self.kind == Kind::Pedals {
            panel = panel.child(group("Presentación del widget").child(self.setting(
                "transparentBackground",
                "Fondo del widget",
                options(&[("false", "Con panel"), ("true", "Transparente")]),
                cx,
            )));
        } else if self.kind == Kind::FastestLap {
            panel = panel.child(
                group("Avisos")
                    .child(self.setting(
                        "showPersonal",
                        "Mejor personal",
                        options(&[("true", "Sí"), ("false", "No")]),
                        cx,
                    ))
                    .child(self.setting(
                        "showClass",
                        "Mejor de clase",
                        options(&[("true", "Sí"), ("false", "No")]),
                        cx,
                    ))
                    .child(self.setting("durationSeconds", "Duración (s)", numbers(3..=15), cx))
                    .child(self.setting(
                        "showDriver",
                        "Piloto",
                        options(&[("true", "Mostrar"), ("false", "Ocultar")]),
                        cx,
                    )),
            );
        } else if self.kind == Kind::RacingFlags {
            panel = panel.child(group("Bandera").child(self.setting(
                "hideWhenGreen",
                "Bandera verde",
                options(&[("true", "Ocultar"), ("false", "Mostrar")]),
                cx,
            )));
        } else if self.kind == Kind::PedalsTelemetry {
            panel = panel.child(group("Volante").child(self.setting(
                "steeringWheel",
                "Volante",
                options(&[
                    ("generic", "Genérico"),
                    ("ferrari-499p", "Ferrari 499P"),
                    ("porsche-963", "Porsche 963"),
                ]),
                cx,
            )));
        }
        let visible_scenes = self
            .scenes
            .iter()
            .zip(&self.scene_labels)
            .filter(|(p, _)| {
                p.file_name().is_some_and(|n| {
                    let n = n.to_string_lossy();
                    n.starts_with(&format!("{}-", self.kind.name()))
                        || n.starts_with(&format!("{}.", self.kind.name()))
                }) || **p == self.scene.path
            })
            .map(|(p, label)| (p.display().to_string(), label.clone()))
            .collect();
        panel = panel
            .child(
                group("Animación")
                    .child(self.picker(
                        Control::Scene,
                        "Escena",
                        &self.scene.path.display().to_string(),
                        visible_scenes,
                        cx,
                    ))
                    .child(
                        button("run".into(), "▶ Reproducir", false).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.playback.playing = false;
                                this.play(cx);
                            },
                        )),
                    ),
            )
            .child(
                group("Datos")
                    .child(self.picker(
                        Control::Source,
                        "Estado de la fuente",
                        match self.source {
                            Some(vantare_domain::SourceState::Stale) => "stale",
                            Some(vantare_domain::SourceState::Lost) => "lost",
                            Some(vantare_domain::SourceState::Waiting) => "waiting",
                            _ => "live",
                        },
                        options(&[
                            ("live", "Recibiendo"),
                            ("stale", "Datos antiguos"),
                            ("lost", "Desconectado"),
                            ("waiting", "Esperando datos"),
                        ]),
                        cx,
                    ))
                    .child(self.picker(
                        Control::Location,
                        "Ubicación",
                        if self.in_pits == Some(true) {
                            "pits"
                        } else {
                            "track"
                        },
                        options(&[("track", "Pista"), ("pits", "Boxes")]),
                        cx,
                    )),
            )
            .child(
                group("Presentación")
                    .child(self.picker(
                        Control::Background,
                        "Fondo",
                        &self.background,
                        options(&[
                            ("context", "Mixto"),
                            ("solid", "Oscuro"),
                            ("transparent", "Claro"),
                            ("grid", "Cuadrícula"),
                        ]),
                        cx,
                    ))
                    .child(self.picker(
                        Control::Surface,
                        "Superficie",
                        &self.surface,
                        options(&[
                            ("studio", "Studio"),
                            ("desktop", "Desktop"),
                            ("obs", "OBS"),
                            ("harness", "Harness"),
                        ]),
                        cx,
                    ))
                    .child(self.picker(
                        Control::Compare,
                        "Comparar con",
                        if self.comparison.is_some() {
                            &self.comparison_surface
                        } else {
                            "off"
                        },
                        options(&[
                            ("off", "Sin comparar"),
                            ("desktop", "Desktop"),
                            ("obs", "OBS"),
                            ("harness", "Harness"),
                        ]),
                        cx,
                    ))
                    .child(self.picker(
                        Control::Scale,
                        "Escala",
                        &self.scale.to_string(),
                        options(&[("0.5", "0.5×"), ("1", "1×"), ("1.5", "1.5×"), ("2", "2×")]),
                        cx,
                    ))
                    .child(self.picker(
                        Control::Preset,
                        "Resolución",
                        &self.preset,
                        options(&[
                            ("720p", "720p · 1280×720"),
                            ("1080p", "1080p · 1920×1080"),
                            ("1440p", "1440p · 2560×1440"),
                        ]),
                        cx,
                    ))
                    .child(
                        self.numeric_field(
                            Control::Width,
                            "Ancho",
                            self.dimensions
                                .map_or(self.overlay.read(cx).wanted_size().0, |s| s.0),
                            cx,
                        ),
                    )
                    .child(
                        self.numeric_field(
                            Control::Height,
                            "Alto",
                            self.dimensions
                                .map_or(self.overlay.read(cx).wanted_size().1, |s| s.1),
                            cx,
                        ),
                    )
                    .child(
                        button("natural-size".into(), "Aplicar tamaño declarado", false).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.dimensions = None;
                                cx.notify();
                            }),
                        ),
                    ),
            )
            .child(
                group("Escenario de diseño").child(
                    div()
                        .text_size(px(10.0))
                        .text_color(rgb(0x95959c))
                        .child("Datos de demostración. Mismo renderer que la aplicación."),
                ),
            )
            .child(
                button("reset".into(), "Restablecer selección", false)
                    .mt(px(10.0))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.preset = "1080p".into();
                        this.settings = default_settings(this.kind);
                        this.player_position = None;
                        this.name_mode = "full".into();
                        this.numeric = None;
                        this.prefs = Preferences::default();
                        this.background = "grid".into();
                        this.scale = 1.0;
                        this.study = "default".into();
                        this.dimensions = None;
                        this.source = None;
                        this.session = None;
                        this.in_pits = None;
                        this.comparison = None;
                        this.open = None;
                        match Scene::new(&default_path(this.kind)) {
                            Ok(scene) => {
                                this.scene = scene;
                                this.park(0, cx);
                                this.persist();
                            }
                            Err(error) => {
                                this.state_error = Some(error);
                                cx.notify();
                            }
                        }
                    })),
            );
        let wanted = self.overlay.read(cx).wanted_size();
        let dimensions = self.dimensions.unwrap_or(wanted);
        let widget = div()
            .w(px(dimensions.0 * self.scale))
            .h(px(dimensions.1 * self.scale))
            .child(self.overlay.clone());
        let mut previews = div().flex().items_center().gap(px(24.0)).child(widget);
        if let Some(view) = &self.comparison {
            previews = previews.child(
                div()
                    .w(px(dimensions.0 * self.scale))
                    .h(px(dimensions.1 * self.scale))
                    .child(view.clone()),
            );
        }
        let mut stage = div()
            .id("stage")
            .relative()
            .flex_1()
            .h_full()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .bg(rgb(match self.background.as_str() {
                "solid" => 0x252527,
                "transparent" => 0xb8b7b3,
                "context" => 0x777670,
                _ => 0x151516,
            }))
            .child(backdrop(&self.background))
            .child(
                div()
                    .absolute()
                    .top(px(26.0))
                    .left(px(32.0))
                    .text_size(px(9.0))
                    .text_color(rgb(0xb9b9bd))
                    .child(format!("{} / ESTUDIO 01", self.kind.name().to_uppercase())),
            )
            .child(previews);
        if self.scene.snapshots.len() > 1 {
            stage =
                stage.child(
                    div()
                        .absolute()
                        .bottom(px(22.0))
                        .left(px(32.0))
                        .w(px(430.0))
                        .p(px(16.0))
                        .rounded(px(8.0))
                        .bg(rgb(0x131315))
                        .border_1()
                        .border_color(rgb(0x333336))
                        .child(
                            div()
                                .flex()
                                .gap(px(6.0))
                                .child(button("prev-frame".into(), "◀", false).on_click(
                                    cx.listener(|this, _, _, cx| {
                                        this.park(this.playback.frame.saturating_sub(1), cx);
                                    }),
                                ))
                                .child(
                                    button(
                                        "play".into(),
                                        if self.playback.playing {
                                            "❙❙ Pausa"
                                        } else {
                                            "▶ Reproducir de nuevo"
                                        },
                                        false,
                                    )
                                    .on_click(cx.listener(|this, _, _, cx| this.play(cx))),
                                )
                                .child(button("next-frame".into(), "▶", false).on_click(
                                    cx.listener(|this, _, _, cx| {
                                        this.park(this.playback.frame + 1, cx);
                                    }),
                                ))
                                .child(
                                    button("loop".into(), "En bucle", self.playback.looping)
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.playback.looping = !this.playback.looping;
                                            cx.notify();
                                        })),
                                ),
                        )
                        .child(div().mt(px(12.0)).text_size(px(11.0)).child(format!(
                            "Fase {} de {}",
                            self.playback.frame + 1,
                            self.scene.snapshots.len()
                        )))
                        .child(self.slider(cx))
                        .child(
                            div().mt(px(8.0)).text_size(px(11.0)).child(
                                self.scene
                                    .captions
                                    .get(self.playback.frame)
                                    .cloned()
                                    .unwrap_or_default(),
                            ),
                        )
                        .child(
                            div()
                                .mt(px(8.0))
                                .text_size(px(10.0))
                                .text_color(rgb(0x919197))
                                .child(format!("Qué mirar: {}", self.scene.watch_for)),
                        ),
                );
        }
        if let Some(error) = self
            .scene
            .error
            .as_ref()
            .or(self.style.error.as_ref())
            .or(self.state_error.as_ref())
        {
            stage = stage.child(
                div()
                    .absolute()
                    .top(px(52.0))
                    .left(px(32.0))
                    .text_size(px(11.0))
                    .text_color(rgb(0xff8888))
                    .child(error.clone()),
            );
        }
        div()
            .id("workshop")
            .track_focus(&self.focus)
            .tab_group()
            .tab_stop(false)
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                if this.edit_number(&event.keystroke.key, cx) {
                    cx.stop_propagation();
                    return;
                }
                if event.keystroke.key == "escape" {
                    this.open = None;
                    cx.notify();
                }
                if event.keystroke.key == "tab" {
                    if event.keystroke.modifiers.shift {
                        window.focus_prev(cx);
                    } else {
                        window.focus_next(cx);
                    }
                    cx.stop_propagation();
                }
            }))
            .font_family("Inter W400")
            .size_full()
            .flex()
            .text_color(rgb(0xf5f5f5))
            .child(panel)
            .child(stage)
    }
}
