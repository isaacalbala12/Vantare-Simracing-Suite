//! Ficha de una salida: cajón lateral con salidas, fases, favorita, avisos,
//! reglas e historial, como en el contrato visual.
use super::super::{
    Calendar,
    chrome::{
        self, acct, btn, btn_pri, class_chip, disp, ib, icon, mono, section_title, star, t,
        tier, tint,
    },
    clock::{day_name, duration_txt, in_txt},
    rows,
};
use super::{Ficha, Modal, avisos::band_box};
use crate::orbit;
use chrono::{DateTime, Duration, Utc};
use gpui::{Context, Div, IntoElement, div, prelude::*, px, rgb};

/// Caja con icono, título y subtítulo (`.favbox`).
fn favbox(on: bool, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(12.0))
        .px(px(12.0))
        .py(px(10.0))
        .rounded(px(9.0))
        .border_1()
        .border_color(if on {
            chrome::acc_line(cx)
        } else {
            orbit::alpha(skin.line1)
        })
        .bg(if on {
            chrome::acc_bg(cx)
        } else {
            rgb(skin.l2).into()
        })
}

fn license_es(label: &str) -> String {
    label.replace("Bronze", "Bronce").replace("Silver", "Plata")
}

fn setup_es(value: &str) -> String {
    match value {
        "fixed" => "Fijo".to_owned(),
        "open" => "Libre".to_owned(),
        "" => "—".to_owned(),
        other => other.to_owned(),
    }
}

fn assists_es(value: &str) -> &'static str {
    match value {
        "High assists allowed" => "Todas permitidas",
        "Low assists allowed" => "Pocas permitidas",
        _ => "Ninguna",
    }
}

/// Fila de la tabla de reglas (`.dl div`): rótulo a la izquierda, valor a la derecha.
fn rule_cell(label: &str, value: String, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    div()
        .flex()
        .justify_between()
        .gap(px(8.0))
        .py(px(6.0))
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(t(label.to_owned(), 12.5, 400, skin.text3, cx))
        .child(t(value, 12.5, 400, skin.text1, cx).text_right())
}

/// Barra de fases (práctica, clasificación, carrera) con sus horas de entrada.
pub(super) fn phase_block(
    series: &super::super::Series,
    at: Option<DateTime<Utc>>,
    zone: super::super::clock::Zone,
    cx: &gpui::App,
) -> Div {
    let skin = chrome::skin(cx);
    let phases = series.phases();
    let names = ["Práctica", "Clasificación", "Carrera"];
    let weights = [
        phases[0].0.max(4) as f32,
        phases[1].0 as f32,
        phases[2].0.min(60) as f32,
    ];
    let total_weight: f32 = weights.iter().sum::<f32>().max(1.0);
    let mins = [64.0_f32, 74.0, 0.0];
    let mut bar = div()
        .flex()
        .gap(px(2.0))
        .h(px(34.0))
        .rounded(px(7.0))
        .overflow_hidden();
    for (index, (minutes, _)) in phases.iter().enumerate() {
        let race = index == 2;
        let text = if race {
            duration_txt(*minutes)
        } else {
            format!("{minutes}′")
        };
        bar = bar.child(
            div()
                .w(gpui::relative(weights[index] / total_weight))
                .min_w(px(mins[index]))
                .flex()
                .flex_col()
                .justify_center()
                .px(px(8.0))
                .overflow_hidden()
                .bg(if race {
                    chrome::acc_bg(cx)
                } else {
                    rgb(skin.l3).into()
                })
                .when(race, |d| {
                    d.border_1().border_color(chrome::acc_line(cx)).rounded(px(7.0))
                })
                .child(t(names[index], 11.0, 600, skin.text1, cx).whitespace_nowrap())
                .child(
                    t(
                        text,
                        11.0,
                        400,
                        skin.text2,
                        cx,
                    )
                    .whitespace_nowrap(),
                ),
        );
    }
    let lead_in = series.lead_in_min();
    let phase_labels = div()
        .flex()
        .justify_between()
        .mt(px(5.0))
        .child(mono(
            format!("{} entras", at.map_or("—".into(), |a| zone.hm(a))),
            11.0,
            skin.text3,
            cx,
        ))
        .child(mono(
            format!(
                "{} carrera",
                at.map_or("—".into(), |a| zone.hm(a + Duration::minutes(lead_in)))
            ),
            11.0,
            skin.text3,
            cx,
        ))
        .child(mono(
            format!(
                "~{} fin",
                at.map_or("—".into(), |a| zone
                    .hm(a + Duration::minutes(series.event_minutes())))
            ),
            11.0,
            skin.text3,
            cx,
        ));
    div().child(bar).child(phase_labels)
}

