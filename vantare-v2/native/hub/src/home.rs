//! Inicio compone Orbit y el calendario local. La shell conserva la navegación.
use super::{Calendar, Schedule};
use crate::{Section, orbit};
use chrono::{DateTime, Duration, Local, Timelike, Utc};
use gpui::{Div, Stateful, div, prelude::*, px};

const RACE_ROWS: usize = 4;

fn greeting(hour: u32) -> &'static str {
    match hour {
        0..12 => "Buenos días, piloto.",
        12..20 => "Buenas tardes, piloto.",
        _ => "Buenas noches, piloto.",
    }
}

struct Race {
    id: String,
    at: DateTime<Utc>,
    name: String,
    track: String,
    license_label: String,
}

/// Cuatro salidas por serie bastan para las cuatro primeras del conjunto y
/// para la primera serie seguida. No expande agendas caducadas ni futuras.
fn races(schedule: &Schedule, now: DateTime<Utc>) -> Result<Vec<Race>, String> {
    if !schedule.is_current(now)? {
        return Ok(vec![]);
    }
    let mut races = vec![];
    for series in &schedule.series {
        races.extend(
            schedule
                .starts(series, now, now + Duration::days(1))?
                .into_iter()
                .take(RACE_ROWS)
                .map(|at| Race {
                    id: series.id.clone(),
                    at,
                    name: series.name.clone(),
                    track: series.track.clone(),
                    license_label: series.license_label.clone(),
                }),
        );
    }
    races.sort_unstable_by(|a, b| (a.at, &a.id).cmp(&(b.at, &b.id)));
    Ok(races)
}

fn demo_races(
    schedule: &Schedule,
    demo: &crate::demo::DemoData,
    now: DateTime<Utc>,
) -> Result<Vec<Race>, String> {
    if !schedule.is_current(now)? {
        return Ok(vec![]);
    }
    demo.home_races
        .iter()
        .map(|race| {
            Ok(Race {
                id: race.id.clone(),
                at: DateTime::parse_from_rfc3339(&race.at_utc)
                    .map_err(|error| format!("carrera demo {}: {error}", race.id))?
                    .with_timezone(&Utc),
                name: race.name.clone(),
                track: race.track.clone(),
                license_label: race.license_label.clone(),
            })
        })
        .collect()
}

fn target<'a>(races: &'a [Race], following: &[String]) -> Option<&'a Race> {
    races
        .iter()
        .find(|race| following.contains(&race.id))
        .or_else(|| races.first())
}

fn pending_overlay(id: &'static str) -> Stateful<Div> {
    orbit::button(id, "Abrir overlay · pendiente")
        .tab_stop(false)
        .opacity(orbit::DISABLED)
}

/// Ejecuta el mismo Ctrl+K que la shell, incluido foco, cierre y teclado.
/// No monta otra paleta ni mantiene otro estado de búsqueda.
fn command() -> Stateful<Div> {
    orbit::button("home-command", "")
        .w_full()
        .h(px(72.0))
        .aria_label("Busca, abre o lanza algo en Vantare… · Ctrl+K")
        .on_click(|_, window, cx| {
            window.dispatch_keystroke(
                gpui::Keystroke {
                    modifiers: gpui::Modifiers {
                        control: true,
                        ..Default::default()
                    },
                    key: "k".into(),
                    key_char: None,
                },
                cx,
            );
        })
        .child(
            div()
                .w_full()
                .flex()
                .items_center()
                .gap(px(orbit::GUTTER / 2.0))
                .child(orbit::icon("i-comando", 18.0, orbit::CORAL))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(orbit::text(
                            "Busca, abre o lanza algo en Vantare…",
                            16.0,
                            600,
                            orbit::INK_2,
                        ))
                        .child(orbit::text(
                            "\"Abre el Studio\"",
                            orbit::SECONDARY,
                            400,
                            orbit::INK_3,
                        )),
                )
                .child(orbit::chip("Ctrl + K", orbit::Tone::Neutral)),
        )
}

