//! Asistente de cinco pasos; prepara datos desde el documento y la API nativa.
use super::*;
use gpui::{div, px, rgb, rgba};

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
                "Prepara tu próxima carrera",
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
            .pl(px(48.0))
            .pr(px(154.0))
            .h(px(93.0))
            .child(
                gpui::div()
                    .absolute()
                    .top(px(17.0))
                    .left(px(36.0))
                    .right(px(36.0))
                    .h(px(1.0))
                    .bg(rgba(orbit::LINE)),
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
                    .when(index < AssistantStep::ALL.len() - 1, gpui::Styled::flex_1)
                    .when(index == AssistantStep::ALL.len() - 1, |item| {
                        item.w(px(60.0)).flex_none()
                    })
                    .flex_col()
                    .when(index < AssistantStep::ALL.len() - 1, |item| {
                        item.items_start()
                    })
                    .when(index == AssistantStep::ALL.len() - 1, |item| {
                        item.items_center()
                    })
                    .gap(px(8.0))
                    .child(
                        gpui::div()
                            .flex()
                            .items_center()
                            .justify_center()
                            .size(px(36.0))
                            .rounded_full()
                            .border_1()
                            .border_color(if current || complete {
                                rgb(orbit::CARMINE)
                            } else {
                                rgba(orbit::LINE)
                            })
                            .bg(if complete {
                                rgb(orbit::CARMINE)
                            } else {
                                rgba(0x0809_0bf0)
                            })
                            .child(orbit::text(
                                marker,
                                orbit::BODY,
                                600,
                                if current || complete {
                                    orbit::INK
                                } else {
                                    orbit::INK_3
                                },
                            )),
                    )
                    .child(
                        div()
                            .w(px(90.0))
                            .when(index < AssistantStep::ALL.len() - 1, |label| {
                                label.ml(px(-27.0))
                            })
                            .flex()
                            .justify_center()
                            .child(
                                div()
                                    .pb(px(7.0))
                                    .when(current, |label| {
                                        label.border_b_2().border_color(rgb(orbit::CARMINE))
                                    })
                                    .child(orbit::text(
                                        item.label(),
                                        orbit::SECONDARY,
                                        if current { 600 } else { 400 },
                                        if current { orbit::INK } else { orbit::INK_3 },
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
            .border_color(rgba(orbit::LINE_STRONG))
            .bg(rgba(0x0809_0bf0))
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
                            .border_color(rgba(orbit::LINE_STRONG))
                            .child(orbit::text("✓", 12.0, 600, orbit::INK_2)),
                    )
                    .child(orbit::text("Originales intactos", 14.0, 500, orbit::INK_2)),
            )
            .child(
                gpui::div()
                    .flex()
                    .gap(px(18.0))
                    .child(
                        Self::assistant_footer_button(
                            "strategy-assistant-back",
                            "← Atrás",
                            false,
                        )
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
                        )
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
            AssistantStep::Combinacion => self.combination_choices(),
            AssistantStep::Reglas => self.rules_fields(cx),
            AssistantStep::Pilotos => self.driver_fields(),
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
            .child(orbit::eyebrow(step.label().to_uppercase()).flex_none())
            .child(
                orbit::text(title, 42.0, 700, orbit::INK)
                    .max_w(px(480.0))
                    .line_height(px(50.0))
                    .flex_none(),
            )
            .child(
                orbit::text(description, 16.0, 400, orbit::INK_2)
                    .max_w(px(if step == AssistantStep::Pilotos {
                        600.0
                    } else {
                        460.0
                    }))
                    .flex_none(),
            )
            .child(body);
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
                orbit::PRIMARY_BG
            } else {
                orbit::SURFACE_2
            }))
            .border_1()
            .border_color(if primary {
                rgb(orbit::PRIMARY_BG)
            } else {
                rgba(orbit::LINE_STRONG)
            })
            .cursor_pointer()
            .hover(|style| style.bg(rgb(orbit::SURFACE_3)))
            .focus_visible(|style| style.border_color(rgb(orbit::CARMINE)))
            .child(orbit::text(
                label.to_owned(),
                15.0,
                600,
                if primary { 0x001c_1719 } else { orbit::INK },
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
                rgb(orbit::CARMINE)
            } else {
                rgba(orbit::LINE)
            })
            .bg(if selected {
                rgba(0x100d_0ff2)
            } else {
                rgba(0x0809_0bf0)
            })
            .opacity(if selected { 1.0 } else { 0.82 })
            .child(orbit::icon(icon, 20.0, orbit::INK_2))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .child(orbit::text(title, 16.0, 600, orbit::INK))
                    .child(orbit::text(description, 12.0, 400, orbit::INK_2)),
            )
    }

    fn combination_event_options(selected: bool) -> gpui::Div {
        div()
            .flex()
            .gap(px(12.0))
            .child(Self::combination_option_card(
                "strategy-custom-event",
                "Carrera personalizada",
                "Elige coche, circuito y reglamento",
                "i-ajustes",
                selected,
            ))
            .child(Self::combination_option_card(
                "strategy-calendar-event",
                "Calendario de Vantare",
                "Selección de eventos no disponible",
                "i-carreras",
                false,
            ))
    }

    fn combination_summary(circuit: String, category: String) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(10.0))
            .mt(px(8.0))
            .w(px(720.0))
            .h(px(90.0))
            .flex_none()
            .p(px(18.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::LINE))
            .bg(rgba(0x0809_0bf2))
            .child(orbit::eyebrow("TU COMBINACIÓN"))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .flex_1()
                    .child(orbit::text(circuit, 17.0, 500, orbit::INK))
                    .child(orbit::text(category, 13.0, 400, orbit::INK_2)),
            )
    }

    fn combination_choices(&self) -> gpui::Div {
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
                .child(orbit::text(label.to_owned(), 14.0, 500, orbit::INK_2).w(px(124.0)))
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
                .border_color(rgba(orbit::LINE))
                .bg(rgba(0x0809_0bf0))
        };
        let simulator_row = row(
            "Simulador",
            surface()
                .gap(px(12.0))
                .child(orbit::text("LMU", 14.0, 800, orbit::CARMINE))
                .child(orbit::text(simulator, 13.0, 600, orbit::INK)),
        );
        let category_control = surface().child(if self.demo_car.is_some() {
            orbit::text(category.clone(), 13.0, 500, orbit::INK)
        } else {
            div().flex_1().child(self.inputs[5].clone())
        });
        let circuit_control = surface()
            .child(div().flex_1().child(self.inputs[4].clone()))
            .child(orbit::icon("i-chevron", 14.0, orbit::INK_2));
        gpui::div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(720.0))
            .child(orbit::eyebrow("EVENTO"))
            .child(Self::combination_event_options(event_available))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .mt(px(6.0))
                    .w(px(720.0))
                    .flex_none()
                    .child(simulator_row)
                    .child(row("Categoría / coche", category_control))
                    .child(row("Circuito / trazado", circuit_control)),
            )
            .child(Self::combination_summary(circuit, category))
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
            .child(self.field(3).flex_1())
            .child(self.field(16).flex_1())
            .child(self.field(24).flex_1());
        let advanced_section = div()
            .flex()
            .flex_col()
            .rounded(px(12.0))
            .border_1()
            .border_color(rgba(orbit::LINE))
            .bg(rgba(0x0809_0be8))
            .child(
                button(
                    "strategy-rules-advanced",
                    if self.rules_details_open {
                        "▾  Neumáticos y paradas"
                    } else {
                        "›  Neumáticos y paradas"
                    },
                )
                .w_full()
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
            .child(orbit::eyebrow(
                "CONFIGURACIÓN DE CARRERA · LOS CAMPOS VACÍOS SIGUEN PENDIENTES",
            ))
            .child(self.labeled_input("Nombre de la carrera", 0, 220.0))
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
                            .child(orbit::text("Formato", 14.0, 500, orbit::INK_2).w(px(205.0)))
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
                                    .border_color(rgba(orbit::LINE))
                                    .bg(rgba(0x0809_0be8))
                                    .child(orbit::text(distance_unit, 14.0, 500, orbit::INK))
                                    .child(orbit::text("⌄", 16.0, 500, orbit::INK_2)),
                            ),
                    )
                    .child(
                        self.labeled_input(distance_label, distance_field, 205.0)
                            .flex_1(),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .justify_between()
                    .h(px(306.0))
                    .p(px(18.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(orbit::LINE))
                    .bg(rgba(0x0809_0be8))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .child(orbit::text("▾", 14.0, 600, orbit::INK))
                            .child(orbit::text(
                                "Combustible y energía virtual",
                                14.0,
                                600,
                                orbit::INK,
                            )),
                    )
                    .child(
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
                                    ))
                                    .child(self.labeled_input("Consumo Fuel · L/v", 11, 205.0))
                                    .child(self.labeled_input("Reserva final · vueltas", 22, 205.0))
                                    .child(div().h(px(44.0))),
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .flex_1()
                                    .justify_between()
                                    .h(px(234.0))
                                    .child(self.labeled_input("Modo de variante", 8, 205.0))
                                    .child(self.labeled_input("Capacidad VE · %", 12, 205.0))
                                    .child(self.labeled_input("Consumo VE · %/v", 13, 205.0))
                                    .child(div().h(px(44.0))),
                            ),
                    ),
            )
            .child(advanced_section)
    }

    fn labeled_input(&self, label: &str, index: usize, label_width: f32) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .h(px(44.0))
            .child(orbit::text(label.to_owned(), 14.0, 500, orbit::INK_2).w(px(label_width)))
            .child(div().flex_1().child(self.inputs[index].clone()))
    }

    #[allow(clippy::too_many_lines)] // Mantiene el orden y las tarjetas del equipo en una vista.
    fn driver_fields(&self) -> gpui::Div {
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
                    .border_color(rgba(orbit::LINE))
                    .bg(rgba(0x0809_0be8))
                    .child(orbit::text(
                        format!("{}", index + 1),
                        14.0,
                        600,
                        orbit::INK_3,
                    ))
                    .child(orbit::text(name.clone(), 15.0, 600, orbit::INK)),
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
                .border_color(rgba(orbit::LINE))
                .bg(rgba(0x0809_0be8))
                .child(orbit::eyebrow(role));
            if index == 0 {
                card = card.child(self.field(26)).child(self.field(27));
            } else {
                card = card
                    .child(orbit::eyebrow("NOMBRE DEL PILOTO"))
                    .child(orbit::text(name.clone(), 16.0, 600, orbit::INK));
            }
            if !class.is_empty() {
                card = card
                    .child(orbit::eyebrow("CLASE / ACREDITACIÓN"))
                    .child(orbit::text(class.clone(), 14.0, 500, orbit::INK_2));
            }
            cards = cards.child(card.child(orbit::empty_state(
                "Límites de stint sin configurar",
                "El documento no contiene límites para este piloto.",
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
                    .border_color(rgba(orbit::LINE))
                    .bg(rgba(0x0809_0be8))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(orbit::text("Orden de pilotos", 17.0, 600, orbit::INK))
                            .child(orbit::text("Orden guardado", 13.0, 500, orbit::INK_2)),
                    )
                    .child(orbit::text(
                        "La carrera conserva la secuencia del documento.",
                        13.0,
                        400,
                        orbit::INK_2,
                    ))
                    .child(order),
            )
            .child(cards)
    }

    fn session_sources(&self, cx: &mut Context<Self>) -> gpui::Div {
        let preparation = match &self.automatic_preparation {
            Some(prepared) => Ok(Some(prepared.clone())),
            None if self.automatic => self.prepare_automatic(),
            None => Ok(None),
        };
        let linked_sessions = self.current_event().map_or(0, |event| {
            event["planningInputs"]["projection"]["sourceSessions"]
                .as_array()
                .map_or(0, Vec::len)
        });
        let session_count = preparation
            .as_ref()
            .ok()
            .and_then(Option::as_ref)
            .map_or(linked_sessions, |prepared| prepared.source_revisions.len());
        let status = preparation.as_ref().map_or_else(
            |error| Some(error.clone()),
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
        let browse = orbit::primary_button("strategy-browse-sessions", "Buscar sesiones")
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
            .border_color(rgba(orbit::LINE))
            .bg(rgba(0x0809_0bf0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(orbit::text("Telemetría registrada", 17.0, 600, orbit::INK))
                    .child(
                        div()
                            .px(px(8.0))
                            .py(px(3.0))
                            .rounded(px(7.0))
                            .bg(rgb(orbit::SURFACE_2))
                            .child(orbit::text(
                                format!("{session_count}/4"),
                                11.0,
                                500,
                                orbit::INK_3,
                            )),
                    ),
            )
            .child(orbit::text(
                "Los originales se conservan. Abre hasta cuatro sesiones para revisarlas y elige después cuáles utilizar.",
                15.0,
                400,
                orbit::INK_2,
            ))
            .when_some(status, |card, status| {
                card.child(orbit::text(status, 13.0, 500, orbit::INK_3))
            })
            .child(browse)
    }

    fn choice_card(
        id: &'static str,
        title: &str,
        help: &str,
        icon: &'static str,
        selected: bool,
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
                rgb(orbit::CARMINE)
            } else {
                rgba(orbit::LINE)
            })
            .rounded(px(12.0))
            .bg(if selected {
                rgba(0x100d_0ff2)
            } else {
                rgba(0x0809_0bf2)
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
                                rgb(orbit::CARMINE)
                            } else {
                                rgba(orbit::LINE_STRONG)
                            })
                            .when(selected, |radio| radio.bg(rgb(orbit::CARMINE)))
                            .when(selected, |radio| {
                                radio.child(orbit::text("✓", 13.0, 700, orbit::WHITE))
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
                    .child(orbit::icon(icon, 36.0, orbit::INK_2)),
            )
            .child(
                gpui::div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_w(px(0.0))
                    .gap(px(10.0))
                    .child(orbit::text(title.to_owned(), 20.0, 600, orbit::INK))
                    .child(orbit::text(help.to_owned(), 14.0, 400, orbit::INK_2)),
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
