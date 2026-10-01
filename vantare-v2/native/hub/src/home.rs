//! Inicio compone Orbit y el calendario local. La shell conserva la navegación.
use super::{Calendar, Schedule};
use crate::{Section, orbit};
use chrono::{DateTime, Duration, Local, Timelike, Utc};
use gpui::{Div, Stateful, div, linear_color_stop, linear_gradient, prelude::*, px, rgb, rgba};

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
    orbit::button(id, "Abrir overlay")
        .tab_stop(false)
        .opacity(orbit::DISABLED)
}

fn keycap(label: &'static str) -> Div {
    div()
        .min_w(px(27.0))
        .h(px(26.0))
        .px(px(6.5))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(6.5))
        .border_1()
        .border_color(rgba(orbit::LINE_STRONG))
        .bg(rgba(0xffff_ff06))
        .font_family("Cascadia Code")
        .text_size(px(12.0))
        .font_weight(gpui::FontWeight(500.0))
        .text_color(rgb(orbit::INK_3))
        .child(label)
}

/// Ejecuta el mismo Ctrl+K que la shell, incluido foco, cierre y teclado.
/// No monta otra paleta ni mantiene otro estado de búsqueda.
fn command() -> Stateful<Div> {
    orbit::button("home-command", "")
        .w_full()
        .h(px(72.0))
        .pl(px(23.0))
        .pr(px(18.0))
        .rounded(px(24.0))
        .bg(linear_gradient(
            135.0,
            linear_color_stop(rgb(0x0019_191e), 0.0),
            linear_color_stop(rgb(0x0013_1317), 1.0),
        ))
        .border_color(rgba(0xf047_5526))
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
                .child(
                    div()
                        .size(px(44.0))
                        .flex_none()
                        .flex()
                        .items_center()
                        .justify_center()
                        .rounded(px(13.0))
                        .bg(linear_gradient(
                            135.0,
                            linear_color_stop(rgb(orbit::CARMINE), 0.0),
                            linear_color_stop(rgb(orbit::CARMINE_DARK), 1.0),
                        ))
                        .child(orbit::icon("i-comando", 18.0, 0x00ff_ffff)),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(orbit::text(
                            "Busca, abre o lanza algo en Vantare…",
                            16.0,
                            560,
                            orbit::INK_2,
                        ))
                        .child(
                            orbit::text(
                                "\"Abre el Studio con el perfil Clean Overlay\"",
                                11.0,
                                400,
                                orbit::INK_3,
                            )
                            .mt(px(4.0)),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(4.0))
                        .child(keycap("Ctrl"))
                        .child(orbit::text("+", 10.0, 500, orbit::INK_MUTED).px(px(3.0)))
                        .child(keycap("K")),
                ),
        )
}

fn next_race(
    race: Option<&Race>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Div {
    let mut view = div()
        .w(px(300.0))
        .flex_none()
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .gap(px(8.0));
    if let Some(race) = race {
        view = view.child(
            div()
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(div().size(px(8.0)).rounded_full().bg(rgb(orbit::GREEN)))
                .child(orbit::eyebrow("Próximas carreras")),
        );
        view = view
            .child(orbit::text(race.name.clone(), 14.0, 600, orbit::INK_2))
            .child(orbit::text(
                format!(
                    "{} · {}",
                    race.track,
                    race.at.with_timezone(&Local).format("%H:%M")
                ),
                12.0,
                400,
                orbit::INK_3,
            ))
            .child(navigate(
                orbit::button("home-next", "Abrir en Calendario").h(px(36.0)),
                Section::Calendar,
            ));
    } else {
        view = view.child(orbit::text(
            "Sin salidas próximas en el calendario",
            13.0,
            400,
            orbit::INK_3,
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
        .gap(px(40.0))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(orbit::GUTTER / 2.0))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(14.0))
                        .child(div().size(px(10.0)).rounded_full().bg(rgb(orbit::GREEN)))
                        .child(orbit::text(greeting, 34.0, 700, orbit::INK))
                        .mb(px(-6.0)),
                )
                .child(command())
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(9.0))
                        .child(navigate(
                            orbit::button("home-quick-studio", "Abrir Studio")
                                .h(px(36.0))
                                .px(px(13.0))
                                .rounded(px(8.0)),
                            Section::Studio,
                        ))
                        .child(
                            pending_overlay("home-quick-overlay")
                                .h(px(36.0))
                                .px(px(13.0))
                                .rounded(px(8.0)),
                        )
                        .child(navigate(
                            orbit::button("home-plan", "Crear plan")
                                .h(px(36.0))
                                .px(px(13.0))
                                .rounded(px(8.0)),
                            Section::Strategy,
                        ))
                        .child(navigate(
                            orbit::button("home-launch", "Lanzar perfil")
                                .h(px(36.0))
                                .px(px(13.0))
                                .rounded(px(8.0)),
                            Section::Launcher,
                        )),
                ),
        )
        .child(next)
}