fn next_race(
    race: Option<&Race>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Div {
    let mut view = div().w(px(300.0)).flex_none();
    if let Some(race) = race {
        view = view.child(
            orbit::card("").child(
                orbit::card_body()
                    .child(orbit::eyebrow("Próxima serie"))
                    .child(orbit::text(race.name.clone(), 15.0, 700, orbit::INK))
                    .child(orbit::text(
                        race.track.clone(),
                        orbit::SECONDARY,
                        400,
                        orbit::INK_3,
                    ))
                    .child(orbit::text(
                        race.at
                            .with_timezone(&Local)
                            .format("%d/%m · %H:%M")
                            .to_string(),
                        orbit::BODY,
                        600,
                        orbit::INK_2,
                    ))
                    .child(navigate(
                        orbit::button("home-next", "Abrir la serie en Calendario"),
                        Section::Calendar,
                    )),
            ),
        );
    } else {
        view = view.child(orbit::empty_state(
            "Sin salidas próximas en el calendario",
            "",
        ));
    }
    view
}

fn hero(
    next: Div,
    greeting: String,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(orbit::GUTTER))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(orbit::GUTTER / 2.0))
                .child(orbit::text(greeting, 34.0, 700, orbit::INK))
                .child(command())
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(orbit::RADIUS_CHIP))
                        .child(navigate(
                            orbit::button("home-quick-studio", "Abrir Studio"),
                            Section::Studio,
                        ))
                        .child(pending_overlay("home-quick-overlay"))
                        .child(navigate(
                            orbit::button("home-plan", "Crear plan"),
                            Section::Strategy,
                        ))
                        .child(navigate(
                            orbit::button("home-launch", "Lanzar perfil"),
                            Section::Launcher,
                        )),
                ),
        )
        .child(next)
}

fn profile(
    demo: Option<&crate::demo::DemoData>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Div {
    // Falta una API de Studio que exponga su layout/renderers y una escala de
    // incrustación en Overlay. No se crea otra lectura ni un renderer de cajas.
    orbit::card("").child(
        orbit::card_body().child(
            div()
                .flex()
                .items_center()
                .gap(px(orbit::GUTTER))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(orbit::RADIUS_CHIP))
                        .child(orbit::eyebrow("Perfil activo"))
                        .child(orbit::text(
                            demo.map_or("Perfil activo · pendiente", |data| {
                                data.profile.name.as_str()
                            }),
                            24.0,
                            700,
                            orbit::INK,
                        ))
                        .child({
                            let label = demo.map_or_else(
                                || "Perfiles · pendiente".to_owned(),
                                |data| format!("{} widgets · activa", data.profile.widgets),
                            );
                            orbit::chip(&label, orbit::Tone::Neutral)
                        })
                        .child(orbit::text(
                            demo.map_or("Perfiles y vista previa pendientes.".to_owned(), |data| {
                                format!(
                                    "Perfil de demostración · {} × {}.",
                                    data.profile.width, data.profile.height
                                )
                            }),
                            orbit::SECONDARY,
                            400,
                            orbit::INK_3,
                        ))
                        .child(
                            div()
                                .flex()
                                .flex_wrap()
                                .gap(px(orbit::RADIUS_CHIP))
                                .child(navigate(
                                    orbit::button("home-studio", "Abrir Studio"),
                                    Section::Studio,
                                ))
                                .child(pending_overlay("home-overlay")),
                        ),
                )
                .child(
                    orbit::card("")
                        .w(px(340.0))
                        .h(px(191.25))
                        .flex_none()
                        .justify_center()
                        .child(orbit::empty_state("Vista previa · pendiente", "")),
                ),
        ),
    )
}

fn lists(starts: &[Race], navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>) -> Div {
    let mut race_list = orbit::card_body();
    if starts.is_empty() {
        race_list = race_list.child(orbit::empty_state("Sin salidas próximas", ""));
    }
    for (index, race) in starts.iter().take(RACE_ROWS).enumerate() {
        race_list = race_list.child(navigate(
            orbit::list_row(
                ("home-race", index),
                &race.name,
                &format!(
                    "{} · {} · {}",
                    race.at.with_timezone(&Local).format("%d/%m %H:%M"),
                    race.track,
                    race.license_label
                ),
                index == 0,
                true,
            ),
            Section::Calendar,
        ));
    }
    div()
        .flex()
        .gap(px(orbit::GUTTER * 0.75))
        .child(
            orbit::card("")
                .flex_1()
                .flex_basis(gpui::relative(7.0 / 12.0))
                .min_w_0()
                .min_h(px(360.0))
                .child(
                    orbit::setting_row(
                        "Próximas carreras",
                        "",
                        div()
                            .flex()
                            .items_center()
                            .gap(px(orbit::RADIUS_CHIP))
                            .child(orbit::text(
                                "Cadencia publicada",
                                orbit::SECONDARY,
                                400,
                                orbit::INK_3,
                            ))
                            .child(navigate(
                                orbit::button("home-races", "Ver todas"),
                                Section::Calendar,
                            )),
                    )
                    .px(px(20.0)),
                )
                .child(race_list),
        )
        .child(
            orbit::card("")
                .flex_1()
                .flex_basis(gpui::relative(5.0 / 12.0))
                .min_w_0()
                .child(
                    orbit::setting_row(
                        "Perfiles",
                        "",
                        navigate(orbit::button("home-profiles", "Gestionar"), Section::Studio),
                    )
                    .px(px(20.0)),
                )
                .child(orbit::empty_state(
                    "Perfiles · pendiente",
                    "Catálogo de perfiles · pendiente",
                )),
        )
}

