//! Tres vistas R10.10 sobre el horario vigente; sin datos de carreras inventados.
use super::{Calendar, CalendarView, beta, views};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, Local, Timelike, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px};

const AGENDA_EVENT_HEIGHT: f32 = 30.0;
const AGENDA_CELL_PADDING: f32 = 3.0;

fn agenda_hour_height(adapt: orbit::Adapt) -> f32 {
    // 30 de evento + 6 de padding + 1 de borde; 38 deja un píxel de aire en XS.
    (adapt.row_height() - 8.0).max(38.0)
}

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
                    if this.view != view && view == CalendarView::Agenda {
                        this.agenda_scroll = None;
                    }
                    this.view = view;
                    cx.notify();
                },
            ))
        }),
    )
}

fn page(id: &'static str, adapt: orbit::Adapt) -> Stateful<Div> {
    div()
        .id(id)
        .size_full()
        .min_h_0()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(adapt.gap()))
}

fn agenda_event(
    calendar: &Calendar,
    event: &views::Start<'_>,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let id = event.series.id.clone();
    let favorite = calendar.following.series_ids.contains(&id);
    let color = beta::classes(event.series)
        .first()
        .map_or(orbit::ink_3(cx), |class| beta::class_color(class, cx));
    div()
        .id(format!("calendar-slot-{id}-{}", event.at.timestamp()))
        .min_w_0()
        .role(gpui::Role::Button)
        .tab_index(0)
        .aria_label(format!("{} · marcar favorita", event.series.name))
        .aria_selected(favorite)
        .flex_none()
        .h(px(AGENDA_EVENT_HEIGHT))
        .overflow_hidden()
        .p(px(2.0))
        .rounded(px(orbit::skin(cx).radius.sm))
        .bg(orbit::tint(color, if favorite { 0.18 } else { 0.08 }))
        .child(
            orbit::text(
                event.at.with_timezone(&Local).format("%H:%M").to_string(),
                10.0,
                500,
                color,
                cx,
            )
            .line_height(px(12.0)),
        )
        .child(
            orbit::text(event.series.name.clone(), 11.0, 600, orbit::ink(cx), cx)
                .line_height(px(14.0))
                .whitespace_nowrap()
                .overflow_hidden()
                .text_ellipsis(),
        )
        .on_click(cx.listener(move |this, _, _, cx| {
            this.error = this.follow(id.clone()).err();
            cx.notify();
        }))
}

fn agenda_preview<'a>(
    events: &[views::Start<'a>],
    includes: impl Fn(&super::Series) -> bool,
) -> (Vec<views::Start<'a>>, usize) {
    let mut matching = events.iter().filter(|event| includes(event.series));
    let preview = matching.by_ref().take(views::WEEK_SLOTS).cloned().collect();
    (preview, matching.count())
}

fn agenda_grid(
    calendar: &Calendar,
    now: DateTime<Utc>,
    cx: &mut Context<Calendar>,
) -> Result<(Div, gpui::Stateful<Div>), String> {
    let today = now.with_timezone(&Local).date_naive();
    let monday = views::week_anchor(today)?;
    let mut days = Vec::new();
    let mut header = div()
        .flex()
        .gap(px(4.0))
        .child(div().w(px(48.0)).flex_none());
    for (index, name) in ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]
        .into_iter()
        .enumerate()
    {
        let date =
            monday + Duration::days(i64::try_from(index).map_err(|error| error.to_string())?);
        days.push(views::day_rows(
            &calendar.schedule,
            views::Filter::default(),
            date,
            now,
            &Local,
        )?);
        header = header.child(
            orbit::text(
                format!("{name} {}", date.day()),
                10.0,
                500,
                orbit::ink_3(cx),
                cx,
            )
            .flex_1()
            .min_w_0()
            .py(px(10.0))
            .rounded(px(orbit::skin(cx).radius.sm))
            .text_center()
            .when(date == today, |day| {
                day.bg(orbit::tint(orbit::carmine(cx), 0.12))
            }),
        );
    }
    let mut grid = div()
        .id("calendar-week-list")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .track_scroll(calendar.agenda_scroll.as_ref().expect("agenda abierta"))
        .flex()
        .flex_col()
        .gap_0();
    for hour in 0..24 {
        let mut line = div()
            .flex()
            .flex_none()
            .gap(px(4.0))
            // Una hora ocupa siempre la misma distancia, haya cero o muchas salidas.
            .h(px(agenda_hour_height(calendar.adapt)))
            .child(
                orbit::text(format!("{hour:02}:00"), 10.0, 500, orbit::ink_3(cx), cx)
                    .w(px(48.0))
                    .flex_none(),
            );
        for (day_index, day) in days.iter().enumerate() {
            let cell = &day[hour];
            let mut column = div()
                .id(format!("calendar-hour-{hour}-{day_index}"))
                .flex_1()
                .min_w_0()
                .h_full()
                .min_h_0()
                .overflow_y_scroll()
                .flex()
                .flex_col()
                .gap(px(3.0))
                .p(px(AGENDA_CELL_PADDING))
                .border_b_1()
                .border_color(orbit::alpha(orbit::skin(cx).line1))
                .when(cell.now, |cell| {
                    cell.bg(orbit::tint(orbit::carmine(cx), 0.08))
                });
            // Bound GPUI elements, retaining the complete schedule and a visible
            // overflow count. Class/tier filters are applied before the preview.
            let (preview, more) =
                agenda_preview(&cell.events, |series| beta::includes(calendar, series));
            for event in &preview {
                column = column.child(agenda_event(calendar, event, cx));
            }
            if more > 0 {
                column = column.child(
                    orbit::small_button("calendar-more", &format!("+{more} · Tiempos"), cx)
                        .id(format!("calendar-more-{hour}-{day_index}"))
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.view = CalendarView::Times;
                            cx.notify();
                        })),
                );
            }
            line = line.child(column);
        }
        grid = grid.child(line);
    }
    Ok((header.flex_none(), grid))
}

