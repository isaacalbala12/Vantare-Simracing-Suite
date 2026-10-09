//! Pantalla beta: catálogo UTC y seguimiento locales; avisos sin servicio se anuncian pendientes.
use super::{Calendar, Series, views};
use crate::orbit::{self, Tone};
use chrono::{DateTime, Datelike, Duration, Local, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px, rgb, rgba};
use std::collections::BTreeSet;

pub(super) fn classes(series: &Series) -> Vec<&str> {
    if series.classes.is_empty() {
        vec![series.vehicle_class.as_str()]
    } else {
        series
            .classes
            .iter()
            .map(|class| class.name.as_str())
            .collect()
    }
}
pub(super) fn class_color(class: &str, cx: &gpui::App) -> u32 {
    match class {
        "Hypercar" => 0x00e1_4a54,
        "LMP2" => 0x004c_8df6,
        "LMP3" => 0x00a9_70f0,
        "LMGT3" => 0x00e9_852a,
        "GTE" | "LMGTE Am" => 0x00d6_b83a,
        _ => orbit::ink_3(cx),
    }
}
pub(super) fn class_chip(class: &str, cx: &gpui::App) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(6.0))
        .px(px(8.0))
        .py(px(4.0))
        .rounded_full()
        .bg(rgb(orbit::surface_3(cx)))
        .child(
            div()
                .size(px(7.0))
                .rounded_full()
                .bg(rgb(class_color(class, cx))),
        )
        .child(orbit::text(
            class.to_owned(),
            11.0,
            400,
            orbit::ink_2(cx),
            cx,
        ))
}
fn tier_style(tier: &str, cx: &gpui::App) -> (&'static str, u32, u32) {
    match tier {
        "beginner" => ("Bronze", 0x003a_2a20, 0x00e2_a877),
        "intermediate" => ("Silver", 0x002e_3033, 0x00c9_ced4),
        "advanced" => ("Gold", 0x003a_3220, 0x00e7_c86a),
        "weekly" => ("Semanal", orbit::surface_3(cx), orbit::carmine(cx)),
        _ => ("Sin nivel", orbit::surface_3(cx), orbit::ink_3(cx)),
    }
}
pub(super) fn tier_pill(tier: &str, cx: &gpui::App) -> Div {
    let (label, background, foreground) = tier_style(tier, cx);
    div()
        .px(px(6.0))
        .py(px(2.0))
        .rounded(px(4.0))
        .bg(if tier == "weekly" {
            orbit::tint(foreground, 0.12)
        } else {
            rgb(background).into()
        })
        .child(orbit::text(label, 11.0, 600, foreground, cx))
}
pub(super) fn includes(calendar: &Calendar, series: &Series) -> bool {
    calendar
        .tier_filter
        .as_ref()
        .is_none_or(|tier| tier == &series.tier)
        && calendar
            .class_filter
            .as_ref()
            .is_none_or(|class| classes(series).contains(&class.as_str()))
}
pub(super) fn next_rows(
    calendar: &Calendar,
    now: DateTime<Utc>,
) -> Result<Vec<views::Start<'_>>, String> {
    if !calendar.schedule.is_current(now)? {
        return Ok(vec![]);
    }
    let mut rows = Vec::new();
    for series in calendar
        .schedule
        .series
        .iter()
        .filter(|series| includes(calendar, series))
    {
        // Una salida por serie. Las semanales también se ven fuera de la próxima hora.
        let horizon = if series.recurrence.kind == "interval" {
            Duration::minutes(series.recurrence.interval_minutes)
        } else {
            Duration::days(7)
        };
        if let Some(at) = calendar
            .schedule
            .starts(series, now, now + horizon)?
            .into_iter()
            .next()
        {
            rows.push(views::Start { series, at });
        }
    }
    rows.sort_by(|a, b| a.at.cmp(&b.at).then_with(|| a.series.id.cmp(&b.series.id)));
    Ok(rows)
}
fn start_label(at: DateTime<Utc>) -> String {
    let local = at.with_timezone(&Local);
    let weekday = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
        [local.weekday().num_days_from_monday() as usize];
    format!("{weekday} {}", local.format("%H:%M · UTC%:z"))
}
fn countdown(at: DateTime<Utc>, now: DateTime<Utc>) -> String {
    let minutes = (at - now).num_seconds().max(0).saturating_add(59) / 60;
    if minutes >= 60 {
        format!("{} h {:02} min", minutes / 60, minutes % 60)
    } else {
        format!("{minutes} min")
    }
}
fn next_hour_rows(
    calendar: &Calendar,
    now: DateTime<Utc>,
) -> Result<Vec<views::Start<'_>>, String> {
    Ok(next_rows(calendar, now)?
        .into_iter()
        .filter(|row| row.at < now + Duration::hours(1))
        .collect())
}
pub(super) fn follow_button(
    calendar: &Calendar,
    series: &Series,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let followed = calendar.following.series_ids.contains(&series.id);
    let id = series.id.clone();
    orbit::icon_button(
        gpui::SharedString::from(format!("calendar-follow-{id}")),
        "star",
        if followed {
            "Quitar favorita"
        } else {
            "Marcar favorita"
        },
        32.0,
        cx,
    )
    .aria_label(if followed {
        "Quitar favorita"
    } else {
        "Marcar favorita"
    })
    .aria_selected(followed)
    .when(followed, |button| {
        button.bg(orbit::tint(orbit::carmine(cx), 0.12))
    })
    .on_click(cx.listener(move |this, _, _, cx| {
        this.error = this.follow(id.clone()).err();
        cx.notify();
    }))
}
pub(super) fn reminder_button(
    calendar: &Calendar,
    series: &Series,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let selected = calendar.following.reminder_ids.contains(&series.id);
    let id = series.id.clone();
    orbit::icon_button(
        format!("calendar-reminder-{id}"),
        "v-bell",
        "Aviso · Próximamente (guardar preferencia)",
        32.0,
        cx,
    )
    .aria_selected(selected)
    .when(selected, |button| {
        button.bg(orbit::tint(orbit::carmine(cx), 0.12))
    })
    .on_click(cx.listener(move |this, _, _, cx| {
        this.error = this.toggle_reminder(id.clone()).err();
        cx.notify();
    }))
}
pub(super) fn filters(calendar: &Calendar, cx: &mut Context<Calendar>) -> Div {
    let available: BTreeSet<_> = calendar
        .schedule
        .series
        .iter()
        .flat_map(classes)
        .map(str::to_owned)
        .collect();
    let tiers: BTreeSet<_> = calendar
        .schedule
        .series
        .iter()
        .map(|series| series.tier.clone())
        .collect();
    let mut row = div().flex().flex_wrap().gap(px(6.0));
    for class in std::iter::once(None).chain(available.into_iter().map(Some)) {
        let label = class.clone().unwrap_or_else(|| "Todas las clases".into());
        row = row.child(
            orbit::button(
                gpui::SharedString::from(format!("calendar-class-{label}")),
                "",
                cx,
            )
            .when_some(class.as_deref(), |button, class| {
                button.gap(px(6.0)).child(
                    div()
                        .size(px(7.0))
                        .rounded_full()
                        .bg(rgb(class_color(class, cx))),
                )
            })
            .aria_label(label.clone())
            .child(orbit::text(label, 12.0, 500, orbit::ink_2(cx), cx))
            .when(calendar.class_filter == class, |button| {
                button.bg(rgb(orbit::surface_3(cx)))
            })
            .on_click(cx.listener(move |this, _, _, cx| {
                this.class_filter.clone_from(&class);
                cx.notify();
            })),
        );
    }
    let mut levels = div().flex().flex_wrap().gap(px(6.0));
    for tier in std::iter::once(None).chain(tiers.into_iter().map(Some)) {
        let label = match tier.as_deref() {
            None => "Todos los niveles",
            Some("beginner") => "Bronze",
            Some("intermediate") => "Silver",
            Some("advanced") => "Gold",
            Some("weekly") => "Semanal",
            Some(other) => other,
        }
        .to_owned();
        levels = levels.child(
            orbit::button(
                gpui::SharedString::from(format!("calendar-tier-{label}")),
                "",
                cx,
            )
            .aria_label(label.clone())
            .child(orbit::text(
                label.clone(),
                12.0,
                500,
                tier.as_deref()
                    .map_or(orbit::ink_2(cx), |tier| tier_style(tier, cx).2),
                cx,
            ))
            .when_some(tier.as_deref(), |button, tier| {
                let (_, background, foreground) = tier_style(tier, cx);
                button.bg(rgb(background)).text_color(rgb(foreground))
            })
            .when(calendar.tier_filter == tier, |button| {
                button.bg(rgb(orbit::surface_3(cx)))
            })
            .on_click(cx.listener(move |this, _, _, cx| {
                this.tier_filter.clone_from(&tier);
                cx.notify();
            })),
        );
    }
    div()
        .flex()
        .flex_col()
        .gap(px(8.0))
        .child(row)
        .child(levels)
}
fn hero_countdown(
    at: DateTime<Utc>,
    now: DateTime<Utc>,
    adapt: orbit::Adapt,
    cx: &gpui::App,
) -> Div {
    let seconds = (at - now).num_seconds().max(0);
    div()
        .flex_none()
        .child(orbit::eyebrow("Salida en", cx))
        .child(
            orbit::mono_text(
                format!(
                    "{:02}:{:02}:{:02}",
                    seconds / 3600,
                    seconds / 60 % 60,
                    seconds % 60
                ),
                if adapt.height >= 1000.0 { 66.0 } else { 44.0 },
                orbit::ink(cx),
                cx,
            )
            .line_height(px(if adapt.height >= 1000.0 { 72.0 } else { 50.0 })),
        )
        .child(orbit::text(
            start_label(at),
            11.0,
            400,
            orbit::ink_3(cx),
            cx,
        ))
}

