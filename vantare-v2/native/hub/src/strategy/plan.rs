//! Resultado Strategy: estado, certificado y revisiones exactas del solver.
use gpui::{Context, Div, ParentElement, Styled, div, prelude::*, px, rgb, rgba};

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
            .min_h(px(0.0))
            .px(px(12.0))
            .pt(px(10.0))
            .gap(px(14.0))
            .child(self.plan_header(state))
            .child(self.plan_status(state, source_open, cx).when(
                matches!(
                    state,
                    PlanState::Loading | PlanState::Partial | PlanState::Error
                ),
                |card| card.mt(px(18.0)),
            ))
            .when(
                matches!(state, PlanState::Calculated | PlanState::Editing),
                |page| {
                    page.child(self.plan_results(cx))
                        .child(self.calculation_footer(cx))
                },
            )
            .when(state == PlanState::Idle, |page| {
                page.child(self.calculation_footer(cx))
            })
            .into_any_element()
    }

    fn plan_header(&self, state: PlanState) -> Div {
        div()
            .flex()
            .items_end()
            .justify_between()
            .border_b_1()
            .border_color(rgba(orbit::LINE))
            .pb(px(22.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(orbit::tracked_text("PLAN", 11.0, 700, orbit::RED, 1.0))
                    .child(
                        super::datos::tight_title(state.title(), 44.0, 400, 2.8)
                            .line_height(px(52.8)),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(16.0))
                    .child(
                        orbit::text(
                            "Condición del
cálculo",
                            13.0,
                            400,
                            orbit::INK_2,
                        )
                        .line_height(px(20.0)),
                    )
                    .child(
                        super::datos::select_value(if self.fields[8] == "wet" {
                            "Mojado"
                        } else {
                            "Seco"
                        })
                        .w(px(145.0))
                        .h(px(44.0)),
                    ),
            )
    }

    fn plan_status(&self, state: PlanState, source_open: bool, cx: &mut Context<Self>) -> Div {
        match state {
            PlanState::Idle => self.preflight_card(source_open),
            PlanState::Loading | PlanState::Error => self.pending_plan_card(state,cx),
            PlanState::Partial if self.capture_demo.is_some() => self.partial_capture_card(cx),
            PlanState::Partial => plan_card().p(px(16.0))
                .child(orbit::text("Estrategia óptima no demostrada",16.0,700,orbit::INK))
                .child(orbit::text("La búsqueda terminó sin demostrar optimalidad completa.",16.0,400,orbit::INK_2).mt(px(8.0))),
            PlanState::Calculated => certificate_card(self.result.as_ref().map(|outcome| &outcome.certificate)),
            PlanState::Editing => plan_card().p(px(16.0)).child(orbit::text("El calendario ha cambiado. Recalcula para actualizar las métricas y el certificado.",16.0,400,orbit::INK_2)),
        }
    }

    fn preflight_card(&self, source_open: bool) -> Div {
        let laps = if self.capture_demo.is_some() {
            "69".into()
        } else {
            self.last_input.as_ref().map_or_else(
                || self.fields[9].clone(),
                |input| input.race_laps.to_string(),
            )
        };
        let drivers = self
            .current_event()
            .and_then(|event| event["drivers"].as_array());
        let names = drivers.map_or_else(String::new, |drivers| {
            drivers
                .iter()
                .map(|driver| super::display(&driver["name"]["value"]))
                .collect::<Vec<_>>()
                .join(" · ")
        });
        let values = [
            ("Evento", format!("{laps} vueltas")),
            (
                "Combustible y energía virtual",
                format!(
                    "Capacidad · {} L",
                    self.capture_demo.as_ref().map_or_else(
                        || self.fields[2].clone(),
                        |demo| decimal(demo.capacity_liters, 0)
                    )
                ),
            ),
            (
                "Fuente de datos",
                format!(
                    "{} sesión seleccionada",
                    self.data.selected_revisions().len()
                ),
            ),
            (
                "Prepara tu equipo",
                format!("{} pilotos", drivers.map_or(0, Vec::len)),
            ),
        ];
        plan_card().p(px(28.0))
            .child(orbit::tracked_text("PENDIENTE DE VALIDAR",11.0,700,orbit::RED,0.9))
            .child(orbit::text(if source_open {"El cálculo estará disponible al completar y validar las entradas de carrera."} else {"Abre o crea un borrador de estrategia antes de calcular."},18.0,700,orbit::INK).line_height(px(22.0)).mt(px(8.0)))
            .child(div().flex().gap(px(10.0)).mt(px(26.0)).children(values.into_iter().enumerate().map(|(index,(label,value))|
                metric_card(label,value).h(px(115.0)).when(index==3,|card|card.child(orbit::text(names.clone(),12.0,400,orbit::INK_2).mt(px(8.0)))))))
            .child(stage_strip(false,false).mt(px(32.0)).child(div()))
    }

    fn pending_plan_card(&self, state: PlanState, cx: &mut Context<Self>) -> Div {
        let loading = state == PlanState::Loading;
        let mut header = div()
            .flex()
            .items_center()
            .gap(px(22.0))
            .px(px(28.0))
            .h(px(124.0));
        if loading {
            header = header.child(
                div()
                    .size(px(54.0))
                    .rounded_full()
                    .border_2()
                    .border_color(rgba(orbit::LINE_STRONG))
                    .relative()
                    .child(
                        div()
                            .absolute()
                            .top(px(-1.0))
                            .left(px(18.0))
                            .w(px(18.0))
                            .h(px(2.0))
                            .bg(rgb(orbit::RED)),
                    ),
            );
        }
        header=header.child(div().flex().flex_col().flex_1().gap(px(12.0))
            .child(orbit::text(if loading {"Calculando estrategia"} else {"Revisa las reglas y la telemetría antes de calcular."},if loading {16.0} else {20.0},700,orbit::INK))
            .child(orbit::text(if loading {"El motor nativo está calculando vueltas, stints y combustible.".to_owned()} else {self.error.clone().unwrap_or_else(||"No existe una estrategia que complete la carrera con estas reglas y recursos.".into())},16.0,400,orbit::INK_2).line_height(px(24.0))));
        if loading {
            let laps = self.last_input.as_ref().map_or_else(
                || {
                    if self.capture_demo.is_some() {
                        "69".into()
                    } else {
                        self.fields[9].clone()
                    }
                },
                |input| input.race_laps.to_string(),
            );
            header = header.child(
                div().flex().children(
                    [
                        ("Evento", format!("{laps} vueltas")),
                        (
                            "Fuente de datos",
                            self.data.selected_revisions().len().to_string(),
                        ),
                        (
                            "Prepara tu equipo",
                            self.current_event()
                                .and_then(|event| event["drivers"].as_array())
                                .map_or(0, Vec::len)
                                .to_string(),
                        ),
                    ]
                    .into_iter()
                    .map(|(label, value)| compact_summary(label, value)),
                ),
            );
        }
        plan_card()
            .child(header)
            .child(stage_strip(loading, loading))
            .child(self.state_footer(loading, cx))
    }

    fn partial_capture_card(&self, cx: &mut Context<Self>) -> Div {
        let Some(demo) = &self.capture_demo else {
            return div();
        };
        plan_card().child(div().flex().flex_col().p(px(16.0)).pb(px(12.0))
            .child(orbit::text("La telemetría permite mostrar estas magnitudes, pero todavía no respalda una estrategia completa.",16.0,600,orbit::INK).line_height(px(20.0)))
            .child(div().flex().gap(px(10.0)).mt(px(18.0))
                .child(metric_card("Fuel por vuelta",format!("{} L",decimal(demo.fuel_per_lap,2))).h(px(79.0)))
                .child(metric_card("Energía virtual por vuelta",format!("{}%",decimal(demo.ve_per_lap,2))).h(px(79.0)))
                .child(plan_card().w(px(368.0)).flex_none().p(px(18.0)).border_color(orbit::tint(orbit::CARMINE,0.5)).bg(orbit::tint(orbit::CARMINE,0.08))
                    .child(orbit::text("Falta ritmo válido para la condición elegida",16.0,700,orbit::INK).line_height(px(24.0))))))
            .child(stage_strip(false,false)).child(self.state_footer(false,cx))
    }

    fn state_footer(&self, loading: bool, cx: &mut Context<Self>) -> Div {
        let action = if loading {
            orbit::button("strategy-plan-retry", "Cancelar")
        } else {
            super::datos::primary_action("strategy-plan-retry", "Reintentar cálculo")
        };
        div()
            .flex()
            .items_center()
            .justify_between()
            .px(px(18.0))
            .h(px(72.0))
            .border_t_1()
            .border_color(rgba(orbit::LINE))
            .child(orbit::text(
                "Guardar configuración y aceptar propuesta son acciones independientes.",
                12.0,
                400,
                orbit::INK_2,
            ))
            .child(
                action
                    .h(px(40.0))
                    .when(
                        !loading
                            && !can_calculate(
                                self.manual_source_status,
                                self.editor.document.is_some(),
                                self.running,
                                self.edit_dirty,
                            ),
                        |button| button.opacity(orbit::DISABLED),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if loading {
                            this.invalidate();
                            cx.notify();
                        } else {
                            this.calculate(cx);
                        }
                    })),
            )
    }

    fn plan_results(&self, cx: &mut Context<Self>) -> Div {
        let mut details = div().flex().flex_col().w_full().min_w_0().gap(px(14.0));
        if let Some(outcome) = &self.result {
            if outcome.result.feasible && !self.edit_dirty {
                details = details.child(self.metrics(outcome));
            }
            if outcome.result.feasible || self.edited_plan.is_some() {
                details = details
                    .child(
                        div()
                            .flex()
                            .w_full()
                            .gap(px(12.0))
                            .child(
                                orbit::button("strategy-edit-stints", "")
                                    .child(orbit::text("Ajustar stints", 16.0, 700, orbit::INK))
                                    .flex_1()
                                    .h(px(52.0))
                                    .min_w_0()
                                    .justify_start()
                                    .rounded(px(10.0))
                                    .bg(rgb(0x0009_0c0d))
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.begin_plan_edit(cx);
                                        this.page = Page::Stints;
                                        cx.notify();
                                    })),
                            )
                            .child(
                                orbit::button("strategy-edit-pits", "")
                                    .child(orbit::text("Ajustar paradas", 16.0, 700, orbit::INK))
                                    .flex_1()
                                    .h(px(52.0))
                                    .min_w_0()
                                    .justify_start()
                                    .rounded(px(10.0))
                                    .bg(rgb(0x0009_0c0d))
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.begin_plan_edit(cx);
                                        this.page = Page::Stops;
                                        cx.notify();
                                    })),
                            ),
                    )
                    .child(self.timeline(outcome));
            }
            details = details.child(self.exact_revisions());
            if self.capture_demo.is_none() {
                details = details.child(plan_condition(outcome));
            }
        }
        if let Some(cost) = self.edit_cost_seconds {
            details = details.child(orbit::callout(format!(
                "Recálculo completado · coste: {}",
                duration(cost)
            )));
        }
        if let Some(error) = &self.edit_error {
            details = details.child(orbit::callout(error.clone()));
        }
        details
    }

    fn metrics(&self, outcome: &SolverOutcome) -> Div {
        let plan = &outcome.result;
        let reserve = plan.reserve.as_ref().map_or_else(
            || "Sin dato".into(),
            |reserve| {
                if !reserve.fuel.active && !reserve.virtual_energy.active {
                    "Sin reserva solicitada".into()
                } else {
                    format!(
                        "{} / {}",
                        decimal(reserve.effective_laps, 2),
                        decimal(
                            reserve
                                .fuel
                                .requested_laps
                                .max(reserve.virtual_energy.requested_laps),
                            0
                        )
                    )
                }
            },
        );
        let (seconds, reserve) =
            self.capture_demo
                .as_ref()
                .map_or((plan.expected.total_seconds, reserve), |demo| {
                    (
                        demo.total_seconds,
                        format!(
                            "{} / {}",
                            decimal(demo.reserve_laps, 2),
                            decimal(demo.required_laps, 0)
                        ),
                    )
                });
        let laps = self
            .last_input
            .as_ref()
            .map_or_else(|| "Sin dato".into(), |input| input.race_laps.to_string());
        div().flex().w_full().min_w_0().gap(px(10.0)).children(
            [
                ("Duración", duration(seconds)),
                ("Vueltas", laps),
                ("Paradas", plan.pit_stops.len().to_string()),
                ("Reserva real / exigida", reserve),
            ]
            .into_iter()
            .map(|(label, value)| metric_card(label, value).h(px(80.0))),
        )
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
            .pt(px(18.0))
            .child(orbit::text(
                "Guardar configuración y aceptar propuesta son acciones independientes.",
                12.0,
                400,
                orbit::INK_2,
            ))
            .child(
                div()
                    .flex()
                    .gap(px(12.0))
                    .child(
                        orbit::button("strategy-calculate-plan", "Calcular estrategia")
                            .h(px(40.0))
                            .when(
                                !can_calculate(
                                    self.manual_source_status,
                                    self.editor.document.is_some(),
                                    self.running,
                                    self.edit_dirty,
                                ) || self.capture_demo.is_some(),
                                |button| button.opacity(orbit::DISABLED),
                            )
                            .on_click(cx.listener(|this, _, _, cx| this.calculate(cx))),
                    )
                    .when(
                        self.result
                            .as_ref()
                            .is_some_and(|outcome| outcome.result.feasible),
                        |actions| {
                            actions.child(
                                super::datos::primary_action(
                                    "strategy-accept-plan",
                                    "Aceptar propuesta",
                                )
                                .h(px(40.0))
                                .when(self.capture_demo.is_none(), |button| {
                                    button.opacity(orbit::DISABLED)
                                })
                                .on_click(cx.listener(
                                    |this, _, _, cx| {
                                        if this.capture_demo.is_some() {
                                            this.status = "Propuesta demo aceptada".into();
                                            cx.notify();
                                        }
                                    },
                                )),
                            )
                        },
                    ),
            )
    }

    pub(super) fn plan_edit_footer(
        &self,
        cx: &mut Context<Self>,
        reset_id: &'static str,
        recalculate_id: &'static str,
        recalculate_label: &'static str,
    ) -> gpui::AnyElement {
        div()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .border_t_1()
            .border_color(rgba(orbit::LINE))
            .pt(px(12.0))
            .when(self.edit_dirty, |footer| {
                footer.child(orbit::text(
                    "Cambios pendientes de recalcular",
                    12.0,
                    500,
                    orbit::INK_2,
                ))
            })
            .when_some(self.edit_cost_seconds, |footer, cost| {
                footer.child(orbit::text(
                    format!("Coste del plan recalculado: {}", duration(cost)),
                    12.0,
                    600,
                    orbit::INK_2,
                ))
            })
            .when_some(self.edit_error.clone(), |footer, error| {
                footer.child(orbit::callout(error))
            })
            .child(
                div()
                    .flex()
                    .justify_end()
                    .gap(px(16.0))
                    .child(
                        orbit::button(reset_id, "Restablecer")
                            .h(px(40.0))
                            .when(!self.can_reset_plan_edit() || self.running, |button| {
                                button.opacity(orbit::DISABLED)
                            })
                            .on_click(cx.listener(|this, _, _, cx| this.reset_plan_edit(cx))),
                    )
                    .child(
                        super::datos::primary_action(recalculate_id, recalculate_label)
                            .h(px(40.0))
                            .when(!self.edit_dirty || self.running, |button| {
                                button.opacity(orbit::DISABLED)
                            })
                            .on_click(cx.listener(|this, _, _, cx| this.recalculate_plan_edit(cx))),
                    ),
            )
            .into_any_element()
    }

    fn timeline(&self, outcome: &SolverOutcome) -> Div {
        let plan = &outcome.result;
        let use_solver_schedule = plan.feasible && !self.edit_dirty;
        let stints = if use_solver_schedule {
            plan.stints.as_slice()
        } else {
            self.edited_plan
                .as_ref()
                .map_or(plan.stints.as_slice(), |edited| edited.stints.as_slice())
        };
        let mut timeline = div().flex().w_full().min_w_0().items_start().gap(px(12.0));
        let mut first = 1_u32;
        for (index, &laps) in stints.iter().enumerate() {
            let last = first.saturating_add(laps).saturating_sub(1);
            timeline = timeline.child(timeline_item(
                self.stint_card(index, first, last),
                index * 2,
            ));
            first = last.saturating_add(1);
            if let Some(card) = self.stop_card(outcome, index, use_solver_schedule) {
                timeline = timeline.child(timeline_item(card, index * 2 + 1));
            }
        }
        timeline
    }

    pub(super) fn stint_values(&self, index: usize) -> [String; 4] {
        if let Some(stint) = self
            .capture_demo
            .as_ref()
            .and_then(|demo| demo.stints.get(index))
        {
            return [
                stint.driver.clone(),
                duration(stint.pace_seconds),
                format!("{} L", decimal(stint.fuel_liters, 1)),
                format!("{}%", decimal(stint.ve_percent, 1)),
            ];
        }
        let outcome = self.result.as_ref();
        let driver = outcome
            .and_then(|outcome| outcome.result.best.as_ref())
            .and_then(|best| best.stints.get(index))
            .map(|stint| stint.driver.as_str());
        let name = driver
            .and_then(|id| {
                self.current_event()
                    .and_then(|event| event["drivers"].as_array())
                    .and_then(|drivers| {
                        drivers
                            .iter()
                            .find(|driver| driver["id"].as_str() == Some(id))
                    })
                    .map(|driver| super::display(&driver["name"]["value"]))
            })
            .unwrap_or_else(|| "Sin piloto".into());
        let pace = self.last_input.as_ref().map_or_else(
            || "Sin dato".into(),
            |input| duration(input.base_lap_seconds.value),
        );
        let fuel = outcome.filter(|_| index == 0).map_or_else(
            || "Sin dato".into(),
            |outcome| format!("{} L", decimal(outcome.result.fuel_start_liters, 1)),
        );
        let energy = outcome.filter(|_| index == 0).map_or_else(
            || "Sin dato".into(),
            |outcome| format!("{}%", decimal(outcome.result.ve_start_percent, 1)),
        );
        [name, pace, fuel, energy]
    }

    fn stint_card(&self, index: usize, first: u32, last: u32) -> Div {
        let [driver, pace, fuel, energy] = self.stint_values(index);
        plan_card()
            .p(px(16.0))
            .h(px(166.0))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .gap(px(8.0))
                    .child(orbit::tracked_text(
                        format!("STINT {}", index + 1),
                        11.0,
                        700,
                        orbit::RED,
                        0.8,
                    ))
                    .child(orbit::text(driver, 16.0, 700, orbit::INK).line_height(px(19.2))),
            )
            .child(
                div()
                    .flex()
                    .gap(px(16.0))
                    .mt(px(14.0))
                    .child(fact("Vueltas", format!("{first}–{last}")))
                    .child(fact("Ritmo base", pace)),
            )
            .child(
                div()
                    .flex()
                    .gap(px(16.0))
                    .mt(px(14.0))
                    .child(fact("Fuel", fuel))
                    .child(fact("Energía virtual", energy)),
            )
    }

    fn stop_card(
        &self,
        outcome: &SolverOutcome,
        index: usize,
        use_solver_schedule: bool,
    ) -> Option<Div> {
        let stop = outcome.result.pit_stops.get(index);
        let lap = if use_solver_schedule {
            stop.map(|stop| stop.lap)
        } else {
            self.edited_plan
                .as_ref()
                .and_then(|edited| edited.pit_stop_laps.get(index).copied())
        }?;
        let mut card = plan_card()
            .p(px(16.0))
            .border_color(orbit::tint(orbit::CARMINE, 0.42))
            .child(
                div()
                    .flex()
                    .justify_between()
                    .gap(px(8.0))
                    .child(orbit::tracked_text(
                        format!("PARADA {}", index + 1),
                        11.0,
                        700,
                        orbit::RED,
                        0.8,
                    ))
                    .child(
                        orbit::text(format!("Vuelta {lap}"), 16.0, 700, orbit::INK)
                            .line_height(px(19.2)),
                    ),
            );
        if self.edit_dirty {
            return Some(card.child(
                orbit::text("Pendiente de recálculo", 12.0, 400, orbit::INK_2).mt(px(14.0)),
            ));
        }
        let rows = if let Some(demo) = self
            .capture_demo
            .as_ref()
            .and_then(|demo| demo.stops.get(index))
        {
            vec![
                format!("Tiempo de pit: {}", duration(demo.total_seconds)),
                format!(
                    "Fuel: {} → {} L",
                    decimal(demo.fuel_in, 1),
                    decimal(demo.fuel_out, 1)
                ),
                format!(
                    "Energía virtual: {} → {}%",
                    decimal(demo.ve_in, 0),
                    decimal(demo.ve_out, 0)
                ),
            ]
        } else if let Some(stop) = stop {
            vec![
                format!("Fuel añadido: {} L", decimal(stop.fuel_liters, 1)),
                format!("Energía virtual añadida: {}%", decimal(stop.ve_percent, 1)),
                if stop.change_tyres {
                    "Cambio de neumáticos".into()
                } else {
                    "Sin cambio de neumáticos".into()
                },
            ]
        } else {
            vec!["Sin decisión factible de recursos".into()]
        };
        card = card.child(
            div().flex().flex_col().gap(px(6.0)).mt(px(14.0)).children(
                rows.into_iter()
                    .map(|row| orbit::text(row, 12.0, 400, orbit::INK_2).line_height(px(16.0))),
            ),
        );
        Some(card)
    }

    fn exact_revisions(&self) -> Div {
        let mut rows = div().flex().gap(px(8.0));
        for revision in &self.source_revisions {
            rows = rows.child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .p(px(12.0))
                    .h(px(62.0))
                    .flex_none()
                    .rounded(px(8.0))
                    .bg(rgb(0x0011_1416))
                    .child(
                        orbit::text(revision.session_id.clone(), 16.0, 700, orbit::INK)
                            .line_height(px(19.2)),
                    )
                    .child(
                        orbit::mono_text(short_digest(&revision.revision_id), 11.0, orbit::INK_2)
                            .line_height(px(16.5)),
                    ),
            );
        }
        if self.source_revisions.is_empty() {
            rows = rows.child(orbit::text(
                "El resultado usa entradas manuales; no utiliza revisiones de Analysis.",
                12.0,
                400,
                orbit::INK_2,
            ));
        }
        div()
            .flex()
            .flex_col()
            .border_t_1()
            .border_color(rgba(orbit::LINE))
            .pt(px(9.0))
            .gap(px(1.0))
            .child(
                orbit::text(
                    if self.capture_demo.is_some() {
                        "REVISIONES EXACTAS UTILIZADAS"
                    } else {
                        "REVISIONES EXACTAS SELECCIONADAS"
                    },
                    11.0,
                    400,
                    orbit::INK,
                )
                .line_height(px(16.5))
                .h(px(16.5)),
            )
            .child(rows)
    }

    pub(super) fn stint_editor_page(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        super::stint::render_editor(self, cx)
    }

    pub(super) fn pit_editor_page(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        super::parada::render_editor(self, cx)
    }
}

