//! Página de una serie: todas sus salidas, avisos, reglas y circuito por semana.
use super::super::{
    Calendar,
    chrome::{
        self, acct, bold_mono, btn, btn_pri, center_message, class_chip, disp, icon, mono,
        pick_chip, section_title, star, t, tier, tint,
    },
    clock::{self, day_name},
    rows,
};
use super::{View, avisos::band_box, ficha::phase_block};
use crate::orbit;
use chrono::{DateTime, Duration, Utc};
use gpui::{Context, Div, div, prelude::*, px, rgb};

fn assists_es(value: &str) -> &'static str {
    match value {
        "High assists allowed" => "Todas permitidas",
        "Low assists allowed" => "Pocas permitidas",
        _ => "Ninguna",
    }
}

fn license_es(label: &str) -> String {
    if label.is_empty() {
        "Sin requisito".to_owned()
    } else {
        label.replace("Bronze", "Bronce").replace("Silver", "Plata")
    }
}

/// Par de la tabla de reglas con raya inferior.
fn pair(label: &str, value: String, cx: &gpui::App) -> Div {
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

/// Muestra de la leyenda del mapa de calor.
fn swatch(kind: u8, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    let base = div().w(px(14.0)).h(px(12.0)).flex_none().rounded(px(3.0));
    match kind {
        0 => base.bg(rgb(skin.l2)).child(
            div()
                .size_full()
                .rounded(px(3.0))
                .bg(gpui::pattern_slash(orbit::alpha(skin.line2), 1.0, 5.0)),
        ),
        1 => base.bg(tint(chrome::acc(cx), 0.75)),
        _ => base
            .bg(rgb(skin.l3))
            .border_2()
            .border_color(rgb(skin.text1)),
    }
}

fn legend_item(kind: u8, label: &str, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    div()
        .flex()
        .items_center()
        .gap(px(7.0))
        .child(swatch(kind, cx))
        .child(t(label.to_owned(), 11.5, 400, skin.text3, cx))
}

/// Columna que reparte el ancho con las demás según su peso (`fr` del contrato).
fn grow(column: Div, weight: f32) -> Div {
    let mut column = column.min_w_0().flex_basis(gpui::relative(0.0));
    column.style().flex_grow = Some(weight);
    column
}

/// Lo que todas las tarjetas de la página necesitan saber de la serie abierta.
#[derive(Clone, Copy)]
struct Page<'a> {
    series: &'a super::super::Series,
    schedule: &'a super::super::Schedule,
    now: DateTime<Utc>,
    zone: clock::Zone,
    compact: bool,
    fav: bool,
    daily: bool,
    valid_from: DateTime<Utc>,
    valid_until: DateTime<Utc>,
    next: Option<DateTime<Utc>>,
}

