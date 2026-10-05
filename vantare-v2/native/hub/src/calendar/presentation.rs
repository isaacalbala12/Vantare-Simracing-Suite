use super::{Calendar, CalendarView, views};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Timelike, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px, rgb};

fn weekly_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x0081_96c6, cx)
}
fn today_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x001e_191c, cx)
}

fn view_button(
    calendar: &Calendar,
    cx: &mut Context<Calendar>,
    view: CalendarView,
    label: &'static str,
    id: &'static str,
) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_index(0)
        .h(px(44.0))
        .px(px(12.0))
        .flex()
        .items_center()
        .justify_center()
        .when(calendar.view == view, |button| {
            button.border_b_2().border_color(rgb(orbit::carmine(cx)))
        })
        .when(calendar.view != view, |button| {
            button.hover(|style| style.bg(rgb(orbit::surface_2(cx))))
        })
        .child(orbit::text(
            label,
            12.0,
            500,
            if calendar.view == view {
                orbit::ink(cx)
            } else {
                orbit::ink_3(cx)
            },
            cx,
        ))
        .on_click(cx.listener(move |this, _, _, cx| {
            this.view = view;
            cx.notify();
        }))
}

pub(super) fn views_control(calendar: &Calendar, cx: &mut Context<Calendar>) -> Div {
    div().flex().items_center().gap(px(2.0)).children([
        view_button(
            calendar,
            cx,
            CalendarView::Upcoming,
            "Próximas",
            "calendar-upcoming",
        ),
        view_button(calendar, cx, CalendarView::Day, "Día", "calendar-day"),
        view_button(calendar, cx, CalendarView::Week, "Semana", "calendar-week"),
        view_button(calendar, cx, CalendarView::Month, "Mes", "calendar-month"),
        view_button(
            calendar,
            cx,
            CalendarView::Timeline,
            "Timeline",
            "calendar-timeline",
        ),
    ])
}

fn mono(content: impl Into<gpui::SharedString>, cx: &gpui::App) -> Div {
    div()
        .font_family(crate::orbit::mono_family(cx))
        .text_size(px(12.0))
        .font_weight(gpui::FontWeight(500.0))
        .text_color(rgb(orbit::ink_3(cx)))
        .child(content.into())
}

fn local_time(now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let local = now.with_timezone(&Local);
    mono(
        format!(
            "{} · {}",
            local.format("%H:%M"),
            local.format("%Z (UTC%:z)")
        ),
        cx,
    )
}

fn disabled_icon_button(
    id: &'static str,
    label: &'static str,
    cx: &gpui::App,
) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_stop(false)
        .size(px(28.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(orbit::RADIUS_CHIP))
        .opacity(orbit::DISABLED)
        .child(orbit::text(label, 16.0, 500, orbit::ink_3(cx), cx))
}

fn navigation(calendar: &Calendar, cx: &gpui::App) -> Div {
    let mut actions = div().flex().items_center().gap(px(4.0));
    if calendar.view == CalendarView::Timeline {
        actions = actions
            .child(disabled_icon_button("calendar-previous", "‹", cx))
            .child(disabled_icon_button("calendar-next", "›", cx))
            .child(orbit::text("1×", 11.0, 500, orbit::ink_2(cx), cx).w(px(40.0)))
            .child(disabled_icon_button("calendar-zoom-out", "−", cx))
            .child(disabled_icon_button("calendar-zoom-in", "+", cx))
            .child(
                orbit::button("calendar-zoom-fit", "Ajustar", cx)
                    .h(px(32.0))
                    .px(px(12.0))
                    .rounded(px(8.0))
                    .tab_stop(false)
                    .opacity(orbit::DISABLED),
            );
    } else {
        actions = actions
            .child(disabled_icon_button("calendar-previous", "‹", cx))
            .child(
                orbit::button("calendar-today", "Hoy", cx)
                    .h(px(32.0))
                    .px(px(12.0))
                    .rounded(px(8.0))
                    .tab_stop(false)
                    .opacity(orbit::DISABLED),
            )
            .child(disabled_icon_button("calendar-next", "›", cx));
    }
    actions
}

