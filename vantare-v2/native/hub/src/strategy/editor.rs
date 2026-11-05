//! Carrera overview and shared Strategy editor tabs.
use super::*;
use gpui::{div, px, rgb, rgba};

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
    Plan,
}

impl EditorTab {
    pub(super) const ALL: [Self; 2] = [Self::Carrera, Self::Plan];

    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Carrera => "Carrera",
            Self::Plan => "Plan",
        }
    }
}

impl Strategy {
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
            EditorTab::Plan => div().flex().flex_col().child(match self.page {
                Page::Stints => self.stint_editor_page(cx),
                Page::Stops => self.pit_editor_page(cx),
                _ => self.plan_page(cx),
            }),
        };
        let mut tabs = div()
            .flex()
            .gap(px(8.0))
            .border_b_1()
            .border_color(rgba(orbit::line(cx)));
        for item in EditorTab::ALL {
            let selected = item == tab;
            let id = match item {
                EditorTab::Carrera => "strategy-tab-career",
                EditorTab::Plan => "strategy-tab-plan",
            };
            tabs = tabs.child(
                div()
                    .id(id)
                    .role(gpui::Role::Button)
                    .aria_label(item.label())
                    .aria_selected(selected)
                    .tab_index(0)
                    .h(px(42.0))
                    .w(px(match item {
                        EditorTab::Carrera => 104.0,
                        EditorTab::Plan => 95.0,
                    }))
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
                            this.error = Some(error.into());
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
                        button("strategy-back-assistant", "", cx)
                            .aria_label("← Volver al asistente")
                            .bg(gpui::transparent_black())
                            .border_color(rgba(orbit::line(cx)))
                            .child(orbit::text(
                                "← Volver al asistente",
                                12.0,
                                400,
                                orbit::ink_2(cx),
                                cx,
                            ))
                            .on_click(cx.listener(|this, _, _, cx| {
                                if let Err(error) = this.ensure_clean_form() {
                                    this.error = Some(error.into());
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
                        page.child(capture!(Self::editor_footer(cx) => Self::editor_footer(cx, &self.view_data)))
                    }),
            )
    }

    fn editor_footer(
        cx: &mut Context<Self>,
        #[cfg(feature = "parity-capture")] view_data: &super::view_data::ViewData,
    ) -> gpui::Div {
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
                        capture!("Borrador local" => view_data.draft_label),
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
                                this.error = Some(error.into());
                            } else {
                                this.page = Page::Assistant(AssistantStep::Sesiones);
                                this.error = None;
                            }
                            cx.notify();
                        }))
                        .w(px(191.0))
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
                            this.error = Some(error.into());
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
        let laps = if self.fields[Field::RaceLaps].trim().is_empty() {
            event.map_or_else(String::new, |event| {
                display(
                    &event["strategies"][self.variant]["overrides"]["nativeScalarInput"][
                        "raceLaps"
                    ],
                )
            })
        } else {
            self.fields[Field::RaceLaps].clone()
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
            capture!(class, self.view_data.layout.map(str::to_owned)),
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
        let source_detail =
            if event.is_some_and(|event| !event["planningInputs"]["projection"].is_null()) {
                "Proyección guardada en el documento".to_owned()
            } else if selected_sessions > 0 {
                "Sesiones conservadas en el documento importado; el cálculo usa entradas manuales."
                    .to_owned()
            } else {
                "Sin proyección de telemetría guardada".to_owned()
            };
        let session_label = match selected_sessions {
            0 => "Sin sesiones seleccionadas".to_owned(),
            1 => "1 sesión seleccionada".to_owned(),
            count => format!("{count} sesiones seleccionadas"),
        };
        let note_pending = note.is_empty()
            && (selected_sessions == 0 || capture!(false => self.view_data.layout.is_some()));
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
            && self.fields[Field::VariantMode].trim() == "dry"
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
                .opacity(capture!(orbit::DISABLED => self.view_data.disabled_calculate_opacity))
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
                                                    "Resultado del cálculo de estrategia."
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
