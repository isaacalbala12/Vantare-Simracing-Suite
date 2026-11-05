//! Preparación de escenas Strategy. Solo QA y caracterización; no se distribuye.
#[cfg(feature = "parity-capture")]
use super::plan::{decimal, metric_card, plan_card, stage_strip};
use super::*;
#[cfg(feature = "parity-capture")]
use gpui::{Div, px, rgb, rgba};

#[derive(Clone, Copy)]
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

fn demo_selected_sessions() -> Value {
    serde_json::json!({
        "combinationId": "demo-imola-gp-lmgt3",
        "sessions": [{"sessionId": CAPTURE_DEMO.session_name, "included": true}]
    })
}

// La fixture se prepara con el contrato nativo, sin proyección ni resultado.
pub(super) fn capture_document(
    demo: &crate::demo::DemoData,
) -> Result<(Document, ManualEvent, usize), String> {
    let event = &demo.strategy.event;
    let plan = demo
        .strategy
        .plans
        .first()
        .ok_or("La demo no tiene una estrategia")?;
    // Valores visibles en las capturas v5 aprobadas de Carrera y Reglas.
    let mut fields = ManualEvent {
        name: "4 Horas de Imola · LMGT3".into(),
        duration_minutes: event.duration_minute.to_string(),
        fuel_capacity_liters: "110".into(),
        pit_transit_seconds: event.pit_seconds.to_string(),
        track: event.track.clone(),
        class: event.vehicle_class.clone(),
        variant_name: plan.name.clone(),
        variant_mode: plan.mode.clone(),
        team: event.team.clone(),
        race_laps: "69".into(),
        ..ManualEvent::default()
    };
    if let Some(driver) = demo.strategy.drivers.first() {
        fields[Field::DriverName].clone_from(&driver.name);
        fields[Field::DriverInitials].clone_from(&driver.initials);
    }

    let mut document = Document::empty(&demo.fixed_now()?.to_rfc3339())?;
    let event_index = fields.append(&mut document)?;
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

pub(super) fn capture_solver_input(
    page: crate::demo::CaptureStrategyPage,
) -> Result<Input, String> {
    let mut input: Input = serde_json::from_str(include_str!(
        "../../reference/fixtures/strategy-solver-demo.json"
    ))
    .map_err(|error| format!("fixture demo solver: {error}"))?;
    match page {
        crate::demo::CaptureStrategyPage::PlanPartial => input.budget.max_candidates = 1,
        crate::demo::CaptureStrategyPage::PlanError => {
            input.event_rules.min_pit_stops = None;
            input.event_rules.max_pit_stops = Some(0);
        }
        _ => {}
    }
    Ok(input)
}

#[cfg(feature = "parity-capture")]
impl super::view_data::PlanData {
    pub fn load() -> Result<Self, String> {
        serde_json::from_str(include_str!(
            "../../reference/fixtures/strategy-capture-demo.json"
        ))
        .map_err(|error| format!("escena pass-27 Strategy: {error}"))
    }
}

#[cfg(feature = "parity-capture")]
impl Strategy {
    pub fn new_demo(
        directory: PathBuf,
        page: Option<crate::demo::CaptureStrategyPage>,
        cx: &mut Context<Self>,
    ) -> Self {
        let mut strategy = Self::new(directory, cx);
        let Some(page) = page else {
            return strategy;
        };
        strategy.page = match page {
            crate::demo::CaptureStrategyPage::PlanIdle
            | crate::demo::CaptureStrategyPage::PlanLoading
            | crate::demo::CaptureStrategyPage::PlanPartial
            | crate::demo::CaptureStrategyPage::PlanError
            | crate::demo::CaptureStrategyPage::PlanCalculated => Page::Editor(EditorTab::Plan),
            crate::demo::CaptureStrategyPage::Stints => Page::Stints,
            crate::demo::CaptureStrategyPage::Stops => Page::Stops,
            crate::demo::CaptureStrategyPage::AssistantInicio => {
                Page::Assistant(AssistantStep::Inicio)
            }
            crate::demo::CaptureStrategyPage::AssistantCombinacion => {
                Page::Assistant(AssistantStep::Combinacion)
            }
            crate::demo::CaptureStrategyPage::AssistantReglas => {
                Page::Assistant(AssistantStep::Reglas)
            }
            crate::demo::CaptureStrategyPage::AssistantPilotos => {
                Page::Assistant(AssistantStep::Pilotos)
            }
            crate::demo::CaptureStrategyPage::AssistantSesiones => {
                Page::Assistant(AssistantStep::Sesiones)
            }
            crate::demo::CaptureStrategyPage::Career => Page::Editor(EditorTab::Carrera),
        };
        match super::view_data::PlanData::load() {
            Ok(demo) => strategy.view_data.plan = Some(demo),
            Err(error) => strategy.error = Some(error.into()),
        }
        strategy.manual_source_status = SourceStatus::Open;
        if let Err(error) = strategy.seed_capture_demo(cx) {
            strategy.error = Some(error.into());
        }
        if matches!(
            page,
            crate::demo::CaptureStrategyPage::PlanIdle
                | crate::demo::CaptureStrategyPage::PlanLoading
                | crate::demo::CaptureStrategyPage::PlanPartial
                | crate::demo::CaptureStrategyPage::PlanError
                | crate::demo::CaptureStrategyPage::PlanCalculated
                | crate::demo::CaptureStrategyPage::Stints
                | crate::demo::CaptureStrategyPage::Stops
        ) {
            // Only the reference row rendered by the remaining plan captures.
            strategy.source_revisions = vec![AnalysisRevisionRef {
                session_id: "imola-race".into(),
                base_digest: "0".repeat(64),
                revision_id: "a".repeat(64),
                snapshot_id: "b".repeat(64),
            }];
        }
        if matches!(
            page,
            crate::demo::CaptureStrategyPage::PlanLoading
                | crate::demo::CaptureStrategyPage::PlanPartial
                | crate::demo::CaptureStrategyPage::PlanError
                | crate::demo::CaptureStrategyPage::PlanCalculated
                | crate::demo::CaptureStrategyPage::Stints
                | crate::demo::CaptureStrategyPage::Stops
        ) && let Err(error) = strategy.load_capture_plan(page)
        {
            strategy.error = Some(error.into());
        }
        strategy
    }

    fn load_capture_plan(&mut self, page: crate::demo::CaptureStrategyPage) -> Result<(), String> {
        let input = capture_solver_input(page)?;
        self.manual_source_status = SourceStatus::Open;

        if page == crate::demo::CaptureStrategyPage::PlanLoading {
            self.running = true;
            self.status = "Calculando la estrategia demo…".into();
            return Ok(());
        }

        let prepared = application::prepare_manual(input.clone())?;
        let outcome = application::calculate(
            &prepared,
            self.manual_source_status,
            &AtomicBool::new(false),
        )?;
        self.last_input = Some(input);
        self.result = Some(outcome.clone());
        self.status = match outcome.certificate.status {
            solver::OptimalityStatus::Proven => "Cálculo demo completado.".into(),
            solver::OptimalityStatus::NotProven => "Búsqueda demo parcial.".into(),
            solver::OptimalityStatus::NoSolution => "La demo no tiene plan factible.".into(),
        };

        if matches!(
            page,
            crate::demo::CaptureStrategyPage::Stints | crate::demo::CaptureStrategyPage::Stops
        ) {
            let edited = stint::schedule_from_outcome(&outcome)?;
            self.baseline_result = Some(outcome);
            self.baseline_edited_plan = Some(edited.clone());
            self.edited_plan = Some(edited);
        }
        Ok(())
    }

    pub(super) fn seed_capture_demo(&mut self, cx: &mut Context<Self>) -> Result<(), String> {
        let demo = crate::demo::DemoData::load()?;
        let (document, fields, event_index) = capture_document(&demo)?;

        self.editor.saved = Some(document.bytes().to_vec());
        self.editor.document = Some(document);
        self.editor.path = None;
        self.view_data.custom_description = "Elige tu combinación";
        self.view_data.calendar_description = "Parte de un evento publicado";
        self.view_data.draft_label = "Borrador guardado";
        self.view_data.revisions_heading = "REVISIONES EXACTAS UTILIZADAS";
        self.view_data.simulator = Some("Le Mans Ultimate");
        self.view_data.disabled_calculate_opacity = 0.55;
        self.view_data.resource_opacity = 1.0;
        self.view_data.service_label = Some("Servicios en paralelo");
        self.view_data.read_only = true;
        self.view_data.accept = Some(accept_proposal);
        self.view_data.car = Some(demo.strategy.event.car.clone());
        self.view_data.partial = Some(Self::partial_capture_card);
        self.view_data.laps = Some("69".into());
        self.view_data.layout = Some(CAPTURE_DEMO.track_layout);
        self.view_data.text_control = Some(demo_control);
        self.view_data.rule_row = Some(Self::demo_rule_row);
        self.view_data.resources = Some(capture_resources);
        self.view_data.drivers = Some(capture_drivers);
        self.event = event_index;
        self.variant = 0;
        self.fields = fields;
        self.sync_inputs(cx);
        self.status = "Escena Strategy cargada desde los datos demo del Hub.".into();
        Ok(())
    }
}

#[cfg(feature = "parity-capture")]
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

#[cfg(feature = "parity-capture")]
impl Strategy {
    fn demo_rule_row(label: &str, value: &(impl ToString + ?Sized), cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .h(px(44.0))
            .child(orbit::text(label.to_owned(), 13.0, 400, orbit::ink_2(cx), cx).w(px(205.0)))
            .child(demo_control(value, cx))
    }

    fn demo_resource_fields(demo: &CaptureDemo, cx: &gpui::App) -> gpui::Div {
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
                    .child(demo_control("Aplica", cx).child(orbit::text(
                        "⌄",
                        16.0,
                        500,
                        orbit::ink(cx),
                        cx,
                    ))),
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
    fn demo_driver_fields(&self, demo: &CaptureDemo, cx: &gpui::App) -> gpui::Div {
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
                                demo_control(arrow, cx)
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
                            .child(demo_control(&demo.driver_limits[offset * 2 + column], cx))
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
                            demo_control("Quitar piloto", cx)
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
                        .child(demo_control(name, cx)),
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
                                demo_control("Estimar a partir de Isaac Albalá", cx)
                                    .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx)),
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
                                demo_control("Rotación fijada", cx).px(px(16.0))
                                    .flex_none()
                                    .w(px(147.0))
                                    .child(orbit::text("⌄", 16.0, 500, orbit::ink_2(cx), cx)),
                            ),
                    )
                    .child(order.relative().top(px(1.0))),
            )
            .child(cards)
    }
}