fn profile_metadata(demo: Option<&crate::demo::DemoData>) -> Div {
    if let Some(data) = demo {
        div()
            .flex()
            .items_center()
            .gap(px(16.0))
            .mt(px(8.0))
            .mb(px(12.0))
            .child(
                div()
                    .font_family("Cascadia Code")
                    .text_size(px(12.0))
                    .font_weight(gpui::FontWeight(650.0))
                    .text_color(rgb(orbit::INK_3))
                    .child(format!("{} × {}", data.profile.width, data.profile.height)),
            )
            .child(orbit::text(
                format!("{} widgets visibles", data.profile.widgets),
                12.0,
                400,
                orbit::INK_3,
            ))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(7.0))
                    .child(div().size(px(7.0)).rounded_full().bg(rgb(orbit::INK_MUTED)))
                    .child(orbit::text("Overlay detenido", 12.0, 400, orbit::INK_3)),
            )
    } else {
        div()
    }
}

fn profile_info(
    name: &str,
    meta: Div,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Div {
    div()
        .h_full()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .pt(px(6.0))
        .child(orbit::eyebrow("Perfil activo"))
        .child(
            orbit::text(name, 22.0, 700, orbit::INK)
                .mt(px(4.0))
                .mb(px(2.0)),
        )
        .child(meta)
        .child(div().flex_1())
        .child(
            div()
                .flex()
                .flex_wrap()
                .gap(px(10.0))
                .child(navigate(
                    orbit::primary_button("home-studio", "Abrir Studio")
                        .h(px(36.0))
                        .px(px(13.0))
                        .rounded(px(8.0)),
                    Section::Studio,
                ))
                .child(
                    pending_overlay("home-overlay")
                        .h(px(36.0))
                        .px(px(13.0))
                        .rounded(px(8.0)),
                ),
        )
}

fn profile_preview() -> Div {
    orbit::card("")
        .w(px(340.0))
        .h(px(191.25))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .overflow_hidden()
        .bg(rgb(0x000b_0c0f))
        .child(orbit::text(
            "Vista previa · no disponible",
            12.0,
            400,
            orbit::INK_3,
        ))
}

fn profile(
    demo: Option<&crate::demo::DemoData>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Div {
    // Falta una API de Studio que exponga su layout/renderers y una escala de
    // incrustación en Overlay. No se crea otra lectura ni un renderer de cajas.
    let name = demo.map_or("Sin perfil activo", |data| data.profile.name.as_str());
    let meta = profile_metadata(demo);
    orbit::card("")
        .h(px(225.0))
        .flex_none()
        .rounded(px(orbit::FEATURED_RADIUS))
        .border_color(rgba(0xf047_5530))
        .bg(linear_gradient(
            135.0,
            linear_color_stop(rgb(0x0019_191e), 0.0),
            linear_color_stop(rgb(0x0013_1317), 1.0),
        ))
        .child(
            orbit::card_body()
                .h_full()
                .pl(px(24.0))
                .pr(px(18.0))
                .py(px(16.0))
                .child(
                    div()
                        .h_full()
                        .flex()
                        .items_center()
                        .gap(px(28.0))
                        .child(profile_info(name, meta, navigate))
                        .child(profile_preview()),
                ),
        )
}

fn race_rows(starts: &[Race], navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>) -> Div {
    let mut race_list = orbit::card_body().flex_1().min_h_0().py(px(21.0));
    if starts.is_empty() {
        race_list = race_list.child(div().w_full().flex().justify_center().child(orbit::text(
            "Sin salidas próximas",
            12.0,
            400,
            orbit::INK_3,
        )));
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
    race_list
}

fn profile_rows(demo: Option<&crate::demo::DemoData>) -> Div {
    let mut profiles = orbit::card_body().flex_1().min_h_0();
    if let Some(profile) = demo.map(|data| &data.profile) {
        profiles = profiles.child(
            div()
                .relative()
                .mx(px(4.0))
                .mt(px(10.0))
                .h(px(46.0))
                .px(px(8.0))
                .flex()
                .items_center()
                .gap(px(10.0))
                .rounded(px(11.0))
                .bg(linear_gradient(
                    90.0,
                    linear_color_stop(rgba(0xd52f_491c), 0.0),
                    linear_color_stop(rgba(0xd52f_4905), 1.0),
                ))
                .when(profile.active, |row| {
                    row.child(
                        div()
                            .absolute()
                            .left(px(-13.0))
                            .top(px(14.0))
                            .w(px(3.0))
                            .h(px(18.0))
                            .flex_none()
                            .rounded_full()
                            .bg(rgb(orbit::RED)),
                    )
                })
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(2.0))
                        .child(orbit::text(profile.name.clone(), 13.0, 650, orbit::INK))
                        .child(orbit::text(
                            format!("{} widgets · configuración local", profile.widgets),
                            11.0,
                            400,
                            orbit::INK_3,
                        )),
                )
                .when(profile.active, |row| {
                    row.child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .child(orbit::text("✓", 14.0, 700, orbit::GREEN))
                            .child(orbit::text("Activo", 12.0, 500, orbit::GREEN)),
                    )
                }),
        );
    } else {
        profiles = profiles.child(div().w_full().flex().justify_center().child(orbit::text(
            "Sin perfiles todavía",
            12.0,
            400,
            orbit::INK_3,
        )));
    }
    profiles
}

