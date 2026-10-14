//! Mes: cuadrícula de semanas LMU (martes a lunes) con su estado y su densidad.
use super::super::{
    Calendar, Schedule,
    chrome::{self, Tone, acc, acc_bg, acc_line, bold_mono, cap, disp, ib, pill, skin, t},
    clock, rows,
};
use super::{fav_seg, full_button, span_seg};
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

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
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
                .min_w(px(170.0))
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
        .child(div().flex_1())
        .child(full_button(cal, cx))
        .child(span_seg(cal, cx))
        .child(fav_seg(cal, None, cx));

    let header = div()
        .flex_none()
        .flex()
        .border_t_1()
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(div().w(px(104.0)).flex_none())
        .children(["MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM", "LUN"].map(|d| {
            div()
                .flex_1()
                .py(px(8.0))
                .flex()
                .justify_center()
                .child(cap(d, skin.cap, cx))
        }));

    let mut grid = div().flex_1().min_h_0().flex().flex_col();
    for week in &weeks {
        let schedule = schedule_of(*week);
        let state = if *week == current_start.date_naive() {
            State::Now
        } else if *week < current_start.date_naive() {
            if schedule.is_some() {
                State::Past
            } else {
                State::Unsaved
            }
        } else if schedule.is_none() && *week == current_start.date_naive() + Duration::days(7) {
            State::Waiting
        } else {
            State::Unpublished
        };
        let (label, tone) = match state {
            State::Past => ("Pasada", Tone::Neutral),
            State::Now => ("Esta semana", Tone::Acc),
            State::Waiting => ("Esperando", Tone::Warn),
            State::Unpublished => ("Sin publicar", Tone::Neutral),
            State::Unsaved => ("Sin guardar", Tone::Neutral),
        };
        let mut row = div()
            .flex_1()
            .min_h(px(70.0))
            .flex()
            .border_b_1()
            .border_color(orbit::alpha(skin.line1))
            .child(
                div()
                    .w(px(104.0))
                    .flex_none()
                    .p(px(10.0))
                    .gap(px(6.0))
                    .flex()
                    .flex_col()
                    .when(state == State::Now, |c| {
                        c.border_l_2().border_color(rgb(acc(cx))).bg(acc_bg(cx))
                    })
                    .child(t(
                        format!("{} {}", week.day(), month_short(week.month())),
                        13.0,
                        700,
                        skin.text1,
                        cx,
                    ))
                    .child(pill(label, tone, cx).self_start()),
            );
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
                .gap(px(3.0))
                .p(px(6.0))
                .border_l_1()
                .border_color(orbit::alpha(skin.line1))
                .overflow_hidden()
                .when(is_today, |c| {
                    c.border_2().border_color(rgb(acc(cx))).bg(acc_bg(cx))
                })
                .when(schedule.is_none(), |c| c.bg(orbit::alpha(skin.hover)));
            let mut head = div().flex().items_center().gap(px(6.0)).child(bold_mono(
                day.day().to_string(),
                13.0,
                if outside { skin.text3 } else { skin.text1 },
                cx,
            ));
            if is_today {
                head = head.child(cap("Hoy", chrome::acct(cx), cx));
            }
            if let Some(schedule) = schedule {
                let alerts = day_alerts(cal, schedule, a, b);
                if alerts > 0 {
                    head =
                        head.child(div().flex_1())
                            .child(pill(format!("{alerts}"), Tone::Acc, cx));
                }
                cell = cell.child(head);
                for series in schedule.series.iter().filter(|s| !rows::is_daily(s)) {
                    if schedule.starts(series, a, b).is_ok_and(|v| !v.is_empty()) {
                        let special = series.kind() == crate::calendar::model::Kind::Special;
                        cell = cell.child(
                            div()
                                .h(px(16.0))
                                .px(px(5.0))
                                .rounded(px(4.0))
                                .overflow_hidden()
                                .bg(if special {
                                    rgb(acc(cx)).into()
                                } else {
                                    acc_bg(cx)
                                })
                                .border_1()
                                .border_color(acc_line(cx))
                                .child(
                                    t(
                                        series.name.clone(),
                                        10.5,
                                        600,
                                        if special {
                                            0x00ff_ffff
                                        } else {
                                            chrome::acct(cx)
                                        },
                                        cx,
                                    )
                                    .truncate(),
                                ),
                        );
                    }
                }
                cell = cell.child(density(schedule, a, now, cx));
            } else {
                cell = cell.child(head);
            }
            row = row.child(cell);
        }
        grid = grid.child(row);
    }
    chrome::card(cx)
        .flex_1()
        .child(bar)
        .child(header)
        .child(grid)
}

/// Barritas: salidas por hora de las series, en rojo si hay tandas de evento.
fn density(
    schedule: &Schedule,
    day_start: DateTime<Utc>,
    now: DateTime<Utc>,
    cx: &gpui::App,
) -> Div {
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
    let max = per_hour.iter().copied().max().unwrap_or(1).max(1) as f32;
    div()
        .flex()
        .items_end()
        .gap(px(1.0))
        .h(px(18.0))
        .mt_auto()
        .children((0..24).map(|h| {
            let past = day_start + Duration::hours(h as i64 + 1) <= now;
            div()
                .flex_1()
                .h(relative((per_hour[h] as f32 / max).max(0.08)))
                .rounded(px(1.0))
                .bg(if events[h] {
                    rgb(acc(cx)).into()
                } else {
                    orbit::alpha(skin.line2)
                })
                .when(past, |b| b.opacity(0.45))
        }))
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