#[cfg(feature = "parity-capture")]
fn capture_resources(_this: &Strategy, cx: &gpui::App) -> gpui::Div {
    Strategy::demo_resource_fields(&CAPTURE_DEMO, cx)
}

#[cfg(feature = "parity-capture")]
fn capture_drivers(this: &Strategy, cx: &gpui::App) -> gpui::Div {
    this.demo_driver_fields(&CAPTURE_DEMO, cx)
}

#[cfg(feature = "parity-capture")]
impl Strategy {
    fn partial_capture_card(&self, cx: &mut Context<Self>) -> Div {
        let Some(demo) = &self.view_data.plan else {
            return div();
        };
        plan_card( cx).child(div().flex().flex_col().p(px(16.0)).pb(px(12.0))
            .child(orbit::text("La telemetría permite mostrar estas magnitudes, pero todavía no respalda una estrategia completa.",18.0,400,orbit::ink(cx), cx).line_height(px(20.0)))
            .child(div().flex().items_center().gap(px(20.0)).mt(px(18.0))
                .child(div().flex().flex_1().min_w_0().gap(px(10.0))
                    .child(metric_card("Fuel por vuelta",format!("{} L",decimal(demo.fuel_per_lap,2)), cx).h(px(79.0)))
                    .child(metric_card("Energía virtual por vuelta",format!("{}%",decimal(demo.ve_per_lap,2)), cx).h(px(79.0))))
                .child(plan_card( cx).w(px(368.0)).h(px(85.0)).flex_none().p(px(18.0)).border_color(orbit::tint(orbit::carmine(cx),0.5)).bg(orbit::tint(orbit::carmine(cx),0.08))
                    .child(orbit::text("Falta ritmo válido para la condición elegida",16.0,700,orbit::ink(cx), cx).line_height(px(23.2))))))
            .child(stage_strip(false,false,false, cx)).child(self.state_footer(false,cx))
    }
}