fn card_header(
    calendar: &Calendar,
    title: impl Into<gpui::SharedString>,
    now: DateTime<Utc>,
    cx: &gpui::App,
) -> Div {
    orbit::card_header(title, cx).child(
        div()
            .flex()
            .items_center()
            .gap(px(8.0))
            .child(local_time(now, cx))
            .when(
                matches!(
                    calendar.view,
                    CalendarView::Day
                        | CalendarView::Week
                        | CalendarView::Month
                        | CalendarView::Timeline
                ),
                |actions| actions.child(navigation(calendar, cx)),
            ),
    )
}

fn empty_panel(text: &str, cx: &gpui::App) -> Div {
    div()
        .flex_1()
        .min_h_0()
        .px(px(12.0))
        .py(px(20.0))
        .child(orbit::text(
            text.to_owned(),
            13.0,
            400,
            orbit::ink_3(cx),
            cx,
        ))
}

fn upcoming(calendar: &Calendar, now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let (starts, _) = calendar.upcoming(now);
    let mut body = div().flex_1().min_h_0().px(px(12.0)).py(px(12.0));
    for (index, (at, name)) in starts.iter().enumerate() {
        body = body.child(
            div()
                .h(px(51.0))
                .px(px(12.0))
                .flex()
                .items_center()
                .justify_between()
                .gap(px(16.0))
                .border_b_1()
                .border_color(gpui::rgba(orbit::line_row(cx)))
                .child(orbit::text(name.clone(), 13.0, 600, orbit::ink_2(cx), cx))
                .child(mono(
                    at.with_timezone(&Local).format("%H:%M").to_string(),
                    cx,
                ))
                .id(("calendar-upcoming-row", index)),
        );
    }
    body
}

fn weekday(index: usize) -> &'static str {
    ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"][index]
}

fn month_name(month: u32) -> &'static str {
    [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    ][month.saturating_sub(1).min(11) as usize]
}

fn weekday_long(index: usize) -> &'static str {
    [
        "lunes",
        "martes",
        "miércoles",
        "jueves",
        "viernes",
        "sábado",
        "domingo",
    ][index]
}

fn day_title(date: NaiveDate, today: NaiveDate) -> String {
    format!(
        "{}, {} de {}{}",
        weekday_long(date.weekday().num_days_from_monday() as usize),
        date.day(),
        month_name(date.month()),
        if date == today { " · hoy" } else { "" }
    )
}

fn day_view(now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let local = now.with_timezone(&Local);
    let minute = local.minute() / 15 * 15;
    let aligned = local
        .with_minute(minute)
        .and_then(|time| time.with_second(0))
        .and_then(|time| time.with_nanosecond(0));
    let aligned = match aligned {
        Some(aligned) => aligned,
        None => local,
    };
    let first = aligned - Duration::minutes(105);
    // Wails centra la franja actual; el scroll deja 5 px arriba y reserva 10 px a la derecha.
    let mut rows = div()
        .mt(px(4.0))
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .relative()
        .overflow_hidden()
        .px(px(12.0))
        .pr(px(22.0))
        .pt(px(8.0))
        .pb(px(12.0));
    for index in 0..15 {
        let at = first + Duration::minutes(index * 15);
        let line_color = if at.minute() == 0 {
            orbit::line_row(cx)
        } else {
            0xffff_ff09
        };
        rows = rows.child(
            div()
                .h(px(38.0))
                .flex_none()
                .flex()
                .child(
                    div()
                        .w(px(74.0))
                        .h_full()
                        .flex_none()
                        .border_t_1()
                        .border_color(gpui::rgba(line_color))
                        .pt(px(8.0))
                        .pr(px(8.0))
                        .font_family(crate::orbit::mono_family(cx))
                        .text_size(px(11.0))
                        .font_weight(gpui::FontWeight(600.0))
                        .text_color(rgb(orbit::ink_3(cx)))
                        .child(at.format("%H:%M").to_string()),
                )
                .child(
                    div()
                        .h_full()
                        .flex_1()
                        .min_w_0()
                        .border_t_1()
                        .border_color(gpui::rgba(line_color)),
                ),
        );
    }
    rows.child(
        div()
            .absolute()
            .left(px(12.0))
            .right(px(22.0))
            .top(px(578.0))
            .h(px(1.0))
            .bg(gpui::rgba(orbit::line_row(cx))),
    )
}

