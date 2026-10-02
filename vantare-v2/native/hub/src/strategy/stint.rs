//! Edición de límites de stint; el solver nativo vuelve a valorar el plan.
use gpui::{Context, ParentElement, Styled, div, prelude::*, px, rgb, rgba};

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

pub(super) struct EditorState {
    pub stint: usize,
    pub stop: usize,
    bounds: Option<gpui::Bounds<gpui::Pixels>>,
    dragging: bool,
    focus: gpui::FocusHandle,
}
impl EditorState {
    pub(super) fn new(cx: &mut Context<Strategy>) -> Self {
        Self {
            stint: 0,
            stop: 0,
            bounds: None,
            dragging: false,
            focus: cx.focus_handle(),
        }
    }
}

pub(super) fn render_editor(this: &Strategy, cx: &mut Context<Strategy>) -> gpui::AnyElement {
    let Some(edited) = this.edited_plan.as_ref() else {
        return orbit::empty_state(
            "Sin plan calculado",
            "Calcula una estrategia antes de editar los stints.",
            cx,
        )
        .into_any_element();
    };
    let race_laps = this.last_input.as_ref().map_or(0, |input| input.race_laps);
    let index = this
        .plan_editor
        .stint
        .min(edited.stints.len().saturating_sub(1));
    let laps = edited.stints.get(index).copied().unwrap_or(0);
    let [driver, pace, fuel, energy] = this.stint_values(index);
    div()
        .id("strategy-stint-editor")
        .flex()
        .flex_col()
        .px(px(12.0))
        .pt(px(10.0))
        .gap(px(14.0))
        .child(super::plan::edit_heading("Ajustar stints", cx))
        .child(
            orbit::button("strategy-stints-back", "← Plan", cx)
                .w(px(70.0))
                .h(px(40.0))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.page = Page::Editor(super::EditorTab::Plan);
                    cx.notify();
                })),
        )
        .child(
            super::plan::plan_card(cx)
                .p(px(18.0))
                .gap(px(14.0))
                .child(stint_header(race_laps, cx))
                .child(stint_selector(edited, index, cx))
                .child(
                    div()
                        .flex()
                        .gap(px(14.0))
                        .min_w_0()
                        .child(
                            stint_metrics(laps, pace, fuel, energy, cx)
                                .w(gpui::relative(0.4454))
                                .flex_none(),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .flex_1()
                                .min_w_0()
                                .gap(px(14.0))
                                .child(pilot_row(index, laps, &driver, cx))
                                .child(boundary_control(this, edited, index, race_laps, cx)),
                        ),
                )
                .child(this.plan_edit_footer(
                    cx,
                    "strategy-stints-reset",
                    "strategy-stints-recalculate",
                    "Recalcular cambios",
                )),
        )
        .into_any_element()
}

fn stint_header(race_laps: u32, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .items_start()
        .pt(px(4.0))
        .gap(px(14.0))
        .h(px(42.0))
        .border_b_1()
        .border_color(rgba(orbit::line(cx)))
        .child(orbit::text("VUELTAS TOTALES", 11.0, 700, orbit::red(cx), cx).line_height(px(21.6)))
        .child(
            orbit::text(
                format!("{race_laps} vueltas"),
                18.0,
                700,
                orbit::ink(cx),
                cx,
            )
            .line_height(px(21.6)),
        )
        .child(
            orbit::text(
                "Mueve un límite para comparar con la propuesta.",
                12.0,
                400,
                orbit::ink_2(cx),
                cx,
            )
            .line_height(px(21.6)),
        )
}

fn pilot_row(index: usize, laps: u32, driver: &str, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(16.0))
        .h(px(88.0))
        .p(px(14.0))
        .rounded(px(10.0))
        .bg(rgb(crate::orbit::legacy_rgb(0x0011_1515, cx)))
        .child(orbit::text(
            format!("Stint {}", index + 1),
            16.0,
            700,
            orbit::ink(cx),
            cx,
        ))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(8.0))
                .w(px(320.0))
                .child(orbit::text("Piloto", 13.0, 400, orbit::ink_2(cx), cx))
                .child(super::datos::select_value(driver, cx)),
        )
        .child(orbit::text(
            format!("{laps} vueltas"),
            12.0,
            400,
            orbit::ink_2(cx),
            cx,
        ))
}

