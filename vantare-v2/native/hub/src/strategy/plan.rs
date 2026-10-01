//! Resultado Strategy: estado, certificado y revisiones exactas del solver.
use gpui::{Context, Div, ParentElement, Styled, div, prelude::*, px, rgba};

use super::{Page, Strategy, orbit};
use std::sync::{Arc, atomic::AtomicBool};
use vantare_strategy::{
    application::{self, SourceStatus},
    solver::{OptimalityStatus, SolverOutcome},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PlanState {
    Idle,
    Loading,
    Partial,
    Error,
    Calculated,
    Editing,
}

impl PlanState {
    fn from(
        outcome: Option<&SolverOutcome>,
        running: bool,
        error: Option<&str>,
        edit_dirty: bool,
    ) -> Self {
        if running {
            Self::Loading
        } else if error.is_some() {
            Self::Error
        } else if edit_dirty {
            Self::Editing
        } else if let Some(outcome) = outcome {
            from_certificate(outcome.certificate.status, outcome.result.feasible)
        } else {
            Self::Idle
        }
    }

    fn title(self) -> &'static str {
        match self {
            Self::Idle => "Sin calcular",
            Self::Loading => "Calculando estrategia",
            Self::Partial => "Cobertura parcial",
            Self::Error => "No se pudo calcular la estrategia",
            Self::Calculated => "Cálculo completado",
            Self::Editing => "Cambios pendientes de recálculo",
        }
    }
}

impl Strategy {
    pub(super) fn begin_plan_edit(&mut self, cx: &mut Context<Self>) {
        if self.edit_dirty {
            return;
        }
        let Some(outcome) = self.result.clone() else {
            self.edit_error = Some("Primero calcula una estrategia factible.".into());
            cx.notify();
            return;
        };
        if !outcome.result.feasible {
            if self.edited_plan.is_none() {
                self.edit_error = Some("Primero calcula una estrategia factible.".into());
            }
            cx.notify();
            return;
        }
        match super::stint::schedule_from_outcome(&outcome) {
            Ok(edited) => {
                self.baseline_result = Some(outcome);
                self.baseline_edited_plan = Some(edited.clone());
                self.edited_plan = Some(edited);
                self.edit_dirty = false;
                self.edit_cost_seconds = None;
                self.edit_error = None;
            }
            Err(error) => self.edit_error = Some(error),
        }
        cx.notify();
    }

    pub(super) fn move_plan_boundary(&mut self, index: usize, lap: u32, cx: &mut Context<Self>) {
        if self.running {
            return;
        }
        let Some(race_laps) = self.last_input.as_ref().map(|input| input.race_laps) else {
            self.edit_error = Some("No hay entradas de carrera para editar.".into());
            cx.notify();
            return;
        };
        let Some(edited) = self.edited_plan.as_mut() else {
            self.edit_error = Some("Abre el editor desde un plan calculado.".into());
            cx.notify();
            return;
        };
        match super::stint::move_boundary(edited, race_laps, index, lap) {
            Ok(next) => {
                self.edited_plan = Some(next);
                self.edit_dirty = true;
                self.edit_cost_seconds = None;
                self.edit_error = None;
            }
            Err(error) => self.edit_error = Some(error),
        }
        cx.notify();
    }

    pub(super) fn move_plan_stop(&mut self, index: usize, delta: i32, cx: &mut Context<Self>) {
        if self.running {
            return;
        }
        let Some(race_laps) = self.last_input.as_ref().map(|input| input.race_laps) else {
            self.edit_error = Some("No hay entradas de carrera para editar.".into());
            cx.notify();
            return;
        };
        let Some(edited) = self.edited_plan.as_ref() else {
            self.edit_error = Some("Abre el editor desde un plan calculado.".into());
            cx.notify();
            return;
        };
        match super::parada::move_stop(edited, race_laps, index, delta) {
            Ok(next) => {
                self.edited_plan = Some(next);
                self.edit_dirty = true;
                self.edit_cost_seconds = None;
                self.edit_error = None;
            }
            Err(error) => self.edit_error = Some(error),
        }
        cx.notify();
    }

