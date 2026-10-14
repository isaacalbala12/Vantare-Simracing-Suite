//! Asistente de cinco pasos; prepara datos desde el documento y la API nativa.
use super::*;
use gpui::{div, px, rgb, rgba};

#[cfg(test)]
thread_local! {
    pub(super) static AUTOMATIC_PREPARATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum AssistantStep {
    Inicio,
    Combinacion,
    Reglas,
    Pilotos,
    Sesiones,
}

impl AssistantStep {
    pub(super) const ALL: [Self; 5] = [
        Self::Inicio,
        Self::Combinacion,
        Self::Reglas,
        Self::Pilotos,
        Self::Sesiones,
    ];

    pub(super) fn index(self) -> usize {
        match self {
            Self::Inicio => 0,
            Self::Combinacion => 1,
            Self::Reglas => 2,
            Self::Pilotos => 3,
            Self::Sesiones => 4,
        }
    }

    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Inicio => "Inicio",
            Self::Combinacion => "Combinación",
            Self::Reglas => "Reglas",
            Self::Pilotos => "Pilotos",
            Self::Sesiones => "Sesiones",
        }
    }

    pub(super) fn previous(self) -> Option<Self> {
        self.index().checked_sub(1).map(|index| Self::ALL[index])
    }

    pub(super) fn next(self) -> Option<Self> {
        Self::ALL.get(self.index() + 1).copied()
    }

    fn shows_navigation_footer(self) -> bool {
        matches!(self, Self::Inicio | Self::Combinacion | Self::Sesiones)
    }
}