fn stint_selector(edited: &EditedPlan, selected: usize, cx: &mut Context<Strategy>) -> gpui::Div {
    div()
        .flex()
        .gap(px(8.0))
        .children(edited.stints.iter().enumerate().map(|(index, _)| {
            div()
                .id(("strategy-stint-selector", index))
                .role(gpui::Role::Button)
                .tab_index(0)
                .aria_selected(index == selected)
                .flex()
                .items_center()
                .gap(px(10.0))
                .w(px(240.0))
                .h(px(54.0))
                .px(px(14.0))
                .rounded(px(8.0))
                .border_1()
                .border_color(rgba(orbit::line_strong(cx)))
                .bg(rgb(crate::orbit::legacy_rgb(0x000f_1212, cx)))
                .when(index == selected, |tab| {
                    tab.border_color(rgb(orbit::red(cx)))
                        .bg(orbit::tint(orbit::carmine(cx), 0.1))
                })
                .child(
                    div()
                        .size(px(28.0))
                        .flex()
                        .items_center()
                        .justify_center()
                        .rounded_full()
                        .bg(rgb(crate::orbit::legacy_rgb(0x000a_0c0e, cx)))
                        .child(orbit::text(
                            (index + 1).to_string(),
                            16.0,
                            400,
                            orbit::red(cx),
                            cx,
                        )),
                )
                .child(orbit::text(
                    format!("Stint {}", index + 1),
                    16.0,
                    400,
                    orbit::ink(cx),
                    cx,
                ))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.plan_editor.stint = index;
                    cx.notify();
                }))
        }))
}

pub(super) fn editor_metric(label: &str, value: String, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_w_0()
        .p(px(18.0))
        .py(px(15.0))
        .gap(px(8.0))
        .bg(rgb(crate::orbit::legacy_rgb(0x000b_0e0f, cx)))
        .border_1()
        .border_color(rgba(orbit::line(cx)))
        .child(
            orbit::text(label.to_uppercase(), 11.0, 400, orbit::ink_2(cx), cx)
                .line_height(px(16.5)),
        )
        .child(orbit::text(value, 20.0, 700, orbit::ink(cx), cx).line_height(px(24.0)))
}
fn stint_metrics(
    laps: u32,
    pace: String,
    fuel: String,
    energy: String,
    cx: &gpui::App,
) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .rounded(px(10.0))
        .overflow_hidden()
        .child(
            div()
                .flex()
                .h(px(85.0))
                .child(editor_metric("Vueltas", laps.to_string(), cx))
                .child(editor_metric("Ritmo base", pace, cx)),
        )
        .child(
            div()
                .flex()
                .h(px(85.0))
                .child(editor_metric("Fuel", fuel, cx))
                .child(editor_metric("Energía virtual", energy, cx)),
        )
}

fn boundary_range(edited: &EditedPlan, index: usize, race_laps: u32) -> Option<(u32, u32, u32)> {
    let value = *edited.pit_stop_laps.get(index)?;
    let first = if index == 0 {
        1
    } else {
        edited.pit_stop_laps.get(index - 1)?.checked_add(1)?
    };
    let last = edited
        .pit_stop_laps
        .get(index + 1)
        .copied()
        .unwrap_or(race_laps)
        .checked_sub(1)?;
    (first <= last).then_some((first, last, value))
}

fn boundary_control(
    this: &Strategy,
    edited: &EditedPlan,
    index: usize,
    race_laps: u32,
    cx: &mut Context<Strategy>,
) -> gpui::Div {
    let Some((min, max, value)) = boundary_range(edited, index, race_laps) else {
        return orbit::text(
            "El último stint termina en la última vuelta de carrera.",
            13.0,
            400,
            orbit::ink_2(cx),
            cx,
        );
    };
    let slider = boundary_slider(this, index, min, max, value, cx);
    div()
        .flex()
        .items_center()
        .gap(px(16.0))
        .px(px(14.0))
        .child(
            div()
                .flex()
                .flex_col()
                .flex_1()
                .gap(px(8.0))
                .child(
                    orbit::text("Límite del stint", 13.0, 400, orbit::ink_2(cx), cx)
                        .line_height(px(19.5)),
                )
                .child(slider),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .w(px(76.0))
                .gap(px(8.0))
                .child(orbit::text("Vuelta", 13.0, 400, orbit::ink_2(cx), cx).line_height(px(19.5)))
                .child(
                    div()
                        .h(px(40.0))
                        .px(px(8.0))
                        .flex()
                        .items_center()
                        .rounded(px(8.0))
                        .border_1()
                        .border_color(rgba(orbit::line_strong(cx)))
                        .bg(rgb(crate::orbit::legacy_rgb(0x0008_0b0c, cx)))
                        .child(orbit::text(
                            value.to_string(),
                            13.0,
                            500,
                            orbit::ink(cx),
                            cx,
                        )),
                ),
        )
}