fn compact_summary(label: &str, value: String) -> Div {
    div()
        .w(px(155.0))
        .h(px(62.0))
        .flex()
        .flex_col()
        .px(px(14.0))
        .justify_center()
        .gap(px(8.0))
        .border_1()
        .border_color(rgba(orbit::LINE))
        .child(
            orbit::tracked_text(label.to_uppercase(), 11.0, 400, orbit::INK_2, 0.2)
                .line_height(px(16.5)),
        )
        .child(orbit::text(value, 15.0, 700, orbit::INK).line_height(px(22.0)))
}

pub(super) fn edit_heading(title: &str) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(12.0))
        .pb(px(18.0))
        .border_b_1()
        .border_color(rgba(orbit::LINE))
        .child(orbit::tracked_text(
            "EDICIÓN MANUAL",
            11.0,
            700,
            orbit::RED,
            0.9,
        ))
        .child(
            super::datos::tight_title(title, 34.0, 400, 2.0)
                .line_height(px(40.8))
                .relative()
                .top(px(2.0)),
        )
}

pub(super) fn plan_card() -> Div {
    orbit::card("")
        .flex_none()
        .rounded(px(10.0))
        .bg(rgb(0x000b_0e0f))
        .border_color(rgba(orbit::LINE))
}

pub(super) fn decimal(value: f64, digits: usize) -> String {
    if !value.is_finite() {
        return "Sin dato".into();
    }
    let Ok(places) = i32::try_from(digits) else {
        return "Sin dato".into();
    };
    let factor = 10_f64.powi(places);
    let rounded = (value * factor).round() / factor;
    if !rounded.is_finite() {
        return "Sin dato".into();
    }
    format!("{rounded:.digits$}").replace('.', ",")
}