fn hero_details(series: &Series, compact: bool, cx: &gpui::App) -> Div {
    div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(if compact { 4.0 } else { 8.0 }))
        .child(orbit::eyebrow("La siguiente que sigues", cx))
        .child(
            orbit::text(
                series.name.clone(),
                if compact { 24.0 } else { 30.0 },
                600,
                orbit::ink(cx),
                cx,
            )
            .line_height(px(if compact { 26.0 } else { 32.0 }))
            .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
            .truncate(),
        )
        .child(
            orbit::text(
                if compact {
                    format!("{} · {}", series.track, classes(series).join(" · "))
                } else {
                    series.track.clone()
                },
                11.0,
                400,
                orbit::ink_2(cx),
                cx,
            )
            .line_height(px(16.0))
            .truncate(),
        )
        .when(!compact, |details| {
            details.child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(6.0))
                    .children(
                        classes(series)
                            .into_iter()
                            .map(|class| class_chip(class, cx)),
                    )
                    .child(tier_pill(&series.tier, cx)),
            )
        })
}

fn hero(calendar: &Calendar, now: DateTime<Utc>, cx: &mut Context<Calendar>) -> Div {
    let (followed, error) = calendar.upcoming(now);
    let next = followed.first().and_then(|(at, id)| {
        calendar
            .schedule
            .series
            .iter()
            .find(|series| &series.id == id)
            .map(|series| views::Start { series, at: *at })
    });
    let compact = calendar.adapt.height < 820.0;
    let mut hero = orbit::hero_surface(cx)
        .flex_none()
        .flex_row()
        .items_center()
        .gap(px(if compact { 16.0 } else { 24.0 }))
        .p(px(if compact { 16.0 } else { 24.0 }));
    if let Some(next) = next {
        hero = hero
            .child(hero_details(next.series, compact, cx))
            .child(hero_countdown(next.at, now, calendar.adapt, cx))
            .when(calendar.adapt.center_width() >= 1100.0, |hero| {
                hero.child(
                    orbit::neo_card(cx)
                        .w(px(140.0))
                        .flex_none()
                        .p(px(14.0))
                        .gap(px(6.0))
                        .child(orbit::eyebrow("Carrera", cx))
                        .child(orbit::text(
                            next.series
                                .race_duration_min
                                .map_or_else(|| "—".into(), |minutes| format!("{minutes} min")),
                            18.0,
                            600,
                            orbit::ink(cx),
                            cx,
                        )),
                )
            })
            .child(
                div()
                    .flex_none()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .child(follow_button(calendar, next.series, cx))
                    .child(reminder_button(calendar, next.series, cx))
                    .child(orbit::text(
                        "Avisos · Próximamente",
                        10.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            );
    } else {
        hero = hero.child(orbit::text(
            "Marca una favorita para ver su próxima carrera.",
            22.0,
            600,
            orbit::ink(cx),
            cx,
        ));
    }
    hero.when_some(error, |hero, error| hero.child(orbit::callout(error, cx)))
}

fn times_header(cx: &gpui::App) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(10.0))
        .px(px(18.0))
        .py(px(8.0))
        .border_b_1()
        .border_color(rgba(orbit::line(cx)))
        .child(
            orbit::meta("Estado", 10.0, orbit::ink_3(cx), cx)
                .w(px(72.0))
                .flex_none(),
        )
        .child(
            orbit::meta("Hora", 10.0, orbit::ink_3(cx), cx)
                .w(px(60.0))
                .flex_none(),
        )
        .child(
            orbit::meta("Serie", 10.0, orbit::ink_3(cx), cx)
                .flex_1()
                .min_w_0(),
        )
        .child(
            orbit::meta("Circuito", 10.0, orbit::ink_3(cx), cx)
                .flex_1()
                .min_w_0(),
        )
        .child(
            orbit::meta("Clases", 10.0, orbit::ink_3(cx), cx)
                .w(px(224.0))
                .flex_none(),
        )
        .child(
            orbit::meta("Carrera", 10.0, orbit::ink_3(cx), cx)
                .w(px(60.0))
                .flex_none(),
        )
        .child(
            orbit::meta("Salida en", 10.0, orbit::ink_3(cx), cx)
                .w(px(76.0))
                .flex_none(),
        )
        .child(div().w(px(68.0)).flex_none())
}