    pub(super) fn reset_plan_edit(&mut self, cx: &mut Context<Self>) {
        if let (Some(result), Some(edited)) = (
            self.baseline_result.clone(),
            self.baseline_edited_plan.clone(),
        ) {
            self.result = Some(result);
            self.edited_plan = Some(edited);
            self.edit_dirty = false;
            self.edit_cost_seconds = None;
            self.edit_error = None;
            self.status = "Se restauró el último plan factible.".into();
            cx.notify();
        } else {
            self.begin_plan_edit(cx);
        }
    }

    pub(super) fn can_reset_plan_edit(&self) -> bool {
        self.baseline_edited_plan.is_some()
            && (self.edit_dirty
                || self
                    .result
                    .as_ref()
                    .is_some_and(|outcome| !outcome.result.feasible))
    }

    pub(super) fn recalculate_plan_edit(&mut self, cx: &mut Context<Self>) {
        if self.running {
            return;
        }
        if self.manual_source_status != SourceStatus::Open {
            self.edit_error = Some("No se puede calcular con una fuente cerrada.".into());
            cx.notify();
            return;
        }
        let (Some(input), Some(edited)) = (self.last_input.clone(), self.edited_plan.clone())
        else {
            self.edit_error = Some("No hay un plan editable confirmado.".into());
            cx.notify();
            return;
        };
        if !self.edit_dirty {
            self.edit_error = Some("No hay cambios pendientes de recálculo.".into());
            cx.notify();
            return;
        }

        self.cancellation
            .store(true, std::sync::atomic::Ordering::Relaxed);
        self.generation = self.generation.wrapping_add(1);
        self.cancellation = Arc::new(AtomicBool::new(false));
        let cancel = self.cancellation.clone();
        let generation = self.generation;
        self.running = true;
        self.edit_error = None;
        self.status = "Recalculando el plan editado…".into();
        let task = cx.background_executor().spawn(async move {
            application::recalculate_edited_plan(&input, &edited, &cancel)
                .map(|outcome| (outcome, edited))
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                    if this.generation == generation {
                        this.running = false;
                        match result {
                            Ok((outcome, edited)) => {
                                this.edit_cost_seconds = outcome.cost_seconds;
                                if outcome.result.feasible {
                                    this.baseline_result = Some(outcome.clone());
                                    this.baseline_edited_plan = Some(edited.clone());
                                    this.edit_error = None;
                                    this.status = "Plan editado y recalculado.".into();
                                } else {
                                    this.edit_error = Some(
                                        "No hay una solución factible para este calendario. Ajusta los stints o las paradas y vuelve a calcular.".into(),
                                    );
                                    this.status = "El calendario editado no tiene solución factible.".into();
                                }
                                this.result = Some(outcome);
                                this.edited_plan = Some(edited);
                                this.edit_dirty = false;
                            }
                            Err(error) => {
                                this.edit_error = Some(error);
                                this.status = "No se pudo recalcular el plan editado.".into();
                            }
                        }
                        cx.notify();
                    }
                });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn plan_page(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        let state = PlanState::from(
            self.result.as_ref(),
            self.running,
            self.error.as_deref(),
            self.edit_dirty,
        );
        let source_open =
            self.manual_source_status == SourceStatus::Open && self.editor.document.is_some();
        div()
            .id("strategy-plan")
            .flex()
            .flex_col()
            .w_full()
            .min_w_0()
            .gap(px(orbit::RADIUS_CONTROL))
            .child(orbit::eyebrow("Plan"))
            .child(orbit::text(state.title(), 34.0, 600, orbit::INK))
            .child(self.plan_status(state, source_open))
            .child(self.plan_results(cx))
            .child(self.calculation_footer(cx))
            .into_any_element()
    }

    fn plan_status(&self, state: PlanState, source_open: bool) -> Div {
        match state {
            PlanState::Idle => orbit::card("Pendiente de validar").child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::text(
                        if source_open {
                            "El cálculo estará disponible al confirmar las entradas de carrera."
                        } else {
                            "Abre o crea un borrador de estrategia antes de calcular. No se conserva un resultado parcial."
                        },
                        14.0,
                        650,
                        orbit::INK,
                    ))
                    .child(orbit::text(
                        "El resultado del solver usa las entradas manuales confirmadas; las revisiones de Analysis se muestran aparte.",
                        12.5,
                        400,
                        orbit::INK_2,
                    )),
            ),
            PlanState::Loading => orbit::card("Calculando").child(
                orbit::card_body()
                    .child(orbit::text(
                        "El solver nativo está calculando stints, recursos y paradas.",
                        14.0,
                        650,
                        orbit::INK,
                    )),
            ),
            PlanState::Partial => orbit::card("Estrategia óptima no demostrada").child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::text(
                        if self
                            .result
                            .as_ref()
                            .is_some_and(|outcome| outcome.result.feasible)
                        {
                            "El plan factible no tiene certificado de optimalidad completa."
                        } else {
                            "El presupuesto de búsqueda terminó antes de demostrar optimalidad o encontrar un plan factible."
                        },
                        14.0,
                        650,
                        orbit::INK,
                    )),
            ),
            PlanState::Error => orbit::card("Revisa las reglas y la fuente").child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::text(
                        self.error.clone().unwrap_or_else(|| {
                            "No existe una solución factible con las reglas y recursos actuales.".into()
                        }),
                        13.0,
                        400,
                        orbit::INK_2,
                    )),
            ),
            PlanState::Calculated => certificate_card(
                self.result
                    .as_ref()
                    .map(|outcome| &outcome.certificate),
            ),
            PlanState::Editing => orbit::card("Calendario pendiente").child(
                orbit::card_body().child(orbit::text(
                    "El calendario ha cambiado. Las métricas y el certificado se actualizan al recalcular.",
                    14.0,
                    600,
                    orbit::INK_2,
                )),
            ),
        }
    }

    fn plan_results(&self, cx: &mut Context<Self>) -> Div {
        let mut details = div()
            .flex()
            .flex_col()
            .w_full()
            .min_w_0()
            .gap(px(orbit::RADIUS_CONTROL));
        if let Some(outcome) = &self.result {
            if outcome.result.feasible && !self.edit_dirty {
                details = details.child(metrics(
                    outcome,
                    self.last_input.as_ref().map(|input| input.race_laps),
                ));
            }
            if outcome.result.feasible || self.edited_plan.is_some() {
                details = details
                    .child(
                        div()
                            .flex()
                            .w_full()
                            .gap(px(orbit::RADIUS_CONTROL))
                            .child(
                                orbit::button("strategy-edit-stints", "Ajustar stints")
                                    .flex_1()
                                    .min_w_0()
                                    .justify_start()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.begin_plan_edit(cx);
                                        this.page = Page::Stints;
                                        cx.notify();
                                    })),
                            )
                            .child(
                                orbit::button("strategy-edit-pits", "Ajustar paradas")
                                    .flex_1()
                                    .min_w_0()
                                    .justify_start()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.begin_plan_edit(cx);
                                        this.page = Page::Stops;
                                        cx.notify();
                                    })),
                            ),
                    )
                    .child(self.timeline(outcome));
            }
            if !self.edit_dirty {
                details = details.child(plan_condition(outcome));
            }
            details = details.child(self.exact_revisions());
        }
        if let Some(cost) = self.edit_cost_seconds {
            details = details.child(orbit::callout(format!(
                "Recálculo completado · coste del plan editado: {}",
                duration(cost)
            )));
        }
        if let Some(error) = &self.edit_error {
            details = details.child(orbit::callout(error.clone()));
        }

        if !self.source_revisions.is_empty() {
            details = details.child(orbit::callout(
                "La preparación automática valida cobertura y revisiones de Analysis. El solver disponible calcula con entradas manuales y no convierte esa proyección en un plan.",
            ));
        }
        details
    }

    fn calculation_footer(&self, cx: &mut Context<Self>) -> Div {
        div()
            .flex()
            .w_full()
            .min_w_0()
            .justify_between()
            .items_center()
            .border_t_1()
            .border_color(rgba(orbit::LINE))
            .pt(px(orbit::RADIUS_CONTROL))
            .child(orbit::text(
                "Guardar la configuración y aceptar una propuesta son acciones distintas.",
                12.5,
                400,
                orbit::INK_2,
            ))
            .child(
                orbit::button(
                    "strategy-calculate-plan",
                    if self.running {
                        "Calculando…"
                    } else {
                        "Calcular estrategia"
                    },
                )
                .when(
                    !can_calculate(
                        self.manual_source_status,
                        self.editor.document.is_some(),
                        self.running,
                        self.edit_dirty,
                    ),
                    |button| button.opacity(orbit::DISABLED),
                )
                .on_click(cx.listener(|this, _, _, cx| this.calculate(cx))),
            )
    }

    pub(super) fn plan_edit_footer(
        &self,
        cx: &mut Context<Self>,
        reset_id: &'static str,
        recalculate_id: &'static str,
        recalculate_label: &'static str,
    ) -> gpui::AnyElement {
        let mut footer = div().flex().flex_col().gap(px(orbit::RADIUS_CONTROL));
        if self.edit_dirty {
            footer = footer.child(orbit::text(
                "Cambios pendientes de recalcular",
                12.0,
                600,
                orbit::CORAL,
            ));
        }
        if let Some(cost) = self.edit_cost_seconds {
            footer = footer.child(orbit::text(
                format!("Coste del plan recalculado: {}", duration(cost)),
                12.0,
                600,
                orbit::INK_2,
            ));
        }
        if let Some(error) = &self.edit_error {
            footer = footer.child(orbit::callout(error.clone()));
        }
        footer
            .child(
                div()
                    .flex()
                    .justify_end()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(
                        orbit::button(reset_id, "Restablecer")
                            .when(!self.can_reset_plan_edit() || self.running, |button| {
                                button.opacity(orbit::DISABLED)
                            })
                            .on_click(cx.listener(|this, _, _, cx| this.reset_plan_edit(cx))),
                    ),
            )
            .child(
                orbit::primary_button(recalculate_id, recalculate_label)
                    .when(!self.edit_dirty || self.running, |button| {
                        button.opacity(orbit::DISABLED)
                    })
                    .on_click(cx.listener(|this, _, _, cx| this.recalculate_plan_edit(cx))),
            )
            .into_any_element()
    }

    fn timeline(&self, outcome: &SolverOutcome) -> Div {
        let plan = &outcome.result;
        let use_solver_schedule = plan.feasible && !self.edit_dirty;
        let edited = self.edited_plan.as_ref();
        let stints = if use_solver_schedule {
            plan.stints.as_slice()
        } else {
            edited.map_or(plan.stints.as_slice(), |edited| edited.stints.as_slice())
        };
        let mut timeline = div()
            .flex()
            .w_full()
            .min_w_0()
            .items_stretch()
            .gap(px(orbit::RADIUS_CONTROL));
        let mut lap_start = 1_u32;
        for (index, laps) in stints.iter().enumerate() {
            let lap_end = lap_start.saturating_add(*laps).saturating_sub(1);
            timeline = timeline.child(self.stint_card(index, lap_start, lap_end));
            lap_start = lap_end.saturating_add(1);
            if let Some(card) = self.stop_card(outcome, index, use_solver_schedule) {
                timeline = timeline.child(card);
            }
        }
        orbit::card("Stints y paradas")
            .w_full()
            .min_w_0()
            .child(orbit::card_body().w_full().child(timeline))
    }

    fn stint_card(&self, index: usize, lap_start: u32, lap_end: u32) -> Div {
        orbit::card("").flex_1().min_w_0().child(
            orbit::card_body()
                .gap(px(8.0))
                .child(orbit::eyebrow(format!("Stint {}", index + 1)))
                .child(orbit::text(
                    format!("Vueltas {lap_start}–{lap_end}"),
                    14.0,
                    700,
                    orbit::INK,
                ))
                .child(orbit::setting_row(
                    "Ritmo base",
                    "Entrada usada por el solver",
                    orbit::text(
                        self.last_input.as_ref().map_or_else(
                            || "Sin dato".into(),
                            |input| format!("{:.2} s/v", input.base_lap_seconds.value),
                        ),
                        12.0,
                        600,
                        orbit::INK_2,
                    ),
                )),
        )
    }

    fn stop_card(
        &self,
        outcome: &SolverOutcome,
        index: usize,
        use_solver_schedule: bool,
    ) -> Option<Div> {
        let plan = &outcome.result;
        let edited = self.edited_plan.as_ref();
        let stop_lap = if use_solver_schedule {
            plan.pit_stops.get(index).map(|stop| stop.lap)
        } else {
            edited.and_then(|edited| edited.pit_stop_laps.get(index).copied())
        }?;
        let mut body = orbit::card_body()
            .gap(px(8.0))
            .child(orbit::eyebrow(format!("Parada {}", index + 1)))
            .child(orbit::text(
                format!("Vuelta {stop_lap}"),
                14.0,
                700,
                orbit::INK,
            ));
        if use_solver_schedule && let Some(stop) = plan.pit_stops.get(index) {
            body = body
                .child(orbit::text(
                    format!(
                        "Fuel +{:.1} L · Energía virtual +{:.1}%",
                        stop.fuel_liters, stop.ve_percent
                    ),
                    12.0,
                    400,
                    orbit::INK_2,
                ))
                .child(orbit::text(
                    if stop.change_tyres {
                        format!("Cambio de neumáticos · {}", stop.service_mode)
                    } else {
                        format!("Sin cambio de neumáticos · {}", stop.service_mode)
                    },
                    11.5,
                    400,
                    orbit::INK_3,
                ));
        } else {
            body = body.child(orbit::text(
                if self.edit_dirty {
                    "Pendiente de recálculo"
                } else {
                    "Sin decisión factible de recursos"
                },
                11.5,
                400,
                orbit::INK_3,
            ));
        }
        Some(
            orbit::card("")
                .flex_1()
                .min_w_0()
                .border_color(orbit::tint(orbit::CARMINE, 0.42))
                .child(body),
        )
    }

    fn exact_revisions(&self) -> Div {
        let body = if self.source_revisions.is_empty() {
            orbit::card_body().child(orbit::text(
                "No hay revisiones de Analysis seleccionadas. El resultado usa entradas manuales.",
                12.0,
                400,
                orbit::INK_3,
            ))
        } else {
            let rows = self.source_revisions.iter().map(|revision| {
                orbit::setting_row(
                    &revision.session_id,
                    &format!(
                        "base {} · snapshot {}",
                        short_digest(&revision.base_digest),
                        short_digest(&revision.snapshot_id)
                    ),
                    orbit::mono_text(short_digest(&revision.revision_id), 11.0, orbit::INK_2),
                )
            });
            orbit::card_body().children(rows)
        };
        orbit::card("Revisiones exactas seleccionadas")
            .w_full()
            .min_w_0()
            .child(body)
    }

    pub(super) fn stint_editor_page(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        super::stint::render_editor(self, cx)
    }

    pub(super) fn pit_editor_page(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        super::parada::render_editor(self, cx)
    }
}

