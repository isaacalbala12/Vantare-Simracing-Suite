//! Carrera overview and shared Strategy editor tabs.
use super::*;
use gpui::{div, px, rgb, rgba};

// Valores visibles en la demo aprobada; no representan telemetría real.
pub(super) struct CaptureDemo {
    pub(super) track_layout: &'static str,
    pub(super) fuel_initial: u16,
    pub(super) fuel_reserve: u16,
    pub(super) energy_capacity: u16,
    pub(super) energy_initial: u16,
    pub(super) energy_reserve: u16,
    pub(super) driver_limits: [u16; 4],
    pub(super) session_name: &'static str,
}

const CAPTURE_DEMO: CaptureDemo = CaptureDemo {
    track_layout: "GP",
    fuel_initial: 106,
    fuel_reserve: 3,
    energy_capacity: 100,
    energy_initial: 96,
    energy_reserve: 4,
    driver_limits: [15, 30, 55, 120],
    session_name: "2026-09-15_Imola_Race.duckdb",
};

pub(super) fn demo_control(value: &(impl ToString + ?Sized), cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .justify_between()
        .flex_1()
        .min_w_0()
        .h(px(42.0))
        .px(px(12.0))
        .rounded(px(7.0))
        .border_1()
        .border_color(rgba(orbit::line_strong(cx)))
        .bg(rgb(crate::orbit::legacy_rgb(0x000b_0d0f, cx)))
        .child(orbit::text(value.to_string(), 13.0, 400, orbit::ink(cx), cx).line_height(px(19.5)))
}

fn demo_selected_sessions() -> Value {
    serde_json::json!({
        "combinationId": "demo-imola-gp-lmgt3",
        "sessions": [{"sessionId": CAPTURE_DEMO.session_name, "included": true}]
    })
}

/// Acción clara Orbit: compuesta aquí porque `primary_button` fija el color del hijo.
pub(super) fn white_button(
    id: &'static str,
    label: &str,
    cx: &gpui::App,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .flex()
        .items_center()
        .justify_center()
        .h(px(46.0))
        .px(px(14.0))
        .rounded(px(12.0))
        .border_1()
        .border_color(rgb(orbit::primary_bg(cx)))
        .bg(rgb(orbit::primary_bg(cx)))
        .cursor_pointer()
        .hover(|style| style.bg(rgb(orbit::ink(cx))))
        .focus_visible(|style| style.border_color(rgb(orbit::carmine(cx))))
        .child(orbit::text(
            label.to_owned(),
            13.0,
            500,
            cx.global::<crate::orbit::theme::Theme>().primary_ink,
            cx,
        ))
}

// La fixture se prepara con el contrato nativo, sin proyección ni resultado.
fn capture_document(
    demo: &crate::demo::DemoData,
) -> Result<(Document, Vec<String>, usize), String> {
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
    // Valores visibles en las capturas v5 aprobadas de Carrera y Reglas.
    fields[0] = "4 Horas de Imola · LMGT3".into();
    fields[2] = "110".into();
    fields[7].clear();
    fields[9] = "69".into();
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
    event_value["combination"] = demo_selected_sessions();
    event_value["strategies"][0]["order"] = serde_json::json!(driver_order);
    event_value["teamMode"] = vantare_strategy::document::manual(serde_json::json!("team"));
    document = Document::parse(&serde_json::to_vec(&value).map_err(|error| error.to_string())?)?;

    Ok((document, fields, event_index))
}

pub(super) fn secondary_button(
    id: &'static str,
    label: &str,
    size: f32,
    cx: &gpui::App,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label.to_owned())
        .tab_index(0)
        .flex()
        .items_center()
        .justify_center()
        .h(px(46.0))
        .px(px(14.0))
        .rounded(px(12.0))
        .border_1()
        .border_color(rgba(orbit::line_strong(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff04, cx)))
        .cursor_pointer()
        .hover(|style| style.bg(rgb(orbit::surface_3(cx))))
        .focus_visible(|style| style.border_color(rgb(orbit::carmine(cx))))
        .child(orbit::text(label.to_owned(), size, 400, orbit::ink(cx), cx))
}

