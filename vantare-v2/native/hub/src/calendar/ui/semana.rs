//! Semana LMU (martes a lunes): eventos con sus tandas por día y las series
//! diarias como una barra continua, con la línea de ahora y tus franjas.
use super::super::{
    Calendar, Schedule, Series,
    chrome::{
        self, Tone, acc, acc_bg, acc_line, bold_mono, btn, cap, center_message, disp, ib, icon,
        pill, t, tier, tint,
    },
    clock::{self, Zone, duration_txt},
    rows::{self, Week, WeekRow},
};
use super::{fav_seg, full_button, span_seg};
use crate::orbit;
use chrono::{DateTime, Duration, NaiveDate, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px, relative, rgb};

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    card(cal, false, cx)
}

/// `readonly`: la última semana publicada, tras caducar, sin acciones.
pub(super) fn card(cal: &Calendar, readonly: bool, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let now = cal.now();
    let zone = cal.zone();
    let compact = cal.adapt.width < 1400.0;
    let sc = if compact { 200.0 } else { 240.0 };
    let offset = if readonly { 0 } else { cal.ui.week };
    let start = if readonly {
        cal.last_week
            .as_ref()
            .and_then(|s| s.window().ok())
            .map_or_else(|| clock::week_start(now), |(from, _)| from)
    } else {
        clock::week_start(now) + Duration::days(7 * i64::from(offset))
    };
    let days = clock::week_days(start);
    let title = clock::week_title(&days);
    let source: Option<&Schedule> = if readonly {
        cal.last_week.as_ref()
    } else {
        [
            cal.current.as_ref(),
            cal.last_week.as_ref(),
            cal.previous.as_ref(),
        ]
        .into_iter()
        .flatten()
        .find(|s| s.window().is_ok_and(|(from, _)| from == start))
    };
    let current_week = offset == 0 && !readonly;
    let past_week = start < clock::week_start(now);
    let readonly = readonly || (past_week && source.is_some());

    // Barra superior
    let bar = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(8.0))
        .px(px(14.0))
        .py(px(12.0));
    let bar = if readonly {
        bar.child(disp(format!("Semana pasada · {title}"), 19.0, skin.text1, cx).flex_none())
            .child(pill("Solo consulta", Tone::Neutral, cx))
            .child(t(
                "por si quieres repasar qué corriste",
                12.0,
                400,
                skin.cap,
                cx,
            ))
            .child(div().flex_1())
            .when(cal.ui.week < 0 && cal.schedule().is_some(), |b| {
                b.child(
                    btn("calendar-week-today", "Hoy", true, cx).on_click(cx.listener(
                        |this, _, _, cx| {
                            this.ui.week = 0;
                            cx.notify();
                        },
                    )),
                )
            })
    } else {
        bar.child(
            ib(
                "calendar-week-prev",
                "chevron-left",
                "Semana anterior",
                false,
                false,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.week -= 1;
                cx.notify();
            })),
        )
        .child(
            disp(format!("Semana {title}"), 19.0, skin.text1, cx)
                .min_w(px(128.0))
                .text_center(),
        )
        .child(
            ib(
                "calendar-week-next",
                "right",
                "Semana siguiente",
                false,
                false,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.week = (this.ui.week + 1).min(1);
                cx.notify();
            })),
        )
        .child(
            btn("calendar-week-today", "Hoy", true, cx)
                .when(offset == 0, |b| b.opacity(0.45))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.ui.week = 0;
                    cx.notify();
                })),
        )
        .when(!compact, |bar| {
            bar.child(div().min_w(px(92.0)).flex_shrink(1.0).child(t(
                "mar → lun, como publica LMU",
                12.0,
                400,
                skin.cap,
                cx,
            )))
        })
        .child(div().flex_1())
        .child(full_button(cal, cx))
        .child(span_seg(cal, cx))
        .child(fav_seg(cal, None, cx))
    };

    // Semana sin publicar
    let Some(schedule) = source else {
        let next_title = title.clone();
        let back = clock::week_title(&clock::week_days(clock::week_start(now)));
        let body = if past_week {
            center_message(
                "v-calendar",
                skin.text2,
                &format!("No tenemos guardada la semana {title}"),
                "Solo guardamos las últimas semanas que publicó LMU en este equipo.",
                vec![
                    btn("calendar-week-back", "Volver a esta semana", false, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.ui.week = 0;
                            cx.notify();
                        }),
                    ),
                ],
                cx,
            )
        } else {
            center_message(
                "v-calendar",
                skin.text2,
                &format!("LMU aún no ha publicado la semana {next_title}"),
                "Suele llegar el lunes por la mañana. La buscamos sola cada 15 minutos; tus favoritas y avisos pasan a la nueva semana sin hacer nada.",
                vec![
                    btn("calendar-week-back", "", false, cx)
                        .aria_label(format!("Volver a {back}"))
                        .child(icon("chevron-left", 15.0, skin.text1))
                        .child(t(format!("Volver a {back}"), 13.0, 500, skin.text1, cx))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.ui.week = (this.ui.week - 1).max(-1);
                            cx.notify();
                        })),
                    btn("calendar-week-refresh", "", false, cx)
                        .aria_label("Buscar ahora")
                        .child(icon("refresh", 15.0, skin.text1))
                        .child(t("Buscar ahora", 13.0, 500, skin.text1, cx))
                        .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))),
                ],
                cx,
            )
        };
        return chrome::card(cx)
            .flex_1()
            .child(bar)
            .child(day_header(&days, now, zone, sc, false, cx))
            .child(body);
    };

    let week = rows::week(
        schedule,
        start,
        now,
        zone,
        cal.favorites(),
        cal.ui.filter.only_favs,
    );
    let today = (current_week && !readonly)
        .then(|| days.iter().position(|d| *d == zone.date(now)))
        .flatten();
    let mut content = div().relative().flex().flex_col().min_h_full();
    if let Some(_today) = today {
        let f = rows::fraction(now, week.from, week.to);
        content = content.child(
            div()
                .absolute()
                .top_0()
                .bottom_0()
                .left(px(sc))
                .right_0()
                .child(
                    div()
                        .absolute()
                        .top_0()
                        .bottom_0()
                        .left(relative(f))
                        .ml(px(-1.0))
                        .w(px(2.0))
                        .bg(rgb(acc(cx))),
                ),
        );
    }
    content = content.child(group("Semanales y especiales", "· tandas fijas", cx));
    for row in &week.events {
        content = content.child(event_row(
            cal, schedule, &week, row, today, readonly, sc, cx,
        ));
    }
    content = content.child(group(
        "Diarias",
        if readonly {
            "· mismo circuito toda la semana"
        } else {
            "· mismo circuito toda la semana; la marca roja es tu próxima salida"
        },
        cx,
    ));
    for row in &week.daily {
        content = content.child(daily_row(
            cal, schedule, &week, row, today, readonly, sc, cx,
        ));
    }
    let body = div()
        .id("calendar-week-rows")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .when(readonly, |b| b.opacity(0.72))
        .child(content);
    chrome::card(cx)
        .flex_1()
        .child(bar)
        .child(day_header(
            &days,
            now,
            zone,
            sc,
            today.is_some() || !readonly,
            cx,
        ))
        .child(body)
        .when(!readonly, |card| card.child(legend(cx)))
}