fn week_title(monday: NaiveDate) -> String {
    let sunday = monday + Duration::days(6);
    format!(
        "{} – {} de {}",
        monday.day(),
        sunday.day(),
        month_name(sunday.month())
    )
}

fn week_view(calendar: &Calendar, now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let today = now.with_timezone(&Local).date_naive();
    let Ok(monday) = views::week_anchor(today) else {
        return empty_panel("No hay salidas esta semana.", cx);
    };
    let schedule = &calendar.schedule;
    let Ok(rows) = views::week_rows(schedule, views::Filter::default(), monday, now, &Local) else {
        return empty_panel("No se pudo leer el horario.", cx);
    };
    let weekly: Vec<_> = rows
        .into_iter()
        .filter(|row| row.series.recurrence.kind != "interval")
        .collect();
    let mut grid = div().flex().flex_col().flex_1().min_h_0();
    let mut header = div()
        .h(px(41.0))
        .flex_none()
        .flex()
        .border_b_1()
        .border_color(gpui::rgba(orbit::line_row(cx)));
    header = header.child(div().w(px(160.0)).flex_none());
    for index in 0_u8..7 {
        let date = monday + Duration::days(i64::from(index));
        let color = if date == today {
            orbit::coral(cx)
        } else {
            orbit::ink_2(cx)
        };
        header = header.child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(orbit::surface_1(cx)))
                .child(orbit::text(
                    format!("{} {}", weekday(usize::from(index)), date.day()),
                    11.0,
                    500,
                    color,
                    cx,
                )),
        );
    }
    grid = grid.child(header);
    for row in weekly {
        let mut line = div()
            .h(px(41.0))
            .flex_none()
            .flex()
            .border_b_1()
            .border_color(gpui::rgba(orbit::line_row(cx)));
        line = line.child(
            div()
                .w(px(160.0))
                .flex_none()
                .px(px(8.0))
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(div().size(px(7.0)).rounded_full().bg(rgb(weekly_color(cx))))
                .child(orbit::text(
                    row.series.name.clone(),
                    12.0,
                    600,
                    orbit::ink(cx),
                    cx,
                ))
                .overflow_hidden(),
        );
        for cell in row.cells {
            line = line.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .justify_start()
                    .px(px(8.0))
                    .bg(rgb(if cell.today {
                        today_color(cx)
                    } else {
                        orbit::surface_1(cx)
                    }))
                    .child(orbit::text(
                        if cell.total == 0 { "–" } else { "·" },
                        12.0,
                        400,
                        orbit::ink_muted(cx),
                        cx,
                    )),
            );
        }
        grid = grid.child(line);
    }
    grid.mx(px(12.0)).mt(px(10.0))
}

fn month_view(calendar: &Calendar, now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let local = now.with_timezone(&Local);
    let today = local.date_naive();
    let Some(anchor) = NaiveDate::from_ymd_opt(today.year(), today.month(), 1) else {
        return empty_panel("Mes fuera de rango.", cx);
    };
    let Ok(days) = views::month_days(
        &calendar.schedule,
        views::Filter::default(),
        anchor,
        now,
        &Local,
    ) else {
        return empty_panel("No se pudo leer el horario.", cx);
    };
    let mut grid = div().flex().flex_col().flex_1().min_h_0();
    let mut labels = div()
        .h(px(33.0))
        .bg(rgb(orbit::surface_1(cx)))
        .flex_none()
        .flex()
        .border_b_1()
        .border_color(rgb(crate::orbit::legacy_rgb(0x0018_181b, cx)));
    for index in 0..7 {
        labels = labels.child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(orbit::surface_1(cx)))
                .child(orbit::text(weekday(index), 11.0, 600, orbit::ink_2(cx), cx)),
        );
    }
    grid = grid.child(labels);
    for week in days.chunks(7) {
        let mut row = div()
            .flex_1()
            .min_h(px(72.0))
            .flex()
            .border_b_1()
            .border_color(rgb(crate::orbit::legacy_rgb(0x0018_181b, cx)));
        for day in week {
            let color = if day.today {
                orbit::ink(cx)
            } else if day.other {
                orbit::ink_muted(cx)
            } else {
                orbit::ink_2(cx)
            };
            let date = if day.today {
                div()
                    .px(px(7.0))
                    .py(px(2.0))
                    .rounded(px(7.0))
                    .bg(rgb(orbit::carmine(cx)))
                    .child(orbit::text(
                        day.day.day().to_string(),
                        11.0,
                        700,
                        orbit::ink(cx),
                        cx,
                    ))
            } else {
                orbit::text(day.day.day().to_string(), 11.0, 600, color, cx)
            };
            row = row.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .items_start()
                    .gap(px(4.0))
                    .px(px(10.0))
                    .py(px(8.0))
                    .border_r_1()
                    .border_color(rgb(crate::orbit::legacy_rgb(0x0018_181b, cx)))
                    .bg(rgb(orbit::surface_1(cx)))
                    .child(date),
            );
        }
        grid = grid.child(row);
    }
    grid.mx(px(12.0)).mt(px(10.0)).mb(px(12.0))
}

