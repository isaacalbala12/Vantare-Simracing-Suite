//! Edición de vueltas de parada y lectura de las decisiones reales del solver.
use gpui::{Context, Div, ParentElement, Styled, div, prelude::*, px, rgb, rgba};

use super::{Page, Strategy, orbit};
use vantare_strategy::application::EditedPlan;

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
    let Some(edited) = this.edited_plan.as_ref() else {
        return orbit::empty_state(
            "Sin plan calculado",
            "Calcula una estrategia antes de editar las paradas.",
        )
        .into_any_element();
    };
    let index = this
        .plan_editor
        .stop
        .min(edited.pit_stop_laps.len().saturating_sub(1));
    div()
        .id("strategy-pit-editor")
        .flex()
        .flex_col()
        .px(px(12.0))
        .pt(px(10.0))
        .gap(px(14.0))
        .child(super::plan::edit_heading("Ajustar paradas"))
        .child(
            super::plan::secondary_action("strategy-stops-back", "← Plan")
                .rounded(px(10.0))
                .w(px(69.0))
                .h(px(39.0))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.page = Page::Editor(super::EditorTab::Plan);
                    cx.notify();
                })),
        )
        .child(
            super::plan::plan_card()
                .p(px(18.0))
                .flex()
                .flex_col()
                .gap(px(14.0))
                .border_color(orbit::tint(orbit::CARMINE, 0.4))
                .child(
                    div()
                        .flex()
                        .items_start()
                        .pt(px(4.0))
                        .gap(px(14.0))
                        .h(px(42.0))
                        .border_b_1()
                        .border_color(rgba(orbit::LINE))
                        .child(orbit::text("TOTAL", 11.0, 700, orbit::RED).line_height(px(21.6)))
                        .child(
                            orbit::text(
                                edited.pit_stop_laps.len().to_string(),
                                18.0,
                                700,
                                orbit::INK,
                            )
                            .line_height(px(21.6)),
                        )
                        .child(orbit::text(
                            service_label(this, index),
                            12.0,
                            400,
                            orbit::INK_2,
                        )),
                )
                .child(stop_selector(edited, index, cx))
                .child(stop_details(this, index, cx))
                .child(this.plan_edit_footer(
                    cx,
                    "strategy-stops-reset",
                    "strategy-stops-recalculate",
                    "Recalcular parada",
                )),
        )
        .into_any_element()
}

fn stop_selector(edited: &EditedPlan, selected: usize, cx: &mut Context<Strategy>) -> Div {
    div()
        .flex()
        .gap(px(8.0))
        .children(edited.pit_stop_laps.iter().enumerate().map(|(index, _)| {
            div()
                .id(("strategy-stop-selector", index))
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
                .border_color(rgba(orbit::LINE_STRONG))
                .bg(rgb(0x000f_1212))
                .when(index == selected, |tab| {
                    tab.border_color(rgb(orbit::RED))
                        .bg(orbit::tint(orbit::CARMINE, 0.1))
                })
                .child(
                    div()
                        .size(px(28.0))
                        .flex()
                        .items_center()
                        .justify_center()
                        .rounded_full()
                        .bg(rgb(0x000a_0c0e))
                        .child(orbit::text((index + 1).to_string(), 16.0, 400, orbit::RED)),
                )
                .child(orbit::text(
                    format!("Parada {}", index + 1),
                    16.0,
                    400,
                    orbit::INK,
                ))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.plan_editor.stop = index;
                    cx.notify();
                }))
        }))
}

