use super::{Calendar, CalendarView, views};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Timelike, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px, rgb};

const WEEKLY: u32 = 0x0081_96c6;
const TODAY: u32 = 0x001e_191c;
const HUB_CONTENT_MIN_HEIGHT: f32 = 830.0;
const SHELL_HEADER_OVERLAP: f32 = 162.0;

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
        .h(px(31.0))
        .px(px(12.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(8.0))
        .when(calendar.view == view, |button| {
            button
                .bg(rgb(0x0033_171c))
                .border_1()
                .border_color(rgb(orbit::CARMINE_DARK))
        })
        .when(calendar.view != view, |button| {
            button.hover(|style| style.bg(rgb(orbit::SURFACE_2)))
        })
        .child(orbit::text(
            label,
            12.0,
            500,
            if calendar.view == view {
                orbit::INK
            } else {
                orbit::INK_3
            },
        ))
        .on_click(cx.listener(move |this, _, _, cx| {
            this.view = view;
            cx.notify();
        }))
}

fn views_control(calendar: &Calendar, cx: &mut Context<Calendar>) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(2.0))
        .p(px(4.0))
        .rounded(px(12.0))
        .border_1()
        .border_color(rgb(orbit::LINE))
        .bg(rgb(orbit::SURFACE_1))
        .children([
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

fn page_header(calendar: &Calendar, cx: &mut Context<Calendar>, now: DateTime<Utc>) -> Div {
    let current = matches!(calendar.schedule.is_current(now), Ok(true));
    div()
        .flex()
        .items_end()
        .justify_between()
        .gap(px(20.0))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .child(
                    orbit::eyebrow("Calendario LMU")
                        .font_family("Segoe UI Variable")
                        .font_weight(gpui::FontWeight(800.0)),
                )
                .child(
                    orbit::text("Calendario", 34.0, 690, orbit::INK)
                        .font_family("Segoe UI Variable")
                        .mt(px(6.0)),
                )
                .child(
                    orbit::text(
                        if current {
                            "Horario UTC activo. Consulta las próximas salidas."
                        } else {
                            "Horario caducado. Actualiza para consultar próximas salidas."
                        },
                        13.5,
                        400,
                        orbit::INK_2,
                    )
                    .mt(px(7.0))
                    .line_height(gpui::relative(1.55)),
                ),
        )
        .child(views_control(calendar, cx))
}

fn mono(content: impl Into<gpui::SharedString>) -> Div {
    div()
        .font_family("Cascadia Code")
        .text_size(px(12.0))
        .font_weight(gpui::FontWeight(500.0))
        .text_color(rgb(orbit::INK_3))
        .child(content.into())
}

fn local_time(now: DateTime<Utc>) -> Div {
    let local = now.with_timezone(&Local);
    mono(format!("{} · Europe/Madrid", local.format("%H:%M")))
}

fn disabled_icon_button(id: &'static str, label: &'static str) -> gpui::Stateful<Div> {
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
        .child(orbit::text(label, 16.0, 500, orbit::INK_3))
}

fn navigation(calendar: &Calendar) -> Div {
    let mut actions = div().flex().items_center().gap(px(4.0));
    if calendar.view == CalendarView::Timeline {
        actions = actions
            .child(disabled_icon_button("calendar-previous", "‹"))
            .child(disabled_icon_button("calendar-next", "›"))
            .child(orbit::text("1×", 11.0, 500, orbit::INK_2).w(px(40.0)))
            .child(disabled_icon_button("calendar-zoom-out", "−"))
            .child(disabled_icon_button("calendar-zoom-in", "+"))
            .child(
                orbit::button("calendar-zoom-fit", "Ajustar")
                    .h(px(32.0))
                    .px(px(12.0))
                    .rounded(px(8.0))
                    .tab_stop(false)
                    .opacity(orbit::DISABLED),
            );
    } else {
        actions = actions
            .child(disabled_icon_button("calendar-previous", "‹"))
            .child(
                orbit::button("calendar-today", "Hoy")
                    .h(px(32.0))
                    .px(px(12.0))
                    .rounded(px(8.0))
                    .tab_stop(false)
                    .opacity(orbit::DISABLED),
            )
            .child(disabled_icon_button("calendar-next", "›"));
    }
    actions
}

fn card_header(
    calendar: &Calendar,
    title: impl Into<gpui::SharedString>,
    now: DateTime<Utc>,
) -> Div {
    div()
        .h(px(59.0))
        .flex_none()
        .px(px(20.0))
        .flex()
        .items_center()
        .justify_between()
        .gap(px(16.0))
        .border_b_1()
        .border_color(gpui::rgba(orbit::LINE_ROW))
        .child(orbit::text(title, 15.0, 700, orbit::INK))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(local_time(now))
                .when(
                    matches!(
                        calendar.view,
                        CalendarView::Day
                            | CalendarView::Week
                            | CalendarView::Month
                            | CalendarView::Timeline
                    ),
                    |actions| actions.child(navigation(calendar)),
                ),
        )
}