#[allow(unused_variables, clippy::too_many_lines)]
fn header(cal: &Calendar, p: &Page<'_>, cx: &mut Context<Calendar>) -> Div {
    let Page {
        series,
        schedule,
        now,
        zone,
        compact,
        fav,
        daily,
        valid_from,
        valid_until,
        next,
    } = *p;
    let skin = chrome::skin(cx);
    let id = series.id.clone();
    let back_label = match cal.ui.prev {
        View::Mias => "Mis carreras",
        View::Calendario => "Calendario",
        View::Eventos => "Eventos",
        _ => "Próximas",
    };
    let kind_line = if let Some(every) = series.every() {
        format!(
            "Diaria · cada {every} min · {} salidas al día",
            24 * 60 / every.max(1)
        )
    } else if series.event_kind == "special" {
        "Especial · fin de semana".to_owned()
    } else {
        "Semanal · tandas fijas".to_owned()
    };

    // Selector «Cambiar serie».
    let mut select = div()
        .relative()
        .flex_none()
        .w(px(if compact { 150.0 } else { 200.0 }))
        .child(
            div()
                .id("calendar-serie-select")
                .role(gpui::Role::Button)
                .aria_label("Cambiar serie")
                .tab_index(0)
                .h(px(34.0))
                .flex()
                .items_center()
                .gap(px(8.0))
                .px(px(10.0))
                .rounded(px(8.0))
                .border_1()
                .border_color(orbit::alpha(skin.line2))
                .bg(rgb(skin.l3))
                .cursor_pointer()
                .child(t("Cambiar serie", 13.0, 400, skin.text1, cx).flex_1())
                .child(icon("down", 14.0, skin.text1))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.ui.series_menu = !this.ui.series_menu;
                    cx.notify();
                })),
        );
    if cal.ui.series_menu {
        let mut menu = div()
            .id("calendar-serie-menu")
            .absolute()
            .top(px(38.0))
            .right_0()
            .w(px(260.0))
            .max_h(px(360.0))
            .overflow_y_scroll()
            .p(px(4.0))
            .rounded(px(8.0))
            .bg(rgb(skin.l2))
            .border_1()
            .border_color(orbit::alpha(skin.line2))
            .occlude();
        for (index, other) in schedule.series.iter().enumerate() {
            let sid = other.id.clone();
            let current = other.id == id;
            menu = menu.child(
                div()
                    .id(("calendar-serie-option", index))
                    .h(px(28.0))
                    .px(px(8.0))
                    .flex()
                    .items_center()
                    .rounded(px(6.0))
                    .cursor_pointer()
                    .when(current, |row| row.bg(rgb(skin.l3)))
                    .hover(|s| s.bg(orbit::alpha(skin.hover)))
                    .child(t(other.name.clone(), 12.5, 400, skin.text1, cx).truncate())
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.ui.series_menu = false;
                        this.open_serie(sid.clone(), cx);
                    })),
            );
        }
        select = select.child(gpui::deferred(menu).with_priority(orbit::MENU_Z));
    }
    let fid = id.clone();
    let fav_button = btn("calendar-serie-fav", "", false, cx)
        .when(fav, |b| {
            b.border_color(chrome::acc_line(cx)).bg(chrome::acc_bg(cx))
        })
        .child(star(fav, 15.0, cx))
        .child(t(
            if fav { "En favoritas" } else { "Favorita" },
            13.0,
            500,
            if fav { acct(cx) } else { skin.text1 },
            cx,
        ))
        .on_click(cx.listener(move |this, _, _, cx| this.toggle_fav(&fid, cx)));

    let header = div()
        .relative()
        .flex_none()
        .flex()
        .items_end()
        .gap(px(16.0))
        .child(
            div().absolute().left(px(-10.0)).top_0().child(
                btn("calendar-serie-back", "", true, cx)
                    .bg(gpui::hsla(0.0, 0.0, 0.0, 0.0))
                    .child(icon("chevron-left", 14.0, skin.text1))
                    .child(t(back_label, 12.5, 500, skin.text1, cx))
                    .on_click(cx.listener(|this, _, _, cx| this.back(cx))),
            ),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .pt(px(34.0))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .child(tier(&series, cx))
                        .child(t(kind_line, 12.5, 400, skin.cap, cx))
                        .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx))),
                )
                .child(disp(series.name.clone(), 34.0, skin.text1, cx).my(px(7.0)))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .flex_wrap()
                        .gap(px(10.0))
                        .child(t(
                            series.track_short().to_owned(),
                            13.0,
                            700,
                            skin.text2,
                            cx,
                        ))
                        .child(t(
                            series.track_layout().to_owned(),
                            13.0,
                            400,
                            skin.text3,
                            cx,
                        ))
                        .child(div().w(px(1.0)).h(px(12.0)).bg(orbit::alpha(skin.line3)))
                        .children(series.class_chips().iter().map(|c| class_chip(c, cx))),
                ),
        )
        .child(
            div()
                .flex_none()
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(select)
                .child(fav_button)
                .child(
                    btn_pri("calendar-serie-launch", &cal.launch_label(), false, cx)
                        .on_click(cx.listener(|this, _, _, cx| this.launch_profile(cx))),
                ),
        );

    header
}