pub(super) fn agenda(
    calendar: &mut Calendar,
    now: DateTime<Utc>,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    if calendar.agenda_scroll.is_none() {
        let scroll = gpui::ScrollHandle::new();
        scroll
            .scroll_to_top_of_item(usize::try_from(now.with_timezone(&Local).hour()).unwrap_or(0));
        calendar.agenda_scroll = Some(scroll);
    }
    let (header, grid) = match agenda_grid(calendar, now, cx) {
        Ok((header, grid)) => (header, grid.into_any_element()),
        Err(error) => (div(), orbit::callout(error, cx).into_any_element()),
    };
    page("calendar-agenda", calendar.adapt)
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
                .child(header)
                .child(grid),
        )
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error, cx))
        })
}

fn poster_card(calendar: &Calendar, row: &views::Start<'_>, cx: &mut Context<Calendar>) -> Div {
    let compact = calendar.adapt.center_width() < 950.0;
    let short = !calendar.adapt.show_optional();
    let local = row.at.with_timezone(&Local);
    let favorite = calendar.following.series_ids.contains(&row.series.id);
    orbit::neo_card(cx)
        .flex_none()
        .min_w_0()
        .overflow_hidden()
        .p_0()
        .pr(px(14.0))
        .h(px(if short { 84.0 } else { 118.0 }))
        .flex_row()
        .items_center()
        .gap(px(if compact { 16.0 } else { 22.0 }))
        .when(favorite, |card| {
            card.bg(orbit::ramp(orbit::skin(cx).hero, 118.0))
                .border_color(orbit::tint(orbit::carmine(cx), 0.32))
        })
        .child(
            div()
                .w(px(if short { 84.0 } else { 108.0 }))
                .flex_none()
                .self_stretch()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(3.0))
                .bg(orbit::tint(0, 0.24))
                .border_r_1()
                .border_color(orbit::alpha(orbit::skin(cx).line1))
                .child(orbit::meta(
                    ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]
                        [local.weekday().num_days_from_monday() as usize],
                    10.0,
                    orbit::ink_3(cx),
                    cx,
                ))
                .child(
                    orbit::caps(
                        &local.format("%H:%M").to_string(),
                        if short { 22.0 } else { 30.0 },
                        orbit::ink(cx),
                        cx,
                    )
                    .line_height(px(if short { 24.0 } else { 32.0 })),
                )
                .child(orbit::text(
                    local.format("%d/%m").to_string(),
                    11.0,
                    500,
                    orbit::ink_3(cx),
                    cx,
                )),
        )
        .child(poster_details(row.series, short, cx))
        .when(!compact, |card| {
            card.child(
                div()
                    .w(px(130.0))
                    .h(px(70.0))
                    .flex_none()
                    .child(orbit::circuit(Some(&row.series.track), cx).size_full()),
            )
        })
        .child(poster_actions(calendar, row.series, compact, cx))
}