fn race_row(
    calendar: &Calendar,
    row: &views::Start<'_>,
    now: DateTime<Utc>,
    cx: &mut Context<Calendar>,
) -> Div {
    let soon = (row.at - now).num_minutes() < 10;
    div()
        .flex()
        .items_center()
        .gap(px(10.0))
        .min_h(px(44.0))
        .py(px(4.0))
        .px(px(18.0))
        .border_b_1()
        .border_color(rgba(orbit::line_row(cx)))
        .when(soon, |row| row.bg(orbit::tint(orbit::carmine(cx), 0.06)))
        .child(div().w(px(72.0)).flex_none().child(orbit::pill(
            if soon { "En breve" } else { "Próxima" },
            if soon { Tone::Accent } else { Tone::Neutral },
            cx,
        )))
        .child(
            orbit::mono_text(
                row.at.with_timezone(&Local).format("%H:%M").to_string(),
                13.0,
                orbit::ink(cx),
                cx,
            )
            .w(px(60.0))
            .flex_none(),
        )
        .child(
            orbit::text(row.series.name.clone(), 13.0, 600, orbit::ink(cx), cx)
                .line_height(px(16.0))
                .truncate()
                .flex_1()
                .min_w_0(),
        )
        .child(
            orbit::text(row.series.track.clone(), 12.0, 400, orbit::ink_3(cx), cx)
                .line_height(px(16.0))
                .truncate()
                .flex_1()
                .min_w_0(),
        )
        .child(
            div()
                .w(px(224.0))
                .flex_none()
                .flex()
                .flex_wrap()
                .gap(px(4.0))
                .children(
                    classes(row.series)
                        .into_iter()
                        .map(|class| class_chip(class, cx)),
                ),
        )
        .child(
            orbit::text(
                row.series
                    .race_duration_min
                    .map_or_else(|| "—".into(), |minutes| format!("{minutes} min")),
                12.0,
                500,
                orbit::ink_2(cx),
                cx,
            )
            .w(px(60.0))
            .flex_none(),
        )
        .child(
            orbit::mono_text(countdown(row.at, now), 12.0, orbit::ink_2(cx), cx)
                .w(px(76.0))
                .flex_none(),
        )
        .child(
            div()
                .w(px(68.0))
                .flex_none()
                .flex()
                .gap(px(4.0))
                .child(follow_button(calendar, row.series, cx))
                .child(reminder_button(calendar, row.series, cx)),
        )
}
fn times_board_header(calendar: &Calendar, now: DateTime<Utc>, cx: &mut Context<Calendar>) -> Div {
    div()
        .flex()
        .items_center()
        .flex_wrap()
        .gap(px(12.0))
        .px(px(18.0))
        .py(px(12.0))
        .child(orbit::neo_header("Horario · próxima hora", "v-calendar", cx).flex_none())
        .when(
            matches!(calendar.schedule.is_current(now), Ok(true)),
            |header| header.child(filters(calendar, cx).flex_row().flex_wrap().gap(px(8.0))),
        )
}

