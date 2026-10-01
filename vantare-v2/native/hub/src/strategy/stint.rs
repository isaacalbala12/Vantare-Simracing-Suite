//! Edición de límites de stint; el solver nativo vuelve a valorar el plan.
use gpui::{Context, ParentElement, Styled, div, prelude::*, px, rgba};

use super::{Page, Strategy, orbit};
use vantare_strategy::{application::EditedPlan, solver::SolverOutcome};

pub(super) fn schedule_from_outcome(outcome: &SolverOutcome) -> Result<EditedPlan, String> {
    let result = &outcome.result;
    if !result.feasible
        || result.stints.is_empty()
        || result.pit_stops.len() + 1 != result.stints.len()
    {
        return Err("El resultado no contiene un calendario editable.".into());
    }
    Ok(EditedPlan {
        stints: result.stints.clone(),
        pit_stop_laps: result.pit_stops.iter().map(|stop| stop.lap).collect(),
    })
}

pub(super) fn move_boundary(
    edited: &EditedPlan,
    race_laps: u32,
    index: usize,
    lap: u32,
) -> Result<EditedPlan, String> {
    if edited.stints.len() != edited.pit_stop_laps.len() + 1 || index >= edited.pit_stop_laps.len()
    {
        return Err("El límite de stint no está disponible.".into());
    }
    let previous = if index == 0 {
        0
    } else {
        edited.pit_stop_laps[index - 1]
    };
    let next = edited
        .pit_stop_laps
        .get(index + 1)
        .copied()
        .unwrap_or(race_laps);
    if lap <= previous || lap >= next || lap >= race_laps {
        return Err("El límite debe dejar al menos una vuelta en cada stint.".into());
    }
    let mut changed = edited.clone();
    changed.stints[index] = lap - previous;
    changed.stints[index + 1] = next - lap;
    changed.pit_stop_laps[index] = lap;
    Ok(changed)
}

pub(super) fn render_editor(this: &Strategy, cx: &mut Context<Strategy>) -> gpui::AnyElement {
    if this.result.is_none() {
        return orbit::card("Ajustar stints")
            .child(orbit::card_body().child(orbit::empty_state(
                "Sin plan calculado",
                "Calcula una estrategia antes de editar los stints.",
            )))
            .into_any_element();
    }
    let Some(edited) = this.edited_plan.as_ref() else {
        return orbit::card("Ajustar stints")
            .child(orbit::card_body().child(orbit::empty_state(
                "Abre el editor desde Plan",
                "El calendario se copia del resultado confirmado.",
            )))
            .into_any_element();
    };
    let race_laps = this.last_input.as_ref().map_or(0, |input| input.race_laps);
    div()
        .id("strategy-stint-editor")
        .flex()
        .flex_col()
        .gap(px(orbit::RADIUS_CONTROL))
        .child(orbit::eyebrow("Edición manual"))
        .child(orbit::text("Ajustar stints", 28.0, 500, orbit::INK))
        .child(
            orbit::button("strategy-stints-back", "← Plan").on_click(
                cx.listener(|this, _, _, cx| {
                    this.page = Page::Editor(super::EditorTab::Plan);
                    cx.notify();
                }),
            ),
        )
        .child(total_laps_card(race_laps))
        .child(stint_cards(this, cx, edited))
        .child(orbit::callout(
            "La API nativa permite editar el calendario de vueltas. La asignación de piloto y los consumos por stint no se fijan en este recálculo.",
        ))
        .child(this.plan_edit_footer(
            cx,
            "strategy-stints-reset",
            "strategy-stints-recalculate",
            "Recalcular cambios",
        ))
        .into_any_element()
}

fn total_laps_card(race_laps: u32) -> gpui::AnyElement {
    orbit::card("Vueltas totales")
        .child(
            orbit::card_body()
                .flex_row()
                .items_center()
                .gap(px(orbit::RADIUS_CONTROL))
                .child(orbit::text(
                    format!("{race_laps} vueltas"),
                    17.0,
                    700,
                    orbit::INK,
                ))
                .child(orbit::text(
                    "Mueve un límite; la suma de vueltas se mantiene.",
                    12.0,
                    400,
                    orbit::INK_2,
                )),
        )
        .into_any_element()
}

fn stint_cards(
    this: &Strategy,
    cx: &mut Context<Strategy>,
    edited: &EditedPlan,
) -> gpui::AnyElement {
    let mut items = div().flex().flex_wrap().gap(px(orbit::RADIUS_CONTROL));
    let mut previous = 0_u32;
    for (index, &laps) in edited.stints.iter().enumerate() {
        let boundary = edited.pit_stop_laps.get(index).copied();
        let first_lap = previous.saturating_add(1);
        let last_lap = previous.saturating_add(laps);
        items = items.child(stint_card(this, cx, index, first_lap, last_lap, boundary));
        previous = boundary.unwrap_or(last_lap);
    }
    items.into_any_element()
}

fn stint_card(
    this: &Strategy,
    cx: &mut Context<Strategy>,
    index: usize,
    first_lap: u32,
    last_lap: u32,
    boundary: Option<u32>,
) -> gpui::AnyElement {
    let mut body = orbit::card_body()
        .gap(px(orbit::RADIUS_CONTROL))
        .child(orbit::eyebrow(format!("Stint {}", index + 1)))
        .child(orbit::text(
            format!("Vueltas {first_lap}–{last_lap}"),
            15.0,
            700,
            orbit::INK,
        ));
    if let Some(boundary) = boundary {
        body = body
            .child(orbit::text(
                format!("Límite de stint · vuelta {boundary}"),
                12.0,
                400,
                orbit::INK_2,
            ))
            .child(boundary_controls(this, cx, index, boundary));
    }
    orbit::card("")
        .flex_1()
        .min_w(px(220.0))
        .border_color(rgba(orbit::LINE))
        .child(body)
        .into_any_element()
}

fn boundary_controls(
    this: &Strategy,
    cx: &mut Context<Strategy>,
    index: usize,
    boundary: u32,
) -> gpui::AnyElement {
    div()
        .flex()
        .gap(px(orbit::RADIUS_CONTROL))
        .child(
            orbit::button("strategy-stint-earlier", "− 1 vuelta")
                .id(("strategy-stint-earlier", index))
                .when(this.running, |button| button.opacity(orbit::DISABLED))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.move_plan_boundary(index, boundary.saturating_sub(1), cx);
                })),
        )
        .child(
            orbit::button("strategy-stint-later", "+ 1 vuelta")
                .id(("strategy-stint-later", index))
                .when(this.running, |button| button.opacity(orbit::DISABLED))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.move_plan_boundary(index, boundary.saturating_add(1), cx);
                })),
        )
        .into_any_element()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moving_a_boundary_keeps_total_laps_and_other_boundaries() {
        let original = EditedPlan {
            stints: vec![20, 22, 27],
            pit_stop_laps: vec![20, 42],
        };
        let moved = move_boundary(&original, 69, 0, 21).expect("valid boundary");
        assert_eq!(moved.stints, [21, 21, 27]);
        assert_eq!(moved.pit_stop_laps, [21, 42]);
        assert_eq!(moved.stints.iter().sum::<u32>(), 69);
    }

    #[test]
    fn boundary_cannot_empty_a_stint_or_move_past_race_end() {
        let original = EditedPlan {
            stints: vec![1, 2],
            pit_stop_laps: vec![1],
        };
        assert!(move_boundary(&original, 3, 0, 0).is_err());
        assert!(move_boundary(&original, 3, 0, 3).is_err());
        assert!(move_boundary(&original, 3, 1, 1).is_err());
    }
}
