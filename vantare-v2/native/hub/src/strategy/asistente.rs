//! Asistente de cinco pasos; prepara datos desde el documento y la API nativa.
use super::*;
use gpui::{ObjectFit, div, img, px, rgb, rgba};

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
    pub(super) fn assistant_page(&self, step: AssistantStep, cx: &mut Context<Self>) -> gpui::Div {
        let main = div()
            .id("strategy-assistant")
            .relative()
            .flex()
            .flex_col()
            .flex_1()
            .min_w_0()
            .overflow_hidden()
            .bg(rgb(0x0010_1114));
        let main = if let Some(image) = self.garage.clone() {
            main.child(
                img(image)
                    .absolute()
                    .inset_0()
                    .size_full()
                    .object_fit(ObjectFit::Cover)
                    .opacity(0.82),
            )
        } else {
            main
        };
        let (title, description) = match step {
            AssistantStep::Inicio => (
                "Prepara tu próxima carrera",
                "Elige cómo empezar. Construye tu estrategia con sesiones registradas.",
            ),
            AssistantStep::Combinacion => (
                "Elige tu combinación",
                "Configura una carrera o parte de un evento disponible.",
            ),
            AssistantStep::Reglas => (
                "Configura tu carrera",
                "Define los parámetros que ya conoces; los campos vacíos siguen pendientes.",
            ),
            AssistantStep::Pilotos => (
                "Prepara tus pilotos",
                "Revisa los pilotos guardados o introduce los datos que tengas.",
            ),
            AssistantStep::Sesiones => (
                "Elige tu telemetría",
                "La preparación automática exige sesiones y revisiones exactas.",
            ),
        };
        let mut progress = gpui::div()
            .relative()
            .flex()
            .items_start()
            .justify_between()
            .gap(px(8.0))
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
                    .flex_1()
                    .flex_col()
                    .items_center()
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
                    .child(orbit::text(
                        item.label(),
                        orbit::SECONDARY,
                        if current { 600 } else { 400 },
                        if current { orbit::INK } else { orbit::INK_3 },
                    )),
            );
        }

        let footer = gpui::div()
            .flex()
            .items_center()
            .justify_between()
            .border_t_1()
            .border_color(rgba(orbit::LINE))
            .bg(rgba(0x0809_0bf0))
            .px(px(24.0))
            .py(px(14.0))
            .child(orbit::text(
                "✓  Originales intactos",
                orbit::BODY,
                500,
                orbit::INK_2,
            ))
            .child(
                gpui::div()
                    .flex()
                    .gap(px(10.0))
                    .child(
                        button(
                            "strategy-assistant-back",
                            if step.previous().is_some() {
                                "← Atrás"
                            } else {
                                "Cancelar"
                            },
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
                        button(
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
            AssistantStep::Reglas => self.rules_fields(),
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
            .pt(px(10.0))
            .pb(px(22.0))
            .child(progress)
            .child(orbit::eyebrow(step.label().to_uppercase()))
            .child(
                orbit::text(title, 38.0, 700, orbit::INK)
                    .max_w(px(480.0))
                    .line_height(px(48.0)),
            )
            .child(orbit::text(description, 14.0, 400, orbit::INK_2).max_w(px(460.0)))
            .child(body);
        let main = main
            .child(div().absolute().inset_0().bg(rgba(0x0809_0b68)))
            .child(
                gpui::div()
                    .relative()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_h(px(0.0))
                    .child(content)
                    .child(footer),
            );
        div().flex().flex_1().min_w_0().min_h(px(0.0)).child(main)
    }

    fn start_choices(&self, cx: &mut Context<Self>) -> gpui::Div {
        gpui::div()
            .flex()
            .flex_col()
            .mt(px(10.0))
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

    fn combination_choices(&self) -> gpui::Div {
        gpui::div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(720.0))
            .child(
                orbit::card("Evento").child(
                    orbit::card_body()
                        .gap(px(8.0))
                        .child(orbit::text(
                            "Carrera personalizada",
                            orbit::BODY,
                            700,
                            orbit::INK,
                        ))
                        .child(orbit::text(
                            "Los valores se confirman en el paso Reglas.",
                            orbit::SECONDARY,
                            400,
                            orbit::INK_2,
                        )),
                ),
            )
            .child(orbit::empty_state(
                "Calendario de Vantare",
                "La selección de eventos todavía no tiene un contrato nativo en Strategy.",
            ))
            .child(
                orbit::card("Tu combinación actual")
                    .child(orbit::card_body().child(self.field(4)).child(self.field(5))),
            )
    }

    fn rules_fields(&self) -> gpui::Div {
        gpui::div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .max_w(px(920.0))
            .child(
                orbit::card("Carrera").child(
                    orbit::card_body().gap(px(12.0)).child(self.field(0)).child(
                        gpui::div()
                            .flex()
                            .gap(px(12.0))
                            .child(self.field(1))
                            .child(self.field(9)),
                    ),
                ),
            )
            .child(
                orbit::card("Combustible y energía virtual").child(
                    orbit::card_body()
                        .gap(px(12.0))
                        .child(
                            gpui::div()
                                .flex()
                                .gap(px(12.0))
                                .child(self.field(2))
                                .child(self.field(11)),
                        )
                        .child(
                            gpui::div()
                                .flex()
                                .gap(px(12.0))
                                .child(self.field(12))
                                .child(self.field(13)),
                        )
                        .child(
                            gpui::div()
                                .flex()
                                .gap(px(12.0))
                                .child(self.field(22))
                                .child(self.field(8)),
                        ),
                ),
            )
            .child(
                orbit::card("Reglamento y paradas").child(
                    orbit::card_body()
                        .gap(px(12.0))
                        .child(
                            gpui::div()
                                .flex()
                                .gap(px(12.0))
                                .child(self.field(3))
                                .child(self.field(16)),
                        )
                        .child(
                            gpui::div()
                                .flex()
                                .gap(px(12.0))
                                .child(self.field(25))
                                .child(self.field(24)),
                        ),
                ),
            )
    }

    fn driver_fields(&self) -> gpui::Div {
        let drivers = self
            .current_event()
            .and_then(|event| event["drivers"].as_array())
            .map_or_else(Vec::new, |drivers| {
                drivers
                    .iter()
                    .map(|driver| display(&driver["name"]["value"]))
                    .filter(|name| !name.is_empty())
                    .collect::<Vec<_>>()
            });
        orbit::card("Piloto principal").child(
            orbit::card_body()
                .gap(px(12.0))
                .child(if drivers.is_empty() {
                    orbit::empty_state(
                        "Sin pilotos guardados",
                        "Introduce el piloto principal; no se añadirán pilotos automáticamente.",
                    )
                } else {
                    orbit::text(drivers.join(" · "), orbit::BODY, 600, orbit::INK)
                })
                .child(
                    gpui::div()
                        .flex()
                        .gap(px(12.0))
                        .child(self.field(26))
                        .child(self.field(27)),
                )
                .child(self.field(25)),
        )
    }

    fn session_sources(&self, cx: &mut Context<Self>) -> gpui::Div {
        if !self.automatic {
            return orbit::card("Sesiones registradas").child(orbit::card_body().child(
                orbit::empty_state(
                    "Modo manual",
                    "Este borrador no requiere sesiones de telemetría.",
                ),
            ));
        }
        let preparation = match &self.automatic_preparation {
            Some(prepared) => Ok(Some(prepared.clone())),
            None => self.prepare_automatic(),
        };
        let browse = button("strategy-browse-sessions", "Buscar sesiones").on_click(cx.listener(
            |this, _, _, cx| {
                this.page = Page::Editor(EditorTab::Datos);
                this.error = None;
                cx.notify();
            },
        ));
        match preparation {
            Ok(Some(prepared)) => orbit::card("Sesiones registradas").child(
                orbit::card_body()
                    .gap(px(10.0))
                    .child(orbit::text(
                        format!(
                            "{} sesiones · {} revisiones exactas",
                            prepared.source_revisions.len(),
                            prepared.source_revisions.len()
                        ),
                        orbit::BODY,
                        600,
                        orbit::INK,
                    ))
                    .child(orbit::text(
                        match prepared.status {
                            application::AutomaticPreparationStatus::Ready => {
                                "Preparación completa".to_owned()
                            }
                            application::AutomaticPreparationStatus::Partial => format!(
                                "Preparación parcial · bloqueos: {}",
                                prepared.blockers.len()
                            ),
                        },
                        orbit::SECONDARY,
                        400,
                        orbit::INK_2,
                    ))
                    .child(browse),
            ),
            Ok(None) => orbit::card("Sesiones registradas").child(orbit::card_body().child(
                gpui::div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(orbit::empty_state(
                        "Sin sesiones compatibles",
                        "No hay una proyección guardada con revisiones exactas para esta carrera.",
                    ))
                    .child(browse),
            )),
            Err(error) => orbit::card("Sesiones registradas").child(
                orbit::card_body()
                    .child(orbit::callout(error))
                    .child(browse),
            ),
        }
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
            .h(px(146.0))
            .px(px(22.0))
            .border_1()
            .border_color(if selected {
                rgb(orbit::CARMINE)
            } else {
                rgba(orbit::LINE)
            })
            .rounded(px(12.0))
            .bg(if selected {
                rgba(0xd52f_4912)
            } else {
                rgba(0x0809_0bd9)
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
}