#[allow(unused_variables, clippy::too_many_lines)]
fn outings_card(cal: &Calendar, p: &Page<'_>, cx: &mut Context<Calendar>) -> Div {
    let Page {
        series,
        schedule,
        now,
        zone,
        compact,
        fav,
        daily,
        valid_from,
        valid_until,
        next,
    } = *p;
    let skin = chrome::skin(cx);
    let id = series.id.clone();
    // Todas sus salidas.
    let minutes = series.minutes_of_hour();
    let mut left = chrome::card(cx)
        .flex_none()
        .px(px(16.0))
        .py(px(14.0))
        .overflow_hidden();
    if daily {
        let mut line = div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(8.0))
            .mb(px(12.0))
            .child(t(
                if minutes.is_empty() {
                    "Sale cada"
                } else {
                    "Sale a los minutos"
                },
                12.5,
                400,
                skin.text3,
                cx,
            ));
        for m in &minutes {
            line = line.child(
                div()
                    .px(px(6.0))
                    .py(px(2.0))
                    .rounded(px(5.0))
                    .bg(rgb(skin.l3))
                    .child(bold_mono(format!(":{m:02}"), 14.0, skin.text1, cx)),
            );
        }
        line = line.child(t(
            if minutes.is_empty() {
                format!("{} min, todo el día.", series.every().unwrap_or(0))
            } else {
                "de cada hora, todo el día y toda la semana.".to_owned()
            },
            12.5,
            400,
            skin.text3,
            cx,
        ));
        left = left
            .child(section_title("Todas sus salidas", Some(zone.long(now)), cx))
            .child(line)
            .child(heat_map(cal, &series, valid_from, now, cx))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(18.0))
                    .pt(px(8.0))
                    .child(legend_item(0, "Ya pasó", cx))
                    .child(legend_item(1, "Tu franja de aviso", cx))
                    .child(legend_item(2, "Ahora", cx)),
            )
            .child(
                div()
                    .mt(px(14.0))
                    .child(section_title("Próximas salidas", None, cx)),
            );
        let upcoming: Vec<_> = schedule
            .starts(&series, now, valid_until)
            .unwrap_or_default()
            .into_iter()
            .take(if compact { 9 } else { 12 })
            .collect();
        let mut chips = div().flex().flex_wrap().gap(px(6.0));
        for (i, at) in upcoming.iter().enumerate() {
            let (sid, at) = (id.clone(), *at);
            let alerted = cal.alerts.cause(&schedule, &series, at).is_some();
            chips = chips.child(
                pick_chip(
                    ("calendar-serie-next", i),
                    zone.hm(at),
                    next == Some(at),
                    alerted,
                    cx,
                )
                .on_click(
                    cx.listener(move |this, _, _, cx| this.open_ficha(sid.clone(), Some(at), cx)),
                ),
            );
        }
        left = left.child(chips);
    } else {
        left = left.child(section_title(
            "Todas sus tandas",
            Some(format!("Pulsa una para avisarte · {}", zone.long(now))),
            cx,
        ));
        let mut by_day: Vec<(String, Vec<DateTime<Utc>>)> = vec![];
        for at in schedule
            .starts(&series, valid_from, valid_until)
            .unwrap_or_default()
        {
            let label = zone.day_rel(at, now);
            match by_day.last_mut() {
                Some((l, v)) if *l == label => v.push(at),
                _ => by_day.push((label, vec![at])),
            }
        }
        let mut days = div().flex().flex_col().gap(px(6.0));
        for (label, starts) in by_day {
            let mut row = div().flex().flex_wrap().gap(px(6.0)).flex_1().min_w_0();
            for at in starts {
                let alerted = cal.alerts.slot_at(&series.id, at);
                let sid = series.id.clone();
                let upcoming = next == Some(at);
                let on_click = cx.listener(move |this, _, _, cx| {
                    this.toggle_slot_alert(&sid, at, cx);
                });
                row = row.child(
                    chrome::slot_chip(
                        ("calendar-serie-slot", at.timestamp() as usize & 0xfffff),
                        &zone.hm(at),
                        (at < now, upcoming, alerted),
                        None,
                        cx,
                    )
                    .on_click(on_click),
                );
            }
            days = days.child(
                div()
                    .flex()
                    .items_start()
                    .gap(px(12.0))
                    .child(
                        div()
                            .w(px(64.0))
                            .flex_none()
                            .pt(px(7.0))
                            .child(chrome::cap(&label, skin.cap, cx)),
                    )
                    .child(row),
            );
        }
        left = left.child(days);
    }
    let first = next.or_else(|| {
        schedule
            .starts(&series, valid_from, valid_until)
            .unwrap_or_default()
            .first()
            .copied()
    });
    left = left
        .child(
            div().mt(px(14.0)).child(section_title(
                "Así es cada salida",
                first.map(|a| format!("la de las {}", zone.hm(a))),
                cx,
            )),
        )
        .child(phase_block(&series, first, zone, cx));

    // Historial en esta serie.
    let mine: Vec<_> = cal.runs.iter().filter(|r| r.series_id == id).collect();
    let (races, best, average) = if mine.is_empty() {
        ("Ninguna".to_owned(), "—".to_owned(), "—".to_owned())
    } else {
        let n = mine.len();
        let best = mine
            .iter()
            .filter_map(|r| r.best_lap.clone())
            .min()
            .unwrap_or_else(|| "—".into());
        let position = mine.iter().map(|r| u32::from(r.position)).sum::<u32>() / n as u32;
        let sr = mine.iter().map(|r| i32::from(r.safety_tenths)).sum::<i32>();
        (
            format!("{n} carreras"),
            best,
            format!("P{position} · {:+} SR", sr / 10),
        )
    };
    let how = if daily { "Carreras diarias" } else { "Eventos" };
    let source = if series.is_fallback() {
        "Horario de RaceControl (respaldo): falta en la publicación oficial de LMU."
    } else {
        "Horario oficial de LMU"
    };
    let updated = chrono::DateTime::from_timestamp(cal.stamps.updated.max(cal.stamps.checked), 0)
        .map(|at| format!("{} {}", zone.day_rel(at, now), zone.hm(at)));
    left = left
        .child(
            div()
                .mt(px(16.0))
                .child(section_title(
                    "Tu historial en esta serie",
                    Some("telemetría local".to_owned()),
                    cx,
                ))
                .child(
                    div()
                        .flex()
                        .gap(px(8.0))
                        .child(chrome::fact("Esta semana", races, cx))
                        .child(chrome::fact("Mejor vuelta", best, cx))
                        .child(chrome::fact("Media", average, cx)),
                ),
        )
        .child(
            div()
                .mt(px(12.0))
                .flex()
                .flex_wrap()
                .gap(px(4.0))
                .child(t(
                    format!(
                        "{source}{} · En el simulador:",
                        updated.map_or_else(String::new, |u| format!(" · actualizado {u}"))
                    ),
                    11.5,
                    400,
                    skin.cap,
                    cx,
                ))
                .child(t(
                    format!("Multijugador › {how} › {}", series.name),
                    11.5,
                    600,
                    skin.text2,
                    cx,
                )),
        );

    left
}