fn boundary_slider(
    this: &Strategy,
    index: usize,
    min: u32,
    max: u32,
    value: u32,
    cx: &mut Context<Strategy>,
) -> gpui::Stateful<gpui::Div> {
    let fraction = if min == max {
        0.0
    } else {
        f64::from(value.saturating_sub(min)) / f64::from(max - min)
    };
    let entity = cx.entity();
    div()
        .id("strategy-stint-boundary")
        .track_focus(&this.plan_editor.focus)
        .tab_index(0)
        .role(gpui::Role::Slider)
        .aria_label("Límite del stint")
        .aria_numeric_value(f64::from(value))
        .aria_min_numeric_value(f64::from(min))
        .aria_max_numeric_value(f64::from(max))
        .aria_numeric_value_step(1.0)
        .h(px(20.0))
        .w_full()
        .cursor_pointer()
        .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
            let next = match event.keystroke.key.as_str() {
                "left" | "down" => value.saturating_sub(1),
                "right" | "up" => value.saturating_add(1),
                "home" => min,
                "end" => max,
                _ => return,
            };
            this.move_plan_boundary(index, next.clamp(min, max), cx);
            cx.stop_propagation();
        }))
        .on_mouse_down(
            gpui::MouseButton::Left,
            cx.listener(move |this, event: &gpui::MouseDownEvent, window, cx| {
                if !this.running {
                    this.plan_editor.focus.focus(window, cx);
                    this.plan_editor.dragging = true;
                    this.move_boundary_pointer(index, min, max, event.position.x, cx);
                }
            }),
        )
        .on_mouse_move(
            cx.listener(move |this, event: &gpui::MouseMoveEvent, _, cx| {
                if this.plan_editor.dragging {
                    this.move_boundary_pointer(index, min, max, event.position.x, cx);
                }
            }),
        )
        .on_mouse_up(
            gpui::MouseButton::Left,
            cx.listener(|this, _, _, _| this.plan_editor.dragging = false),
        )
        .on_mouse_up_out(
            gpui::MouseButton::Left,
            cx.listener(|this, _, _, _| this.plan_editor.dragging = false),
        )
        .child(
            gpui::canvas(
                move |bounds, _, cx| {
                    entity.update(cx, |this, _| this.plan_editor.bounds = Some(bounds));
                },
                move |bounds, (), window, cx| paint_boundary(bounds, fraction, window, cx),
            )
            .size_full(),
        )
}

impl Strategy {
    fn move_boundary_pointer(
        &mut self,
        index: usize,
        min: u32,
        max: u32,
        x: gpui::Pixels,
        cx: &mut Context<Self>,
    ) {
        let Some(bounds) = self.plan_editor.bounds else {
            return;
        };
        if bounds.size.width <= px(0.0) {
            return;
        }
        let fraction = f64::from((x - bounds.left()) / bounds.size.width);
        if let Some(lap) = boundary_at_fraction(min, max, fraction) {
            self.move_plan_boundary(index, lap, cx);
        }
    }
}

fn boundary_at_fraction(min: u32, max: u32, fraction: f64) -> Option<u32> {
    if min > max || !fraction.is_finite() {
        return None;
    }
    let range = orbit::NumberRange::new(
        f64::from(min),
        f64::from(max),
        1.0,
        f64::from(min) + fraction.clamp(0.0, 1.0) * f64::from(max - min),
    )
    .ok()?;
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    // El rango validado está limitado a u32 y el paso es una vuelta.
    Some(range.value as u32)
}

fn paint_boundary(
    bounds: gpui::Bounds<gpui::Pixels>,
    fraction: f64,
    window: &mut gpui::Window,
    cx: &gpui::App,
) {
    let y = bounds.top() + bounds.size.height / 2.0;
    let track = gpui::Bounds::new(
        gpui::point(bounds.left(), y - px(3.0)),
        gpui::size(bounds.size.width, px(6.0)),
    );
    window.paint_quad(
        gpui::fill(track, rgb(crate::orbit::legacy_rgb(0x0053_5353, cx))).corner_radii(px(3.0)),
    );
    #[allow(clippy::cast_possible_truncation)] // Fracción de presentación acotada a 0..1.
    let width = bounds.size.width * fraction.clamp(0.0, 1.0) as f32;
    window.paint_quad(
        gpui::fill(
            gpui::Bounds::new(track.origin, gpui::size(width, px(6.0))),
            rgb(orbit::red(cx)),
        )
        .corner_radii(px(3.0)),
    );
    window.paint_quad(
        gpui::fill(
            gpui::Bounds::new(
                gpui::point(bounds.left() + width - px(7.0), y - px(7.0)),
                gpui::size(px(14.0), px(14.0)),
            ),
            rgb(orbit::red(cx)),
        )
        .corner_radii(px(7.0)),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pointer_mapping_rounds_clamps_and_rejects_invalid_ranges() {
        for (fraction, expected) in [(-1.0, 1), (0.0, 1), (0.5, 23), (1.0, 45), (2.0, 45)] {
            assert_eq!(boundary_at_fraction(1, 45, fraction), Some(expected));
        }
        assert_eq!(boundary_at_fraction(7, 7, 0.5), Some(7));
        assert_eq!(boundary_at_fraction(2, 1, 0.0), None);
        assert_eq!(boundary_at_fraction(1, 45, f64::NAN), None);
        assert_eq!(boundary_at_fraction(1, 45, f64::INFINITY), None);
        assert_eq!(
            boundary_at_fraction(u32::MAX, u32::MAX, 0.0),
            Some(u32::MAX)
        );
    }

    #[test]
    fn boundary_range_prevents_empty_adjacent_stints() {
        let edited = EditedPlan {
            stints: vec![23, 23, 23],
            pit_stop_laps: vec![23, 46],
        };
        assert_eq!(boundary_range(&edited, 0, 69), Some((1, 45, 23)));
        assert_eq!(boundary_range(&edited, 1, 69), Some((24, 68, 46)));
        assert_eq!(boundary_range(&edited, 2, 69), None);
    }

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