fn group(label: &str, extra: &str, cx: &gpui::App) -> Div {
    chrome::group_row(label, extra, cx)
}

fn day_header(
    days: &[NaiveDate; 7],
    now: DateTime<Utc>,
    zone: Zone,
    sc: f32,
    highlight_today: bool,
    cx: &gpui::App,
) -> Div {
    let skin = chrome::skin(cx);
    let today = zone.date(now);
    div()
        .flex_none()
        .flex()
        .border_t_1()
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(
            div()
                .w(px(sc))
                .flex_none()
                .flex()
                .items_center()
                .px(px(14.0))
                .child(cap("Serie", skin.cap, cx)),
        )
        .children(days.iter().map(|day| {
            let is_today = highlight_today && *day == today;
            let past = zone.day_start(*day + Duration::days(1)) <= now;
            div()
                .flex_1()
                .min_w_0()
                .h(px(44.0))
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .border_l_1()
                .border_color(orbit::alpha(skin.line1))
                .relative()
                .when(is_today, |d| {
                    d.bg(acc_bg(cx)).child(
                        div()
                            .absolute()
                            .bottom_0()
                            .left_0()
                            .right_0()
                            .h(px(2.0))
                            .bg(rgb(acc(cx))),
                    )
                })
                .child(cap(
                    &if is_today {
                        "Hoy".to_owned()
                    } else {
                        clock::day_name(*day).to_uppercase()
                    },
                    if is_today { chrome::acct(cx) } else { skin.cap },
                    cx,
                ))
                .child(disp(
                    chrono::Datelike::day(day).to_string(),
                    19.0,
                    if past { skin.text3 } else { skin.text1 },
                    cx,
                ))
        }))
}