fn certificate_card(certificate: Option<&vantare_strategy::solver::OptimalityCertificate>) -> Div {
    let Some(certificate) = certificate else {
        return orbit::callout("El solver no devolvió un certificado.");
    };
    let proven = certificate.status == OptimalityStatus::Proven;
    orbit::card("")
        .w_full()
        .border_color(orbit::tint(
            if proven { orbit::GREEN } else { orbit::CORAL },
            0.65,
        ))
        .child(
            orbit::card_body()
                .child(orbit::text(
                    if proven {
                        "Estrategia óptima demostrada"
                    } else {
                        "Estrategia óptima no demostrada"
                    },
                    15.0,
                    700,
                    orbit::INK,
                ))
                .child(orbit::text(
                    if proven {
                        "La decisión final coincide con el mejor resultado de la búsqueda completa del modelo."
                    } else {
                        "La búsqueda no demostró optimalidad completa para este resultado."
                    },
                    13.0,
                    400,
                    orbit::INK_2,
                ))
                .child(orbit::text(
                    format!(
                        "Modelo: {} · alcance: {}",
                        certificate.model, certificate.scope
                    ),
                    12.0,
                    400,
                    orbit::INK_2,
                )),
        )
}

fn metrics(outcome: &SolverOutcome, laps: Option<u32>) -> Div {
    let plan = &outcome.result;
    let reserve = plan.reserve.as_ref().map_or_else(
        || "Sin reserva solicitada".into(),
        |reserve| {
            format!(
                "Fuel {:.1}/{:.1} L · VE {:.1}/{:.1}%",
                reserve.fuel.remaining_amount,
                reserve.fuel.required_amount,
                reserve.virtual_energy.remaining_amount,
                reserve.virtual_energy.required_amount,
            )
        },
    );
    let values = [
        ("Duración", duration(plan.expected.total_seconds)),
        (
            "Vueltas",
            laps.map_or_else(|| "Sin dato".into(), |laps| laps.to_string()),
        ),
        ("Paradas", plan.pit_stops.len().to_string()),
        ("Reserva real / exigida", reserve),
    ];
    let cards = values.into_iter().map(|(title, value)| {
        orbit::card("").flex_1().min_w_0().child(
            orbit::card_body()
                .gap(px(6.0))
                .child(orbit::eyebrow(title))
                .child(orbit::text(value, 17.0, 700, orbit::INK)),
        )
    });
    div()
        .flex()
        .w_full()
        .min_w_0()
        .flex_wrap()
        .gap(px(orbit::RADIUS_CONTROL))
        .children(cards)
}