fn empty_panel(text: &str) -> Div {
    div()
        .flex_1()
        .min_h_0()
        .px(px(12.0))
        .py(px(20.0))
        .child(orbit::text(text.to_owned(), 13.0, 400, orbit::INK_3))
}

fn upcoming(calendar: &Calendar, now: DateTime<Utc>) -> Div {
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
                .border_color(gpui::rgba(orbit::LINE_ROW))
                .child(orbit::text(name.clone(), 13.0, 600, orbit::INK_2))
                .child(mono(at.with_timezone(&Local).format("%H:%M").to_string()))
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

fn day_view(now: DateTime<Utc>) -> Div {
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
        .mt(px(5.0))
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
            orbit::LINE_ROW
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
                        .font_family("Cascadia Code")
                        .text_size(px(11.0))
                        .font_weight(gpui::FontWeight(600.0))
                        .text_color(rgb(orbit::INK_3))
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
            .bg(gpui::rgba(orbit::LINE_ROW)),
    )
}

fn week_title(monday: NaiveDate) -> String {
    let sunday = monday + Duration::days(6);
    if monday.month() == sunday.month() {
        format!(
            "{} – {} de {}",
            monday.day(),
            sunday.day(),
            month_name(sunday.month())
        )
    } else {
        format!(
            "{} de {} – {} de {}",
            monday.day(),
            month_name(monday.month()),
            sunday.day(),
            month_name(sunday.month())
        )
    }
}