fn legend(cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    let item = |swatch: Div, label: &str| {
        div()
            .flex()
            .items_center()
            .gap(px(7.0))
            .child(swatch)
            .child(t(label.to_owned(), 11.5, 400, skin.text3, cx))
    };
    div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(18.0))
        .px(px(14.0))
        .py(px(9.0))
        .border_t_1()
        .border_color(orbit::alpha(skin.line1))
        .child(item(next_marker("20:00", false, cx), "Tu próxima salida"))
        .child(item(time_chip("22:00", Chip::Bell, cx), "Tanda con aviso"))
        .child(item(
            div()
                .w(px(22.0))
                .h(px(12.0))
                .rounded(px(3.0))
                .bg(tint(acc(cx), 0.32)),
            "Tu franja de aviso",
        ))
        .child(item(div().w(px(2.0)).h(px(14.0)).bg(rgb(acc(cx))), "Ahora"))
        .child(div().flex_1())
        .child(t(
            "Pulsa una serie para ver todas sus salidas",
            11.5,
            400,
            skin.text3,
            cx,
        ))
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Chip {
    Fav,
    Bell,
    Next,
}

/// Hora pequeña de una tanda (`.tm`).
pub(super) fn time_chip(label: &str, kind: Chip, cx: &gpui::App) -> Div {
    time_chip_sized(label, kind, false, cx)
}

/// `.tm` en su tamaño de lista (Mis carreras): 22 px y mono de 11 px.
pub(super) fn time_chip_sized(label: &str, kind: Chip, big: bool, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    let (bg, fg, ring): (gpui::Background, u32, Option<gpui::Hsla>) = match kind {
        Chip::Bell => (orbit::ramp(skin.button, 180.0), 0x00ff_ffff, None),
        Chip::Fav => (acc_bg(cx).into(), skin.text1, Some(acc_line(cx))),
        Chip::Next => (
            rgb(skin.l2).into(),
            skin.text1,
            Some(orbit::alpha(skin.text2)),
        ),
    };
    div()
        .h(px(if big { 22.0 } else { 18.0 }))
        .flex_none()
        .flex()
        .items_center()
        .gap(px(3.0))
        .px(px(if big { 5.0 } else { 4.0 }))
        .rounded(px(5.0))
        .bg(bg)
        .when_some(ring, |c, ring| c.border_1().border_color(ring))
        .when(kind == Chip::Bell, |c| c.child(icon("bell-fill", 9.0, fg)))
        .child(
            orbit::mono_text(label.to_owned(), if big { 11.0 } else { 10.5 }, fg, cx)
                .when(kind == Chip::Next, |s| {
                    s.font_weight(gpui::FontWeight(700.0))
                })
                .whitespace_nowrap(),
        )
}

/// Marca de tu próxima salida sobre la barra de una diaria.
fn next_marker(label: &str, bell: bool, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    div()
        .h(px(22.0))
        .flex_none()
        .flex()
        .items_center()
        .gap(px(4.0))
        .px(px(7.0))
        .rounded(px(5.0))
        .bg(orbit::ramp(skin.button, 180.0))
        .when(bell, |m| m.child(icon("bell-fill", 10.0, 0x00ff_ffff)))
        .child(bold_mono(label.to_owned(), 11.5, 0x00ff_ffff, cx))
}

fn series_cell(
    cal: &Calendar,
    series: &Series,
    fav: bool,
    sc: f32,
    readonly: bool,
    cx: &mut Context<Calendar>,
) -> Div {
    let skin = chrome::skin(cx);
    let key = series.id.len() * 1000 + series.name.len();
    let name_id = series.id.clone();
    let fav_id = series.id.clone();
    div()
        .w(px(sc))
        .flex_none()
        .flex()
        .items_center()
        .gap(px(8.0))
        .pl(px(12.0))
        .pr(px(10.0))
        .py(px(4.0))
        .when(fav, |c| {
            c.child(
                div()
                    .absolute()
                    .left_0()
                    .top_0()
                    .bottom_0()
                    .w(px(3.0))
                    .bg(rgb(acc(cx))),
            )
        })
        .when(!readonly, |c| {
            c.child(
                ib(
                    ("calendar-week-fav", key),
                    "star",
                    if fav {
                        "Quitar de favoritas"
                    } else {
                        "Añadir a favoritas"
                    },
                    true,
                    fav,
                    cx,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    cx.stop_propagation();
                    this.toggle_fav(&fav_id, cx);
                })),
            )
        })
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .child(
                            t(series.name.clone(), 13.0, 600, skin.text1, cx)
                                .truncate()
                                .id(("calendar-week-name", key))
                                .when(!readonly, |n| {
                                    n.cursor_pointer().hover(gpui::Styled::underline).on_click(
                                        cx.listener(move |this, _, _, cx| {
                                            cx.stop_propagation();
                                            this.open_serie(name_id.clone(), cx);
                                        }),
                                    )
                                }),
                        )
                        .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx))),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.0))
                        .child(tier(series, cx))
                        .child(
                            t(
                                format!(
                                    "{} · {}",
                                    series.track_short(),
                                    duration_txt(series.race_minutes())
                                ),
                                11.5,
                                400,
                                skin.text3,
                                cx,
                            )
                            .truncate(),
                        ),
                ),
        )
        .map(|c| {
            let _ = cal;
            c
        })
}