fn lists(
    starts: &[Race],
    demo: Option<&crate::demo::DemoData>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
) -> Div {
    let race_list = race_rows(starts, navigate);
    let profiles = profile_rows(demo);
    div()
        .flex()
        .flex_1()
        .min_h_0()
        .gap(px(20.0))
        .child(
            orbit::card("")
                .flex_1()
                .flex_basis(gpui::relative(0.575))
                .min_w_0()
                .min_h(px(360.0))
                .child(
                    div()
                        .h(px(50.0))
                        .px(px(20.0))
                        .flex()
                        .items_center()
                        .justify_between()
                        .border_b_1()
                        .border_color(gpui::rgba(orbit::LINE_ROW))
                        .child(orbit::text("Próximas carreras", 15.0, 700, orbit::INK))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(12.0))
                                .child(orbit::text("Cadencia publicada", 12.0, 400, orbit::INK_3))
                                .child(navigate(
                                    div()
                                        .id("home-races")
                                        .role(gpui::Role::Button)
                                        .aria_label("Ver todas")
                                        .tab_index(0)
                                        .child(orbit::text("Ver todas", 12.0, 500, orbit::INK_3)),
                                    Section::Calendar,
                                )),
                        ),
                )
                .child(race_list),
        )
        .child(
            orbit::card("")
                .flex_1()
                .flex_basis(gpui::relative(0.405))
                .min_w_0()
                .flex()
                .flex_col()
                .child(
                    div()
                        .h(px(50.0))
                        .px(px(20.0))
                        .flex()
                        .items_center()
                        .justify_between()
                        .border_b_1()
                        .border_color(gpui::rgba(orbit::LINE_ROW))
                        .child(orbit::text("Perfiles", 15.0, 700, orbit::INK))
                        .child(navigate(
                            div()
                                .id("home-profiles")
                                .role(gpui::Role::Button)
                                .aria_label("Gestionar")
                                .tab_index(0)
                                .child(orbit::text("Gestionar", 12.0, 500, orbit::INK_3)),
                            Section::Studio,
                        )),
                )
                .child(profiles),
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
    let content = div()
        .mt(px(10.0))
        .flex_1()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(20.0))
        .child(profile(demo, &navigate))
        .child(lists(&starts, demo, &navigate));
    div()
        .id("home")
        .w_full()
        .h_full()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .mt(px(-50.0))
        .pt(px(21.0))
        .pb(px(20.0))
        .child(hero(
            next_race(target(&starts, &calendar.following.series_ids), &navigate),
            salute,
            &navigate,
        ))
        .child(content)
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
