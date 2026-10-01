//! Edición de vueltas de parada y lectura de las decisiones reales del solver.
use gpui::{Context, Div, ParentElement, Styled, div, prelude::*, px};

use super::{Page, Strategy, orbit};
use vantare_strategy::application::EditedPlan;
use vantare_strategy::solver::SolverOutcome;

pub(super) fn move_stop(
    edited: &EditedPlan,
    race_laps: u32,
    index: usize,
    delta: i32,
) -> Result<EditedPlan, String> {
    let current = edited
        .pit_stop_laps
        .get(index)
        .copied()
        .ok_or("La parada no está disponible")?;
    let lap = current
        .checked_add_signed(delta)
        .ok_or("La vuelta de parada no está disponible")?;
    super::stint::move_boundary(edited, race_laps, index, lap)
}

pub(super) fn render_editor(this: &Strategy, cx: &mut Context<Strategy>) -> gpui::AnyElement {
    let Some(outcome) = this.result.as_ref() else {
        return orbit::card("Ajustar paradas")
            .child(orbit::card_body().child(orbit::empty_state(
                "Sin plan calculado",
                "Calcula una estrategia antes de editar las paradas.",
            )))
            .into_any_element();
    };
    let Some(edited) = this.edited_plan.as_ref() else {
        return orbit::card("Ajustar paradas")
            .child(orbit::card_body().child(orbit::empty_state(
                "Abre el editor desde Plan",
                "Las vueltas se copian del resultado confirmado.",
            )))
            .into_any_element();
    };
    let race_laps = this.last_input.as_ref().map_or(0, |input| input.race_laps);
    div()
        .id("strategy-pit-editor")
        .flex()
        .flex_col()
        .gap(px(orbit::RADIUS_CONTROL))
        .child(orbit::eyebrow("Edición manual"))
        .child(orbit::text("Ajustar paradas", 28.0, 500, orbit::INK))
        .child(
            orbit::button("strategy-stops-back", "← Plan").on_click(
                cx.listener(|this, _, _, cx| {
                    this.page = Page::Editor(super::EditorTab::Plan);
                    cx.notify();
                }),
            ),
        )
        .child(
            orbit::card("Paradas del plan").child(
                orbit::card_body()
                    .flex_row()
                    .items_center()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::text(
                        edited.pit_stop_laps.len().to_string(),
                        17.0,
                        700,
                        orbit::INK,
                    ))
                    .child(orbit::text(
                        format!("{race_laps} vueltas · calendario en edición"),
                        12.0,
                        400,
                        orbit::INK_2,
                    )),
            ),
        )
        .child(stop_list(this, cx, outcome, edited))
        .child(orbit::callout(
            "Este contrato de recálculo solo fija las vueltas de parada. Fuel, energía virtual y neumáticos no se editan aquí; los valores visibles pertenecen a la última solución factible.",
        ))
        .child(this.plan_edit_footer(
            cx,
            "strategy-stops-reset",
            "strategy-stops-recalculate",
            "Recalcular paradas",
        ))
        .into_any_element()
}

fn stop_list(
    this: &Strategy,
    cx: &mut Context<Strategy>,
    outcome: &SolverOutcome,
    edited: &EditedPlan,
) -> gpui::AnyElement {
    if edited.pit_stop_laps.is_empty() {
        return orbit::empty_state(
            "Sin paradas",
            "El calendario no contiene paradas para ajustar.",
        )
        .into_any_element();
    }
    let mut stops = div().flex().flex_col().gap(px(orbit::RADIUS_CONTROL));
    for (index, &lap) in edited.pit_stop_laps.iter().enumerate() {
        stops = stops.child(stop_card(this, cx, outcome, index, lap));
    }
    stops.into_any_element()
}

fn stop_card(
    this: &Strategy,
    cx: &mut Context<Strategy>,
    outcome: &SolverOutcome,
    index: usize,
    lap: u32,
) -> gpui::AnyElement {
    let summary = div()
        .flex()
        .justify_between()
        .child(orbit::text(
            format!("Parada {}", index + 1),
            14.0,
            700,
            orbit::INK,
        ))
        .child(orbit::text(
            format!("Vuelta {lap}"),
            12.0,
            500,
            orbit::INK_2,
        ));
    orbit::card("")
        .border_color(orbit::tint(orbit::CARMINE, 0.38))
        .child(
            orbit::card_body()
                .gap(px(orbit::RADIUS_CONTROL))
                .child(summary)
                .child(stop_resources(outcome.result.pit_stops.get(index)))
                .child(stop_controls(this, cx, index)),
        )
        .into_any_element()
}

fn stop_resources(stop: Option<&vantare_strategy::solver::PitStop>) -> gpui::AnyElement {
    let Some(stop) = stop else {
        return orbit::callout(
            "Este calendario no tiene una decisión factible de recursos para mostrar.",
        )
        .into_any_element();
    };
    div()
        .flex()
        .flex_wrap()
        .gap(px(orbit::RADIUS_CONTROL))
        .child(read_only(
            "Fuel añadido",
            format!("{:.1} L", stop.fuel_liters),
        ))
        .child(read_only(
            "Energía virtual añadida",
            format!("{:.1}%", stop.ve_percent),
        ))
        .child(read_only(
            "Neumáticos",
            if stop.change_tyres {
                "Cambio"
            } else {
                "Sin cambio"
            }
            .to_owned(),
        ))
        .child(read_only("Servicio", stop.service_mode.clone()))
        .into_any_element()
}

fn stop_controls(this: &Strategy, cx: &mut Context<Strategy>, index: usize) -> gpui::AnyElement {
    div()
        .flex()
        .items_center()
        .gap(px(orbit::RADIUS_CONTROL))
        .child(orbit::text("Mover parada", 12.0, 600, orbit::INK_2))
        .child(
            orbit::button("strategy-stop-earlier", "− 1 vuelta")
                .id(("strategy-stop-earlier", index))
                .when(this.running, |button| button.opacity(orbit::DISABLED))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.move_plan_stop(index, -1, cx);
                })),
        )
        .child(
            orbit::button("strategy-stop-later", "+ 1 vuelta")
                .id(("strategy-stop-later", index))
                .when(this.running, |button| button.opacity(orbit::DISABLED))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.move_plan_stop(index, 1, cx);
                })),
        )
        .into_any_element()
}

fn read_only(label: &str, value: String) -> Div {
    orbit::card("").flex_1().min_w(px(145.0)).child(
        orbit::card_body()
            .gap(px(5.0))
            .child(orbit::eyebrow(label))
            .child(orbit::text(value, 13.0, 650, orbit::INK)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moving_a_stop_recalculates_only_its_adjacent_stints() {
        let original = EditedPlan {
            stints: vec![12, 18, 20],
            pit_stop_laps: vec![12, 30],
        };
        let changed = move_stop(&original, 50, 1, -1).expect("valid stop lap");
        assert_eq!(changed.pit_stop_laps, [12, 29]);
        assert_eq!(changed.stints, [12, 17, 21]);
        assert_eq!(changed.stints.iter().sum::<u32>(), 50);
    }

    #[test]
    fn stop_editor_rejects_missing_and_out_of_bounds_stops() {
        let original = EditedPlan {
            stints: vec![1, 2],
            pit_stop_laps: vec![1],
        };
        assert!(move_stop(&original, 3, 1, 1).is_err());
        assert!(move_stop(&original, 3, 0, 2).is_err());
    }
}
