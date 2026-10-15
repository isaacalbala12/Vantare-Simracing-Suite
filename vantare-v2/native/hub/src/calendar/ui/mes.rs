//! Mes: cuadrícula de semanas LMU (martes a lunes) con su estado y su densidad.
use super::super::{
    Calendar, Health, Schedule,
    chrome::{self, Tone, acc, acc_bg, acct, bold_mono, cap, disp, ib, icon, pill, skin, t},
    clock, rows,
};
use super::{full_button, span_seg};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use gpui::{Context, Div, div, prelude::*, px, relative, rgb};

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Past,
    Now,
    Waiting,
    Unpublished,
    Unsaved,
}

/// Salidas por hora que llenan la barra entera de la minigráfica.
const DENSITY_MAX: f32 = 40.0;

#[allow(clippy::too_many_lines)] // Cabecera, cuadrícula de cinco semanas y leyenda.
pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let compact = cal.adapt.width < 1400.0;
    let today = zone.date(now);
    let first_of_month = today
        .with_day(1)
        .and_then(|d| {
            let months = cal.ui.month;
            let index = d.year() * 12 + d.month0() as i32 + months;
            NaiveDate::from_ymd_opt(index.div_euclid(12), (index.rem_euclid(12) + 1) as u32, 1)
        })
        .unwrap_or(today);
    let next_month = if first_of_month.month() == 12 {
        NaiveDate::from_ymd_opt(first_of_month.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(first_of_month.year(), first_of_month.month() + 1, 1)
    }
    .unwrap_or(first_of_month);
    // Semanas LMU (martes) que cubren el mes.
    let mut start = first_of_month;
    while start.weekday() != chrono::Weekday::Tue {
        start -= Duration::days(1);
    }
    let weeks: Vec<NaiveDate> =
        std::iter::successors(Some(start), |d| Some(*d + Duration::days(7)))
            .take_while(|d| *d < next_month)
            .collect();
    let current_start = clock::week_start(now);
    let schedules: Vec<&Schedule> = [
        cal.current.as_ref(),
        cal.last_week.as_ref(),
        cal.previous.as_ref(),
    ]
    .into_iter()
    .flatten()
    .collect();
    let schedule_of = |week: NaiveDate| {
        schedules
            .iter()
            .copied()
            .find(|s| s.window().is_ok_and(|(from, _)| from.date_naive() == week))
    };

    let title = format!(
        "{} {}",
        month_label(first_of_month.month()),
        first_of_month.year()
    );
    let bar = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(10.0))
        .px(px(16.0))
        .py(px(12.0))
        .child(
            ib(
                "calendar-month-prev",
                "chevron-left",
                "Mes anterior",
                false,
                false,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.month -= 1;
                cx.notify();
            })),
        )
        .child(
            disp(title, 19.0, skin.text1, cx)
                .min_w(px(if compact { 150.0 } else { 170.0 }))
                .text_center(),
        )
        .child(
            ib(
                "calendar-month-next",
                "right",
                "Mes siguiente",
                false,
                false,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.month += 1;
                cx.notify();
            })),
        )
        .child(
            chrome::btn("calendar-month-today", "Hoy", true, cx).on_click(cx.listener(
                |this, _, _, cx| {
                    this.ui.month = 0;
                    cx.notify();
                },
            )),
        )
        .when(!compact, |bar| {
            bar.child(t(
                "semanas LMU, de martes a lunes",
                12.0,
                400,
                skin.cap,
                cx,
            ))
        })
        .child(div().flex_1())
        .child(full_button(cal, cx))
        .child(span_seg(cal, cx));

    let week_w = if compact { 104.0 } else { 132.0 };
    let header = div()
        .flex_none()
        .flex()
        .border_t_1()
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(div().w(px(week_w)).flex_none())
        .children(["MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM", "LUN"].map(|d| {
            div()
                .flex_1()
                .h(px(30.0))
                .flex()
                .items_center()
                .justify_center()
                .child(cap(d, skin.cap, cx))
        }));

    let mut grid = div().flex_1().min_h_0().flex().flex_col();
    for (row_index, week) in weeks.iter().enumerate() {
        let schedule = schedule_of(*week);
        let state = if *week == current_start.date_naive() {
            State::Now
        } else if *week < current_start.date_naive() {
            if schedule.is_some() {
                State::Past
            } else {
                State::Unsaved
            }
        } else if schedule.is_none()
            && *week == current_start.date_naive() + Duration::days(7)
            && cal.health() == Health::Expired
        {
            State::Waiting
        } else {
            State::Unpublished
        };
        let (label, tone, note) = match state {
            State::Past => ("Pasada", Tone::Neutral, "desde tu caché"),
            State::Now => ("Esta semana", Tone::Acc, ""),
            State::Waiting => ("Esperando", Tone::Warn, "LMU publica cada lunes"),
            State::Unpublished => ("Sin publicar", Tone::Neutral, "LMU publica cada lunes"),
            State::Unsaved => ("Sin guardar", Tone::Neutral, ""),
        };
        let last_day = *week + Duration::days(6);
        let range = if compact {
            format!("{} {}", week.day(), month_short(week.month()))
        } else {
            format!(
                "{} {} – {} {}",
                week.day(),
                month_short(week.month()),
                last_day.day(),
                month_short(last_day.month())
            )
        };
        let mut row = div()
            .relative()
            .min_h(px(60.0))
            .flex()
            .border_b_1()
            .border_color(orbit::alpha(skin.line1))
            .child(
                div()
                    .w(px(week_w))
                    .flex_none()
                    .px(px(12.0))
                    .py(px(10.0))
                    .gap(px(5.0))
                    .flex()
                    .flex_col()
                    .items_start()
                    .when(state == State::Now, |c| {
                        c.border_l_2()
                            .border_color(rgb(acc(cx)))
                            .bg(acc_bg(cx))
                    })
                    .child(disp(range, 15.0, skin.text1, cx))
                    .child(pill(label, tone, cx))
                    .when(!compact && !note.is_empty(), |c| {
                        c.child(t(note, 11.0, 400, skin.cap, cx))
                    }),
            );
        // Las dos primeras semanas ocupan más; las demás van más bajas.
        row = row.flex_basis(relative(0.0));
        row.style().flex_grow = Some(if row_index < 2 { 1.0 } else { 0.6 });
        let past_week = *week < current_start.date_naive();
        for offset in 0..7 {
            let day = *week + Duration::days(offset);
            let is_today = day == today;
            let outside = day.month() != first_of_month.month();
            let (a, b) = (zone.day_start(day), zone.day_start(day + Duration::days(1)));
            let mut cell = div()
                .flex_1()
                .min_w_0()
                .relative()
                .flex()
                .flex_col()
                .gap(px(5.0))
                .py(px(7.0))
                .border_l_1()
                .border_color(orbit::alpha(skin.line1))
                .when(is_today, |c| {
                    c.border_2().border_color(rgb(acc(cx))).bg(acc_bg(cx))
                })
                .when(schedule.is_none(), |c| c.bg(chrome::stripe(cx)));
            let ran = cal
                .runs
                .iter()
                .filter(|r| zone.date(r.at) == day)
                .count();
            let alerts = schedule
                .filter(|_| state == State::Now)
                .map_or(0, |s| day_alerts(cal, s, a.max(now), b));
            let mut head = div().flex().items_center().gap(px(4.0)).px(px(8.0));
            head = head.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .flex_1()
                    .when(is_today, |d| d.child(cap("Hoy", acct(cx), cx)))
                    .child(disp(
                        day.day().to_string(),
                        17.0,
                        if outside { skin.cap } else { skin.text1 },
                        cx,
                    )),
            );
            if ran > 0 {
                head = head.child(
                    day_pill(
                        chrome::tint(skin.ok, 0.13).into(),
                        chrome::ok_text(cx),
                        "check",
                        ran,
                        cx,
                    ),
                );
            }
            if alerts > 0 {
                head = head.child(day_pill(
                    orbit::ramp(skin.button, 180.0).into(),
                    0x00ff_ffff,
                    "bell-fill",
                    alerts,
                    cx,
                ));
            }
            cell = cell.child(head);
            if let Some(schedule) = schedule {
                // Reserva la línea de los eventos, que se dibuja encima de toda la fila.
                let events = schedule
                    .series
                    .iter()
                    .filter(|s| !rows::is_daily(s))
                    .filter(|s| schedule.starts(s, a, b).is_ok_and(|v| !v.is_empty()))
                    .count();
                cell = cell.child(div().h(px(23.0 * events as f32)).flex_none());
                let (density, total) = density(schedule, a, now, cx);
                cell = cell.child(density);
                if !compact {
                    cell = cell.child(
                        div()
                            .px(px(8.0))
                            .when(a + Duration::hours(24) <= now, |d| d.opacity(0.55))
                            .child(chrome::mono(
                                format!("{total} salidas"),
                                10.5,
                                skin.cap,
                                cx,
                            )),
                    );
                }
            }
            row = row.child(cell);
        }
        if let Some(schedule) = schedule {
            row = row.child(event_bars(schedule, *week, week_w, (zone, past_week), cx));
        }
        grid = grid.child(row);
    }

    let legend = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(18.0))
        .px(px(14.0))
        .py(px(9.0))
        .border_t_1()
        .border_color(orbit::alpha(skin.line1))
        .child(legend_bar("WEC Weekly", false, cx))
        .child(t("Semanal", 11.5, 400, skin.text3, cx))
        .child(legend_bar("10 Hours", true, cx))
        .child(t("Especial", 11.5, 400, skin.text3, cx))
        .child(
            div()
                .w(px(22.0))
                .h(px(14.0))
                .flex()
                .items_end()
                .gap(px(1.0))
                .child(div().flex_1().h(relative(0.6)).bg(orbit::alpha(skin.line3)))
                .child(div().flex_1().h(relative(0.9)).bg(rgb(acc(cx))))
                .child(div().flex_1().h(relative(0.6)).bg(orbit::alpha(skin.line3))),
        )
        .child(div().min_w_0().child(t(
            if compact {
                "Salidas por hora"
            } else {
                "Salidas por hora (rojo: tandas de evento)"
            },
            11.5,
            400,
            skin.text3,
            cx,
        )))
        .child(day_pill(
            chrome::tint(skin.ok, 0.13).into(),
            chrome::ok_text(cx),
            "check",
            3,
            cx,
        ))
        .child(div().min_w_0().child(t(
            if compact {
                "Corridas"
            } else {
                "Carreras que corriste"
            },
            11.5,
            400,
            skin.text3,
            cx,
        )))
        .child(day_pill(
            orbit::ramp(skin.button, 180.0).into(),
            0x00ff_ffff,
            "bell-fill",
            2,
            cx,
        ))
        .child(t("Avisos", 11.5, 400, skin.text3, cx));

    chrome::card(cx)
        .flex_1()
        .child(bar)
        .child(header)
        .child(grid)
        .child(legend)
}

