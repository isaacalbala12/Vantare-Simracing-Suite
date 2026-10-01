//! Resultado Strategy: estado, certificado y revisiones exactas del solver.
use gpui::{Context, Div, ParentElement, Styled, div, prelude::*, px, rgba};

use super::{Strategy, orbit};
use vantare_strategy::{
    application::SourceStatus,
    solver::{OptimalityStatus, SolverOutcome},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PlanState {
    Idle,
    Loading,
    Partial,
    Error,
    Calculated,
}

impl PlanState {
    fn from(outcome: Option<&SolverOutcome>, running: bool, error: Option<&str>) -> Self {
        if running {
            Self::Loading
        } else if error.is_some() {
            Self::Error
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
        }
    }
}

impl Strategy {
    pub(super) fn plan_page(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        let state = PlanState::from(self.result.as_ref(), self.running, self.error.as_deref());
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
            .child(self.plan_results())
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
        }
    }

    fn plan_results(&self) -> Div {
        let mut details = div()
            .flex()
            .flex_col()
            .w_full()
            .min_w_0()
            .gap(px(orbit::RADIUS_CONTROL));
        if let Some(outcome) = &self.result {
            if outcome.result.feasible {
                details = details
                    .child(metrics(
                        outcome,
                        self.last_input.as_ref().map(|input| input.race_laps),
                    ))
                    .child(self.timeline(outcome));
            }
            details = details
                .child(plan_condition(outcome))
                .child(self.exact_revisions());
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
                    ),
                    |button| button.opacity(orbit::DISABLED),
                )
                .on_click(cx.listener(|this, _, _, cx| this.calculate(cx))),
            )
    }

    fn timeline(&self, outcome: &SolverOutcome) -> Div {
        let plan = &outcome.result;
        let mut timeline = div()
            .flex()
            .w_full()
            .min_w_0()
            .items_stretch()
            .gap(px(orbit::RADIUS_CONTROL));
        let mut lap_start = 1_u32;
        for (index, laps) in plan.stints.iter().enumerate() {
            let lap_end = lap_start.saturating_add(*laps).saturating_sub(1);
            timeline = timeline.child(self.stint_card(index, lap_start, lap_end));
            lap_start = lap_end.saturating_add(1);
            if let Some(card) = Self::stop_card(outcome, index) {
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

    fn stop_card(outcome: &SolverOutcome, index: usize) -> Option<Div> {
        let plan = &outcome.result;
        let stop = plan.pit_stops.get(index)?;
        let body = orbit::card_body()
            .gap(px(8.0))
            .child(orbit::eyebrow(format!("Parada {}", index + 1)))
            .child(orbit::text(
                format!("Vuelta {}", stop.lap),
                14.0,
                700,
                orbit::INK,
            ))
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

fn can_calculate(source_status: SourceStatus, has_document: bool, running: bool) -> bool {
    source_status == SourceStatus::Open && has_document && !running
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
        assert_eq!(PlanState::from(None, false, None), PlanState::Idle);
        assert_eq!(PlanState::from(None, true, None), PlanState::Loading);
        assert_eq!(
            PlanState::from(None, false, Some("failed")),
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
        assert!(can_calculate(SourceStatus::Open, true, false));
        assert!(!can_calculate(SourceStatus::Closed, true, false));
        assert!(!can_calculate(SourceStatus::Open, false, false));
        assert!(!can_calculate(SourceStatus::Open, true, true));
    }
}