pub(super) fn duration(seconds: f64) -> String {
    if !seconds.is_finite() || seconds < 0.0 {
        return "Sin dato".into();
    }
    let Ok(total) = std::time::Duration::try_from_secs_f64(seconds.round()) else {
        return "Sin dato".into();
    };
    let total = total.as_secs();
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let seconds = total % 60;
    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes}:{seconds:02}")
    }
}

fn from_certificate(status: OptimalityStatus, feasible: bool) -> PlanState {
    match status {
        OptimalityStatus::Proven if feasible => PlanState::Calculated,
        OptimalityStatus::NotProven => PlanState::Partial,
        OptimalityStatus::NoSolution | OptimalityStatus::Proven => PlanState::Error,
    }
}

fn can_calculate(
    source_status: SourceStatus,
    has_document: bool,
    running: bool,
    edit_dirty: bool,
) -> bool {
    source_status == SourceStatus::Open && has_document && !running && !edit_dirty
}

fn plan_condition(outcome: &SolverOutcome) -> Div {
    let proof = outcome.certificate.proof.as_ref();
    let condition = proof.map_or_else(
        || {
            outcome
                .certificate
                .reason
                .as_deref()
                .unwrap_or("El solver no publicó detalles adicionales de búsqueda.")
                .to_owned()
        },
        |proof| {
            format!(
                "{} · {} iteraciones · {} estados descartados · {} ms",
                if proof.search_completed {
                    "Búsqueda completada"
                } else {
                    "Búsqueda parcial"
                },
                proof.iterations,
                proof.pruned_states,
                proof.duration_millis
            )
        },
    );
    orbit::card("Condición del cálculo")
        .w_full()
        .min_w_0()
        .child(
            orbit::card_body()
                .gap(px(orbit::RADIUS_CONTROL))
                .child(orbit::text(condition, 13.0, 600, orbit::INK_2))
                .child(orbit::text(
                    format!(
                        "Modelo {} · alcance {} · {} unidades exploradas",
                        outcome.certificate.model,
                        outcome.certificate.scope,
                        outcome.certificate.explored_work_items
                    ),
                    11.5,
                    400,
                    orbit::INK_3,
                )),
        )
}