fn stop_details(this: &Strategy, index: usize, cx: &mut Context<Strategy>) -> Div {
    let demo = this
        .capture_demo
        .as_ref()
        .and_then(|demo| demo.stops.get(index));
    let stop = this
        .result
        .as_ref()
        .and_then(|outcome| outcome.result.pit_stops.get(index));
    let fuel = demo
        .map(|demo| demo.fuel_added)
        .or_else(|| stop.map(|stop| stop.fuel_liters));
    let energy = demo
        .map(|demo| demo.ve_added)
        .or_else(|| stop.map(|stop| stop.ve_percent));
    let tyres = demo
        .map(|demo| demo.change_tyres)
        .or_else(|| stop.map(|stop| stop.change_tyres));
    let compound = demo.map_or("Sin dato", |demo| demo.compound.as_str());
    let costs = demo.map_or([None; 4], |demo| {
        [
            Some(demo.transit_seconds),
            Some(demo.service_seconds),
            Some(-demo.overlap_seconds),
            Some(demo.total_seconds),
        ]
    });
    let values = costs.map(|cost| {
        cost.map_or_else(
            || "Sin dato".into(),
            |cost| format!("{} s", super::plan::decimal(cost, 1).trim_end_matches(",0")),
        )
    });
    let lap = this
        .edited_plan
        .as_ref()
        .and_then(|edited| edited.pit_stop_laps.get(index))
        .copied();
    super::plan::plan_card()
        .p(px(16.0))
        .pb(px(15.0))
        .bg(rgb(0x0010_1415))
        .gap(px(16.0))
        .child(
            div()
                .flex()
                .justify_between()
                .items_center()
                .child(
                    orbit::text(format!("Parada {}", index + 1), 16.0, 700, orbit::INK)
                        .line_height(px(20.0)),
                )
                .child(orbit::text(
                    lap.map_or_else(|| "Sin dato".into(), |lap| format!("Vuelta {lap}")),
                    12.0,
                    400,
                    orbit::INK_2,
                )),
        )
        .when(this.capture_demo.is_none(), |card| {
            card.child(stop_controls(this, cx, index))
        })
        .when(this.edit_dirty, |card| {
            card.child(orbit::text(
                "Valores anteriores: recalcula para actualizar los recursos.",
                12.0,
                400,
                orbit::INK_2,
            ))
        })
        .child(
            div()
                .flex()
                .gap(px(14.0))
                .min_w_0()
                .child(stop_resources(
                    fuel,
                    energy,
                    tyres,
                    compound,
                    this.capture_demo.is_some(),
                ))
                .child(cost_grid(&values)),
        )
}

fn stop_resources(
    fuel: Option<f64>,
    energy: Option<f64>,
    tyres: Option<bool>,
    compound: &str,
    demo: bool,
) -> Div {
    div()
        .flex()
        .flex_1()
        .min_w_0()
        .gap(px(10.0))
        .items_start()
        .pr(px(14.0))
        .border_r_1()
        .border_color(rgba(orbit::LINE))
        .child(
            div()
                .flex()
                .flex_col()
                .flex_1()
                .gap(px(40.0))
                .child(resource_value("Fuel añadido", fuel, "L"))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(5.0))
                        .child(
                            div()
                                .size(px(14.0))
                                .rounded(px(3.0))
                                .bg(rgb(if tyres == Some(true) {
                                    orbit::CARMINE
                                } else {
                                    0x0008_0b0c
                                }))
                                .child(orbit::text(
                                    if tyres == Some(true) { "✓" } else { "" },
                                    12.0,
                                    700,
                                    0x0040_2329,
                                )),
                        )
                        .child(orbit::text(tyre_label(tyres), 13.0, 400, orbit::INK))
                        .opacity(if demo { 1.0 } else { orbit::DISABLED }),
                ),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .flex_1()
                .gap(px(10.0))
                .child(resource_value("Energía virtual añadida", energy, "%"))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(8.0))
                        .child(
                            orbit::text("Compuesto", 13.0, 400, orbit::INK_2).line_height(px(19.5)),
                        )
                        .child(super::plan::read_only_select(compound)),
                ),
        )
}

fn tyre_label(tyres: Option<bool>) -> &'static str {
    if tyres.is_some() {
        "Cambiar neumáticos"
    } else {
        "Neumáticos sin dato"
    }
}