impl Strategy {
    pub(super) fn prepare_automatic(
        &self,
    ) -> Result<Option<application::AutomaticPreparation>, String> {
        #[cfg(test)]
        AUTOMATIC_PREPARATIONS.set(AUTOMATIC_PREPARATIONS.get() + 1);
        let Some(event) = self.current_event() else {
            return Ok(None);
        };
        let projection = &event["planningInputs"]["projection"];
        if projection.is_null() {
            return Ok(None);
        }

        let selected_sessions = event["combination"]["sessions"]
            .as_array()
            .ok_or("La carrera no tiene una selección de sesiones")?
            .iter()
            .filter(|session| session["included"] == true)
            .map(|session| {
                session["sessionId"]
                    .as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| "La selección contiene una sesión sin ID".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        let source_revisions = serde_json::from_value::<Vec<application::AnalysisRevisionRef>>(
            projection["sourceRevisions"].clone(),
        )
        .map_err(|_| "La proyección no contiene revisiones exactas".to_owned())?;
        let climate_bucket = match event["strategies"][self.variant]["mode"]["value"]
            .as_str()
            .unwrap_or_default()
        {
            "dry" => application::ClimateBucket::Dry,
            "humid" => application::ClimateBucket::Humid,
            "wet" => application::ClimateBucket::Wet,
            "eco" => return Err("El modo eco requiere un clima explícito".into()),
            _ => return Err("La carrera no tiene un modo de clima reconocido".into()),
        };
        let virtual_energy = match event["strategies"][self.variant]["overrides"]
            ["nativeScalarInput"]["ve_capacity_percent"]["value"]
            .as_f64()
        {
            Some(value) if value > 0.0 => application::VirtualEnergyApplicability::Applicable,
            Some(0.0) => application::VirtualEnergyApplicability::NotApplicable,
            Some(_) => return Err("La capacidad de energía virtual no es válida".into()),
            None => application::VirtualEnergyApplicability::Pending,
        };

        application::prepare_automatic(
            &selected_sessions,
            &source_revisions,
            projection.clone(),
            climate_bucket,
            virtual_energy,
        )
        .map(Some)
    }

    #[allow(clippy::too_many_lines)] // Mantiene unida la composición de un paso del asistente.
    pub(super) fn assistant_page(
        &self,
        step: AssistantStep,
        viewport_height: f32,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let main = div()
            .id("strategy-assistant")
            .flex()
            .flex_col()
            .flex_1()
            .h(px((viewport_height - orbit::STRATEGY_TOPBAR_H).max(0.0)))
            .min_w_0()
            .min_h(px(0.0))
            .overflow_hidden();
        let (title, description) = match step {
            AssistantStep::Inicio => (
                "Prepara tu próxima\ncarrera",
                "Elige cómo empezar. Construye tu estrategia con sesiones registradas.",
            ),
            AssistantStep::Combinacion => (
                "Elige tu combinación",
                "Configura tu carrera o parte de un evento del calendario de Vantare.",
            ),
            AssistantStep::Reglas => (
                "Configura tu carrera",
                "Define los parámetros de carrera según el reglamento del evento.",
            ),
            AssistantStep::Pilotos => (
                "Prepara tu equipo",
                "Asigna tu piloto principal y prepara los relevos de resistencia.",
            ),
            AssistantStep::Sesiones => (
                "Elige tu telemetría",
                "Revisa las sesiones compatibles y confirma cuáles utilizar en tu estrategia.",
            ),
        };
        let mut progress = gpui::div()
            .relative()
            .flex()
            .items_start()
            .justify_between()
            .gap(px(8.0))
            .ml(px(-32.0))
            .mr(px(-32.0))
            .pl(px(49.0))
            .pr(px(166.0))
            .h(px(93.0))
            .child(
                gpui::div()
                    .absolute()
                    .top(px(17.0))
                    .left(px(36.0))
                    .right(px(36.0))
                    .h(px(1.0))
                    .bg(rgba(orbit::line(cx))),
            );
        for (index, item) in AssistantStep::ALL.into_iter().enumerate() {
            let complete = index < step.index();
            let current = index == step.index();
            let marker = if complete {
                "✓".to_owned()
            } else {
                (index + 1).to_string()
            };
            progress = progress.child(
                gpui::div()
                    .relative()
                    .flex()
                    .w(px(36.0))
                    .flex_none()
                    .flex_col()
                    .items_start()
                    .gap(px(12.0))
                    .child(
                        gpui::div()
                            .flex()
                            .items_center()
                            .justify_center()
                            .size(px(36.0))
                            .rounded_full()
                            .border_1()
                            .border_color(if current || complete {
                                rgb(orbit::carmine(cx))
                            } else {
                                rgba(orbit::line(cx))
                            })
                            .bg(if complete {
                                rgb(orbit::carmine(cx))
                            } else {
                                rgba(crate::orbit::legacy_rgba(0x0809_0bf0, cx))
                            })
                            .child(orbit::text(
                                marker,
                                17.0,
                                400,
                                if current || complete {
                                    orbit::ink(cx)
                                } else {
                                    orbit::ink_3(cx)
                                },
                                cx,
                            )),
                    )
                    .child(
                        div()
                            .w(px(90.0))
                            .ml(px(-27.0))
                            .flex()
                            .justify_center()
                            .child(
                                div()
                                    .pb(px(6.0))
                                    .when(current, |label| {
                                        label.border_b_1().border_color(rgb(orbit::carmine(cx)))
                                    })
                                    .child(orbit::text(
                                        item.label(),
                                        orbit::SECONDARY,
                                        400,
                                        if current {
                                            orbit::ink(cx)
                                        } else {
                                            orbit::ink_2(cx)
                                        },
                                        cx,
                                    )),
                            ),
                    ),
            );
        }

        let footer = gpui::div()
            .flex()
            .items_center()
            .justify_between()
            .h(px(112.0))
            .flex_none()
            .border_t_1()
            .border_color(rgba(orbit::line_strong(cx)))
            .bg(rgb(orbit::canvas(cx)))
            .px(px(32.0))
            .child(
                gpui::div()
                    .flex()
                    .items_center()
                    .gap(px(14.0))
                    .child(
                        gpui::div()
                            .size(px(22.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_full()
                            .border_1()
                            .border_color(rgba(orbit::line_strong(cx)))
                            .child(orbit::text("✓", 12.0, 600, orbit::ink_2(cx), cx)),
                    )
                    .child(orbit::text("Originales intactos", 14.0, 500, orbit::ink_2(cx), cx)),
            )
            .child(
                gpui::div()
                    .flex()
                    .gap(px(18.0)).mt(px(-14.0))
                    .child(
                        Self::assistant_footer_button(
                            "strategy-assistant-back",
                            "← Atrás",
                            false,
                         cx)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(previous) = step.previous() {
                                this.page = Page::Assistant(previous);
                            } else {
                                this.load_fields(cx);
                                this.page = Page::Collection;
                            }
                            this.error = None;
                            cx.notify();
                        })),
                    )
                    .child(
                        Self::assistant_footer_button(
                            "strategy-assistant-next",
                            if step == AssistantStep::Sesiones {
                                if self.automatic {
                                    "Abrir borrador →"
                                } else {
                                    "Crear carrera →"
                                }
                            } else {
                                "Continuar →"
                            },
                            true,
                         cx)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(next) = step.next() {
                                this.page = Page::Assistant(next);
                                this.error = None;
                            } else if this.automatic {
                                match this.prepare_automatic() {
                                    Ok(Some(prepared)) => {
                                        this.automatic_preparation = Some(prepared);
                                        this.page = Page::Editor(EditorTab::Carrera);
                                        this.status = "Proyección y revisiones exactas preparadas.".into();
                                        this.error = None;
                                    }
                                    Ok(None) => {
                                        this.error = Some(
                                            "No hay una proyección con sesiones y revisiones exactas para preparar automáticamente.".into(),
                                        );
                                    }
                                    Err(error) => this.error = Some(error),
                                }
                            } else {
                                this.add_event(cx);
                            }
                            cx.notify();
                        })),
                    ),
            );

        let body = match step {
            AssistantStep::Inicio => self.start_choices(cx),
            AssistantStep::Combinacion => self.combination_choices(cx),
            AssistantStep::Reglas => self.rules_fields(cx),
            AssistantStep::Pilotos => self.driver_fields(cx),
            AssistantStep::Sesiones => self.session_sources(cx),
        };
        let content = gpui::div()
            .relative()
            .flex()
            .flex_col()
            .flex_1()
            .min_h(px(0.0))
            .gap(px(14.0))
            .px(px(orbit::GUTTER))
            .pt(px(20.0))
            .pb(px(22.0))
            .child(progress.flex_none())
            .child(
                orbit::tracked_text(
                    step.label().to_uppercase(),
                    11.0,
                    400,
                    orbit::ink_2(cx),
                    1.43,
                    cx,
                )
                .ml(px(1.0))
                .relative()
                .top(px(2.0))
                .flex_none(),
            )
            .child(
                super::view::heading(title, 50.0, -2.0, cx)
                    .line_height(px(50.0))
                    .max_w(px(440.0))
                    .mt(px(2.0))
                    .ml(px(1.0))
                    .flex_none(),
            )
            .child(
                orbit::text(description, 16.0, 400, orbit::ink_2(cx), cx)
                    .max_w(px(if step == AssistantStep::Pilotos {
                        600.0
                    } else {
                        460.0
                    }))
                    .ml(px(1.0))
                    .relative()
                    .top(px(-2.0))
                    .flex_none(),
            )
            .child(body.ml(px(1.0)).when(
                matches!(step, AssistantStep::Reglas | AssistantStep::Pilotos),
                |body| {
                    body.mt(px(if step == AssistantStep::Reglas {
                        0.0
                    } else {
                        -2.0
                    }))
                },
            ));
        let main = main.child(
            gpui::div()
                .relative()
                .flex()
                .flex_col()
                .flex_1()
                .min_h(px(0.0))
                .child(content)
                .when(step.shows_navigation_footer(), |main| main.child(footer)),
        );
        div().flex().flex_1().min_w_0().min_h(px(0.0)).child(main)
    }

    fn assistant_footer_button(
        id: &'static str,
        label: &str,
        primary: bool,
        cx: &gpui::App,
    ) -> gpui::Stateful<gpui::Div> {
        gpui::div()
            .id(id)
            .role(gpui::Role::Button)
            .aria_label(label.to_owned())
            .tab_index(0)
            .flex()
            .items_center()
            .justify_center()
            .h(px(56.0))
            .w(px(150.0))
            .rounded(px(12.0))
            .bg(rgb(if primary {
                orbit::primary_bg(cx)
            } else {
                orbit::canvas(cx)
            }))
            .border_1()
            .border_color(if primary {
                rgb(orbit::primary_bg(cx))
            } else {
                rgba(orbit::line_strong(cx))
            })
            .cursor_pointer()
            .hover(|style| style.bg(rgb(orbit::surface_3(cx))))
            .focus_visible(|style| style.border_color(rgb(orbit::carmine(cx))))
            .child(orbit::text(
                label.to_owned(),
                16.0,
                500,
                if primary {
                    cx.global::<crate::orbit::theme::Theme>().primary_ink
                } else {
                    orbit::ink_3(cx)
                },
                cx,
            ))
    }

    fn start_choices(&self, cx: &mut Context<Self>) -> gpui::Div {
        gpui::div()
            .flex()
            .flex_col()
            .gap(px(14.0))
            .max_w(px(520.0))
            .child(
                Self::choice_card(
                    "strategy-mode-manual",
                    "Manual",
                    "Configura el evento, el coche y el circuito. Después revisa tus datos.",
                    "i-estrategia",
                    !self.automatic,
                    cx,
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.automatic = false;
                    this.automatic_preparation = None;
                    cx.notify();
                })),
            )
            .child(
                Self::choice_card(
                    "strategy-mode-automatic",
                    "Automático",
                    "Parte de las sesiones disponibles para preparar tu carrera.",
                    "i-comando",
                    self.automatic,
                    cx,
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.automatic = true;
                    cx.notify();
                })),
            )
    }

    fn combination_option_card(
        id: &'static str,
        title: &'static str,
        description: &'static str,
        icon: &'static str,
        selected: bool,
        cx: &gpui::App,
    ) -> gpui::Stateful<gpui::Div> {
        div()
            .id(id)
            .flex()
            .items_center()
            .gap(px(14.0))
            .w(px(354.0))
            .flex_none()
            .h(px(70.0))
            .px(px(18.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(if selected {
                rgb(orbit::carmine(cx))
            } else {
                rgba(orbit::line(cx))
            })
            .bg(if selected {
                rgb(crate::orbit::legacy_rgb(0x001c_1216, cx))
            } else {
                rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx))
            })
            .child(orbit::icon(icon, 20.0, orbit::ink_2(cx)))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .child(orbit::text(title, 14.0, 600, orbit::ink(cx), cx))
                    .child(orbit::text(description, 12.0, 400, orbit::ink_2(cx), cx)),
            )
    }

    fn combination_event_options(&self, selected: bool, cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .gap(px(12.0))
            .child(Self::combination_option_card(
                "strategy-custom-event",
                "Carrera personalizada",
                if self.capture_demo().is_some() {
                    "Elige tu combinación"
                } else {
                    "Elige coche, circuito y reglamento"
                },
                "i-ajustes",
                selected,
                cx,
            ))
            .child(Self::combination_option_card(
                "strategy-calendar-event",
                "Calendario de Vantare",
                if self.capture_demo().is_some() {
                    "Parte de un evento publicado"
                } else {
                    "Selección de eventos no disponible"
                },
                "i-carreras",
                false,
                cx,
            ))
    }

    fn combination_summary(&self, circuit: String, category: String, cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(10.0))
            .mt(px(7.0))
            .w(px(720.0))
            .h(px(92.0))
            .flex_none()
            .p(px(22.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
            .child(orbit::tracked_text(
                "TU COMBINACIÓN",
                11.0,
                400,
                orbit::ink_2(cx),
                1.43,
                cx,
            ))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(18.0))
                    .flex_1()
                    .child(orbit::text(circuit, 22.0, 500, orbit::ink(cx), cx).w(px(175.0)))
                    .when_some(self.capture_demo(), |row, demo| {
                        row.child(
                            orbit::text(demo.track_layout, 13.0, 400, orbit::ink_2(cx), cx)
                                .w(px(113.0)),
                        )
                    })
                    .child(orbit::text(category, 13.0, 400, orbit::ink_2(cx), cx).flex_1()),
            )
    }

    fn combination_choices(&self, cx: &gpui::App) -> gpui::Div {
        let event_available = self.current_event().is_some();
        let simulator = if event_available && self.demo_car.is_some() {
            "Le Mans Ultimate"
        } else {
            "Sin simulador seleccionado"
        };
        let category = if self.fields[5].trim().is_empty() {
            "Sin categoría seleccionada".to_owned()
        } else if let Some(car) = &self.demo_car {
            format!("{} · {car}", self.fields[5])
        } else {
            self.fields[5].clone()
        };
        let circuit = if self.fields[4].trim().is_empty() {
            "Sin circuito seleccionado".to_owned()
        } else {
            self.fields[4].clone()
        };
        let row = |label: &str, control: gpui::Div| {
            div()
                .flex()
                .items_center()
                .gap(px(16.0))
                .h(px(50.0))
                .child(orbit::text(label.to_owned(), 13.0, 400, orbit::ink_2(cx), cx).w(px(124.0)))
                .child(control)
        };
        let surface = || {
            div()
                .flex()
                .items_center()
                .w(px(580.0))
                .h(px(50.0))
                .px(px(16.0))
                .rounded(px(10.0))
                .border_1()
                .border_color(rgba(orbit::line(cx)))
                .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
        };
        let simulator_row = row(
            "Simulador",
            surface()
                .gap(px(12.0))
                .child(orbit::text("LMU", 14.0, 800, orbit::carmine(cx), cx))
                .child(orbit::text(simulator, 13.0, 600, orbit::ink(cx), cx)),
        );
        let category_control = surface()
            .child(if self.demo_car.is_some() {
                orbit::text(category.clone(), 13.0, 500, orbit::ink(cx), cx)
            } else {
                div().flex_1().child(self.inputs[5].clone())
            })
            .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx).ml_auto());
        let circuit_control = surface()
            .child(if let Some(demo) = self.capture_demo() {
                orbit::text(
                    format!("{circuit} · {}", demo.track_layout),
                    13.0,
                    500,
                    orbit::ink(cx),
                    cx,
                )
                .flex_1()
            } else {
                div().flex_1().child(self.inputs[4].clone())
            })
            .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx));
        gpui::div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(720.0))
            .child(orbit::eyebrow("EVENTO", cx))
            .child(self.combination_event_options(event_available, cx))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .mt(px(4.0))
                    .w(px(720.0))
                    .flex_none()
                    .child(simulator_row)
                    .child(row("Categoría / coche", category_control))
                    .child(row("Circuito / trazado", circuit_control)),
            )
            .child(self.combination_summary(circuit, category, cx))
    }

    #[allow(clippy::too_many_lines)] // Mantiene juntos los campos de un único paso del asistente.
    fn rules_fields(&self, cx: &mut Context<Self>) -> gpui::Div {
        let laps_selected = !self.fields[9].trim().is_empty();
        let distance_field = if laps_selected { 9 } else { 1 };
        let distance_unit = if laps_selected { "vueltas" } else { "minutos" };
        let distance_label = if laps_selected {
            "Distancia · vueltas"
        } else {
            "Duración · minutos"
        };
        let advanced = div()
            .flex()
            .gap(px(12.0))
            .p(px(18.0))
            .child(self.field(3, cx).flex_1())
            .child(self.field(16, cx).flex_1())
            .child(self.field(24, cx).flex_1());
        let advanced_section = div()
            .flex()
            .flex_col()
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
            .child(
                button(
                    "strategy-rules-advanced",
                    if self.rules_details_open {
                        "▾  Neumáticos y paradas"
                    } else {
                        "›  Neumáticos y paradas"
                    },
                    cx,
                )
                .w_full()
                .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
                .h(px(58.0))
                .justify_start()
                .px(px(18.0))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.rules_details_open = !this.rules_details_open;
                    cx.notify();
                })),
            )
            .when(self.rules_details_open, |section| section.child(advanced));

        div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(980.0))
            .child(
                orbit::text(
                    "Configuración de carrera · los campos vacíos siguen pendientes.",
                    12.0,
                    400,
                    orbit::ink_2(cx),
                    cx,
                )
                .line_height(px(18.0)),
            )
            .child(if self.capture_demo().is_some() {
                div()
                    .flex()
                    .items_center()
                    .gap(px(14.0))
                    .h(px(42.0))
                    .child(
                        orbit::text("Nombre de la carrera", 13.0, 400, orbit::ink_2(cx), cx)
                            .w(px(220.0)),
                    )
                    .child(super::editor_view::demo_control(&self.fields[0], cx))
            } else {
                self.labeled_input("Nombre de la carrera", 0, 220.0, cx)
            })
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .flex_1()
                            .h(px(64.0))
                            .gap(px(12.0))
                            .p(px(12.0))
                            .rounded(px(10.0))
                            .border_1()
                            .border_color(rgba(orbit::line(cx)))
                            .bg(rgba(crate::orbit::legacy_rgba(0x0b0d_0fe8, cx)))
                            .child(
                                orbit::text("Formato", 14.0, 500, orbit::ink_2(cx), cx)
                                    .w(px(205.0)),
                            )
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .flex_1()
                                    .h(px(44.0))
                                    .px(px(14.0))
                                    .rounded(px(10.0))
                                    .border_1()
                                    .border_color(rgba(orbit::line(cx)))
                                    .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
                                    .child(orbit::text(
                                        distance_unit,
                                        14.0,
                                        500,
                                        orbit::ink(cx),
                                        cx,
                                    ))
                                    .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx)),
                            ),
                    )
                    .child(
                        (if self.capture_demo().is_some() {
                            Self::demo_rule_row(distance_label, &self.fields[distance_field], cx)
                        } else {
                            self.labeled_input(distance_label, distance_field, 205.0, cx)
                        })
                        .flex_1()
                        .h(px(64.0))
                        .p(px(12.0))
                        .rounded(px(10.0))
                        .border_1()
                        .border_color(rgba(orbit::line(cx)))
                        .bg(rgba(crate::orbit::legacy_rgba(0x0b0d_0fe8, cx))),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .justify_between()
                    .h(px(305.0))
                    .p(px(18.0))
                    .pb(px(14.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .child(orbit::text("▾", 14.0, 600, orbit::ink(cx), cx))
                            .child(orbit::text(
                                "Combustible y energía virtual",
                                14.0,
                                400,
                                orbit::ink(cx),
                                cx,
                            )),
                    )
                    .child(if let Some(demo) = self.capture_demo() {
                        Self::demo_resource_fields(demo, cx)
                    } else {
                        div()
                            .flex()
                            .gap(px(18.0))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .flex_1()
                                    .justify_between()
                                    .h(px(234.0))
                                    .child(self.labeled_input(
                                        "Capacidad de combustible · L",
                                        2,
                                        205.0,
                                        cx,
                                    ))
                                    .child(self.labeled_input("Consumo Fuel · L/v", 11, 205.0, cx))
                                    .child(self.labeled_input(
                                        "Reserva final · vueltas",
                                        22,
                                        205.0,
                                        cx,
                                    ))
                                    .child(div().h(px(44.0))),
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .flex_1()
                                    .justify_between()
                                    .h(px(234.0))
                                    .child(self.labeled_input("Modo de variante", 8, 205.0, cx))
                                    .child(self.labeled_input("Capacidad VE · %", 12, 205.0, cx))
                                    .child(self.labeled_input("Consumo VE · %/v", 13, 205.0, cx))
                                    .child(div().h(px(44.0))),
                            )
                    }),
            )
            .child(advanced_section)
    }

    fn demo_rule_row(label: &str, value: &(impl ToString + ?Sized), cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .h(px(44.0))
            .child(orbit::text(label.to_owned(), 13.0, 400, orbit::ink_2(cx), cx).w(px(205.0)))
            .child(super::editor_view::demo_control(value, cx))
    }

    fn demo_resource_fields(demo: &super::editor_view::CaptureDemo, cx: &gpui::App) -> gpui::Div {
        let left = div()
            .flex()
            .flex_col()
            .flex_1()
            .justify_between()
            .h(px(234.0))
            .child(Self::demo_rule_row(
                "Capacidad de combustible · L",
                &110,
                cx,
            ))
            .child(Self::demo_rule_row(
                "Combustible inicial · L",
                &demo.fuel_initial,
                cx,
            ))
            .child(Self::demo_rule_row(
                "Reserva de combustible · L",
                &demo.fuel_reserve,
                cx,
            ))
            .child(div().h(px(44.0)));
        let right = div()
            .flex()
            .flex_col()
            .flex_1()
            .justify_between()
            .h(px(234.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .h(px(44.0))
                    .child(
                        orbit::text("Energía virtual", 13.0, 400, orbit::ink_2(cx), cx)
                            .w(px(205.0)),
                    )
                    .child(
                        super::editor_view::demo_control("Aplica", cx).child(orbit::text(
                            "⌄",
                            16.0,
                            500,
                            orbit::ink(cx),
                            cx,
                        )),
                    ),
            )
            .child(Self::demo_rule_row(
                "Capacidad de energía · %",
                &demo.energy_capacity,
                cx,
            ))
            .child(Self::demo_rule_row(
                "Energía inicial · %",
                &demo.energy_initial,
                cx,
            ))
            .child(Self::demo_rule_row(
                "Reserva de energía · %",
                &demo.energy_reserve,
                cx,
            ));
        div().flex().gap(px(18.0)).child(left).child(right)
    }

    #[allow(clippy::too_many_lines)] // Composición de las tres tarjetas de la fixture aprobada.
    fn demo_driver_fields(
        &self,
        demo: &super::editor_view::CaptureDemo,
        cx: &gpui::App,
    ) -> gpui::Div {
        let names = self
            .current_event()
            .and_then(|event| event["drivers"].as_array())
            .map_or_else(Vec::new, |drivers| {
                drivers
                    .iter()
                    .map(|driver| display(&driver["name"]["value"]))
                    .collect::<Vec<_>>()
            });
        let mut order = div().flex().gap(px(8.0));
        let mut cards = div().flex().items_start().gap(px(14.0));
        for (index, name) in names.iter().enumerate() {
            order = order.child(
                div()
                    .flex()
                    .items_center()
                    .flex_1()
                    .min_w_0()
                    .gap(px(10.0))
                    .h(px(50.0))
                    .px(px(9.0))
                    .rounded(px(7.0))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
                    .child(
                        orbit::text((index + 1).to_string(), 16.0, 400, orbit::ink_2(cx), cx)
                            .w(px(16.0))
                            .mr(px(6.0)),
                    )
                    .child(
                        orbit::text(name.clone(), 16.0, 700, orbit::ink(cx), cx)
                            .flex_1()
                            .min_w_0(),
                    )
                    .child(
                        div()
                            .flex()
                            .gap(px(5.0))
                            .children(["↑", "↓"].into_iter().map(|arrow| {
                                super::editor_view::demo_control(arrow, cx)
                                    .flex_none()
                                    .w(px(34.0))
                                    .h(px(38.0))
                                    .rounded(px(12.0))
                                    .opacity(0.5)
                            })),
                    ),
            );
            let role = if index == 0 {
                "PILOTO PRINCIPAL".to_owned()
            } else {
                format!("RELEVO {index}")
            };
            let mut limits = div().flex().flex_col().gap(px(8.0)).mt(px(-4.0));
            for (offset, labels) in [
                ["Mínimo · vueltas", "Máximo · vueltas"],
                ["Máximo seguido · minutos", "Máximo total · minutos"],
            ]
            .into_iter()
            .enumerate()
            {
                limits = limits.child(div().flex().gap(px(8.0)).children(
                    labels.into_iter().enumerate().map(|(column, label)| {
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w_0()
                            .gap(px(4.0))
                            .child(
                                orbit::text(label, 12.0, 400, orbit::ink_2(cx), cx)
                                    .h(px(30.0))
                                    .line_height(px(15.0)),
                            )
                            .child(super::editor_view::demo_control(
                                &demo.driver_limits[offset * 2 + column],
                                cx,
                            ))
                    }),
                ));
            }
            let card = div()
                .flex()
                .flex_col()
                .flex_1()
                .min_w_0()
                .gap(px(14.0))
                .p(px(18.0))
                .pt(px(17.0))
                .rounded(px(10.0))
                .border_1()
                .border_color(rgba(orbit::line_strong(cx)))
                .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .h(px(38.0))
                        .child(orbit::tracked_text(
                            role,
                            10.5,
                            400,
                            orbit::ink_2(cx),
                            1.2,
                            cx,
                        ))
                        .child(
                            super::editor_view::demo_control("Quitar piloto", cx)
                                .rounded(px(14.0))
                                .opacity(0.6)
                                .flex_none()
                                .w(px(102.0))
                                .h(px(38.0)),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(12.0))
                        .h(px(42.0))
                        .child(
                            orbit::text("Nombre del piloto", 13.0, 400, orbit::ink_2(cx), cx)
                                .w(px(123.0)),
                        )
                        .child(super::editor_view::demo_control(name, cx)),
                )
                .child(limits)
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.0))
                        .pt(px(12.0))
                        .border_t_1()
                        .border_color(rgba(orbit::line(cx)))
                        .child(orbit::text("▶", 11.0, 400, orbit::ink(cx), cx))
                        .child(
                            orbit::text("Tramos no disponibles", 14.5, 650, orbit::ink(cx), cx)
                                .line_height(px(24.0)),
                        ),
                )
                .child(
                    (if index == 0 {
                        orbit::text(
                            "Ritmo pendiente de validar con sus sesiones.",
                            13.0,
                            400,
                            orbit::ink_2(cx),
                            cx,
                        )
                    } else {
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.0))
                            .child(orbit::text(
                                "Fuente de ritmo",
                                13.0,
                                400,
                                orbit::ink_2(cx),
                                cx,
                            ))
                            .child(
                                super::editor_view::demo_control(
                                    "Estimar a partir de Isaac Albalá",
                                    cx,
                                )
                                .child(orbit::text(
                                    "⌄",
                                    16.0,
                                    500,
                                    orbit::ink_2(cx),
                                    cx,
                                )),
                            )
                            .child(
                                div()
                                    .h(px(20.0))
                                    .mt(px(8.0))
                                    .border_t_1()
                                    .border_color(rgba(orbit::line(cx))),
                            )
                    })
                    .mt(px(-8.0)),
                );
            cards = cards.child(card);
        }
        div()
            .flex()
            .flex_col()
            .gap(px(14.0))
            .max_w(px(980.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .justify_between()
                    .h(px(156.0))
                    .p(px(22.0))
                    .rounded(px(10.0))
                    .border_1()
                    .border_color(rgba(orbit::line_strong(cx)))
                    .bg(rgb(crate::orbit::legacy_rgb(0x0010_1214, cx)))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(32.0))
                            .h(px(48.0))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .flex_1()
                                    .gap(px(4.0)).relative().top(px(-2.0))
                                    .child(orbit::text(
                                        "Criterio de asignación",
                                        16.0,
                                        600,
                                        orbit::ink(cx),
                                     cx).line_height(px(24.0)))
                                    .child(orbit::text(
                                        "El motor repetirá esta secuencia y respetará sus límites.",
                                        13.0,
                                        400,
                                        orbit::ink_2(cx),
                                     cx).line_height(px(19.5))),
                            )
                            .child(orbit::text("Orden de pilotos", 13.0, 400, orbit::ink_2(cx), cx))
                            .child(
                                super::editor_view::demo_control("Rotación fijada", cx).px(px(16.0))
                                    .flex_none()
                                    .w(px(147.0))
                                    .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx)),
                            ),
                    )
                    .child(order.relative().top(px(1.0))),
            )
            .child(cards)
    }

    fn labeled_input(
        &self,
        label: &str,
        index: usize,
        label_width: f32,
        cx: &gpui::App,
    ) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .h(px(44.0))
            .child(
                orbit::text(label.to_owned(), 14.0, 500, orbit::ink_2(cx), cx).w(px(label_width)),
            )
            .child(div().flex_1().child(self.inputs[index].clone()))
    }

    #[allow(clippy::too_many_lines)] // Mantiene el orden y las tarjetas del equipo en una vista.
    fn driver_fields(&self, cx: &gpui::App) -> gpui::Div {
        if let Some(demo) = self.capture_demo() {
            return self.demo_driver_fields(demo, cx);
        }
        let drivers = self
            .current_event()
            .and_then(|event| event["drivers"].as_array())
            .map_or_else(Vec::new, |drivers| {
                drivers
                    .iter()
                    .filter_map(|driver| {
                        let name = display(&driver["name"]["value"]);
                        (!name.is_empty()).then(|| (name, display(&driver["cls"]["value"])))
                    })
                    .collect::<Vec<_>>()
            });
        if drivers.is_empty() {
            return div().max_w(px(980.0)).child(orbit::empty_state(
                "Sin pilotos guardados",
                "Añade el piloto principal con los datos que tengas.",
                cx,
            ));
        }

        let mut order = div().flex().gap(px(8.0));
        for (index, (name, _)) in drivers.iter().enumerate() {
            order = order.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .flex_1()
                    .min_w_0()
                    .h(px(48.0))
                    .px(px(12.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgba(crate::orbit::legacy_rgba(0x0809_0be8, cx)))
                    .child(orbit::text(
                        format!("{}", index + 1),
                        14.0,
                        600,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(orbit::text(name.clone(), 15.0, 600, orbit::ink(cx), cx)),
            );
        }

        let mut cards = div().flex().gap(px(12.0));
        for (index, (name, class)) in drivers.iter().enumerate() {
            let role = if index == 0 {
                "PILOTO PRINCIPAL".to_owned()
            } else {
                format!("RELEVO {index}")
            };
            let mut card = div()
                .flex()
                .flex_col()
                .flex_1()
                .min_w_0()
                .min_h(px(390.0))
                .gap(px(14.0))
                .p(px(18.0))
                .rounded(px(12.0))
                .border_1()
                .border_color(rgba(orbit::line(cx)))
                .bg(rgba(crate::orbit::legacy_rgba(0x0809_0be8, cx)))
                .child(orbit::eyebrow(role, cx));
            if index == 0 {
                card = card.child(self.field(26, cx)).child(self.field(27, cx));
            } else {
                card = card
                    .child(orbit::eyebrow("NOMBRE DEL PILOTO", cx))
                    .child(orbit::text(name.clone(), 16.0, 600, orbit::ink(cx), cx));
            }
            if !class.is_empty() {
                card = card
                    .child(orbit::eyebrow("CLASE / ACREDITACIÓN", cx))
                    .child(orbit::text(class.clone(), 14.0, 500, orbit::ink_2(cx), cx));
            }
            cards = cards.child(card.child(orbit::empty_state(
                "Límites de stint sin configurar",
                "El documento no contiene límites para este piloto.",
                cx,
            )));
        }

        div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(980.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .min_h(px(155.0))
                    .gap(px(14.0))
                    .p(px(18.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(orbit::line(cx)))
                    .bg(rgba(crate::orbit::legacy_rgba(0x0809_0be8, cx)))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(orbit::text(
                                "Orden de pilotos",
                                17.0,
                                600,
                                orbit::ink(cx),
                                cx,
                            ))
                            .child(orbit::text(
                                "Orden guardado",
                                13.0,
                                500,
                                orbit::ink_2(cx),
                                cx,
                            )),
                    )
                    .child(orbit::text(
                        "La carrera conserva la secuencia del documento.",
                        13.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(order),
            )
            .child(cards)
    }

    pub(super) fn session_sources(&self, cx: &mut Context<Self>) -> gpui::Div {
        let preparation = match &self.automatic_preparation {
            Some(prepared) => Ok(Some(prepared)),
            None if self.automatic => self
                .automatic_preview
                .get_or_init(|| self.prepare_automatic())
                .as_ref()
                .map(Option::as_ref),
            None => Ok(None),
        };
        let linked_sessions = self.current_event().map_or(0, |event| {
            event["combination"]["sessions"]
                .as_array()
                .map_or(0, |sessions| {
                    sessions
                        .iter()
                        .filter(|session| session["included"] == true)
                        .count()
                })
        });
        let session_count = preparation
            .as_ref()
            .ok()
            .and_then(Option::as_ref)
            .map_or(linked_sessions, |prepared| prepared.source_revisions.len());
        let status = preparation.as_ref().map_or_else(
            |error| Some((*error).clone()),
            |prepared| match prepared {
                Some(prepared) if prepared.blockers.is_empty() => {
                    Some("Preparación completa".to_owned())
                }
                Some(prepared) => Some(format!(
                    "Preparación parcial · {} bloqueos",
                    prepared.blockers.len()
                )),
                None if self.automatic => None,
                None => Some("Modo manual · no requiere telemetría".to_owned()),
            },
        );
        let browse =
            super::editor_view::white_button("strategy-browse-sessions", "Buscar sesiones", cx)
                .on_click(cx.listener(|this, _, _, cx| {
                    this.page = Page::Editor(EditorTab::Datos);
                    this.error = None;
                    cx.notify();
                }))
                .w(px(128.0))
                .h(px(40.0));
        div()
            .flex()
            .flex_col()
            .gap(px(13.0))
            .mt(px(-3.0))
            .max_w(px(520.0))
            .p(px(22.0))
            .rounded(px(14.0))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(orbit::text("Telemetría registrada", 17.0, 600, orbit::ink(cx), cx))
                    .child(
                        div()
                            .px(px(8.0))
                            .py(px(3.0))
                            .rounded(px(7.0))
                            .bg(rgb(orbit::surface_2(cx)))
                            .child(orbit::text(
                                format!("{session_count}/4"),
                                11.0,
                                500,
                                orbit::ink_3(cx),
                             cx)),
                    ),
            )
            .child(orbit::text(
                "Los originales se conservan. Abre hasta cuatro sesiones para revisarlas y elige después cuáles utilizar.",
                15.0,
                400,
                orbit::ink_2(cx),
             cx))
            .when_some(status.filter(|_| self.capture_demo().is_none()), |card, status| {
                card.child(orbit::text(status, 13.0, 500, orbit::ink_3(cx), cx))
            })
            .child(browse)
    }

    fn choice_card(
        id: &'static str,
        title: &str,
        help: &str,
        icon: &'static str,
        selected: bool,
        cx: &gpui::App,
    ) -> gpui::Stateful<gpui::Div> {
        gpui::div()
            .id(id)
            .role(gpui::Role::Button)
            .aria_label(format!("{title}. {help}"))
            .aria_selected(selected)
            .tab_index(0)
            .cursor_pointer()
            .flex()
            .items_center()
            .gap(px(24.0))
            .w(px(520.0))
            .h(px(144.0))
            .px(px(22.0))
            .border_1()
            .border_color(if selected {
                rgb(orbit::carmine(cx))
            } else {
                rgba(orbit::line(cx))
            })
            .rounded(px(12.0))
            .bg(if selected {
                rgb(crate::orbit::legacy_rgb(0x0010_0d0f, cx))
            } else {
                rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx))
            })
            .child(
                gpui::div()
                    .size(px(24.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        gpui::div()
                            .size(px(if selected { 24.0 } else { 10.0 }))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_full()
                            .border_1()
                            .border_color(if selected {
                                rgb(orbit::carmine(cx))
                            } else {
                                rgba(orbit::line_strong(cx))
                            })
                            .when(selected, |radio| radio.bg(rgb(orbit::carmine(cx))))
                            .when(selected, |radio| {
                                radio.child(orbit::text("✓", 13.0, 700, orbit::white(cx), cx))
                            }),
                    ),
            )
            .child(
                gpui::div()
                    .size(px(32.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(orbit::icon(icon, 36.0, orbit::ink_2(cx))),
            )
            .child(
                gpui::div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_w(px(0.0))
                    .gap(px(10.0))
                    .child(orbit::text(title.to_owned(), 20.0, 600, orbit::ink(cx), cx))
                    .child(orbit::text(
                        help.to_owned(),
                        14.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    )),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::AssistantStep;

    #[test]
    fn assistant_steps_are_five_and_navigate_in_order() {
        assert_eq!(AssistantStep::ALL.len(), 5);
        assert_eq!(AssistantStep::Inicio.previous(), None);
        assert_eq!(
            AssistantStep::Inicio.next(),
            Some(AssistantStep::Combinacion)
        );
        assert_eq!(
            AssistantStep::Combinacion.previous(),
            Some(AssistantStep::Inicio)
        );
        assert_eq!(AssistantStep::Reglas.index(), 2);
        assert_eq!(AssistantStep::Pilotos.next(), Some(AssistantStep::Sesiones));
        assert_eq!(AssistantStep::Sesiones.next(), None);
    }

    #[test]
    fn navigation_footer_matches_the_reference_screens() {
        assert!(AssistantStep::Inicio.shows_navigation_footer());
        assert!(AssistantStep::Combinacion.shows_navigation_footer());
        assert!(!AssistantStep::Reglas.shows_navigation_footer());
        assert!(!AssistantStep::Pilotos.shows_navigation_footer());
        assert!(AssistantStep::Sesiones.shows_navigation_footer());
    }
}