fn legend_bar(label: &str, special: bool, cx: &gpui::App) -> Div {
    let skin = skin(cx);
    div()
        .h(px(20.0))
        .px(px(8.0))
        .flex()
        .items_center()
        .rounded(px(5.0))
        .when(special, |d| d.bg(orbit::ramp(skin.button, 180.0)))
        .when(!special, |d| {
            d.bg(acc_bg(cx))
                .border_1()
                .border_color(chrome::acc_line(cx))
        })
        .child(t(
            label.to_owned(),
            11.0,
            600,
            if special { 0x00ff_ffff } else { chrome::acct(cx) },
            cx,
        ))
}

/// Pastilla de recuento de un día (`.mpill`): corridas en verde, avisos en carmín.
fn day_pill(
    bg: gpui::Background,
    color: u32,
    glyph: &'static str,
    count: usize,
    cx: &gpui::App,
) -> Div {
    div()
        .h(px(18.0))
        .px(px(5.0))
        .flex()
        .flex_none()
        .items_center()
        .gap(px(3.0))
        .rounded(px(5.0))
        .bg(bg)
        .child(icon(glyph, 10.0, color))
        .child(bold_mono(count.to_string(), 10.5, color, cx))
}

/// Barras continuas de los eventos de la semana, encima de las siete celdas.
fn event_bars(
    schedule: &Schedule,
    week: NaiveDate,
    week_w: f32,
    (zone, past_week): (clock::Zone, bool),
    cx: &gpui::App,
) -> Div {
    let skin = skin(cx);
    let mut layer = div()
        .absolute()
        .top(px(31.0))
        .left(px(week_w))
        .right_0()
        .h(px(60.0));
    let mut lane = 0.0_f32;
    for series in schedule.series.iter().filter(|s| !rows::is_daily(s)) {
        // Días de la semana con tandas de esta serie.
        let mut present = [false; 7];
        for (offset, slot) in present.iter_mut().enumerate() {
            let day = week + Duration::days(offset as i64);
            let (a, b) = (zone.day_start(day), zone.day_start(day + Duration::days(1)));
            *slot = schedule.starts(series, a, b).is_ok_and(|v| !v.is_empty());
        }
        let special = series.kind() == crate::calendar::model::Kind::Special;
        let mut offset = 0;
        let mut drew = false;
        while offset < 7 {
            if !present[offset] {
                offset += 1;
                continue;
            }
            let from = offset;
            while offset < 7 && present[offset] {
                offset += 1;
            }
            let to = offset - 1;
            drew = true;
            let name = if special {
                series.name.clone()
            } else {
                format!("{} · {}", series.name, series.track_short())
            };
            layer = layer.child(
                div()
                    .absolute()
                    .top(px(lane * 23.0))
                    .left(relative(from as f32 / 7.0))
                    .right(relative((6 - to) as f32 / 7.0))
                    .ml(px(6.0))
                    .mr(px(6.0))
                    .h(px(20.0))
                    .px(px(8.0))
                    .flex()
                    .items_center()
                    .rounded(px(5.0))
                    .when(past_week, |d| d.opacity(0.55))
                    .when(special, |d| d.bg(orbit::ramp(skin.button, 180.0)))
                    .when(!special, |d| {
                        d.bg(acc_bg(cx))
                            .border_1()
                            .border_color(chrome::acc_line(cx))
                    })
                    .child(
                        t(
                            name,
                            11.0,
                            600,
                            if special { 0x00ff_ffff } else { chrome::acct(cx) },
                            cx,
                        )
                        .whitespace_nowrap()
                        .truncate(),
                    ),
            );
        }
        if drew {
            lane += 1.0;
        }
    }
    layer
}