fn cost_grid(values: &[String; 4]) -> Div {
    div()
        .flex()
        .flex_col()
        .w(gpui::relative(0.41))
        .flex_none()
        .relative()
        .top(px(1.0))
        .gap(px(8.0))
        .child(
            div()
                .flex()
                .gap(px(8.0))
                .h(px(72.0))
                .child(cost_metric("Tránsito", &values[0]))
                .child(cost_metric("Servicio", &values[1])),
        )
        .child(
            div()
                .flex()
                .gap(px(8.0))
                .h(px(74.0))
                .child(cost_metric("Solape", &values[2]))
                .child(
                    cost_metric("Total", &values[3])
                        .border_color(orbit::tint(orbit::CARMINE, 0.5))
                        .bg(orbit::tint(orbit::CARMINE, 0.08)),
                ),
        )
}

fn service_label(this: &Strategy, index: usize) -> &'static str {
    if this.capture_demo.is_some() {
        return "Servicios en paralelo";
    }
    match this
        .result
        .as_ref()
        .and_then(|outcome| outcome.result.pit_stops.get(index))
        .map(|stop| stop.service_mode.as_str())
    {
        Some("parallel") => "Servicios en paralelo",
        Some("sequential") => "Servicios secuenciales",
        _ => "Modo de servicio sin dato",
    }
}

fn resource_value(label: &str, value: Option<f64>, unit: &str) -> Div {
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_w_0()
        .gap(px(6.0))
        .child(orbit::text(label.to_owned(), 13.0, 400, orbit::INK_2).line_height(px(19.5)))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(
                    div()
                        .h(px(40.0))
                        .flex_1()
                        .min_w_0()
                        .px(px(10.0))
                        .flex()
                        .items_center()
                        .rounded(px(8.0))
                        .border_1()
                        .border_color(rgba(orbit::LINE_STRONG))
                        .bg(rgb(0x0008_0b0c))
                        .child(orbit::text(
                            value.map_or_else(
                                || "Sin dato".into(),
                                |value| {
                                    super::plan::decimal(value, 1)
                                        .trim_end_matches(",0")
                                        .to_owned()
                                },
                            ),
                            13.0,
                            400,
                            orbit::INK,
                        )),
                )
                .child(orbit::text(unit.to_owned(), 13.0, 400, orbit::INK_2)),
        )
}

fn cost_metric(label: &str, value: &str) -> Div {
    super::plan::plan_card()
        .flex_1()
        .min_w_0()
        .p(px(14.0))
        .flex()
        .flex_col()
        .gap(px(5.0))
        .child(
            orbit::tracked_text(label.to_uppercase(), 11.0, 400, orbit::INK_2, 0.2)
                .text_size(px(11.0))
                .line_height(px(16.5)),
        )
        .child(orbit::text(value.to_owned(), 16.0, 700, orbit::INK).line_height(px(24.0)))
}

fn stop_controls(this: &Strategy, cx: &mut Context<Strategy>, index: usize) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(8.0))
        .child(orbit::text("Mover parada", 12.0, 600, orbit::INK_2))
        .children(
            [(-1, "− 1 vuelta"), (1, "+ 1 vuelta")]
                .into_iter()
                .map(|(delta, label)| {
                    orbit::button("strategy-stop-move", label)
                        .id(("strategy-stop-move", (index * 2) + usize::from(delta > 0)))
                        .when(this.running, |button| button.opacity(orbit::DISABLED))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.move_plan_stop(index, delta, cx);
                        }))
                }),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_tyre_decision_is_not_presented_as_no_change() {
        assert_eq!(tyre_label(None), "Neumáticos sin dato");
        assert_eq!(tyre_label(Some(false)), "Cambiar neumáticos");
        assert_eq!(tyre_label(Some(true)), "Cambiar neumáticos");
    }

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