/// Fondo de las siete columnas de día, con la de hoy resaltada.
fn day_cells(today: Option<usize>, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    div().absolute().inset_0().flex().children((0..7).map(|i| {
        div()
            .flex_1()
            .h_full()
            .border_l_1()
            .border_color(orbit::alpha(skin.line1))
            .when(Some(i) == today, |c| c.bg(acc_bg(cx)))
    }))
}

#[allow(clippy::too_many_arguments)]
fn daily_row(
    cal: &Calendar,
    schedule: &Schedule,
    week: &Week<'_>,
    row: &WeekRow<'_>,
    today: Option<usize>,
    readonly: bool,
    sc: f32,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let skin = chrome::skin(cx);
    let series = row.series;
    let now = cal.now();
    let zone = cal.zone();
    let key = series.id.len() * 1000 + series.name.len();
    let every = series.every().unwrap_or(0);
    let (valid_from, valid_to) = schedule.window().unwrap_or((week.from, week.to));
    let (a, b) = (valid_from.max(week.from), valid_to.min(week.to));
    let af = rows::fraction(a, week.from, week.to);
    let bf = rows::fraction(b, week.from, week.to);
    let n = now.clamp(a, b);
    let past = (n - a).num_seconds() as f32 / (b - a).num_seconds().max(1) as f32;
    let open_id = series.id.clone();
    let mut bar = div()
        .absolute()
        .top_0()
        .bottom_0()
        .left(relative(af))
        .w(relative(bf - af))
        .overflow_hidden()
        .rounded(px(6.0))
        .flex()
        .items_center()
        .justify_end()
        .bg(if row.fav {
            acc_bg(cx)
        } else {
            rgb(skin.l2).into()
        })
        .border_1()
        .border_color(if row.fav {
            acc_line(cx)
        } else {
            orbit::alpha(skin.line2)
        });
    if !readonly {
        bar = bar.child(
            div()
                .absolute()
                .left_0()
                .top_0()
                .bottom_0()
                .w(relative(past))
                .bg(gpui::pattern_slash(orbit::alpha(skin.line1), 1.0, 8.0))
                .border_r_1()
                .border_color(orbit::alpha(skin.line2)),
        );
        if let Some(band) = cal.alerts.band(&series.id) {
            for day in &week.days {
                let day_start = Zone::Local.day_start(*day);
                let from = (day_start + Duration::minutes(i64::from(band.from))).clamp(a, b);
                let to = (day_start + Duration::minutes(i64::from(band.to))).clamp(a, b);
                if to > from {
                    let span = (b - a).num_seconds().max(1) as f32;
                    bar = bar.child(
                        div()
                            .absolute()
                            .top(px(3.0))
                            .bottom(px(3.0))
                            .left(relative((from - a).num_seconds() as f32 / span))
                            .w(relative((to - from).num_seconds() as f32 / span))
                            .rounded(px(3.0))
                            .bg(tint(acc(cx), 0.32)),
                    );
                }
            }
        }
    }
    bar = bar.child(
        t(
            format!("Cada {every} min, todo el día"),
            12.0,
            400,
            skin.text2,
            cx,
        )
        .mx(px(8.0))
        .whitespace_nowrap(),
    );
    let mut span =
        div()
            .absolute()
            .inset_0()
            .child(div().relative().size_full().child(bar).when_some(
                row.next.filter(|_| row.fav && !readonly),
                |s, next| {
                    let alerted = cal.alerts.cause(schedule, series, next).is_some();
                    s.child(
                        div()
                            .absolute()
                            .top(px(-0.0))
                            .left(relative(rows::fraction(next, week.from, week.to)))
                            .ml(px(-26.0))
                            .child(next_marker(&zone.hm(next), alerted, cx)),
                    )
                },
            ));
    span = span.px(px(0.0));
    let row_height = 40.0;
    let mut row_el = div()
        .id(("calendar-week-daily", key))
        .relative()
        .flex_none()
        .flex()
        .min_h(px(row_height))
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .when(!readonly, |r| {
            r.cursor_pointer()
                .hover(move |s| s.bg(orbit::alpha(skin.hover)))
                .on_click(
                    cx.listener(move |this, _, _, cx| this.open_ficha(open_id.clone(), None, cx)),
                )
        })
        .child(series_cell(cal, series, row.fav, sc, readonly, cx));
    row_el = row_el.child(
        div()
            .relative()
            .flex_1()
            .min_w_0()
            .child(day_cells(today, cx))
            .child(
                div()
                    .absolute()
                    .top(px(7.0))
                    .bottom(px(7.0))
                    .left_0()
                    .right_0()
                    .child(span),
            ),
    );
    row_el
}

