//! Pantalla beta: catálogo UTC y seguimiento locales; avisos sin servicio se anuncian pendientes.
use super::{Calendar, Series, views};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, Local, Timelike, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px, rgb, rgba};
use std::collections::BTreeSet;

fn classes(series: &Series) -> Vec<&str> {
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
fn class_color(class: &str, cx: &gpui::App) -> u32 {
    match class {
        "Hypercar" => 0x00e1_4a54,
        "LMP2" => 0x004c_8df6,
        "LMP3" => 0x00a9_70f0,
        "LMGT3" => 0x00e9_852a,
        "GTE" | "LMGTE Am" => 0x00d6_b83a,
        _ => orbit::ink_3(cx),
    }
}
fn class_chip(class: &str, cx: &gpui::App) -> Div {
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
fn tier_pill(tier: &str, cx: &gpui::App) -> Div {
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
fn includes(calendar: &Calendar, series: &Series) -> bool {
    calendar
        .tier_filter
        .as_ref()
        .is_none_or(|tier| tier == &series.tier)
        && calendar
            .class_filter
            .as_ref()
            .is_none_or(|class| classes(series).contains(&class.as_str()))
}
fn next_rows(calendar: &Calendar, now: DateTime<Utc>) -> Result<Vec<views::Start<'_>>, String> {
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
        if let Some(at) = calendar
            .schedule
            .starts(series, now, now + Duration::days(7))?
            .into_iter()
            .next()
        {
            rows.push(views::Start { series, at });
        }
    }
    rows.sort_by(|a, b| a.at.cmp(&b.at).then_with(|| a.series.id.cmp(&b.series.id)));
    Ok(rows)
}
fn countdown(at: DateTime<Utc>, now: DateTime<Utc>) -> String {
    let minutes = (at - now).num_seconds().max(0).saturating_add(59) / 60;
    if minutes >= 60 {
        format!("{} h {:02} min", minutes / 60, minutes % 60)
    } else {
        format!("{minutes} min")
    }
}
fn follow_button(
    calendar: &Calendar,
    series: &Series,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let followed = calendar.following.series_ids.contains(&series.id);
    let id = series.id.clone();
    orbit::button(
        gpui::SharedString::from(format!("calendar-follow-{id}")),
        if followed { "Siguiendo" } else { "Seguir" },
        cx,
    )
    .when(followed, |button| {
        button.bg(orbit::tint(orbit::carmine(cx), 0.12))
    })
    .on_click(cx.listener(move |this, _, _, cx| {
        this.error = this.follow(id.clone()).err();
        cx.notify();
    }))
}
fn filters(calendar: &Calendar, cx: &mut Context<Calendar>) -> Div {
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
fn hero(calendar: &Calendar, now: DateTime<Utc>, cx: &mut Context<Calendar>) -> Div {
    let rows = next_rows(calendar, now);
    let next = rows.as_ref().ok().and_then(|rows| {
        rows.iter()
            .find(|row| calendar.following.series_ids.contains(&row.series.id))
    });
    let mut hero = orbit::neo_accent_card(cx)
        .flex_none()
        .child(orbit::eyebrow("La siguiente que sigues", cx));
    if let Some(next) = next {
        hero = hero
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(12.0))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(
                                orbit::text(
                                    next.series.name.clone(),
                                    30.0,
                                    700,
                                    orbit::ink(cx),
                                    cx,
                                )
                                .font_family(
                                    cx.global::<orbit::design::Tokens>().fonts.display.clone(),
                                ),
                            )
                            .child(orbit::text(
                                format!(
                                    "{} · {}",
                                    next.series.track,
                                    classes(next.series).join(" · ")
                                ),
                                13.0,
                                400,
                                orbit::ink_2(cx),
                                cx,
                            )),
                    )
                    .child(
                        div()
                            .child(
                                orbit::text(countdown(next.at, now), 38.0, 700, orbit::ink(cx), cx)
                                    .font_family(
                                        cx.global::<orbit::design::Tokens>().fonts.display.clone(),
                                    ),
                            )
                            .child(orbit::text(
                                {
                                    let at = next.at.with_timezone(&Local);
                                    format!(
                                        "{} {:02}:{:02} · {}",
                                        ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
                                            [at.weekday().num_days_from_monday() as usize],
                                        at.hour(),
                                        at.minute(),
                                        at.format("%Z")
                                    )
                                },
                                12.0,
                                400,
                                orbit::ink_3(cx),
                                cx,
                            )),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(6.0))
                    .children(
                        classes(next.series)
                            .into_iter()
                            .map(|class| class_chip(class, cx)),
                    )
                    .child(tier_pill(&next.series.tier, cx)),
            );
    } else {
        hero = hero.child(orbit::text(
            "Sigue una serie con horario vigente para ver su próxima salida.",
            22.0,
            600,
            orbit::ink(cx),
            cx,
        ));
    }
    hero.child(orbit::text(
        "Avisarme antes · Próximamente     |     Lanzar perfil antes · Próximamente",
        12.0,
        400,
        orbit::ink_3(cx),
        cx,
    ))
}
fn race_row(
    calendar: &Calendar,
    row: &views::Start<'_>,
    now: DateTime<Utc>,
    cx: &mut Context<Calendar>,
) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(16.0))
        .py(px(12.0))
        .border_b_1()
        .border_color(rgba(orbit::line_row(cx)))
        .when((row.at - now).num_minutes() < 10, |row| {
            row.bg(orbit::tint(orbit::carmine(cx), 0.06))
        })
        .child(
            div()
                .w(px(96.0))
                .flex_none()
                .child(
                    orbit::text(
                        row.at.with_timezone(&Local).format("%H:%M").to_string(),
                        22.0,
                        700,
                        orbit::ink(cx),
                        cx,
                    )
                    .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone()),
                )
                .child(orbit::text(
                    format!("en {}", countdown(row.at, now)),
                    11.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                )),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(orbit::text(
                    row.series.name.clone(),
                    14.0,
                    600,
                    orbit::ink(cx),
                    cx,
                ))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .flex_wrap()
                        .gap(px(8.0))
                        .child(tier_pill(&row.series.tier, cx))
                        .child(orbit::text(
                            row.series.track.clone(),
                            12.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        )),
                ),
        )
        .child(
            div()
                .w(px(180.0))
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
        .child(orbit::text(
            row.series
                .race_duration_min
                .map_or_else(|| "–".into(), |minutes| format!("{minutes} min")),
            12.0,
            500,
            orbit::ink_2(cx),
            cx,
        ))
        .child(follow_button(calendar, row.series, cx))
}
pub(super) fn render(calendar: &mut Calendar, cx: &mut Context<Calendar>) -> Stateful<Div> {
    let now = calendar.demo_now.unwrap_or_else(Utc::now);
    let mut table = orbit::neo_card(cx)
        .flex_1()
        .child(orbit::neo_header(
            "Próximas carreras · una salida por serie",
            "v-calendar",
            cx,
        ))
        .child(filters(calendar, cx));
    let mut races = div()
        .id("calendar-races")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll();
    match next_rows(calendar, now) {
        Ok(rows) if !rows.is_empty() => {
            for row in rows {
                races = races.child(race_row(calendar, &row, now, cx));
            }
        }
        Ok(_) => {
            races = races.child(orbit::text(
                "Sin salidas disponibles para estos filtros. El catálogo debe estar vigente.",
                13.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        }
        Err(error) => {
            races = races.child(orbit::callout(error, cx));
        }
    }
    table = table.child(orbit::scroll_fade(
        races,
        cx.global::<orbit::design::Tokens>().colors.neo_bottom,
    ));
    div()
        .id("calendar")
        .w_full()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(16.0))
        .child(
            div()
                .flex()
                .flex_none()
                .items_center()
                .justify_between()
                .gap(px(12.0))
                .child(orbit::neo_page_header(
                    "Calendario LMU",
                    "Carreras diarias y semanales · hora local del equipo",
                    cx,
                ))
                .child(
                    orbit::button("calendar-reload", "Actualizar horario", cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.error = this.reload().err();
                            cx.notify();
                        }),
                    ),
                ),
        )
        .child(hero(calendar, now, cx))
        .child(table)
        .when_some(calendar.error.clone(), |page, error| {
            page.child(orbit::callout(error, cx))
        })
}
fn week_card(calendar: &Calendar, now: DateTime<Utc>, cx: &gpui::App) -> Div {
    let today = now.with_timezone(&Local).date_naive();
    let mut week = orbit::neo_card(cx).child(orbit::neo_header("Esta semana", "clock", cx));
    if let Ok(monday) = views::week_anchor(today) {
        let mut days = div().flex().gap(px(6.0));
        for day in 0_u8..7 {
            let date = monday + Duration::days(i64::from(day));
            let starts = views::midnight(date, &Local).and_then(|from| {
                views::midnight(date + Duration::days(1), &Local).and_then(|to| {
                    views::starts(&calendar.schedule, views::Filter::default(), from, to)
                })
            });
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
                            Ok(_) => "–",
                            Err(_) => "?",
                        },
                        11.0,
                        400,
                        orbit::coral(cx),
                        cx,
                    )),
            );
        }
        week = week.child(days);
    }
    week
}
pub(super) fn context_column(calendar: &Calendar, cx: &mut Context<Calendar>) -> Stateful<Div> {
    let now = calendar.demo_now.unwrap_or_else(Utc::now);
    let week = week_card(calendar, now, cx);
    let current = matches!(calendar.schedule.is_current(now), Ok(true));
    let timing = orbit::neo_card(cx)
        .child(orbit::neo_header("Horario", "refresh", cx))
        .child(orbit::text(
            if current {
                "Horario vigente"
            } else {
                "Horario caducado · actualiza el catálogo local"
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
            calendar.schedule.window().map_or_else(
                |_| "Vigencia no disponible".into(),
                |(from, until)| {
                    format!(
                        "Válido: {} → {}",
                        from.with_timezone(&Local).format("%d/%m/%Y %H:%M"),
                        until.with_timezone(&Local).format("%d/%m/%Y %H:%M")
                    )
                },
            ),
            12.0,
            400,
            orbit::ink_3(cx),
            cx,
        ))
        .child(orbit::text(
            format!(
                "Zona del equipo · {}",
                now.with_timezone(&Local).format("%Z (UTC%:z)")
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
    let mut follows =
        orbit::neo_card(cx)
            .flex_1()
            .child(orbit::neo_header("Series que sigues", "v-bell", cx));
    for series in calendar
        .schedule
        .series
        .iter()
        .filter(|series| calendar.following.series_ids.contains(&series.id))
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
                .child(follow_button(calendar, series, cx)),
        );
    }
    follows = follows.child(orbit::text("Tus recordatorios · Próximamente. Seguir una serie guarda tu selección; aún no envía avisos ni abre aplicaciones.", 13.0, 400, orbit::ink_3(cx), cx));
    orbit::neo_context_column("calendar-context", cx)
        .child(week)
        .child(timing)
        .child(follows)
}

#[cfg(test)]
mod tests {
    use super::*;
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
