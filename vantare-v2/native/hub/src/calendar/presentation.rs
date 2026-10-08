//! Tres vistas R10.10 sobre el horario vigente; sin datos de carreras inventados.
use super::{Calendar, CalendarView, beta, views};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, Local, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px};

pub(super) fn views_control(calendar: &Calendar, cx: &mut Context<Calendar>) -> Div {
    div().flex().h_full().gap(px(18.0)).children(
        [
            (CalendarView::Agenda, "Agenda", "calendar-week"),
            (CalendarView::Posters, "Carteles", "calendar-month"),
            (CalendarView::Times, "Tiempos", "calendar-upcoming"),
        ]
        .map(|(view, label, id)| {
            orbit::topbar_tab(id, label, calendar.view == view, cx).on_click(cx.listener(
                move |this, _, _, cx| {
                    this.view = view;
                    cx.notify();
                },
            ))
        }),
    )
}

fn page(id: &'static str, cx: &gpui::App) -> Stateful<Div> {
    div()
        .id(id)
        .size_full()
        .min_h_0()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(cx.global::<orbit::Adapt>().gap()))
}

pub(super) fn agenda(
    calendar: &Calendar,
    now: DateTime<Utc>,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let today = now.with_timezone(&Local).date_naive();
    let rows = views::week_anchor(today).and_then(|monday| {
        views::week_rows(
            &calendar.schedule,
            views::Filter {
                tier: calendar.tier_filter.as_deref(),
                ..Default::default()
            },
            monday,
            now,
            &Local,
        )
    });
    let mut grid = div()
        .id("calendar-week-list")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col();
    match rows {
        Ok(rows) => {
            let mut header = div()
                .flex()
                .gap(px(4.0))
                .py(px(8.0))
                .child(div().w(px(150.0)).flex_none());
            for day in 0..7 {
                let date =
                    views::week_anchor(today).expect("semana ya validada") + Duration::days(day);
                header = header.child(
                    orbit::text(
                        format!(
                            "{} {}",
                            ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"][day as usize],
                            date.day()
                        ),
                        10.0,
                        500,
                        orbit::ink_3(cx),
                        cx,
                    )
                    .flex_1()
                    .min_w_0(),
                );
            }
            grid = grid.child(header);
            for row in rows
                .into_iter()
                .filter(|row| beta::includes(calendar, row.series))
            {
                let mut line = div()
                    .flex()
                    .gap(px(4.0))
                    .py(px(8.0))
                    .border_b_1()
                    .border_color(orbit::alpha(orbit::skin(cx).line1))
                    .child(
                        div()
                            .w(px(150.0))
                            .flex_none()
                            .min_w_0()
                            .child(
                                orbit::text(row.series.name.clone(), 12.0, 600, orbit::ink(cx), cx)
                                    .text_ellipsis()
                                    .overflow_hidden()
                                    .whitespace_nowrap(),
                            )
                            .child(beta::tier_pill(&row.series.tier, cx))
                            .child(
                                div()
                                    .flex()
                                    .gap(px(4.0))
                                    .child(beta::follow_button(calendar, row.series, cx))
                                    .child(beta::reminder_button(calendar, row.series, cx)),
                            ),
                    );
                for cell in row.cells {
                    let mut day = div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(4.0))
                        .p(px(4.0))
                        .rounded(px(orbit::skin(cx).radius.sm))
                        .when(cell.today, |day| {
                            day.bg(orbit::tint(orbit::carmine(cx), 0.08))
                        });
                    for time in cell.slots {
                        day = day.child(orbit::text(
                            time.with_timezone(&Local).format("%H:%M").to_string(),
                            11.0,
                            500,
                            orbit::ink_2(cx),
                            cx,
                        ));
                    }
                    if cell.more > 0 {
                        day = day.child(orbit::text(
                            format!("+{}", cell.more),
                            10.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        ));
                    }
                    line = line.child(day);
                }
                grid = grid.child(line);
            }
        }
        Err(error) => grid = grid.child(orbit::callout(error, cx)),
    }
    page("calendar-agenda", cx)
        .child(
            orbit::neo_card(cx)
                .flex_1()
                .min_h_0()
                .child(orbit::section_header(
                    "Semana · hora local",
                    "v-calendar",
                    None,
                    cx,
                ))
                .child(beta::filters(calendar, cx))
                .child(grid),
        )
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error, cx))
        })
}