#[allow(unused_variables, clippy::too_many_lines)]
fn alerts_card(cal: &Calendar, p: &Page<'_>, cx: &mut Context<Calendar>) -> Div {
    let Page {
        series,
        schedule,
        now,
        zone,
        compact,
        fav,
        daily,
        valid_from,
        valid_until,
        next,
    } = *p;
    let skin = chrome::skin(cx);
    let id = series.id.clone();
    // Avisos de esta serie.
    let alerts_body = if daily {
        band_box(cal, &series, cx)
    } else {
        let n = cal
            .alerts
            .slots
            .iter()
            .filter(|s| s.series_id == series.id)
            .count();
        div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .px(px(12.0))
            .py(px(10.0))
            .rounded(px(9.0))
            .border_1()
            .border_color(if n > 0 {
                chrome::acc_line(cx)
            } else {
                orbit::alpha(skin.line1)
            })
            .bg(if n > 0 {
                chrome::acc_bg(cx)
            } else {
                rgb(skin.l2).into()
            })
            .child(icon("bell-fill", 16.0, acct(cx)))
            .child(
                div()
                    .child(t(
                        format!("{n} tanda{} con aviso", if n == 1 { "" } else { "s" }),
                        13.0,
                        600,
                        skin.text1,
                        cx,
                    ))
                    .child(t(
                        "Pulsa una tanda a la izquierda para añadir o quitar.",
                        12.5,
                        400,
                        skin.text3,
                        cx,
                    )),
            )
    };
    let alerts_card = chrome::card(cx)
        .flex_none()
        .px(px(16.0))
        .py(px(14.0))
        .child(section_title("Avisos de esta serie", None, cx))
        .child(alerts_body);

    alerts_card
}