#[allow(clippy::too_many_arguments)]
fn event_row(
    cal: &Calendar,
    schedule: &Schedule,
    week: &Week<'_>,
    row: &WeekRow<'_>,
    today: Option<usize>,
    readonly: bool,
    sc: f32,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let skin = chrome::skin(cx);
    let series = row.series;
    let now = cal.now();
    let zone = cal.zone();
    let key = series.id.len() * 1000 + series.name.len();
    let open_id = series.id.clone();
    let mut days = div().relative().flex_1().min_w_0().flex();
    days = days.child(day_cells(today, cx));
    for (index, starts) in row.per_day.iter().enumerate() {
        let day = week.days[index];
        let (d0, d1) = (zone.day_start(day), zone.day_start(day + Duration::days(1)));
        let mut cell = div()
            .relative()
            .flex_1()
            .min_w_0()
            .h_full()
            .flex()
            .flex_col()
            .justify_center()
            .gap(px(5.0))
            .px(px(8.0))
            .py(px(7.0));
        if starts.is_empty() {
            days = days.child(cell);
            continue;
        }
        let mut track = div()
            .relative()
            .h(px(6.0))
            .rounded(px(3.0))
            .bg(rgb(skin.l3));
        let mut tags = vec![];
        for start in starts {
            let gone = *start < now || readonly;
            let is_next = row.next == Some(*start) && !readonly;
            let alerted = !readonly && cal.alerts.cause(schedule, series, *start).is_some();
            if is_next || alerted {
                tags.push((*start, alerted));
            }
            let size = if is_next || alerted { 9.0 } else { 7.0 };
            let f = (*start - d0).num_seconds() as f32 / (d1 - d0).num_seconds().max(1) as f32;
            let dot_color = if alerted {
                skin.accent
            } else if row.fav {
                skin.accent_bright
            } else {
                skin.text3
            };
            track = track.child(
                div()
                    .absolute()
                    .top_1_2()
                    .mt(px(-size / 2.0))
                    .left(relative(f))
                    .ml(px(-size / 2.0))
                    .size(px(size))
                    .rounded_full()
                    .bg(rgb(dot_color))
                    .when(gone, |d| d.opacity(0.35))
                    .when(is_next || alerted, |d| {
                        d.border_2().border_color(rgb(if alerted {
                            skin.accent
                        } else {
                            skin.text1
                        }))
                    }),
            );
        }
        cell = cell.child(track).child(
            div()
                .h(px(18.0))
                .flex()
                .items_center()
                .justify_center()
                .gap(px(3.0))
                .overflow_hidden()
                .child(if let Some((first, alerted)) = tags.first().copied() {
                    div()
                        .flex()
                        .gap(px(3.0))
                        .items_center()
                        .child(time_chip(
                            &zone.hm(first),
                            if alerted { Chip::Bell } else { Chip::Next },
                            cx,
                        ))
                        .when(tags.len() > 1, |d| {
                            d.child(t(format!("+{}", tags.len() - 1), 11.0, 400, skin.cap, cx))
                        })
                } else {
                    div().child(t(
                        format!(
                            "{} {}",
                            starts.len(),
                            if starts.len() == 1 { "tanda" } else { "tandas" }
                        ),
                        11.0,
                        400,
                        skin.cap,
                        cx,
                    ))
                }),
        );
        days = days.child(cell);
    }
    div()
        .id(("calendar-week-event", key))
        .relative()
        .flex_none()
        .flex()
        .min_h(px(50.0))
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .when(!readonly, |r| {
            r.cursor_pointer()
                .hover(move |s| s.bg(orbit::alpha(skin.hover)))
                .on_click(
                    cx.listener(move |this, _, _, cx| this.open_ficha(open_id.clone(), None, cx)),
                )
        })
        .child(series_cell(cal, series, row.fav, sc, readonly, cx))
        .child(days)
}
