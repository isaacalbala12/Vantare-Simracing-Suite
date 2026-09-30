//! Inicio compone Orbit y el calendario local. La shell conserva la navegación.
use super::{Calendar, Schedule, Series};
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

struct Race<'a> {
    at: DateTime<Utc>,
    series: &'a Series,
}

/// Cuatro salidas por serie bastan para las cuatro primeras del conjunto y
/// para la primera serie seguida. No expande agendas caducadas ni futuras.
fn races(schedule: &Schedule, now: DateTime<Utc>) -> Result<Vec<Race<'_>>, String> {
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
                .map(|at| Race { at, series }),
        );
    }
    races.sort_unstable_by(|a, b| (a.at, &a.series.id).cmp(&(b.at, &b.series.id)));
    Ok(races)
}

fn target<'a, 's>(races: &'a [Race<'s>], following: &[String]) -> Option<&'a Race<'s>> {
    races
        .iter()
        .find(|race| following.contains(&race.series.id))
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
    race: Option<&Race<'_>>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Div {
    let mut view = div().w(px(300.0)).flex_none();
    if let Some(race) = race {
        view = view.child(
            orbit::card("").child(
                orbit::card_body()
                    .child(orbit::eyebrow("Próxima serie"))
                    .child(orbit::text(race.series.name.clone(), 15.0, 700, orbit::INK))
                    .child(orbit::text(
                        race.series.track.clone(),
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

fn hero(next: Div, navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>) -> Div {
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
                .child(orbit::text(
                    greeting(Local::now().hour()),
                    34.0,
                    700,
                    orbit::INK,
                ))
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

fn profile(navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>) -> Div {
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
                            "Perfil activo · pendiente",
                            24.0,
                            700,
                            orbit::INK,
                        ))
                        .child(orbit::chip("Perfiles · pendiente", orbit::Tone::Neutral))
                        .child(orbit::text(
                            "Perfiles y vista previa pendientes.",
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

fn lists(starts: &[Race<'_>], navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>) -> Div {
    let mut race_list = orbit::card_body();
    if starts.is_empty() {
        race_list = race_list.child(orbit::empty_state("Sin salidas próximas", ""));
    }
    for (index, race) in starts.iter().take(RACE_ROWS).enumerate() {
        race_list = race_list.child(navigate(
            orbit::list_row(
                ("home-race", index),
                &race.series.name,
                &format!(
                    "{} · {} · {}",
                    race.at.with_timezone(&Local).format("%d/%m %H:%M"),
                    race.series.track,
                    race.series.license_label
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
    navigate: impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Stateful<Div> {
    let now = Utc::now();
    let (starts, error) = match races(&calendar.schedule, now) {
        Ok(starts) => (starts, None),
        Err(error) => (vec![], Some(error)),
    };
    div()
        .id("home")
        .flex()
        .flex_col()
        .gap(px(orbit::GUTTER / 2.0))
        .child(hero(
            next_race(target(&starts, &calendar.following.series_ids), &navigate),
            &navigate,
        ))
        .child(profile(&navigate))
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
        let followed = &starts.last().ok_or("sin carreras")?.series.id;
        let followed_race = starts
            .iter()
            .find(|race| &race.series.id == followed)
            .ok_or("serie sin salida en 24 h")?;
        assert_eq!(
            target(&starts, std::slice::from_ref(followed)).map(|race| (&race.series.id, race.at)),
            Some((followed, followed_race.at))
        );
        assert_eq!(
            target(&starts, &["serie-desconocida".into()]).map(|race| (&race.series.id, race.at)),
            starts.first().map(|race| (&race.series.id, race.at))
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
            .map(|race| (race.at, &race.series.id))
            .collect();
        assert_eq!(rows, expanded.into_iter().take(4).collect::<Vec<_>>());
        assert_eq!(rows.len(), 4);
        schedule.valid_from = "fecha inválida".into();
        assert!(races(&schedule, now).is_err());
        Ok(())
    }
}