fn poster_details(series: &super::Series, short: bool, cx: &gpui::App) -> Div {
    div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(4.0))
        .child(
            div()
                .flex()
                .gap(px(4.0))
                .child(beta::tier_pill(&series.tier, cx).h(px(20.0)))
                .children(
                    beta::classes(series)
                        .into_iter()
                        .map(|class| beta::class_chip(class, cx).h(px(20.0)).py(px(0.0))),
                ),
        )
        .child(
            orbit::display(
                &series.name,
                if short { 20.0 } else { 25.0 },
                orbit::ink(cx),
                cx,
            )
            .line_height(px(if short { 22.0 } else { 28.0 }))
            .truncate(),
        )
        .child(
            orbit::text(series.track.clone(), 12.0, 400, orbit::ink_3(cx), cx)
                .line_height(px(16.0))
                .truncate(),
        )
        .when(!short, |details| {
            details.child(
                orbit::text(
                    series.race_duration_min.map_or_else(
                        || "Carrera · —".into(),
                        |minutes| format!("Carrera · {minutes} min"),
                    ),
                    11.0,
                    500,
                    orbit::ink_3(cx),
                    cx,
                )
                .line_height(px(16.0)),
            )
        })
}

fn poster_actions(
    calendar: &Calendar,
    series: &super::Series,
    compact: bool,
    cx: &mut Context<Calendar>,
) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(6.0))
        .child(
            beta::follow_button(calendar, series, cx).when(!compact, |button| {
                button.w(px(146.0)).gap(px(8.0)).child(orbit::text(
                    if calendar.following.series_ids.contains(&series.id) {
                        "Favorita"
                    } else {
                        "Marcar favorita"
                    },
                    12.0,
                    500,
                    orbit::ink_2(cx),
                    cx,
                ))
            }),
        )
        .child(
            beta::reminder_button(calendar, series, cx).when(!compact, |button| {
                button.w(px(146.0)).gap(px(8.0)).child(orbit::text(
                    "Aviso · Próximamente",
                    11.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ))
            }),
        )
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
        .flex_col()
        .gap(px(10.0));
    match beta::next_rows(calendar, now) {
        Ok(rows) => {
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
                cards = cards.child(poster_card(calendar, &row, cx));
            }
        }
        Err(error) => cards = cards.child(orbit::callout(error, cx)),
    }
    page("calendar-posters", calendar.adapt)
        .child(
            orbit::neo_card(cx)
                .flex_1()
                .min_h_0()
                .p(px(14.0))
                .child(orbit::section_header(
                    "Próximos eventos",
                    "v-calendar",
                    None,
                    cx,
                ))
                .child(beta::filters(calendar, cx))
                .child(cards),
        )
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error, cx))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_agenda_density_fits_one_complete_event_with_padding_and_border() {
        for height in [720.0, 768.0, 819.0, 820.0, 900.0, 1080.0, 1440.0] {
            let adapt = orbit::Adapt::new(1280.0, height, None, true);
            let usable = agenda_hour_height(adapt) - 2.0 * AGENDA_CELL_PADDING - 1.0;
            assert!(
                usable >= AGENDA_EVENT_HEIGHT,
                "franja incompleta a {height}"
            );
        }
    }

    #[test]
    fn dense_official_agenda_preserves_counts_and_filters_before_previewing() {
        let schedule = super::super::Schedule::parse(include_bytes!(
            "../../reference/fixtures/calendar-lmu-2026-10-06.json"
        ))
        .expect("horario LMU real");
        let now = DateTime::parse_from_rfc3339("2026-10-09T12:00:00Z")
            .expect("reloj")
            .with_timezone(&Utc);
        let rows = views::day_rows(
            &schedule,
            views::Filter::default(),
            now.date_naive(),
            now,
            &Utc,
        )
        .expect("agenda");
        let events = &rows[12].events;
        let (preview, more) = agenda_preview(events, |_| true);
        assert_eq!(preview.len(), views::WEEK_SLOTS);
        assert!(more > 0);
        assert_eq!(preview.len() + more, events.len());
        for series in &schedule.series {
            let (filtered, more) = agenda_preview(events, |candidate| candidate.id == series.id);
            assert!(filtered.iter().all(|event| event.series.id == series.id));
            assert_eq!(
                filtered.len() + more,
                events
                    .iter()
                    .filter(|event| event.series.id == series.id)
                    .count()
            );
        }
    }
}