pub(super) fn posters(
    calendar: &Calendar,
    now: DateTime<Utc>,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let mut cards = div()
        .id("calendar-posters-list")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_wrap()
        .content_start()
        .gap(px(12.0));
    match beta::next_rows(calendar, now) {
        Ok(rows) => {
            let width = poster_width(*cx.global::<orbit::Adapt>());
            if rows.is_empty() {
                cards = cards.child(orbit::text(
                    "No hay carreras para estos filtros",
                    14.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ));
            }
            for row in rows {
                cards = cards.child(
                    orbit::neo_card(cx)
                        .w(px(width))
                        .min_w_0()
                        .flex_none()
                        .child(
                            div()
                                .h(px(70.0))
                                .child(orbit::circuit(Some(&row.series.track), cx).size_full()),
                        )
                        .child(beta::tier_pill(&row.series.tier, cx))
                        .child(
                            orbit::caps(&row.series.name, 20.0, orbit::ink(cx), cx)
                                .text_ellipsis()
                                .overflow_hidden()
                                .whitespace_nowrap(),
                        )
                        .child(orbit::text(
                            row.series.track.clone(),
                            12.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        ))
                        .child(orbit::text(
                            row.at
                                .with_timezone(&Local)
                                .format("%a %d · %H:%M")
                                .to_string(),
                            11.0,
                            500,
                            orbit::ink_3(cx),
                            cx,
                        ))
                        .child(orbit::text(
                            row.series.race_duration_min.map_or_else(
                                || "Carrera · —".into(),
                                |minutes| format!("Carrera · {minutes} min"),
                            ),
                            12.0,
                            500,
                            orbit::ink_2(cx),
                            cx,
                        ))
                        .child(
                            div().flex().flex_wrap().gap(px(4.0)).children(
                                beta::classes(row.series)
                                    .into_iter()
                                    .map(|class| beta::class_chip(class, cx)),
                            ),
                        )
                        .child(
                            div()
                                .flex()
                                .gap(px(8.0))
                                .child(beta::follow_button(calendar, row.series, cx))
                                .child(beta::reminder_button(calendar, row.series, cx)),
                        ),
                );
            }
        }
        Err(error) => cards = cards.child(orbit::callout(error, cx)),
    }
    page("calendar-posters", cx)
        .child(beta::filters(calendar, cx))
        .child(cards)
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error, cx))
        })
}

fn poster_width(adapt: orbit::Adapt) -> f32 {
    let available = adapt.center_width() - 2.0 * adapt.padding().1;
    let columns = if available >= 1050.0 { 3.0 } else { 2.0 };
    ((available - (columns - 1.0) * 12.0) / columns).max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn poster_columns_fit_seven_sizes_with_both_rail_states() {
        for (width, height) in [
            (1920.0, 1080.0),
            (1800.0, 1000.0),
            (1600.0, 900.0),
            (1536.0, 864.0),
            (1440.0, 900.0),
            (1366.0, 768.0),
            (1280.0, 720.0),
        ] {
            for open in [false, true] {
                let adapt = orbit::Adapt::new(width, height, None, open);
                let available = adapt.center_width() - 2.0 * adapt.padding().1;
                let columns = if available >= 1050.0 { 3.0 } else { 2.0 };
                assert!(poster_width(adapt) >= 230.0);
                assert!(poster_width(adapt) * columns + (columns - 1.0) * 12.0 <= available + 0.01);
            }
        }
    }
}