fn career_row(
    title: &str,
    icon: &'static str,
    value: String,
    detail: String,
    action: impl IntoElement,
    cx: &gpui::App,
) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .gap(px(16.0))
        .h(px(74.0))
        .px(px(18.0))
        .rounded(px(12.0))
        .border_1()
        .border_color(rgba(orbit::line(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0x0b0d_0fe8, cx)))
        .child(orbit::icon(icon, 20.0, orbit::ink_2(cx)))
        .child(orbit::text(title.to_owned(), 16.0, 500, orbit::ink(cx), cx).w(px(86.0)))
        .child(
            div()
                .flex()
                .flex_col()
                .flex_1()
                .min_w_0()
                .gap(px(4.0))
                .child(orbit::text(value, 14.0, 700, orbit::ink(cx), cx))
                .child(orbit::text(detail, 13.0, 400, orbit::ink_2(cx), cx)),
        )
        .child(action)
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
    pub(super) fn capture_demo(&self) -> Option<&'static CaptureDemo> {
        self.demo_car.as_ref().map(|_| &CAPTURE_DEMO)
    }

    pub(super) fn seed_capture_demo(&mut self, cx: &mut Context<Self>) -> Result<(), String> {
        let demo = crate::demo::DemoData::load()?;
        let (document, fields, event_index) = capture_document(&demo)?;

        self.editor.saved = Some(document.bytes().to_vec());
        self.editor.document = Some(document);
        self.editor.path = None;
        self.demo_car = Some(demo.strategy.event.car.clone());
        self.event = event_index;
        self.variant = 0;
        self.fields = fields;
        self.sync_inputs(cx);
        self.status = "Escena Strategy cargada desde los datos demo del Hub.".into();
        Ok(())
    }

    #[allow(clippy::too_many_lines)] // Mantiene juntas las cuatro rutas y su navegación por pestañas.
    pub(super) fn editor_page(
        &self,
        tab: EditorTab,
        viewport_height: f32,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let content = match tab {
            EditorTab::Carrera if self.edit_mode => self.edit_workspace(cx),
            EditorTab::Carrera => self.career_overview(cx),
            EditorTab::Datos => div().flex().flex_col().child(self.data_page(cx)),
            EditorTab::Plan => div().flex().flex_col().child(match self.page {
                Page::Stints => self.stint_editor_page(cx),
                Page::Stops => self.pit_editor_page(cx),
                _ => self.plan_page(cx),
            }),
            EditorTab::Revisiones => self.revisions_page(cx),
        };
        let mut tabs = div()
            .flex()
            .gap(px(8.0))
            .border_b_1()
            .border_color(rgba(orbit::line(cx)));
        for (index, item) in EditorTab::ALL.into_iter().enumerate() {
            let selected = item == tab;
            let id = match item {
                EditorTab::Carrera => "strategy-tab-career",
                EditorTab::Datos => "strategy-tab-data",
                EditorTab::Plan => "strategy-tab-plan",
                EditorTab::Revisiones => "strategy-tab-revisions",
            };
            tabs = tabs.child(
                div()
                    .id(id)
                    .role(gpui::Role::Button)
                    .aria_label(item.label())
                    .aria_selected(selected)
                    .tab_index(0)
                    .h(px(42.0))
                    .w(px([104.0, 90.0, 95.0, 129.0][index]))
                    .px(px(24.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(selected, |control| {
                        control.border_b_2().border_color(rgb(orbit::carmine(cx)))
                    })
                    .child(
                        orbit::text(
                            item.label(),
                            16.0,
                            if selected { 600 } else { 400 },
                            if selected {
                                orbit::ink(cx)
                            } else {
                                orbit::ink_2(cx)
                            },
                            cx,
                        )
                        .relative()
                        .top(px(-6.0)),
                    )
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
        div()
            .flex()
            .flex_1()
            .h(px((viewport_height - orbit::STRATEGY_TOPBAR_H).max(0.0)))
            .min_w_0()
            .min_h(px(0.0))
            .child(
                div()
                    .relative()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .h_full()
                    .min_w_0()
                    .min_h(px(0.0))
                    .gap(px(12.0))
                    .px(px(24.0))
                    .pt(px(9.0))
                    .pb(px(0.0))
                    .child(
                        secondary_button(
                            "strategy-back-assistant",
                            "← Volver al asistente",
                            12.0,
                            cx,
                        )
                        .opacity(0.65)
                        .on_click(cx.listener(|this, _, _, cx| {
                            if let Err(error) = this.ensure_clean_form() {
                                this.error = Some(error);
                            } else {
                                this.edit_mode = false;
                                this.page = Page::Assistant(AssistantStep::Sesiones);
                                this.error = None;
                            }
                            cx.notify();
                        }))
                        .w(px(148.0))
                        .h(px(38.0)),
                    )
                    .child(tabs)
                    .child(content.flex_1().min_h(px(0.0)))
                    .when(tab == EditorTab::Carrera, |page| {
                        page.child(self.editor_footer(cx))
                    }),
            )
    }

    fn editor_footer(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .justify_between()
            .h(px(72.0))
            .flex_none()
            .gap(px(12.0))
            .border_t_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgba(crate::orbit::legacy_rgba(0x0809_0bf0, cx)))
            .px(px(0.0))
            .child(orbit::text(
                "Originales intactos",
                orbit::SECONDARY,
                500,
                orbit::ink_2(cx),
                cx,
            ))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(orbit::text(
                        if self.capture_demo().is_some() {
                            "Borrador guardado"
                        } else {
                            "Borrador local"
                        },
                        12.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(
                        secondary_button(
                            "strategy-back-preparation",
                            "Volver a preparación",
                            14.0,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            if let Err(error) = this.ensure_clean_form() {
                                this.error = Some(error);
                            } else {
                                this.page = Page::Assistant(AssistantStep::Sesiones);
                                this.error = None;
                            }
                            cx.notify();
                        }))
                        .w(px(191.0))
                        .h(px(46.0)),
                    )
                    .child(
                        if self.capture_demo().is_some() {
                            white_button("strategy-save-draft", "Guardar revisión", cx)
                                .tab_stop(false)
                                .opacity(0.55)
                                .cursor(gpui::CursorStyle::Arrow)
                        } else {
                            button("strategy-save-draft", "Guardar borrador", cx).on_click(
                                cx.listener(|this, _, _, cx| {
                                    this.error = this.save_application_draft().err();
                                    cx.notify();
                                }),
                            )
                        }
                        .w(px(161.0))
                        .h(px(46.0)),
                    ),
            )
    }

    fn edit_workspace(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .child(orbit::text("Editar carrera", 24.0, 700, orbit::ink(cx), cx))
            .child(self.workspace(cx))
            .child(
                button("strategy-finish-edit", "Volver a Carrera", cx).on_click(cx.listener(
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
        let event_summary = if event.is_some_and(|event| event["source"]["value"] == "custom") {
            "Carrera personalizada".to_owned()
        } else {
            event_name.clone()
        };
        let circuit = event.map_or_else(String::new, |event| display(&event["track"]["value"]));
        let class = event.map_or_else(String::new, |event| display(&event["cls"]["value"]));
        let duration =
            event.map_or_else(String::new, |event| display(&event["durationMin"]["value"]));
        let tank = event
            .and_then(|event| event["tankLiters"]["value"].as_f64())
            .map_or_else(String::new, |liters| liters.to_string());
        let laps = if self.fields[9].trim().is_empty() {
            event.map_or_else(String::new, |event| {
                display(
                    &event["strategies"][self.variant]["overrides"]["nativeScalarInput"][
                        "raceLaps"
                    ],
                )
            })
        } else {
            self.fields[9].clone()
        };
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
        let event_detail = [
            circuit,
            self.capture_demo()
                .map_or(class, |demo| demo.track_layout.to_owned()),
        ]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
        let class_name = event.map_or_else(String::new, |event| display(&event["cls"]["value"]));
        let selected_sessions = event.map_or(0, |event| {
            event["combination"]["sessions"]
                .as_array()
                .map_or(0, |sessions| {
                    sessions
                        .iter()
                        .filter(|session| session["included"] == true)
                        .count()
                })
        });
        let source_detail = source_status.unwrap_or_else(|| {
            if event.is_some_and(|event| !event["planningInputs"]["projection"].is_null()) {
                "Proyección guardada en el documento".to_owned()
            } else if selected_sessions > 0 {
                "Revisa la cobertura de las sesiones antes de calcular.".to_owned()
            } else {
                "Sin proyección de telemetría guardada".to_owned()
            }
        });
        let session_label = match selected_sessions {
            0 => "Sin sesiones seleccionadas".to_owned(),
            1 => "1 sesión seleccionada".to_owned(),
            count => format!("{count} sesiones seleccionadas"),
        };
        let note_pending =
            note.is_empty() && (selected_sessions == 0 || self.capture_demo().is_some());
        let note_detail = if note_pending {
            "Revisa las reglas y la telemetría antes de calcular.".to_owned()
        } else if note.is_empty() {
            "Sin observaciones guardadas".to_owned()
        } else {
            note
        };
        let plan_summary = if let Some(result) = &self.result {
            if result.result.feasible {
                format!(
                    "{} stints · {:.3} s",
                    result.result.stints.len(),
                    result.result.expected.total_seconds
                )
            } else {
                "Sin plan factible".to_owned()
            }
        } else {
            "Sin calcular".to_owned()
        };
        let title = if class_name.is_empty() || event_name.ends_with(&format!(" · {class_name}")) {
            format!("Tu estrategia · {event_name}")
        } else {
            format!("Tu estrategia · {event_name} · {class_name}")
        };
        let calculation_ready = self.input().is_ok()
            && self.fields[8].trim() == "dry"
            && event.is_some_and(|event| event["source"]["value"] == "custom");
        let plan_action = if self.result.is_some() {
            orbit::button("strategy-open-plan", "Ver Plan →", cx).on_click(cx.listener(
                |this, _, _, cx| {
                    this.page = Page::Editor(EditorTab::Plan);
                    this.error = None;
                    cx.notify();
                },
            ))
        } else if calculation_ready && !self.running {
            white_button("strategy-calculate", "Calcular estrategia", cx)
                .on_click(cx.listener(|this, _, _, cx| this.calculate(cx)))
        } else {
            white_button("strategy-calculate", "Calcular estrategia", cx)
                .tab_stop(false)
                .opacity(if self.capture_demo().is_some() {
                    0.55
                } else {
                    orbit::DISABLED
                })
                .cursor(gpui::CursorStyle::Arrow)
        };
        div()
            .flex()
            .flex_col()
            .gap(px(0.0))
            .child(super::view::heading(&title, 68.0, -1.15, cx).mt(px(2.0)).ml(px(12.0)))
            .child(orbit::text(
                "Revisa la configuración de tu carrera y prepara la estrategia.",
                16.0,
                400,
                orbit::ink_2(cx),
             cx).ml(px(12.0)))
            .child(
                div()
                    .flex()
                    .min_w_0()
                    .gap(px(18.0))
                    .mt(px(26.0))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w_0()
                            .gap(px(8.0))
                            .child(career_row(
                                "Evento",
                                "i-carreras",
                                event_summary,
                                event_detail,
                                secondary_button("strategy-edit-event", "Editar", 14.0, cx).on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.edit_mode = true;
                                        this.error = None;
                                        cx.notify();
                                    },
                                )).w(px(112.0)).h(px(46.0)),
                             cx))
                            .child(career_row(
                                "Reglas",
                                "i-ajustes",
                                rules,
                                format!("Capacidad · {tank} L"),
                                secondary_button("strategy-edit-rules", "Editar", 14.0, cx).on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.edit_mode = true;
                                        this.error = None;
                                        cx.notify();
                                    },
                                )).w(px(112.0)).h(px(46.0)),
                             cx))
                            .child(career_row(
                                "Pilotos",
                                "i-cuenta",
                                driver_names,
                                "Ritmo pendiente de validar con sus sesiones.".to_owned(),
                                secondary_button("strategy-edit-drivers", "Editar", 14.0, cx).on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.edit_mode = true;
                                        this.error = None;
                                        cx.notify();
                                    },
                                )).w(px(112.0)).h(px(46.0)),
                             cx))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap(px(9.0))
                                    .mt(px(8.0))
                                    .min_h(px(258.0))
                                    .p(px(18.0))
                                    .rounded(px(12.0))
                                    .border_1()
                                    .border_color(rgba(orbit::line(cx)))
                                    .bg(rgba(crate::orbit::legacy_rgba(0x0f12_14f7, cx)))
                                    .child(
                                        orbit::eyebrow("FUENTE DE DATOS", cx),
                                    )
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .min_h(px(76.0))
                                            .gap(px(54.0))
                                            .child(orbit::icon("i-telemetria", 20.0, orbit::ink_2(cx)))
                                            .child(
                                                div()
                                                    .flex()
                                                    .flex_col()
                                                    .flex_1()
                                                    .gap(px(8.0))
                                                    .child(orbit::text(
                                                        session_label,
                                                        16.0,
                                                        700,
                                                        orbit::ink(cx),
                                                     cx))
                                                    .child(orbit::text(
                                                        source_detail,
                                                        13.0,
                                                        400,
                                                        orbit::ink_2(cx),
                                                     cx)),
                                            )
                                            .child(
                                                secondary_button("strategy-review-data", "Revisar", 14.0, cx)
                                                    .on_click(cx.listener(|this, _, _, cx| {
                                                        this.page = Page::Editor(EditorTab::Datos);
                                                        this.error = None;
                                                        cx.notify();
                                                    }))
                                                    .w(px(112.0))
                                                    .h(px(46.0)),
                                            ),
                                    )
                                    .child(div().h(px(1.0)).bg(rgba(orbit::line(cx))))
                                    .child(orbit::eyebrow("OBSERVACIONES", cx))
                                    .child(if note_pending {
                                        div()
                                            .flex()
                                            .flex_col()
                                            .mt(px(12.0))
                                            .gap(px(6.0))
                                            .child(orbit::text(
                                                "Pendiente de validar",
                                                18.0,
                                                700,
                                                orbit::ink(cx),
                                             cx))
                                            .child(orbit::text(
                                                note_detail,
                                                14.0,
                                                400,
                                                orbit::ink_2(cx),
                                             cx))
                                    } else {
                                        orbit::text(note_detail, 15.0, 600, orbit::ink_2(cx), cx)
                                    }),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .w(px(570.0))
                            .flex_none()
                            .h(px(182.0))
                            .p(px(22.0))
                            .px(px(26.0))
                            .gap(px(10.0))
                            .rounded(px(14.0))
                            .border_1()
                            .border_color(rgba(orbit::line(cx)))
                            .bg(rgba(crate::orbit::legacy_rgba(0x0b0d_0fe8, cx)))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(18.0))
                                    .child(orbit::icon("i-estrategia", 20.0, orbit::ink_2(cx)))
                                    .child(orbit::text("Plan de carrera", 24.0, 400, orbit::ink(cx), cx).line_height(px(30.0))),
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_1()
                                    .items_center()
                                    .justify_between()
                                    .gap(px(12.0))
                                    .child(
                                        div()
                                            .flex()
                                            .flex_col()
                                            .flex_1()
                                            .min_w_0()
                                            .gap(px(7.0))
                                            .child(orbit::text(plan_summary, 24.0, 700, orbit::ink(cx), cx).line_height(px(30.0)))
                                            .child(orbit::text(
                                                if self.result.is_some() {
                                                    "Resultado del solver nativo."
                                                } else {
                                                    "El cálculo estará disponible al completar y validar las entradas de carrera."
                                                },
                                                14.0,
                                                400,
                                                orbit::ink_2(cx),
                                             cx).line_height(px(21.0))),
                                    )
                                    .child(plan_action.w(px(178.0)).h(px(46.0)).flex_none()),
                            ),
                    ),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approved_demo_selects_imola_without_inventing_a_projection_or_solver_input() {
        let demo = crate::demo::DemoData::load().expect("demo");
        let (document, fields, index) = capture_document(&demo).expect("documento nativo");
        let event = &document.value()["events"][index];
        assert_eq!(fields[0], "4 Horas de Imola · LMGT3");
        assert_eq!(fields[2], "110");
        assert_eq!(fields[9], "69");
        assert_eq!(CAPTURE_DEMO.track_layout, "GP");
        assert_eq!(
            event["combination"]["sessions"][0]["sessionId"],
            CAPTURE_DEMO.session_name
        );
        assert_eq!(event["combination"]["sessions"][0]["included"], true);
        assert_eq!(event["drivers"].as_array().expect("pilotos").len(), 3);
        assert!(event["planningInputs"]["projection"].is_null());
        assert!(event["strategies"][0]["overrides"]["nativeScalarInput"].is_null());
        assert!(fields[10..24].iter().all(String::is_empty));
        assert_eq!(
            (CAPTURE_DEMO.fuel_initial, CAPTURE_DEMO.fuel_reserve),
            (106, 3)
        );
        assert_eq!(
            (
                CAPTURE_DEMO.energy_capacity,
                CAPTURE_DEMO.energy_initial,
                CAPTURE_DEMO.energy_reserve
            ),
            (100, 96, 4)
        );
        assert_eq!(CAPTURE_DEMO.driver_limits, [15, 30, 55, 120]);
    }
}