fn timeline(calendar: &Calendar, now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let starts = views::starts(
        &calendar.schedule,
        views::Filter::default(),
        now,
        now + Duration::hours(1),
    );
    let Ok(starts) = starts else {
        return empty_panel("No se pudo leer el horario.", cx);
    };
    if starts.is_empty() {
        empty_panel("No hay salidas en la próxima hora.", cx).pt(px(28.0))
    } else {
        let mut body = div().flex_1().min_h_0().px(px(12.0)).py(px(12.0));
        for start in starts {
            body = body.child(orbit::setting_row(
                &start.series.name,
                "",
                mono(
                    start.at.with_timezone(&Local).format("%H:%M").to_string(),
                    cx,
                ),
                cx,
            ));
        }
        body
    }
}

fn content(calendar: &Calendar, now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let title: String = match calendar.view {
        CalendarView::Upcoming => "Próximas salidas".to_owned(),
        CalendarView::Day => {
            let local = now.with_timezone(&Local);
            day_title(local.date_naive(), local.date_naive())
        }
        CalendarView::Week => {
            let today = now.with_timezone(&Local).date_naive();
            match views::week_anchor(today) {
                Ok(monday) => week_title(monday),
                Err(_) => "Semana fuera de rango".to_owned(),
            }
        }
        CalendarView::Month => {
            let local = now.with_timezone(&Local);
            format!("{} de {}", month_name(local.month()), local.year())
        }
        CalendarView::Timeline => "Próxima hora · una fila por serie".to_owned(),
    };
    let body = match calendar.view {
        CalendarView::Upcoming => upcoming(calendar, now, cx),
        CalendarView::Day => day_view(now, cx),
        CalendarView::Week => week_view(calendar, now, cx),
        CalendarView::Month => month_view(calendar, now, cx),
        CalendarView::Timeline => timeline(calendar, now, cx),
    };
    orbit::neo_card(cx)
        .p(px(0.0))
        .gap(px(0.0))
        .flex_1()
        .min_h_0()
        .overflow_hidden()
        .child(card_header(calendar, title, now, cx))
        .child(body)
}

pub(super) fn render(calendar: &mut Calendar, cx: &mut Context<Calendar>) -> Stateful<Div> {
    let now = calendar.demo_now.unwrap_or_else(Utc::now);
    div()
        .id("calendar")
        .w_full()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(16.0))
        .child(orbit::neo_page_header(
            "Calendario LMU",
            "Carreras diarias y semanales · hora local del equipo",
            cx,
        ))
        .child(content(calendar, now, cx))
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error, cx))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn week_caption_matches_wails_across_month_and_year_boundaries() -> Result<(), String> {
        for (date, expected) in [
            ("2026-09-28", "28 – 4 de octubre"),
            ("2026-12-28", "28 – 3 de enero"),
            ("2026-10-05", "5 – 11 de octubre"),
        ] {
            let monday =
                NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|error| error.to_string())?;
            assert_eq!(week_title(monday), expected);
        }
        Ok(())
    }
}