#[allow(unused_variables, clippy::too_many_lines)]
fn rules_card(p: &Page<'_>, cx: &mut Context<Calendar>) -> Div {
    let Page {
        series,
        schedule,
        now,
        zone,
        compact,
        fav,
        daily,
        valid_from,
        valid_until,
        next,
    } = *p;
    let skin = chrome::skin(cx);
    let id = series.id.clone();
    // Reglas y coches (diez pares).
    let phases = series.phases();
    let sessions = format!(
        "P {}′ · Q {}′ · R {}",
        phases[0].0,
        phases[1].0,
        clock::duration_txt(phases[2].0)
    );
    let cars = series
        .class_chips()
        .iter()
        .map(|c| c.extra.clone().unwrap_or_else(|| c.name.clone()))
        .collect::<Vec<_>>()
        .join(" · ");
    let dlc = series.track.contains("Silverstone") || series.track.contains("Road Atlanta");
    let rules = chrome::card(cx)
        .flex_none()
        .px(px(16.0))
        .py(px(14.0))
        .child(section_title("Reglas y coches", None, cx))
        .child(
            div()
                .grid()
                .grid_cols(2)
                .gap_x(px(18.0))
                .child(pair("Licencia", license_es(&series.license_label), cx))
                .child(pair(
                    "Seguridad",
                    if series.safety_rating.is_empty() {
                        "Sin requisito".to_owned()
                    } else {
                        series.safety_rating.replace("Player SR ", "SR ")
                    },
                    cx,
                ))
                .child(pair(
                    "Reglaje",
                    match series.setup.as_str() {
                        "fixed" => "Fijo".to_owned(),
                        "open" => "Libre".to_owned(),
                        "" => "—".to_owned(),
                        other => other.to_owned(),
                    },
                    cx,
                ))
                .child(pair("Ayudas", assists_es(&series.assists).to_owned(), cx))
                .child(pair(
                    "Calentadores",
                    if series.tyre_warmers { "Sí" } else { "No" }.to_owned(),
                    cx,
                ))
                .child(pair(
                    "Neumáticos",
                    series.tyres.map_or("—".into(), |n| n.to_string()),
                    cx,
                ))
                .child(pair("Sesiones", sessions, cx))
                .child(pair(
                    "Divisiones",
                    series.splits.map_or("—".into(), |n| format!("hasta {n}")),
                    cx,
                ))
                .child(pair("Coches", cars, cx))
                .child(pair(
                    "Contenido",
                    if dlc { "DLC · lo tienes" } else { "Incluido" }.to_owned(),
                    cx,
                )),
        );

    rules
}

#[allow(unused_variables, clippy::too_many_lines)]
fn rotation_card(cal: &Calendar, p: &Page<'_>, cx: &mut Context<Calendar>) -> Div {
    let Page {
        series,
        schedule,
        now,
        zone,
        compact,
        fav,
        daily,
        valid_from,
        valid_until,
        next,
    } = *p;
    let skin = chrome::skin(cx);
    let id = series.id.clone();
    // Circuito por semana: dos anteriores, la actual y la siguiente.
    let mut weeks: Vec<(DateTime<Utc>, String)> = cal
        .history
        .rotation(&series.id)
        .into_iter()
        .filter(|(from, _)| *from < valid_from)
        .collect();
    let skip = weeks.len().saturating_sub(2);
    weeks.drain(..skip);
    let mut cells: Vec<(String, String, u8)> = weeks
        .iter()
        .map(|(from, track)| (clock::week_title(&clock::week_days(*from)), track.clone(), 0))
        .collect();
    cells.push((
        clock::week_title(&clock::week_days(valid_from)),
        series.track_short().to_owned(),
        1,
    ));
    cells.push((
        clock::week_title(&clock::week_days(valid_from + Duration::days(7))),
        "Sin publicar".to_owned(),
        2,
    ));
    let mut rotation = div()
        .grid()
        .grid_cols(if compact { 2 } else { 4 })
        .gap(px(6.0));
    for (week, track, state) in cells {
        rotation = rotation.child(
            div()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(2.0))
                .px(px(10.0))
                .py(px(8.0))
                .rounded(px(8.0))
                .border_1()
                .border_color(if state == 1 {
                    chrome::acc_line(cx)
                } else {
                    orbit::alpha(skin.line1)
                })
                .bg(if state == 1 {
                    chrome::acc_bg(cx)
                } else {
                    rgb(skin.l2).into()
                })
                .when(state == 2, |c| {
                    c.bg(gpui::pattern_slash(orbit::alpha(skin.line1), 1.0, 8.0))
                })
                .child(t(week, 11.0, 400, skin.cap, cx))
                .child(
                    t(
                        track,
                        12.5,
                        if state == 2 { 500 } else { 700 },
                        match state {
                            1 => skin.text1,
                            2 => skin.cap,
                            _ => skin.text2,
                        },
                        cx,
                    )
                    .truncate(),
                ),
        );
    }
    let rotation_card = chrome::card(cx)
        .flex_none()
        .px(px(16.0))
        .py(px(14.0))
        .child(section_title("Circuito por semana", None, cx))
        .child(rotation);

    rotation_card
}

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let found = cal
        .schedule()
        .zip(cal.ui.serie.as_deref())
        .and_then(|(s, id)| s.by_id(id).map(|series| (s.clone(), series.clone())));
    let Some((schedule, series)) = found else {
        return chrome::card(cx).flex_1().child(center_message(
            "search",
            skin.text2,
            "Esta serie ya no está en el horario",
            "Vuelve a Próximas para ver las series de esta semana.",
            vec![
                btn("calendar-serie-back-empty", "Volver", false, cx)
                    .on_click(cx.listener(|this, _, _, cx| this.go(View::Proximas, cx))),
            ],
            cx,
        ));
    };
    let (valid_from, valid_until) = schedule.window().unwrap_or((now, now));
    let page_info = Page {
        series: &series,
        schedule: &schedule,
        now,
        zone,
        compact: cal.adapt.width < 1400.0,
        fav: rows::is_fav(cal.favorites(), &series),
        daily: rows::is_daily(&series),
        valid_from,
        valid_until,
        next: schedule.next_start(&series, now),
    };
    let p = &page_info;
    let header = header(cal, p, cx);
    let left = outings_card(cal, p, cx);
    let right = div()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(14.0))
        .child(alerts_card(cal, p, cx))
        .child(rules_card(p, cx))
        .child(rotation_card(cal, p, cx));
    let page = div()
        .id("calendar-serie")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .gap(px(14.0))
        .child(header)
        .child(
            div()
                .flex()
                .gap(px(14.0))
                .items_start()
                .child(grow(left, 1.35))
                .child(grow(right, 1.0)),
        );
    div().flex_1().min_h_0().flex().flex_col().child(page)
}