/// Solo enlaza intenciones existentes; los contratos de perfiles y control
/// de overlays aún no existen. Un layout sin identidad no se inventa como perfil.
pub fn render(
    calendar: &Calendar,
    demo: Option<&crate::demo::DemoData>,
    navigate: impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Stateful<Div> {
    let now = calendar.demo_now.unwrap_or_else(Utc::now);
    let starts_result = match demo {
        Some(data) => demo_races(&calendar.schedule, data, now),
        None => races(&calendar.schedule, now),
    };
    let (starts, error) = match starts_result {
        Ok(starts) => (starts, None),
        Err(error) => (vec![], Some(error)),
    };
    let salute = if let Some(demo) = demo {
        let phrase = greeting(now.hour());
        phrase.replace("piloto", &demo.user.name)
    } else {
        greeting(now.with_timezone(&Local).hour()).into()
    };
    div()
        .id("home")
        .flex()
        .flex_col()
        .gap(px(orbit::GUTTER / 2.0))
        .child(hero(
            next_race(target(&starts, &calendar.following.series_ids), &navigate),
            salute,
            &navigate,
        ))
        .child(profile(demo, &navigate))
        .child(lists(&starts, &navigate))
        .when_some(error, |view, error| view.child(orbit::callout(error)))
        .when_some(calendar.error.clone(), |view, error| {
            view.child(orbit::callout(error))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greeting_uses_local_hour_boundaries() {
        for (hour, expected) in [
            (0, "Buenos días, piloto."),
            (11, "Buenos días, piloto."),
            (12, "Buenas tardes, piloto."),
            (19, "Buenas tardes, piloto."),
            (20, "Buenas noches, piloto."),
            (23, "Buenas noches, piloto."),
        ] {
            assert_eq!(greeting(hour), expected);
        }
    }

    #[test]
    fn demo_races_follow_the_fixture_calendar_window() -> Result<(), String> {
        let demo = crate::demo::DemoData::load()?;
        let schedule = Schedule::parse(&demo.calendar_json()?)?;
        let first = DateTime::parse_from_rfc3339(&demo.home_races[0].at_utc)
            .map_err(|error| error.to_string())?
            .with_timezone(&Utc);
        assert_eq!(
            demo_races(&schedule, &demo, first - Duration::minutes(8))?.len(),
            4
        );
        assert!(demo_races(&schedule, &demo, demo.fixed_now()?)?.is_empty());
        Ok(())
    }

    #[test]
    fn calendar_includes_unfollowed_series_orders_rows_and_prefers_followed_target()
    -> Result<(), String> {
        let schedule = Schedule::parse(super::super::SEED.as_bytes())?;
        let (from, to) = schedule.window()?;
        assert!(races(&schedule, from - Duration::seconds(1))?.is_empty());
        assert!(races(&schedule, to)?.is_empty());
        let starts = races(&schedule, from)?;
        assert!(
            !starts.is_empty(),
            "el catálogo real debe ofrecer salidas dentro de su ventana"
        );
        assert!(starts.windows(2).all(|pair| pair[0].at <= pair[1].at));
        assert!(
            starts
                .iter()
                .all(|race| race.at >= from && race.at < from + Duration::days(1) && race.at < to)
        );
        assert_eq!(
            target(&starts, &[]).map(|race| race.at),
            starts.first().map(|race| race.at)
        );
        let followed = &starts.last().ok_or("sin carreras")?.id;
        let followed_race = starts
            .iter()
            .find(|race| &race.id == followed)
            .ok_or("serie sin salida en 24 h")?;
        assert_eq!(
            target(&starts, std::slice::from_ref(followed)).map(|race| (&race.id, race.at)),
            Some((followed, followed_race.at))
        );
        assert_eq!(
            target(&starts, &["serie-desconocida".into()]).map(|race| (&race.id, race.at)),
            starts.first().map(|race| (&race.id, race.at))
        );
        assert!(target(&[], &[]).is_none());
        Ok(())
    }
    #[test]
    fn four_row_limit_preserves_earliest_starts_and_window_errors() -> Result<(), String> {
        let mut schedule = Schedule::parse(super::super::SEED.as_bytes())?;
        let (now, _) = schedule.window()?;
        let mut expanded = vec![];
        for series in &schedule.series {
            expanded.extend(
                schedule
                    .starts(series, now, now + Duration::days(1))?
                    .into_iter()
                    .map(|at| (at, &series.id)),
            );
        }
        expanded.sort_unstable();
        let starts = races(&schedule, now)?;
        let rows: Vec<_> = starts
            .iter()
            .take(RACE_ROWS)
            .map(|race| (race.at, &race.id))
            .collect();
        assert_eq!(rows, expanded.into_iter().take(4).collect::<Vec<_>>());
        assert_eq!(rows.len(), 4);
        schedule.valid_from = "fecha inválida".into();
        assert!(races(&schedule, now).is_err());
        Ok(())
    }
}