pub(super) fn fact(label: &str, value: String) -> Div {
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_w_0()
        .gap(px(8.0))
        .child(
            orbit::tracked_text(label.to_uppercase(), 11.0, 400, orbit::INK_2, 0.2)
                .line_height(px(16.5)),
        )
        .child(orbit::text(value, 15.0, 700, orbit::INK).line_height(px(22.0)))
}

fn metric_card(label: &str, value: String) -> Div {
    plan_card()
        .flex_1()
        .min_w_0()
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(8.0))
        .child(
            orbit::tracked_text(label.to_uppercase(), 11.0, 400, orbit::INK_2, 0.2)
                .line_height(px(16.5)),
        )
        .child(orbit::text(value, 20.0, 700, orbit::INK).line_height(px(24.0)))
}

fn timeline_item(card: Div, index: usize) -> Div {
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_w_0()
        .relative()
        .pt(px(16.0))
        .child(card)
        .child(
            div()
                .absolute()
                .left(px(8.0))
                .top(px(4.0))
                .w_full()
                .h(px(1.0))
                .bg(orbit::tint(orbit::CARMINE, 0.5))
                .when(index == 4, |line| line.w(px(0.0))),
        )
        .child(
            div()
                .absolute()
                .left(px(4.0))
                .top(px(0.0))
                .size(px(8.0))
                .rounded_full()
                .border_2()
                .border_color(rgb(orbit::RED))
                .bg(rgb(0x0008_090b)),
        )
}