/// Siete días por 24 horas: lo ya pasado (rayado), tu franja de aviso y el ahora.
fn heat_map(
    cal: &Calendar,
    series: &super::super::Series,
    from: DateTime<Utc>,
    now: DateTime<Utc>,
    cx: &gpui::App,
) -> Div {
    let skin = chrome::skin(cx);
    let zone = cal.zone();
    let days = clock::week_days(from);
    let band = cal.alerts.band(&series.id);
    let mut map = div().flex().flex_col().gap(px(4.0));
    let mut labels = div().flex_1().flex().gap(px(2.0));
    for h in 0..24 {
        labels = labels.child(div().flex_1().min_w_0().h(px(14.0)).child(if h % 3 == 0 {
            mono(format!("{h:02}"), 10.0, skin.cap, cx)
        } else {
            div()
        }));
    }
    map = map.child(
        div()
            .flex()
            .items_center()
            .child(div().w(px(62.0)).flex_none())
            .child(labels),
    );
    for day in days {
        let start = zone.day_start(day);
        let is_today = zone.date(now) == day;
        let mut cells = div().flex_1().flex().gap(px(2.0));
        for h in 0..24 {
            let (a, b) = (start + Duration::hours(h), start + Duration::hours(h + 1));
            let past = b <= now;
            let current = now >= a && now < b;
            let in_band = band.is_some_and(|band| {
                let m = u16::try_from(chrono::Timelike::hour(&zone.naive(a)) * 60).unwrap_or(0);
                band.from <= m && m < band.to
            });
            cells = cells.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h(px(18.0))
                    .rounded(px(3.0))
                    .when(in_band, |c| {
                        c.bg(tint(chrome::acc(cx), if past { 0.3 } else { 0.75 }))
                    })
                    .when(!in_band && past, |c| {
                        c.bg(rgb(skin.l2)).child(
                            div()
                                .size_full()
                                .rounded(px(3.0))
                                .bg(gpui::pattern_slash(orbit::alpha(skin.line2), 1.0, 5.0)),
                        )
                    })
                    .when(!in_band && !past, |c| c.bg(rgb(skin.l3)))
                    .when(current, |c| c.border_2().border_color(rgb(skin.text1))),
            );
        }
        map = map.child(
            div()
                .flex()
                .items_center()
                .child(div().w(px(62.0)).flex_none().child(t(
                    if is_today {
                        "Hoy".to_owned()
                    } else {
                        format!("{} {}", day_name(day), chrono::Datelike::day(&day))
                    },
                    12.0,
                    600,
                    if is_today { acct(cx) } else { skin.text3 },
                    cx,
                )))
                .child(cells),
        );
    }
    map
}