fn short_digest(value: &str) -> &str {
    value.get(..12).unwrap_or(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_states_distinguish_idle_loading_partial_error_and_certificate() {
        assert_eq!(PlanState::from(None, false, None, false), PlanState::Idle);
        assert_eq!(PlanState::from(None, true, None, false), PlanState::Loading);
        assert_eq!(PlanState::from(None, false, None, true), PlanState::Editing);
        assert_eq!(
            PlanState::from(None, false, Some("failed"), false),
            PlanState::Error
        );
        assert_eq!(
            from_certificate(OptimalityStatus::NotProven, true),
            PlanState::Partial
        );
        assert_eq!(
            from_certificate(OptimalityStatus::Proven, true),
            PlanState::Calculated
        );
        assert_eq!(
            from_certificate(OptimalityStatus::NoSolution, false),
            PlanState::Error
        );
    }

    #[test]
    fn duration_formats_only_finite_nonnegative_solver_values() {
        assert_eq!(duration(7_358.4), "2:02:38");
        assert_eq!(duration(65.0), "1:05");
        assert_eq!(duration(f64::NAN), "Sin dato");
        assert_eq!(duration(-1.0), "Sin dato");
    }

    #[test]
    fn partial_search_without_an_incumbent_is_not_misreported_as_no_solution() {
        assert_eq!(
            from_certificate(OptimalityStatus::NotProven, false),
            PlanState::Partial
        );
        assert_eq!(
            from_certificate(OptimalityStatus::Proven, false),
            PlanState::Error
        );
    }

    #[test]
    fn calculation_requires_an_open_source_and_no_active_solver() {
        assert!(can_calculate(SourceStatus::Open, true, false, false));
        assert!(!can_calculate(SourceStatus::Closed, true, false, false));
        assert!(!can_calculate(SourceStatus::Open, false, false, false));
        assert!(!can_calculate(SourceStatus::Open, true, true, false));
        assert!(!can_calculate(SourceStatus::Open, true, false, true));
    }
}