fn stage_strip(first_complete: bool, second_active: bool) -> Div {
    div()
        .flex()
        .border_y_1()
        .border_color(rgba(orbit::LINE))
        .h(px(70.0))
        .children(
            ["Fuente de datos", "Pendiente de validar", "Plan de carrera"]
                .into_iter()
                .enumerate()
                .map(|(index, label)| {
                    let active = second_active && index == 1;
                    let complete = first_complete && index == 0;
                    div()
                        .flex()
                        .items_center()
                        .flex_1()
                        .gap(px(12.0))
                        .px(px(18.0))
                        .border_r_1()
                        .border_color(rgba(orbit::LINE))
                        .child(
                            div()
                                .size(px(32.0))
                                .rounded_full()
                                .border_1()
                                .border_color(if complete {
                                    rgb(orbit::GREEN)
                                } else if active {
                                    rgb(orbit::RED)
                                } else {
                                    rgba(orbit::LINE_STRONG)
                                })
                                .flex()
                                .items_center()
                                .justify_center()
                                .child(orbit::text(
                                    if complete {
                                        "✓".into()
                                    } else {
                                        (index + 1).to_string()
                                    },
                                    16.0,
                                    400,
                                    if complete {
                                        orbit::GREEN
                                    } else if active {
                                        orbit::RED
                                    } else {
                                        orbit::INK_2
                                    },
                                )),
                        )
                        .child(orbit::text(label, 13.0, 700, orbit::INK))
                }),
        )
}