fn times_footer(status: &str, cx: &gpui::App) -> Div {
    orbit::text(status.to_owned(), 10.0, 400, orbit::ink_3(cx), cx)
        .px(px(18.0))
        .py(px(8.0))
        .flex_none()
}

pub(super) fn render(calendar: &mut Calendar, cx: &mut Context<Calendar>) -> Stateful<Div> {
    let now = calendar.demo_now.unwrap_or_else(Utc::now);
    if matches!(calendar.schedule.is_current(now), Ok(true)) {
        match calendar.view {
            super::CalendarView::Agenda => return super::presentation::agenda(calendar, now, cx),
            super::CalendarView::Posters => return super::presentation::posters(calendar, now, cx),
            super::CalendarView::Times => {}
        }
    }
    let mut table = orbit::neo_card(cx)
        .p_0()
        .gap_0()
        .flex_1()
        .child(times_board_header(calendar, now, cx))
        .when(
            matches!(calendar.schedule.is_current(now), Ok(true)),
            |table| table.child(times_header(cx)),
        );
    let mut races = div()
        .id("calendar-races")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll();
    match next_hour_rows(calendar, now) {
        Ok(rows) if !rows.is_empty() => {
            for row in rows {
                races = races.child(race_row(calendar, &row, now, cx));
            }
        }
        Ok(_) => {
            let current = matches!(calendar.schedule.is_current(now), Ok(true));
            races = races.flex().flex_col().child(
                div()
                    .flex_1()
                    .min_h(px(100.0))
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(px(16.0))
                    .child(orbit::icon("v-calendar", 42.0, orbit::ink_3(cx)))
                    .child(
                        orbit::text(
                            if current {
                                "No hay salidas en la próxima hora para estos filtros"
                            } else {
                                "Aún no hay horario publicado para esta semana"
                            },
                            18.0,
                            600,
                            orbit::ink(cx),
                            cx,
                        )
                        .text_center(),
                    )
                    .child(
                        orbit::text(
                            if current {
                                "Prueba otra clase o nivel, o actualiza el horario."
                            } else {
                                "Pulsa Actualizar horario para descargar el último."
                            },
                            13.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        )
                        .text_center(),
                    )
                    .child(
                        orbit::button("calendar-empty-reload", "Actualizar horario", cx)
                            .self_center()
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.refresh(cx);
                            })),
                    ),
            );
        }
        Err(error) => {
            races = races.child(orbit::callout(error, cx));
        }
    }
    table = table.child(orbit::scroll_fade(
        races,
        cx.global::<orbit::design::Tokens>().colors.neo_bottom,
    ));
    table = table.child(times_footer(&calendar.status, cx));
    div()
        .id("calendar")
        .w_full()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(calendar.adapt.gap()))
        .child(hero(calendar, now, cx))
        .child(table)
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error, cx))
        })
}
fn week_card(calendar: &Calendar, now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let today = now.with_timezone(&Local).date_naive();
    let mut week = div().flex().flex_col().gap(px(8.0));
    if let Ok(monday) = views::week_anchor(today) {
        let mut days = div().flex().gap(px(6.0));
        for day in 0_u8..7 {
            let date = monday + Duration::days(i64::from(day));
            let starts = if matches!(calendar.schedule.is_current(now), Ok(true)) {
                views::midnight(date, &Local).and_then(|from| {
                    views::midnight(date + Duration::days(1), &Local).and_then(|to| {
                        views::starts(&calendar.schedule, views::Filter::default(), from, to)
                    })
                })
            } else {
                Ok(Vec::new())
            };
            days = days.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .py(px(12.0))
                    .rounded(px(10.0))
                    .when(date == today, |day| day.bg(rgb(orbit::surface_3(cx))))
                    .child(orbit::text(
                        ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"][usize::from(day)],
                        11.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .child(
                        orbit::text(date.day().to_string(), 22.0, 700, orbit::ink(cx), cx)
                            .font_family(
                                cx.global::<orbit::design::Tokens>().fonts.display.clone(),
                            ),
                    )
                    .child(orbit::text(
                        match starts {
                            Ok(ref rows) if !rows.is_empty() => "●",
                            Ok(_) => "",
                            Err(_) => "?",
                        },
                        11.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )),
            );
        }
        week = week.child(days);
    }
    week
}
pub(super) fn rail_sections(
    calendar: &Calendar,
    cx: &mut Context<Calendar>,
) -> Vec<orbit::RailSection> {
    // La pantalla de tiempos usa todo el ancho; la semana y recordatorios siguen en Agenda/Carteles.
    if calendar.view == super::CalendarView::Times {
        return Vec::new();
    }
    let now = calendar.demo_now.unwrap_or_else(Utc::now);
    let week = week_card(calendar, now, cx);
    let current = matches!(calendar.schedule.is_current(now), Ok(true));
    let timing = div()
        .flex()
        .flex_col()
        .gap(px(8.0))
        .child(orbit::text(
            if current {
                "Horario vigente"
            } else {
                "Aún no hay horario publicado para esta semana"
            },
            14.0,
            600,
            if current {
                orbit::green(cx)
            } else {
                orbit::ember(cx)
            },
            cx,
        ))
        .child(orbit::text(
            if current {
                calendar.schedule.window().map_or_else(
                    |_| "Vigencia no disponible".into(),
                    |(from, until)| {
                        format!(
                            "Válido: {} → {}",
                            from.with_timezone(&Local).format("%d/%m/%Y %H:%M"),
                            until.with_timezone(&Local).format("%d/%m/%Y %H:%M")
                        )
                    },
                )
            } else {
                "Vigencia no disponible".into()
            },
            12.0,
            400,
            orbit::ink_3(cx),
            cx,
        ))
        .child(orbit::text(
            format!(
                "Tu zona horaria · {}",
                now.with_timezone(&Local).format("UTC%:z")
            ),
            13.0,
            400,
            orbit::ink_2(cx),
            cx,
        ))
        .child(orbit::text(
            calendar.status.clone(),
            11.0,
            400,
            orbit::ink_3(cx),
            cx,
        ));
    let mut follows = div()
        .id("calendar-reminders")
        .flex_1()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .min_h_0()
        .gap(px(8.0));
    for series in calendar
        .schedule
        .series
        .iter()
        .filter(|series| current && calendar.following.reminder_ids.contains(&series.id))
    {
        follows = follows.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .gap(px(8.0))
                .child(orbit::text(
                    series.name.clone(),
                    13.0,
                    600,
                    orbit::ink(cx),
                    cx,
                ))
                .child(reminder_button(calendar, series, cx)),
        );
    }
    follows = follows.child(orbit::text("Avisos · Próximamente. La campana guarda tu preferencia; aún no envía notificaciones. Lanzar perfil antes de la salida · Próximamente.", 12.0, 400, orbit::ink_3(cx), cx));
    vec![
        orbit::RailSection::new("Esta semana", "v-calendar", week),
        orbit::RailSection::new("Horario", "clock", timing),
        orbit::RailSection::new("Tus recordatorios", "v-bell", follows).grow(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn next_hour_is_half_open_and_ignores_later_races() {
        let dir = std::env::temp_dir().join("vantare-r6-next-hour-fixture");
        let mut calendar = Calendar::load(&dir).expect("calendario");
        calendar.schedule.series.truncate(1);
        calendar.schedule.series[0].recurrence.kind = "interval".into();
        calendar.schedule.series[0].recurrence.interval_minutes = 60;
        calendar.schedule.series[0].start_offset_minute = 0;
        let now = calendar.schedule.window().expect("vigencia").0;
        let rows = next_hour_rows(&calendar, now).expect("hora");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].at, now);
        let posters = next_rows(&calendar, now).expect("carteles");
        let agenda = views::day_rows(
            &calendar.schedule,
            views::Filter::default(),
            now.date_naive(),
            now,
            &Utc,
        )
        .expect("agenda");
        assert_eq!(posters[0].series.id, rows[0].series.id);
        assert_eq!(posters[0].at, rows[0].at);
        assert!(
            agenda
                .iter()
                .flat_map(|hour| &hour.events)
                .any(|event| event.series.id == rows[0].series.id && event.at == rows[0].at)
        );
        calendar.schedule.series[0].recurrence.interval_minutes = 1;
        calendar.schedule.valid_until = (now + Duration::days(8)).to_rfc3339();
        assert_eq!(
            next_rows(&calendar, now)
                .expect("una sola salida sin expandir 10080 ocurrencias")
                .len(),
            1
        );
        calendar.schedule.series[0].recurrence.interval_minutes = 120;
        let after = now + Duration::seconds(1);
        assert!(
            !next_rows(&calendar, after)
                .expect("salida posterior")
                .is_empty()
        );
        assert!(
            next_hour_rows(&calendar, after)
                .expect("hora vacía")
                .is_empty()
        );
        let expired = now + Duration::days(100);
        assert!(
            next_rows(&calendar, expired)
                .expect("carteles caducados")
                .is_empty()
        );
        assert!(
            next_hour_rows(&calendar, expired)
                .expect("tiempos caducados")
                .is_empty()
        );
        assert!(
            views::day_rows(
                &calendar.schedule,
                views::Filter::default(),
                expired.date_naive(),
                expired,
                &Utc
            )
            .expect("agenda caducada")
            .iter()
            .all(|hour| hour.events.is_empty())
        );
    }
    #[test]
    fn filters_and_countdown_use_catalog_and_real_clock() {
        let dir = std::env::temp_dir().join("vantare-1470-calendar-filters");
        let mut calendar = Calendar::load(&dir).expect("calendar");
        let now = calendar.schedule.window().expect("window").0;
        calendar.class_filter = Some(classes(&calendar.schedule.series[0])[0].to_owned());
        calendar.tier_filter = Some(calendar.schedule.series[0].tier.clone());
        let rows = next_rows(&calendar, now).expect("rows");
        assert!(!rows.is_empty());
        assert!(rows.iter().all(|row| includes(&calendar, row.series)));
        assert_eq!(
            rows.iter()
                .map(|row| &row.series.id)
                .collect::<BTreeSet<_>>()
                .len(),
            rows.len()
        );
        calendar.class_filter = Some("absent".into());
        assert!(next_rows(&calendar, now).expect("rows").is_empty());
        assert!(
            next_rows(&calendar, now + Duration::days(100))
                .expect("expired")
                .is_empty()
        );
        assert_eq!(countdown(now + Duration::seconds(61), now), "2 min");
        assert_eq!(countdown(now + Duration::minutes(112), now), "1 h 52 min");
        assert_eq!(countdown(now - Duration::minutes(1), now), "0 min");
    }
}
