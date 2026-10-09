//! Tres vistas R10.10 sobre el horario vigente; sin datos de carreras inventados.
use super::{Calendar, CalendarView, beta, views};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, Local, Timelike, Utc};
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
        .p(px(4.0))
        .rounded(px(orbit::skin(cx).radius.sm))
        .bg(orbit::tint(color, if favorite { 0.18 } else { 0.08 }))
        .child(orbit::text(
            event.at.with_timezone(&Local).format("%H:%M").to_string(),
            10.0,
            500,
            color,
            cx,
        ))
        .child(
            orbit::text(event.series.name.clone(), 11.0, 600, orbit::ink(cx), cx)
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
            .min_w_0(),
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
        .gap(px(4.0));
    for hour in 0..24 {
        let mut line = div()
            .flex()
            .flex_none()
            .gap(px(4.0))
            .min_h(px(calendar.adapt.row_height()))
            .child(
                orbit::text(format!("{hour:02}:00"), 10.0, 500, orbit::ink_3(cx), cx)
                    .w(px(48.0))
                    .flex_none(),
            );
        for day in &days {
            let cell = &day[hour];
            let mut column = div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(3.0))
                .p(px(3.0))
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
                column = column.child(orbit::text(
                    format!("+{more} salidas · filtra o abre Tiempos"),
                    10.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ));
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
    let local = row.at.with_timezone(&Local);
    orbit::neo_card(cx)
        .flex_none()
        .min_w_0()
        .flex_row()
        .items_center()
        .gap(px(if compact { 12.0 } else { 20.0 }))
        .child(
            div()
                .w(px(if compact { 80.0 } else { 110.0 }))
                .flex_none()
                .flex()
                .flex_col()
                .gap(px(6.0))
                .child(orbit::caps(
                    &local.format("%H:%M").to_string(),
                    if compact { 24.0 } else { 30.0 },
                    orbit::ink(cx),
                    cx,
                ))
                .child(orbit::text(
                    local.format("%d/%m").to_string(),
                    11.0,
                    500,
                    orbit::ink_3(cx),
                    cx,
                )),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(6.0))
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(4.0))
                        .child(beta::tier_pill(&row.series.tier, cx))
                        .children(
                            beta::classes(row.series)
                                .into_iter()
                                .map(|class| beta::class_chip(class, cx)),
                        ),
                )
                .child(
                    orbit::text(row.series.name.clone(), 17.0, 600, orbit::ink(cx), cx)
                        .whitespace_nowrap()
                        .overflow_hidden()
                        .text_ellipsis(),
                )
                .child(orbit::text(
                    row.series.track.clone(),
                    12.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ))
                .child(orbit::text(
                    row.series.race_duration_min.map_or_else(
                        || "Carrera · —".into(),
                        |minutes| format!("Carrera · {minutes} min"),
                    ),
                    11.0,
                    500,
                    orbit::ink_3(cx),
                    cx,
                )),
        )
        .when(!compact, |card| {
            card.child(
                div()
                    .w(px(130.0))
                    .h(px(70.0))
                    .flex_none()
                    .child(orbit::circuit(Some(&row.series.track), cx).size_full()),
            )
        })
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(6.0))
                .child(beta::follow_button(calendar, row.series, cx))
                .child(beta::reminder_button(calendar, row.series, cx)),
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
        .gap(px(12.0));
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
        .child(beta::filters(calendar, cx))
        .child(cards)
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error, cx))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

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
