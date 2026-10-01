//! Carrera overview and shared Strategy editor tabs.
use super::*;
use gpui::{ObjectFit, div, img, px, rgba};

fn career_row(title: &str, value: String, detail: String, action: impl IntoElement) -> gpui::Div {
    orbit::card("").child(
        orbit::card_body()
            .flex()
            .items_center()
            .gap(px(16.0))
            .child(orbit::text(title.to_owned(), 15.0, 600, orbit::INK))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_w_0()
                    .gap(px(4.0))
                    .child(orbit::text(value, orbit::BODY, 700, orbit::INK))
                    .child(orbit::text(detail, orbit::SECONDARY, 400, orbit::INK_2)),
            )
            .child(action),
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum EditorTab {
    Carrera,
    Datos,
    Plan,
    Revisiones,
}

impl EditorTab {
    pub(super) const ALL: [Self; 4] = [Self::Carrera, Self::Datos, Self::Plan, Self::Revisiones];

    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Carrera => "Carrera",
            Self::Datos => "Datos",
            Self::Plan => "Plan",
            Self::Revisiones => "Revisiones",
        }
    }
}

impl Strategy {
    pub(super) fn seed_capture_demo(&mut self, cx: &mut Context<Self>) -> Result<(), String> {
        let demo = crate::demo::DemoData::load()?;
        let event = &demo.strategy.event;
        let plan = demo
            .strategy
            .plans
            .first()
            .ok_or("La demo no tiene una estrategia")?;
        let mut fields = vec![String::new(); FIELDS.len()];
        for (index, value) in [
            (0, event.name.clone()),
            (1, event.duration_minute.to_string()),
            (2, event.tank_liters.to_string()),
            (3, event.pit_seconds.to_string()),
            (4, event.track.clone()),
            (5, event.vehicle_class.clone()),
            (6, plan.name.clone()),
            (7, plan.note.clone()),
            (8, plan.mode.clone()),
            (25, event.team.clone()),
        ] {
            fields[index] = value;
        }
        if let Some(driver) = demo.strategy.drivers.first() {
            fields[26].clone_from(&driver.name);
            fields[27].clone_from(&driver.initials);
        }

        let mut document = Document::empty(&demo.fixed_now()?.to_rfc3339())?;
        let event_index = append_manual_event(&mut document, &fields)?;
        let drivers = demo
            .strategy
            .drivers
            .iter()
            .enumerate()
            .map(|(order, driver)| {
                serde_json::json!({
                    "id": driver.id.clone(),
                    "order": order,
                    "name": vantare_strategy::document::manual(serde_json::json!(driver.name.clone())),
                    "ini": vantare_strategy::document::manual(serde_json::json!(driver.initials.clone())),
                    "cls": vantare_strategy::document::manual(serde_json::json!(driver.class.clone())),
                })
            })
            .collect::<Vec<_>>();
        let driver_order = demo
            .strategy
            .drivers
            .iter()
            .map(|driver| driver.id.clone())
            .collect::<Vec<_>>();
        let mut value = document.value().clone();
        let event_value = &mut value["events"][event_index];
        event_value["drivers"] = serde_json::json!(drivers);
        event_value["strategies"][0]["order"] = serde_json::json!(driver_order);
        event_value["teamMode"] = vantare_strategy::document::manual(serde_json::json!("team"));
        document =
            Document::parse(&serde_json::to_vec(&value).map_err(|error| error.to_string())?)?;

        self.editor.saved = Some(document.bytes().to_vec());
        self.editor.document = Some(document);
        self.editor.path = None;
        self.demo_car = Some(event.car.clone());
        self.event = event_index;
        self.variant = 0;
        self.fields = fields;
        self.sync_inputs(cx);
        self.status = "Escena Strategy cargada desde los datos demo del Hub.".into();
        Ok(())
    }

