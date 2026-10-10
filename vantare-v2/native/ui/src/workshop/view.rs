//! Chrome del Workshop; el widget sigue siendo el Overlay productivo.
use super::*;

impl Workshop {
    /// Grupos Aspecto (estilo y acento) y Marca de los widgets Vantare.
    fn vantare_look(&self, cx: &mut Context<Self>) -> [gpui::Div; 2] {
        let current = |key: &str| {
            serde_json::to_value(&self.settings)
                .ok()
                .and_then(|v| v[key].as_str().map(str::to_owned))
                .unwrap_or_default()
        };
        let brand = match &self.settings {
            Settings::Standings(s) => s.brand_visible,
            Settings::Relative(s) => s.brand_visible,
            Settings::FuelStrategy(s) => s.brand_visible,
            Settings::Delta(s) => s.brand_visible,
            _ => None,
        };
        [
            group("Aspecto")
                .child(Self::segments(
                    Control::Setting("style"),
                    &current("style"),
                    &[("neo", "Neo"), ("neutro", "Neutro")],
                    cx,
                ))
                .child(div().mt(px(6.0)).child(Self::segments(
                    Control::Setting("accent"),
                    &current("accent"),
                    &[
                        ("red", "Rojo"),
                        ("amber", "Ámbar"),
                        ("green", "Verde"),
                        ("white", "Blanco"),
                    ],
                    cx,
                ))),
            group("Marca")
                .child(Self::segments(
                    Control::Brand,
                    if brand == Some(true) { "true" } else { "false" },
                    &[("true", "Con marca"), ("false", "Sin marca")],
                    cx,
                ))
                .child(
                    div()
                        .mt(px(6.0))
                        .text_size(px(10.0))
                        .text_color(rgb(0x95959c))
                        .child("En la app lo decidirá la licencia; aquí se prueba a mano."),
                ),
        ]
    }

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
        let phase = self.playback.elapsed.as_secs_f32() * 1000.0 / self.scene.frame_ms as f32;
        let fraction = ((self.playback.frame as f32 + phase)
            / (self.scene.snapshots.len() - 1).max(1) as f32)
            .min(1.0);
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
                    // La rueda desplaza solo la lista: GPUI no corta el evento y
                    // el panel de detrás se movía a la vez. La lista ya se ha
                    // desplazado (su oyente va antes en la fase de burbuja).
                    .on_scroll_wheel(|_, _, cx| cx.stop_propagation())
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
        Kind::FuelStrategy => "Fuel y stint",
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
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let language = if self.prefs.language == vantare_domain::format::Language::En {
            "en"
        } else {
            "es"
        };
        let appearance = self.settings.appearance().is_some();
        let relative = self.kind == Kind::Relative;
        let system = if matches!(
            self.kind,
            Kind::Standings | Kind::Relative | Kind::FuelStrategy | Kind::Delta
        ) {
            Self::segments(
                Control::Setting("designSystem"),
                self.settings
                    .look()
                    .map_or("eficiencia", crate::look::Look::name),
                &crate::look::Look::choices(),
                cx,
            )
        } else {
            div().child(button("system".into(), "Eficiencia", true))
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
                    .child(format!("{}.", self.settings.look().map_or("Eficiencia", crate::look::Look::label))),
            )
            .child(
                div()
                    .text_size(px(11.0))
                    .text_color(rgb(0xa5a5ab))
                    .child(format!(
                        "{} · Sistema {}",
                        widget_label(self.kind),
                        self.settings.look().map_or("Eficiencia", crate::look::Look::label)
                    )),
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
                    .child(system)
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
        if appearance && self.kind == Kind::FuelStrategy {
            let size = match &self.settings {
                Settings::FuelStrategy(s) => s.size.clone(),
                _ => String::new(),
            };
            panel = panel
                .child(group("Tamaño").child(Self::segments(
                    Control::Setting("size"),
                    &size,
                    &[
                        ("compact", "Compacto"),
                        ("standard", "Estándar"),
                        ("expanded", "Ampliado"),
                    ],
                    cx,
                )))
                .children(self.vantare_look(cx));
        } else if appearance && self.kind == Kind::Delta {
            let (size, reference) = match &self.settings {
                Settings::Delta(s) => (s.size.clone(), s.reference.clone()),
                _ => (String::new(), String::new()),
            };
            panel = panel
                .child(group("Formato").child(Self::segments(
                    Control::Setting("size"),
                    &size,
                    &[
                        ("pill", "Píldora"),
                        ("bar", "Barra"),
                        ("expanded", "Ampliado"),
                    ],
                    cx,
                )))
                .child(group("Referencia").child(Self::segments(
                    Control::Setting("reference"),
                    &reference,
                    &[
                        ("best", "Mejor"),
                        ("optimal", "Óptima"),
                        ("leader", "Líder"),
                    ],
                    cx,
                )))
                .children(self.vantare_look(cx));
        } else if appearance {
            let current = |key: &str| {
                serde_json::to_value(&self.settings)
                    .ok()
                    .and_then(|v| v[key].as_str().map(str::to_owned))
                    .unwrap_or_default()
            };
            let columns = match &self.settings {
                Settings::Standings(settings) => settings
                    .columns
                    .clone()
                    .unwrap_or_else(|| crate::standings::vantare_template("standard")),
                Settings::Relative(settings) => settings
                    .columns
                    .clone()
                    .unwrap_or_else(|| crate::relative::vantare_template("standard")),
                _ => Vec::new(),
            };
            let multiclass = current("classificationMode") == "multiclass";
            let mut modes = if relative {
                group("Ventana")
                    .child(Self::segments(
                        Control::Setting("classScope"),
                        &current("classScope"),
                        &[("all", "Todas las clases"), ("sameClass", "Mi clase")],
                        cx,
                    ))
                    .child(self.setting("rangeAhead", "Delante", numbers(0..=8), cx))
                    .child(self.setting("rangeBehind", "Detrás", numbers(0..=8), cx))
            } else {
                group("Modo").child(Self::segments(
                    Control::Setting("classificationMode"),
                    if multiclass { "multiclass" } else { "normal" },
                    &[("normal", "Estándar"), ("multiclass", "Multiclase")],
                    cx,
                ))
            };
            if !multiclass && !relative {
                modes = modes.child(div().mt(px(6.0)).child(Self::segments(
                    Control::Setting("classScope"),
                    &current("classScope"),
                    &[("player-class", "Mi clase"), ("all-classes", "Todas")],
                    cx,
                )));
            }
            panel = panel
                .child(modes)
                .child(
                    group("Plantilla de columnas").child(
                        div().flex().gap(px(4.0)).children(
                            [
                                ("compact", "Compacto"),
                                ("standard", "Estándar"),
                                ("expanded", "Ampliado"),
                            ]
                            .into_iter()
                            .map(|(id, label)| {
                                button(format!("template-{id}"), label, false)
                                    .flex_1()
                                    .px(px(3.0))
                                    .text_size(px(10.0))
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.select(Control::Template(id), "", cx);
                                    }))
                            }),
                        ),
                    ),
                )
                .child(
                    group("Columnas")
                        .child(
                            div()
                                .text_size(px(10.0))
                                .text_color(rgb(0x919197))
                                .child("Arrastra una columna en el widget o usa ◀ ▶."),
                        )
                        .children(columns.iter().filter_map(|column| {
                            let (id, label): (&'static str, &str) = match column.metric_id.as_str()
                            {
                                "position" if relative => ("position", "Posición en clase"),
                                "carNumber" => ("carNumber", "Dorsal"),
                                "lapDelta" => ("lapDelta", "Vueltas de diferencia"),
                                "driverRating" => ("driverRating", "Nivel del piloto"),
                                "safetyRating" => ("safetyRating", "Safety Rating"),
                                "trend" => ("trend", "Tendencia s/vuelta"),
                                "trackStrip" => ("trackStrip", "Tira de pista (arriba)"),
                                "positionsGained" => ("positionsGained", "Posiciones ganadas ±"),
                                "driverNumber" => ("driverNumber", "Dorsal"),
                                "driverName" => ("driverName", "Piloto"),
                                "vehicle" => ("vehicle", "Coche (junto al piloto)"),
                                "tireCompound" => ("tireCompound", "Compuesto"),
                                "pit" => ("pit", "Paradas / BOX"),
                                "sectors" => ("sectors", "Sectores"),
                                "lastLap" => ("lastLap", "Última vuelta"),
                                "bestLap" => ("bestLap", "Mejor vuelta"),
                                "interval" => ("interval", "Intervalo"),
                                "gap" => ("gap", "Gap al líder"),
                                _ => return None,
                            };
                            let driver = id == "driverName";
                            let enabled = column.enabled || driver;
                            let mut line = div().mt(px(4.0)).flex().gap(px(4.0)).child(
                                button(
                                    format!("column-{id}"),
                                    &if driver {
                                        format!("{label}   ●")
                                    } else {
                                        format!("{label}   {}", if enabled { "●" } else { "○" })
                                    },
                                    enabled,
                                )
                                .flex_1()
                                .on_click(cx.listener(
                                    move |this, _, _, cx| {
                                        if !driver {
                                            this.select(Control::Module(id), "", cx);
                                        }
                                    },
                                )),
                            );
                            if enabled && !matches!(id, "vehicle" | "trackStrip") {
                                for (step, arrow) in [(-1, "◀"), (1, "▶")] {
                                    line = line.child(
                                        button(format!("move-{id}-{step}"), arrow, false)
                                            .px(px(6.0))
                                            .on_click(cx.listener(move |this, _, _, cx| {
                                                this.select(Control::MoveColumn(id, step), "", cx);
                                            })),
                                    );
                                }
                            }
                            Some(line)
                        })),
                )
                .child(
                    group(if relative { "Nombre" } else { "Filas y nombre" })
                        .when(!relative, |g| {
                            g.child(self.setting("rowCount", "Filas", numbers(1..=30), cx))
                        })
                        .child(self.picker(
                            Control::Name,
                            "Nombre",
                            &self.name_mode,
                            options(&[
                                ("full", "Completo"),
                                ("initial", "N. Apellido"),
                                ("surname", "Apellido"),
                            ]),
                            cx,
                        )),
                )
                .children(self.vantare_look(cx));
        } else if self.kind == Kind::Standings {
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

        if !appearance && matches!(self.kind, Kind::Standings | Kind::Relative) {
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
                                this.park(0, cx);
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
                        if self.source_error {
                            "error"
                        } else {
                            match self.source {
                                Some(vantare_domain::SourceState::Stale) => "stale",
                                Some(vantare_domain::SourceState::Lost) => "lost",
                                Some(vantare_domain::SourceState::Waiting) => "waiting",
                                _ => "live",
                            }
                        },
                        options(&[
                            ("live", "Recibiendo"),
                            ("stale", "Datos antiguos"),
                            ("lost", "Desconectado"),
                            ("waiting", "Esperando datos"),
                            ("error", "Error"),
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
                            self.dimensions.map_or(
                                preview_size(
                                    self.fixed_relative_preview(),
                                    self.overlay.read(cx).wanted_size(),
                                )
                                .0,
                                |s| s.0,
                            ),
                            cx,
                        ),
                    )
                    .child(
                        self.numeric_field(
                            Control::Height,
                            "Alto",
                            self.dimensions.map_or(
                                preview_size(
                                    self.fixed_relative_preview(),
                                    self.overlay.read(cx).wanted_size(),
                                )
                                .1,
                                |s| s.1,
                            ),
                            cx,
                        ),
                    )
                    .child(
                        button("natural-size".into(), "Aplicar tamaño declarado", false).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.dimensions = None;
                                this.replay(cx);
                                this.persist();
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
                        this.source_error = false;
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
        let wanted = preview_size(
            self.fixed_relative_preview(),
            self.overlay.read(cx).wanted_size(),
        );
        let dimensions = self.dimensions.unwrap_or(wanted);
        // Encaje: el widget nunca desborda el escenario visible (ventanas estrechas).
        let viewport = window.viewport_size();
        let panel_width = if self.panel_hidden { 0.0 } else { 248.0 };
        let playback = if self.scene.snapshots.len() > 1 {
            210.0
        } else {
            0.0
        };
        let stage_width = (f32::from(viewport.width) - panel_width - 48.0).max(120.0);
        let stage_height = (f32::from(viewport.height) - 80.0 - playback).max(120.0);
        let columns = if self.comparison.is_some() { 2.0 } else { 1.0 };
        let fit = (stage_width / (dimensions.0 * self.scale * columns))
            .min(stage_height / (dimensions.1 * self.scale))
            .min(1.0);
        if (fit - self.fit).abs() > 0.001 {
            self.fit = fit;
            self.apply_preview(cx);
        }
        let scale = self.scale * self.fit;
        let content = |view: Entity<Overlay>| {
            if self.source_error {
                div()
                    .text_size(px(16.0))
                    .text_color(rgb(0xffffff))
                    .child("Overlay V2 source error")
                    .into_any_element()
            } else {
                view.into_any_element()
            }
        };
        let entity = cx.entity();
        let mut widget = div()
            .id("widget-preview")
            .relative()
            .w(px(dimensions.0 * scale))
            .h(px(dimensions.1 * scale))
            .child(content(self.overlay.clone()))
            .child(
                gpui::canvas(
                    move |bounds, _, cx| {
                        entity.update(cx, |this, _| this.widget_bounds = Some(bounds));
                    },
                    |_, (), _, _| {},
                )
                .absolute()
                .top_0()
                .left_0()
                .size_full(),
            );
        // Vantare: arrastrar una columna a izquierda o derecha cambia su orden en
        // directo; al pasar por encima se recuadra la columna exacta.
        if let Some(boxes) = self.overlay.read(cx).vantare_columns() {
            widget = widget
                .cursor(if self.column_drag.is_some() {
                    gpui::CursorStyle::ClosedHand
                } else if self.column_hover.is_some() {
                    gpui::CursorStyle::OpenHand
                } else {
                    gpui::CursorStyle::Arrow
                })
                .on_mouse_down(
                    gpui::MouseButton::Left,
                    cx.listener(|this, event: &gpui::MouseDownEvent, _, cx| {
                        this.start_column_drag(event.position, cx);
                    }),
                )
                .on_mouse_move(cx.listener(|this, event: &gpui::MouseMoveEvent, _, cx| {
                    this.drag_column(event.position, cx);
                }))
                .on_mouse_up(
                    gpui::MouseButton::Left,
                    cx.listener(|this, _, _, cx| this.finish_column_drag(cx)),
                )
                .on_mouse_up_out(
                    gpui::MouseButton::Left,
                    cx.listener(|this, _, _, cx| this.finish_column_drag(cx)),
                )
                .on_hover(cx.listener(|this, hovered: &bool, _, cx| {
                    if !hovered && this.column_hover.take().is_some() {
                        cx.notify();
                    }
                }));
            let marked = self
                .column_drag
                .map(|metric| (metric, true))
                .or(self.column_hover.map(|metric| (metric, false)));
            if let Some((metric, dragging)) = marked
                && let Some((_, left, width)) = boxes.columns.iter().find(|(m, ..)| *m == metric)
            {
                let half = boxes.gap / 2.0;
                let (sx, sy) = self.widget_scale(cx);
                widget = widget.child(
                    div()
                        .absolute()
                        .left(px((left - half) * sx))
                        .top(px((boxes.top - 2.0) * sy))
                        .w(px((width + boxes.gap) * sx))
                        .h(px((boxes.bottom - boxes.top + 4.0) * sy))
                        .rounded(px(4.0))
                        .border_2()
                        .when(dragging, |d| {
                            d.border_color(rgb(0xe14a54)).bg(gpui::rgba(0xe14a541f))
                        })
                        .when(!dragging, |d| d.border_color(gpui::rgba(0xffffff4d))),
                );
            }
        }
        let mut previews = div()
            .w_full()
            .flex_1()
            .flex()
            .items_center()
            .child(div().flex_1().flex().justify_center().child(widget));
        if let Some(view) = &self.comparison {
            previews = previews.child(
                div().flex_1().flex().justify_center().child(
                    div()
                        .w(px(dimensions.0 * scale))
                        .h(px(dimensions.1 * scale))
                        .child(content(view.clone())),
                ),
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
            .pt(px(56.0))
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
            .child(
                div().absolute().top(px(16.0)).right(px(20.0)).child(
                    button(
                        "toggle-panel".into(),
                        if self.panel_hidden {
                            "Mostrar panel"
                        } else {
                            "Ocultar panel"
                        },
                        false,
                    )
                    .text_size(px(10.0))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.panel_hidden = !this.panel_hidden;
                        cx.notify();
                    })),
                ),
            )
            .child(previews);
        if self.scene.snapshots.len() > 1 {
            stage =
                stage.child(
                    div()
                        .flex_shrink_0()
                        .mb(px(16.0))
                        .w(px(430.0_f32.min(stage_width)))
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
                                            "▶ Reproducir"
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
            .or(self.vantare_style.error.as_ref())
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
            .when(!self.panel_hidden, |this| this.child(panel))
            .child(stage)
    }
}