#[cfg(feature = "parity-capture")]
fn accept_proposal(this: &mut Strategy, cx: &mut Context<Strategy>) {
    this.status = "Propuesta demo aceptada".into();
    cx.notify();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(feature = "parity-capture")]
    #[test]
    fn strategy_capture_keeps_pass_27_values_separate_from_solver_inputs() {
        let demo = crate::strategy::view_data::PlanData::load().expect("mock pass-27");
        assert_eq!(demo.samples.len(), 12);
        assert_eq!(demo.samples[7].quality, "Desconocida");
        assert_eq!(demo.stints.len(), 3);
        assert_eq!(demo.stints[0].driver, "Isaac Albalá");
        assert_eq!(
            demo.stops.iter().map(|stop| stop.lap).collect::<Vec<_>>(),
            [23, 46]
        );
        assert!((demo.total_seconds - 7357.57).abs() < 0.001);
        assert!((demo.reserve_laps - 1.14).abs() < 0.001);
    }

    #[test]
    fn approved_demo_selects_imola_without_inventing_a_projection_or_solver_input() {
        let demo = crate::demo::DemoData::load().expect("demo");
        let (document, fields, index) = capture_document(&demo).expect("documento nativo");
        let event = &document.value()["events"][index];
        assert_eq!(fields[Field::Name], "4 Horas de Imola · LMGT3");
        assert_eq!(fields[Field::FuelCapacityLiters], "110");
        assert_eq!(fields[Field::RaceLaps], "69");
        assert_eq!(CAPTURE_DEMO.track_layout, "GP");
        assert_eq!(
            event["combination"]["sessions"][0]["sessionId"],
            CAPTURE_DEMO.session_name
        );
        assert_eq!(event["combination"]["sessions"][0]["included"], true);
        assert_eq!(event["drivers"].as_array().expect("pilotos").len(), 3);
        assert!(event["planningInputs"]["projection"].is_null());
        assert!(event["strategies"][0]["overrides"]["nativeScalarInput"].is_null());
        assert!(
            [
                Field::BasePaceSeconds,
                Field::FuelPerLapLiters,
                Field::VeCapacityPercent,
                Field::VePerLapPercent,
                Field::TyreLifeLaps,
                Field::DegradationSeconds,
                Field::RefuelRate,
                Field::VeRate,
                Field::TyreServiceSeconds,
                Field::FormationSeconds,
                Field::FuelStep,
                Field::VeStep,
                Field::ReserveLaps,
                Field::ServiceMode
            ]
            .iter()
            .all(|field| fields[*field].is_empty())
        );
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