/// Barritas: salidas por hora de las series, en rojo si hay tandas de evento.
fn density(
    schedule: &Schedule,
    day_start: DateTime<Utc>,
    now: DateTime<Utc>,
    cx: &gpui::App,
) -> (Div, u32) {
    let skin = skin(cx);
    let mut per_hour = [0u32; 24];
    let mut events = [false; 24];
    for series in &schedule.series {
        for start in schedule
            .starts(series, day_start, day_start + Duration::hours(24))
            .unwrap_or_default()
        {
            let hour = ((start - day_start).num_minutes() / 60).clamp(0, 23) as usize;
            per_hour[hour] += 1;
            events[hour] |= !rows::is_daily(series);
        }
    }
    let total = per_hour.iter().sum();
    let past_day = day_start + Duration::hours(24) <= now;
    (
        div()
            .flex()
            .items_end()
            .gap(px(1.0))
            .h(px(20.0))
            .px(px(8.0))
            .mt_auto()
            .when(past_day, |d| d.opacity(0.55))
            .children((0..24).map(|h| {
                div()
                    .flex_1()
                    .h(relative((per_hour[h] as f32 / DENSITY_MAX).clamp(0.1, 1.0)))
                    .rounded_t(px(1.0))
                    .bg(if events[h] {
                        rgb(acc(cx)).into()
                    } else {
                        orbit::alpha(skin.text3 << 8 | 0x4d)
                    })
            })),
        total,
    )
}

fn day_alerts(cal: &Calendar, schedule: &Schedule, a: DateTime<Utc>, b: DateTime<Utc>) -> usize {
    schedule
        .series
        .iter()
        .map(|s| {
            schedule
                .starts(s, a, b)
                .unwrap_or_default()
                .into_iter()
                .filter(|at| cal.alerts.cause(schedule, s, *at).is_some())
                .count()
        })
        .sum()
}

fn month_label(month: u32) -> &'static str {
    [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
    ][month as usize - 1]
}

fn month_short(month: u32) -> &'static str {
    [
        "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
    ][month as usize - 1]
}