    pub(super) fn editor_page(&self, tab: EditorTab, cx: &mut Context<Self>) -> gpui::Div {
        let content = match tab {
            EditorTab::Carrera if self.edit_mode => self.edit_workspace(cx),
            EditorTab::Carrera => self.career_overview(cx),
            EditorTab::Datos => {
                orbit::card("Datos").child(orbit::card_body().child(orbit::empty_state(
                    "Sin fuentes o vueltas revisadas",
                    "El documento todavía no tiene datos de sesión seleccionados.",
                )))
            }
            EditorTab::Plan => {
                orbit::card("Plan de carrera").child(orbit::card_body().child(orbit::empty_state(
                    "Plan pendiente",
                    "El documento no tiene un cálculo confirmado.",
                )))
            }
            EditorTab::Revisiones => self.revisions_page(),
        };
        let mut tabs = div()
            .flex()
            .gap(px(8.0))
            .border_b_1()
            .border_color(rgba(orbit::LINE));
        for item in EditorTab::ALL {
            let selected = item == tab;
            tabs = tabs.child(
                button(
                    match item {
                        EditorTab::Carrera => "strategy-tab-career",
                        EditorTab::Datos => "strategy-tab-data",
                        EditorTab::Plan => "strategy-tab-plan",
                        EditorTab::Revisiones => "strategy-tab-revisions",
                    },
                    item.label(),
                )
                .when(selected, |control| {
                    control.border_b_1().border_color(rgba(orbit::CARMINE))
                })
                .on_click(cx.listener(move |this, _, _, cx| {
                    if let Err(error) = this.ensure_clean_form() {
                        this.error = Some(error);
                    } else {
                        this.page = Page::Editor(item);
                        this.edit_mode = false;
                        this.error = None;
                    }
                    cx.notify();
                })),
            );
        }
        let shell = div().relative().flex().flex_1().min_w_0().min_h(px(0.0));
        let shell = if let Some(image) = self.garage.clone() {
            shell.child(
                img(image)
                    .absolute()
                    .inset_0()
                    .size_full()
                    .object_fit(ObjectFit::Cover)
                    .opacity(0.82),
            )
        } else {
            shell
        };
        shell
            .child(div().absolute().inset_0().bg(rgba(0x0809_0b68)))
            .child(
                div()
                    .relative()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_w_0()
                    .min_h(px(0.0))
                    .gap(px(12.0))
                    .px(px(24.0))
                    .py(px(14.0))
                    .child(orbit::text(
                        "PLANIFICADOR  /  Estrategia",
                        orbit::SECONDARY,
                        500,
                        orbit::INK_3,
                    ))
                    .child(
                        button("strategy-back-assistant", "← Volver al asistente").on_click(
                            cx.listener(|this, _, _, cx| {
                                if let Err(error) = this.ensure_clean_form() {
                                    this.error = Some(error);
                                } else {
                                    this.edit_mode = false;
                                    this.page = Page::Assistant(AssistantStep::Sesiones);
                                    this.error = None;
                                }
                                cx.notify();
                            }),
                        ),
                    )
                    .child(tabs)
                    .child(content.flex_1().min_h(px(0.0)))
                    .child(self.editor_footer(cx)),
            )
    }