#[allow(clippy::too_many_lines)] // Una sola pieza visual: cabecera, cuerpo y pie.
pub(super) fn render(
    cal: &mut Calendar,
    ficha: &Ficha,
    cx: &mut Context<Calendar>,
) -> impl IntoElement {
    let skin = chrome::skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let Some(schedule) = cal.schedule().cloned() else {
        return div().into_any_element();
    };
    let Some(series) = schedule.by_id(&ficha.id).cloned() else {
        return div().into_any_element();
    };
    let (_, until) = schedule.window().unwrap_or((now, now));
    let daily = rows::is_daily(&series);
    let upcoming: Vec<DateTime<Utc>> = schedule
        .starts(&series, now, until)
        .unwrap_or_default()
        .into_iter()
        .take(if daily { 10 } else { 12 })
        .collect();
    let at = ficha.at.or_else(|| upcoming.first().copied());
    let fav = rows::is_fav(cal.favorites(), &series);
    let id = series.id.clone();
    let launch = cal.launch_label();

    let mut picks = div().flex().flex_wrap().gap(px(6.0));
    for (index, start) in upcoming.iter().enumerate() {
        let (sid, start) = (id.clone(), *start);
        let label = if daily {
            zone.hm(start)
        } else {
            format!("{} {}", day_name(zone.date(start)), zone.hm(start))
        };
        let alerted = cal.alerts.slot_at(&series.id, start);
        picks = picks.child(
            chrome::pick_chip(("calendar-ficha-pick", index), label, Some(start) == at, alerted, cx).on_click(cx.listener(
                move |this, _, _, cx| this.open_ficha(sid.clone(), Some(start), cx),
            )),
        );
    }

    let phase = phase_block(&series, at, zone, cx);

    // Favorita.
    let fid = id.clone();
    let favorite = favbox(fav, cx)
        .id("calendar-ficha-fav")
        .cursor_pointer()
        .on_click(cx.listener(move |this, _, _, cx| this.toggle_fav(&fid, cx)))
        .child(star(fav, 18.0, cx))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(t(
                    if fav {
                        "Está en tus favoritas"
                    } else {
                        "Añadir a favoritas"
                    },
                    13.0,
                    600,
                    skin.text1,
                    cx,
                ))
                .child(t(
                    if fav {
                        "Sale primero en Próximas, en Semana y en Inicio."
                    } else {
                        "La verás primero en Próximas, en Semana y en Inicio."
                    },
                    12.5,
                    400,
                    skin.text3,
                    cx,
                )),
        )
        .child(chrome::switch(fav, cx));

    // Avisos: franja (diaria) o tanda (semanal/especial).
    let alert_block = if daily {
        band_box(cal, &series, cx)
    } else {
        let on = at.is_some_and(|a| cal.alerts.slot_at(&series.id, a));
        let (sid, slot) = (id.clone(), at);
        let lead = cal.alerts.lead_min;
        let mut leads = chrome::seg_mini_group(cx);
        for value in [5u8, 10, 15, 30] {
            leads = leads.child(
                chrome::seg_mini(
                    ("calendar-ficha-lead", usize::from(value)),
                    &format!("{value}′"),
                    lead == value,
                    cx,
                )
                .on_click(super::avisos::edit(cx, move |a| {
                    a.lead_min = value;
                    Ok(())
                })),
            );
        }
        favbox(on, cx)
            .child(icon(
                if on { "bell-fill" } else { "bell" },
                18.0,
                if on { acct(cx) } else { skin.text3 },
            ))
            .child(
                div()
                    .id("calendar-ficha-slot")
                    .flex_1()
                    .min_w_0()
                    .cursor_pointer()
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(slot) = slot {
                            this.toggle_slot_alert(&sid, slot, cx);
                        }
                    }))
                    .child(t(
                        match (on, at) {
                            (true, Some(a)) => format!(
                                "Te avisaremos a las {}",
                                zone.hm(a - Duration::minutes(i64::from(lead)))
                            ),
                            _ => "Avisarme de esta salida".to_owned(),
                        },
                        13.0,
                        600,
                        skin.text1,
                        cx,
                    ))
                    .child(t(
                        format!("{lead} min antes · notificación de Windows con botón para lanzar"),
                        12.5,
                        400,
                        skin.text3,
                        cx,
                    )),
            )
            .child(leads)
    };

    // Reglas (seis pares).
    let (energy_label, energy_value) = series.ve_limit.map_or_else(
        || {
            (
                "Formato",
                if series.format == "team" {
                    "Equipos".to_owned()
                } else {
                    "Individual".to_owned()
                },
            )
        },
        |ve| ("Energía", format!("{ve} % VE")),
    );
    let rules = div()
        .grid()
        .grid_cols(2)
        .gap_x(px(18.0))
        .child(rule_cell("Reglaje", setup_es(&series.setup), cx))
        .child(rule_cell(
            "Ayudas",
            assists_es(&series.assists).to_owned(),
            cx,
        ))
        .child(rule_cell(
            "Calentadores",
            if series.tyre_warmers { "Sí" } else { "No" }.to_owned(),
            cx,
        ))
        .child(rule_cell(
            "Neumáticos",
            series.tyres.map_or("—".into(), |n| n.to_string()),
            cx,
        ))
        .child(rule_cell(
            "Divisiones",
            series.splits.map_or("—".into(), |n| format!("hasta {n}")),
            cx,
        ))
        .child(rule_cell(energy_label, energy_value, cx));

    // Historial aquí: carreras, mejor vuelta y media de tus sesiones grabadas.
    let mine: Vec<_> = cal.runs.iter().filter(|r| r.series_id == id).collect();
    let (races, best, average) = if mine.is_empty() {
        ("Ninguna".to_owned(), "—".to_owned(), "—".to_owned())
    } else {
        let best = mine
            .iter()
            .filter_map(|r| r.best_lap.clone())
            .min()
            .unwrap_or_else(|| "—".into());
        let n = mine.len();
        let position = mine.iter().map(|r| u32::from(r.position)).sum::<u32>() / n as u32;
        let sr = mine.iter().map(|r| i32::from(r.safety_tenths)).sum::<i32>();
        (
            format!("{n} esta semana"),
            best,
            format!("P{position} · {:+} SR", sr / 10),
        )
    };
    let how = if daily { "Carreras diarias" } else { "Eventos" };
    let history = div()
        .child(section_title(
            "Tu historial aquí",
            Some("de tus sesiones grabadas".to_owned()),
            cx,
        ))
        .child(
            div()
                .flex()
                .gap(px(8.0))
                .child(chrome::fact("Carreras", races, cx))
                .child(chrome::fact("Mejor vuelta", best, cx))
                .child(chrome::fact("Media", average, cx)),
        )
        .child(
            div()
                .flex()
                .gap(px(4.0))
                .mt(px(6.0))
                .child(t("En el simulador:", 11.5, 400, skin.cap, cx))
                .child(t(
                    format!("Multijugador › {how} › {}", series.name),
                    11.5,
                    600,
                    skin.text2,
                    cx,
                )),
        );

    let tracerudp = series.notes.iter().any(|n| n.contains("tracerudp"));
    let (sid_serie, sid_launch) = (id.clone(), id.clone());
    let launch_at = at.map(|a| a - Duration::minutes(3));

    let body = div()
        .id("calendar-ficha-body")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .gap(px(16.0))
        .px(px(20.0))
        .py(px(16.0))
        .child(
            div()
                .child(section_title("Elige salida", Some(zone.long(now)), cx))
                .child(picks),
        )
        .child(
            div()
                .child(section_title(
                    &format!(
                        "Así es la salida de las {}",
                        at.map_or("—".into(), |a| zone.hm(a))
                    ),
                    at.map(|a| in_txt(a - now)),
                    cx,
                ))
                .child(phase)
                .child(
                    t(
                        "Práctica y clasificación son estimadas por LMU; la carrera es exacta.",
                        11.5,
                        400,
                        skin.cap,
                        cx,
                    )
                    .mt(px(4.0)),
                ),
        )
        .child(favorite)
        .child(alert_block)
        .child(
            div()
                .child(section_title("Reglas", None, cx))
                .child(rules),
        )
        .child(history)
        .when(tracerudp, |b| {
            b.child(
                div()
                    .flex_none()
                    .flex()
                    .items_start()
                    .gap(px(10.0))
                    .px(px(12.0))
                    .py(px(10.0))
                    .rounded(px(8.0))
                    .border_1()
                    .border_color(tint(skin.warn, 0.22))
                    .bg(tint(skin.warn, 0.12))
                    .child(icon("warn", 16.0, skin.warn))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(
                                t(
                                    "Este evento pide +tracerudp=3 en las opciones de lanzamiento.",
                                    12.5,
                                    700,
                                    skin.text1,
                                    cx,
                                ),
                            )
                            .child(t(
                                format!(
                                    "Al lanzar {} la añadimos solo para esta sesión.",
                                    launch.replace("Lanzar ", "")
                                ),
                                12.5,
                                400,
                                skin.text2,
                                cx,
                            )),
                    ),
            )
        });

    let profile = cal.profile.clone().unwrap_or_else(|| "Perfil".to_owned());
    let footer = div()
        .flex_none()
        .flex()
        .flex_col()
        .gap(px(8.0))
        .px(px(20.0))
        .py(px(14.0))
        .border_t_1()
        .border_color(orbit::alpha(skin.line1))
        .bg(rgb(skin.l2))
        .child(
            div()
                .h(px(34.0))
                .flex()
                .items_center()
                .gap(px(8.0))
                .px(px(10.0))
                .rounded(px(8.0))
                .border_1()
                .border_color(orbit::alpha(skin.line2))
                .bg(rgb(skin.l3))
                .child(icon("play", 14.0, skin.text2))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .gap(px(4.0))
                        .child(t("Perfil ·", 13.0, 400, skin.text1, cx))
                        .child(t(profile, 13.0, 700, skin.text1, cx)),
                )
                .child(t("LMU + CrewChief + overlays", 12.5, 400, skin.cap, cx))
                .child(icon("down", 14.0, skin.text3)),
        )
        .child(
            div()
                .flex()
                .gap(px(8.0))
                .child(
                    btn_pri("calendar-ficha-launch", "Lanzar ahora", true, cx)
                        .flex_1()
                        .on_click(cx.listener(|this, _, _, cx| this.launch_profile(cx))),
                )
                .when_some(launch_at.filter(|l| *l > now), |f, launch| {
                    f.child(
                        btn("calendar-ficha-schedule", "", false, cx)
                        .h(px(40.0))
                        .px(px(18.0))
                        .child(icon("clock", 15.0, skin.text1))
                        .child(t(
                            format!("Lanzar a las {}", zone.hm(launch)),
                            14.0,
                            500,
                            skin.text1,
                            cx,
                        ))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.arm_launch(&sid_launch, launch, cx);
                        })),
                    )
                })
                .child(
                    ib(
                        "calendar-ficha-ics",
                        "v-calendar",
                        "Añadir a mi calendario",
                        false,
                        false,
                        cx,
                    )
                    .size(px(40.0))
                    .border_1()
                    .border_color(orbit::alpha(skin.line2))
                    .on_click(cx.listener(|this, _, _, cx| this.open_modal(Modal::Ics, cx))),
                ),
        );

    let kind = if series.every().is_some() {
        format!("Diaria · cada {} min", series.every().unwrap_or(0))
    } else if series.event_kind == "special" {
        "Especial · fin de semana".to_owned()
    } else {
        "Semanal".to_owned()
    };
    let license = if series.license_label.is_empty() {
        String::new()
    } else {
        format!(" · licencia {}", license_es(&series.license_label))
    };
    let header = div()
        .relative()
        .flex_none()
        .flex()
        .flex_col()
        .px(px(20.0))
        .pt(px(18.0))
        .pb(px(14.0))
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(tier(&series, cx))
                .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx)))
                .child(t(format!("{kind}{license}"), 12.0, 400, skin.cap, cx).whitespace_nowrap()),
        )
        .child(
            div()
                .absolute()
                .top(px(13.0))
                .right(px(52.0))
                .child(
                    btn("calendar-ficha-serie", "Ver serie", true, cx)
                        .bg(gpui::hsla(0.0, 0.0, 0.0, 0.0))
                        .child(icon("chevron-right", 13.0, skin.text1))
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.open_serie(sid_serie.clone(), cx)),
                        ),
                ),
        )
        .child(
            div()
                .absolute()
                .top(px(12.0))
                .right(px(12.0))
                .child(
                    ib(
                        "calendar-ficha-close",
                        "x",
                        "Cerrar (Esc)",
                        false,
                        false,
                        cx,
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.escape(cx);
                    })),
                ),
        )
        .child(
            div()
                .flex()
                .items_end()
                .gap(px(14.0))
                .mt(px(8.0))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(disp(series.name.clone(), 30.0, skin.text1, cx).truncate())
                        .child(
                            div()
                                .flex()
                                .gap(px(6.0))
                                .mt(px(6.0))
                                .child(t(series.track_short().to_owned(), 13.0, 700, skin.text2, cx))
                                .child(t(series.track_layout().to_owned(), 13.0, 400, skin.text3, cx)),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_wrap()
                                .gap(px(10.0))
                                .mt(px(8.0))
                                .children(series.class_chips().iter().map(|c| class_chip(c, cx))),
                        ),
                )
                .when(orbit::has_circuit(Some(&series.track)), |row| {
                    row.child(
                        div()
                            .w(px(120.0))
                            .h(px(72.0))
                            .flex_none()
                            .child(orbit::circuit(Some(&series.track), cx).size_full()),
                    )
                }),
        );
    chrome::window_layer(
        cal.ui.viewport,
        div()
            .id("calendar-ficha")
            .flex()
            .justify_end()
            .bg(chrome::tint(0x0808_0607, 0.55))
            .occlude()
            .on_click(cx.listener(|this, _, _, cx| {
                this.escape(cx);
            }))
            .child(
                div()
                    .id("calendar-ficha-panel")
                    .w(px(470.0))
                    .h_full()
                    .flex()
                    .flex_col()
                    .overflow_hidden()
                    .border_l_1()
                    .border_color(orbit::alpha(skin.line2))
                    .bg(orbit::ramp(skin.neo, 180.0))
                    .on_click(|_, _, cx| cx.stop_propagation())
                    .child(header)
                    .child(body)
                    .child(footer),
            ),
    )
    .into_any_element()
}