fn certificate_card(certificate: Option<&vantare_strategy::solver::OptimalityCertificate>) -> Div {
    let Some(certificate) = certificate else {
        return orbit::callout("El solver no devolvió un certificado.");
    };
    let proven = certificate.status == OptimalityStatus::Proven;
    plan_card().h(px(102.0)).flex_none().bg(rgb(0x0010_1113)).relative().overflow_hidden().child(div().absolute().left(px(0.0)).top(px(0.0)).bottom(px(0.0)).w(px(3.0)).bg(rgb(if proven {orbit::GREEN} else {orbit::CORAL}))).p(px(16.0)).px(px(18.0)).pt(px(14.0)).flex().flex_col().gap(px(6.0))
        .child(orbit::text(if proven {"Estrategia óptima demostrada"} else {"Estrategia óptima no demostrada"},16.0,700,orbit::INK).line_height(px(19.2)))
        .child(orbit::text(if proven {"La decisión final coincide con el mejor resultado de la búsqueda completa del modelo."} else {"La búsqueda no demostró optimalidad completa para este resultado."},16.0,400,orbit::INK_2).line_height(px(24.0)))
        .child(orbit::text(format!("Modelo: {} · menor tiempo total",certificate.model),12.0,400,orbit::INK).line_height(px(18.0)))
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
    fn decimal_values_follow_the_reference_rounding_and_keep_missing_values_explicit() {
        assert_eq!(decimal(83.35, 1), "83,4");
        assert_eq!(decimal(64.53, 1), "64,5");
        assert_eq!(decimal(-31.33, 1), "-31,3");
        assert_eq!(decimal(1.14, 2), "1,14");
        assert_eq!(decimal(f64::NAN, 1), "Sin dato");
        assert_eq!(decimal(f64::INFINITY, 1), "Sin dato");
        assert_eq!(decimal(1.0, usize::MAX), "Sin dato");
    }

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