fn week_view(calendar: &Calendar, now: DateTime<Utc>) -> Div {
    let today = now.with_timezone(&Local).date_naive();
    let Ok(monday) = views::week_anchor(today) else {
        return empty_panel("No hay salidas esta semana.");
    };
    let schedule = &calendar.schedule;
    let Ok(rows) = views::week_rows(schedule, views::Filter::default(), monday, now, &Local) else {
        return empty_panel("No se pudo leer el horario.");
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
        .border_color(gpui::rgba(orbit::LINE_ROW));
    header = header.child(div().w(px(160.0)).flex_none());
    for index in 0_u8..7 {
        let date = monday + Duration::days(i64::from(index));
        let color = if date == today {
            orbit::CORAL
        } else {
            orbit::INK_2
        };
        header = header.child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(orbit::SURFACE_1))
                .child(orbit::text(
                    format!("{} {}", weekday(usize::from(index)), date.day()),
                    11.0,
                    500,
                    color,
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
            .border_color(gpui::rgba(orbit::LINE_ROW));
        line = line.child(
            div()
                .w(px(160.0))
                .flex_none()
                .px(px(8.0))
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(div().size(px(7.0)).rounded_full().bg(rgb(WEEKLY)))
                .child(orbit::text(row.series.name.clone(), 12.0, 600, orbit::INK))
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
                    .bg(rgb(if cell.today { TODAY } else { orbit::SURFACE_1 }))
                    .child(orbit::text(
                        if cell.total == 0 { "–" } else { "·" },
                        12.0,
                        400,
                        orbit::INK_MUTED,
                    )),
            );
        }
        grid = grid.child(line);
    }
    grid.mx(px(12.0)).mt(px(10.0))
}

fn month_view(calendar: &Calendar, now: DateTime<Utc>) -> Div {
    let local = now.with_timezone(&Local);
    let today = local.date_naive();
    let Some(anchor) = NaiveDate::from_ymd_opt(today.year(), today.month(), 1) else {
        return empty_panel("Mes fuera de rango.");
    };
    let Ok(days) = views::month_days(
        &calendar.schedule,
        views::Filter::default(),
        anchor,
        now,
        &Local,
    ) else {
        return empty_panel("No se pudo leer el horario.");
    };
    let mut grid = div().flex().flex_col().flex_1().min_h_0();
    let mut labels = div()
        .h(px(32.0))
        .flex_none()
        .flex()
        .border_b_1()
        .border_color(gpui::rgba(orbit::LINE_ROW));
    for index in 0..7 {
        labels = labels.child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(orbit::SURFACE_1))
                .child(orbit::text(weekday(index), 11.0, 600, orbit::INK_2)),
        );
    }
    grid = grid.child(labels);
    for week in days.chunks(7) {
        let mut row = div()
            .flex_1()
            .min_h(px(72.0))
            .flex()
            .border_b_1()
            .border_color(gpui::rgba(orbit::LINE_ROW));
        for day in week {
            let color = if day.today {
                orbit::INK
            } else if day.other {
                orbit::INK_MUTED
            } else {
                orbit::INK_2
            };
            let date = if day.today {
                div()
                    .px(px(7.0))
                    .py(px(2.0))
                    .rounded(px(7.0))
                    .bg(rgb(orbit::CARMINE))
                    .child(orbit::text(
                        day.day.day().to_string(),
                        11.0,
                        700,
                        orbit::INK,
                    ))
            } else {
                orbit::text(day.day.day().to_string(), 11.0, 600, color)
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
                    .border_color(gpui::rgba(orbit::LINE_ROW))
                    .bg(rgb(orbit::SURFACE_1))
                    .child(date),
            );
        }
        grid = grid.child(row);
    }
    grid.mx(px(12.0)).mt(px(10.0)).mb(px(12.0))
}

fn timeline(calendar: &Calendar, now: DateTime<Utc>) -> Div {
    let starts = views::starts(
        &calendar.schedule,
        views::Filter::default(),
        now,
        now + Duration::hours(1),
    );
    let Ok(starts) = starts else {
        return empty_panel("No se pudo leer el horario.");
    };
    if starts.is_empty() {
        empty_panel("No hay salidas en la próxima hora.")
    } else {
        let mut body = div().flex_1().min_h_0().px(px(12.0)).py(px(12.0));
        for start in starts {
            body = body.child(orbit::setting_row(
                &start.series.name,
                "",
                mono(start.at.with_timezone(&Local).format("%H:%M").to_string()),
            ));
        }
        body
    }
}

fn content(calendar: &Calendar, now: DateTime<Utc>) -> Div {
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
        CalendarView::Upcoming => upcoming(calendar, now),
        CalendarView::Day => day_view(now),
        CalendarView::Week => week_view(calendar, now),
        CalendarView::Month => month_view(calendar, now),
        CalendarView::Timeline => timeline(calendar, now),
    };
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .overflow_hidden()
        .bg(rgb(orbit::SURFACE_1))
        .border_1()
        .border_color(gpui::rgba(orbit::LINE))
        .rounded(px(orbit::RADIUS))
        .child(card_header(calendar, title, now))
        .child(body)
}

pub(super) fn render(calendar: &mut Calendar, cx: &mut Context<Calendar>) -> Stateful<Div> {
    let now = calendar.demo_now.unwrap_or_else(Utc::now);
    let (_, error) = calendar.upcoming(now);
    if let Some(error) = error {
        calendar.error = Some(error);
    }
    let page = div()
        .flex_1()
        .min_h_0()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(19.0))
        .pt(px(24.0))
        .pb(px(25.0))
        .bg(rgb(orbit::CANVAS))
        .child(page_header(calendar, cx, now))
        .child(content(calendar, now))
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error))
        });
    div()
        .id("calendar")
        .w_full()
        .min_h(px(HUB_CONTENT_MIN_HEIGHT))
        .mt(px(-SHELL_HEADER_OVERLAP))
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .overflow_hidden()
        .bg(rgb(orbit::CANVAS))
        .child(page)
}