    fn editor_footer(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.0))
            .border_t_1()
            .border_color(rgba(orbit::LINE))
            .bg(rgba(0x0809_0bf0))
            .px(px(18.0))
            .py(px(10.0))
            .child(orbit::text(
                "✓  Originales intactos",
                orbit::SECONDARY,
                500,
                orbit::INK_2,
            ))
            .child(orbit::text(
                self.status.clone(),
                orbit::SECONDARY,
                400,
                orbit::INK_3,
            ))
            .child(
                button("strategy-save-draft", "Guardar borrador").on_click(cx.listener(
                    |this, _, _, cx| {
                        this.error = this.save_application_draft().err();
                        cx.notify();
                    },
                )),
            )
    }

    fn edit_workspace(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .child(orbit::text("Editar carrera", 24.0, 700, orbit::INK))
            .child(self.workspace(cx))
            .child(
                button("strategy-finish-edit", "Volver a Carrera").on_click(cx.listener(
                    |this, _, _, cx| {
                        if let Err(error) = this.ensure_clean_form() {
                            this.error = Some(error);
                        } else {
                            this.edit_mode = false;
                            this.error = None;
                        }
                        cx.notify();
                    },
                )),
            )
    }

    #[allow(clippy::too_many_lines)] // Agrupa las tarjetas y el resumen de la pestaña Carrera.
    fn career_overview(&self, cx: &mut Context<Self>) -> gpui::Div {
        let event = self.current_event();
        let event_name = event.map_or_else(
            || "Carrera sin guardar".to_owned(),
            |event| display(&event["name"]["value"]),
        );
        let circuit = event.map_or_else(String::new, |event| display(&event["track"]["value"]));
        let class = event.map_or_else(String::new, |event| display(&event["cls"]["value"]));
        let duration =
            event.map_or_else(String::new, |event| display(&event["durationMin"]["value"]));
        let tank = event.map_or_else(String::new, |event| display(&event["tankLiters"]["value"]));
        let pit = event.map_or_else(String::new, |event| {
            display(&event["pitLossSeconds"]["value"])
        });
        let laps = event.map_or_else(String::new, |event| {
            display(
                &event["strategies"][self.variant]["overrides"]["nativeScalarInput"]["raceLaps"],
            )
        });
        let drivers = event
            .and_then(|event| event["drivers"].as_array())
            .map_or_else(Vec::new, |drivers| {
                drivers
                    .iter()
                    .map(|driver| display(&driver["name"]["value"]))
                    .filter(|name| !name.is_empty())
                    .collect::<Vec<_>>()
            });
        let note = event.map_or_else(String::new, |event| {
            display(&event["strategies"][self.variant]["note"]["value"])
        });
        let source_status =
            self.automatic_preparation
                .as_ref()
                .map(|prepared| match prepared.status {
                    application::AutomaticPreparationStatus::Ready => {
                        "Preparación automática completa".to_owned()
                    }
                    application::AutomaticPreparationStatus::Partial => format!(
                        "Preparación automática parcial · {} bloqueos",
                        prepared.blockers.len()
                    ),
                });
        let driver_names = if drivers.is_empty() {
            "Sin pilotos guardados".to_owned()
        } else {
            drivers.join(" · ")
        };
        let rules = if !laps.is_empty() {
            format!("{laps} vueltas")
        } else if !duration.is_empty() {
            format!("{duration} minutos")
        } else {
            "Reglas pendientes".to_owned()
        };
        let event_detail = [class, circuit]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" · ");
        let class_name = event.map_or_else(String::new, |event| display(&event["cls"]["value"]));
        let source_detail = source_status.unwrap_or_else(|| {
            if event.is_some_and(|event| !event["planningInputs"]["projection"].is_null()) {
                "Proyección guardada en el documento".to_owned()
            } else {
                "Sin proyección de telemetría guardada".to_owned()
            }
        });
        let note_detail = if note.is_empty() {
            "Sin observaciones guardadas".to_owned()
        } else {
            note
        };
        let plan_summary = if let Some(result) = &self.result {
            if result.feasible {
                format!(
                    "{} stints · {:.3} s",
                    result.stints.len(),
                    result.expected.total_seconds
                )
            } else {
                "Sin plan factible".to_owned()
            }
        } else {
            "Sin calcular".to_owned()
        };
        div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .child(orbit::text(
                format!("Tu estrategia · {event_name} · {class_name}"),
                30.0,
                700,
                orbit::INK,
            ))
            .child(orbit::text(
                "Revisa la configuración de tu carrera y prepara la estrategia.",
                orbit::BODY,
                400,
                orbit::INK_2,
            ))
            .child(
                div()
                    .flex()
                    .min_w_0()
                    .gap(px(14.0))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w_0()
                            .gap(px(8.0))
                            .child(career_row(
                                "Evento",
                                event_name,
                                event_detail,
                                button("strategy-edit-event", "Editar").on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.edit_mode = true;
                                        this.error = None;
                                        cx.notify();
                                    },
                                )),
                            ))
                            .child(career_row(
                                "Reglas",
                                rules,
                                format!("Depósito · {tank} L   ·   Boxes · {pit} s"),
                                button("strategy-edit-rules", "Editar").on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.edit_mode = true;
                                        this.error = None;
                                        cx.notify();
                                    },
                                )),
                            ))
                            .child(career_row(
                                "Pilotos",
                                driver_names,
                                "Ritmo pendiente de validar con sus sesiones.".to_owned(),
                                button("strategy-edit-drivers", "Editar").on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.edit_mode = true;
                                        this.error = None;
                                        cx.notify();
                                    },
                                )),
                            ))
                            .child(
                                orbit::card("").child(
                                    orbit::card_body()
                                        .gap(px(12.0))
                                        .child(orbit::eyebrow("FUENTE DE DATOS"))
                                        .child(orbit::text(source_detail, orbit::BODY, 600, orbit::INK))
                                        .child(orbit::text(
                                            "Revisa la cobertura antes de calcular.",
                                            orbit::SECONDARY,
                                            400,
                                            orbit::INK_2,
                                        ))
                                        .child(orbit::eyebrow("OBSERVACIONES"))
                                        .child(orbit::text(note_detail, orbit::BODY, 500, orbit::INK_2)),
                                ),
                            ),
                    )
                    .child(
                        orbit::card("Plan de carrera")
                            .w(px(430.0))
                            .flex_none()
                            .child(
                                orbit::card_body()
                                    .gap(px(10.0))
                                    .child(orbit::text(plan_summary, 24.0, 700, orbit::INK))
                                    .child(orbit::text(
                                        if self.result.is_some() {
                                            "Resultado del solver nativo."
                                        } else {
                                            "El cálculo estará disponible al completar y validar las entradas de carrera."
                                        },
                                        orbit::BODY,
                                        400,
                                        orbit::INK_2,
                                    ))
                                    .child(button("strategy-open-plan", "Ver Plan →").on_click(
                                        cx.listener(|this, _, _, cx| {
                                            this.page = Page::Editor(EditorTab::Plan);
                                            this.error = None;
                                            cx.notify();
                                        }),
                                    )),
                            ),
                    ),
            )
    }
}
