//! Inicio compone Orbit y el calendario local. La shell conserva la navegación.
use super::{Calendar, Schedule};
use crate::orbit::typography;
use crate::{Section, orbit};
use chrono::{DateTime, Duration, Local, Timelike, Utc};
use gpui::{
    Div, FontWeight, SharedString, Stateful, div, linear_color_stop, linear_gradient, prelude::*,
    px, rgb, rgba,
};

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

// Las fuentes Inter del kit son estáticas: pedir otra vez el peso sintetiza negrita.
fn text(
    content: impl Into<SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> Div {
    let weight = if weight == 560 { 600 } else { weight };
    let line_height = size * 1.5;
    let baseline = typography::baseline(0.0, line_height, size);
    let native_baseline = f32::midpoint(line_height.round(), size * (1984.0 - 494.0) / 2048.0);
    orbit::text(content, size, weight, color, cx)
        .font_weight(
            if cx.global::<orbit::theme::Theme>().interface_font
                == orbit::theme::InterfaceFont::Inter
            {
                FontWeight::NORMAL
            } else {
                FontWeight(f32::from(weight))
            },
        )
        .line_height(px(line_height))
        .relative()
        .top(px(baseline - native_baseline))
}

pub(super) fn title(content: String, size: f32, tracking: f32, line_height: f32) -> Div {
    div().h(px(line_height)).flex_1().child(
        gpui::canvas(
            |_, _, _| (),
            move |bounds, (), window, cx| {
                let ink = typography::ink(size, 700.0, tracking, rgb(orbit::ink(cx)).into());
                typography::draw(
                    window,
                    cx,
                    &content,
                    bounds.origin.x.into(),
                    typography::baseline(bounds.origin.y.into(), line_height, size),
                    &ink,
                );
            },
        )
        .w_full()
        .h_full(),
    )
}

fn quick_button(id: &'static str, label: &'static str, cx: &gpui::App) -> Stateful<Div> {
    orbit::button(id, "", cx)
        .aria_label(label)
        .h(px(36.0))
        .px(px(13.0))
        .rounded(px(8.0))
        .border_color(rgba(orbit::line(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff06, cx)))
        .child(text(label, 12.0, 400, orbit::ink_3(cx), cx))
}

/// Falta el contrato de control de overlays: se muestra, pero no finge funcionar.
fn pending_overlay(id: &'static str, cx: &gpui::App) -> Stateful<Div> {
    orbit::disabled(
        quick_button(id, "Abrir overlay", cx),
        "Pendiente: el Hub aún no controla el overlay",
    )
}

/// Ejecuta el mismo Ctrl+K que la shell, incluido foco, cierre y teclado.
/// No monta otra paleta ni mantiene otro estado de búsqueda.
#[allow(clippy::too_many_lines)] // Composición visual; crece al migrar a accesores de tema (#1430).
fn command(cx: &gpui::App) -> Stateful<Div> {
    orbit::button("home-command", "", cx)
        .w_full()
        .h(px(72.0))
        .pl(px(23.0))
        .pr(px(18.0))
        .rounded(px(24.0))
        .bg(linear_gradient(
            180.0,
            linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0019_191e, cx)), 0.0),
            linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0013_1317, cx)), 1.0),
        ))
        .border_color(rgba(crate::orbit::legacy_rgba(0xf047_5526, cx)))
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
                        .relative()
                        .overflow_hidden()
                        .shadow(vec![gpui::BoxShadow {
                            color: rgba(crate::orbit::legacy_rgba(0xd52f_494a, cx)).into(),
                            offset: gpui::point(px(0.0), px(10.0)),
                            blur_radius: px(26.0),
                            spread_radius: px(0.0),
                            inset: false,
                        }])
                        .bg(linear_gradient(
                            145.0,
                            linear_color_stop(rgb(orbit::coral(cx)), 0.0),
                            linear_color_stop(rgb(orbit::carmine(cx)), 0.62),
                        ))
                        .child(
                            div()
                                .absolute()
                                .size_full()
                                .top_0()
                                .left_0()
                                .rounded(px(13.0))
                                .bg(linear_gradient(
                                    145.0,
                                    linear_color_stop(
                                        rgba(crate::orbit::legacy_rgba(0x6415_2600, cx)),
                                        0.62,
                                    ),
                                    linear_color_stop(
                                        rgb(crate::orbit::legacy_rgb(0x0064_1526, cx)),
                                        1.0,
                                    ),
                                )),
                        )
                        .child(orbit::icon("i-comando", 18.0, 0x00ff_ffff)),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(text(
                            "Busca, abre o lanza algo en Vantare…",
                            16.0,
                            560,
                            orbit::ink_2(cx),
                            cx,
                        ))
                        .child(
                            text(
                                "\"Abre el Studio con el perfil Clean Overlay\"",
                                11.0,
                                400,
                                orbit::ink_3(cx),
                                cx,
                            )
                            .mt(px(4.0)),
                        ),
                )
                .child(orbit::keycaps(["Ctrl", "K"], cx)),
        )
}

fn next_race(
    race: Option<&Race>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
    cx: &gpui::App,
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
                .child(orbit::status_dot(orbit::Tone::Success, 8.0, cx))
                .child(orbit::eyebrow("Próximas carreras", cx)),
        );
        view = view
            .child(text(race.name.clone(), 14.0, 600, orbit::ink_2(cx), cx))
            .child(text(
                format!(
                    "{} · {}",
                    race.track,
                    race.at.with_timezone(&Local).format("%H:%M")
                ),
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
            .child(navigate(
                orbit::button("home-next", "Abrir en Calendario", cx).h(px(36.0)),
                Section::Calendar,
            ));
    } else {
        view = view.child(text(
            "Sin salidas próximas en el calendario",
            12.0,
            400,
            orbit::ink_3(cx),
            cx,
        ));
    }
    view
}

fn hero(
    next: Option<Div>,
    plan: bool,
    greeting: String,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
    compact: bool,
    cx: &gpui::App,
) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(40.0))
        .when(compact, |hero| {
            hero.flex_col().items_stretch().gap(px(16.0)).flex_none()
        })
        .child(
            div()
                .flex_1()
                .when(compact, gpui::Styled::flex_none)
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(orbit::GUTTER / 2.0))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(14.0))
                        .child(if orbit::is_mono(cx) {
                            orbit::status_dot(orbit::Tone::Success, 10.0, cx)
                        } else {
                            div()
                                .size(px(10.0))
                                .rounded_full()
                                .bg(rgb(orbit::green(cx)))
                                .shadow(vec![gpui::BoxShadow {
                                    color: rgb(orbit::green(cx)).into(),
                                    offset: gpui::point(px(0.0), px(0.0)),
                                    blur_radius: px(14.0),
                                    spread_radius: px(0.0),
                                    inset: false,
                                }])
                        })
                        .child(title(greeting, 34.0, -0.045, 35.7)),
                )
                .child(command(cx))
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(9.0))
                        .child(navigate(
                            quick_button("home-quick-studio", "Abrir Studio", cx)
                                .h(px(36.0))
                                .px(px(13.0))
                                .rounded(px(8.0)),
                            Section::Studio,
                        ))
                        .when(plan, |actions| {
                            actions.child(navigate(
                                quick_button("home-plan", "Crear plan", cx)
                                    .h(px(36.0))
                                    .px(px(13.0))
                                    .rounded(px(8.0)),
                                Section::Strategy,
                            ))
                        })
                        .child(navigate(
                            quick_button("home-launch", "Lanzar perfil", cx)
                                .h(px(36.0))
                                .px(px(13.0))
                                .rounded(px(8.0)),
                            Section::Launcher,
                        )),
                ),
        )
        .when_some(next, |hero, next| {
            hero.child(next.when(compact, gpui::Styled::w_full))
        })
}

fn profile_metadata(demo: Option<&crate::demo::DemoData>, cx: &gpui::App) -> Div {
    if let Some(data) = demo.filter(|data| data.overlay_profile().is_some()) {
        div()
            .flex()
            .items_center()
            .gap(px(16.0))
            .mt(px(12.0))
            .mb(px(12.0))
            .child(
                div()
                    .font_family(crate::orbit::mono_family(cx))
                    .text_size(px(12.0))
                    .font_weight(FontWeight::NORMAL)
                    .text_color(rgb(orbit::ink_3(cx)))
                    .child(format!("{} × {}", data.profile.width, data.profile.height)),
            )
            .child(text(
                format!("{} widgets visibles", data.profile.widgets),
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(7.0))
                    .child(
                        div()
                            .size(px(7.0))
                            .rounded_full()
                            .bg(rgb(orbit::ink_muted(cx))),
                    )
                    .child(text("Overlay detenido", 12.0, 400, orbit::ink_3(cx), cx)),
            )
    } else {
        div()
    }
}

fn profile_info(
    name: &str,
    meta: Div,
    has_profile: bool,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
    cx: &gpui::App,
) -> Div {
    div()
        .h_full()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .pt(px(6.0))
        .child(orbit::eyebrow("Perfil activo", cx))
        .child(
            title(name.to_owned(), 22.0, -0.03, 27.0)
                .relative()
                .top(px(1.0))
                .flex_none()
                .mt(px(4.0))
                .mb(px(2.0)),
        )
        .child(meta.relative().top(px(-1.0)))
        .child(div().flex_1())
        .child(
            div()
                .flex()
                .flex_wrap()
                .gap(px(10.0))
                .child(navigate(
                    orbit::primary_button("home-studio", "", cx)
                        .aria_label("Abrir Studio")
                        .child(text(
                            "Abrir Studio",
                            12.0,
                            600,
                            cx.global::<crate::orbit::theme::Theme>().primary_ink,
                            cx,
                        ))
                        .h(px(34.0))
                        .px(px(14.0))
                        .rounded(px(8.0)),
                    Section::Studio,
                ))
                .when(has_profile, |row| {
                    row.child(
                        pending_overlay("home-overlay", cx)
                            .h(px(34.0))
                            .px(px(16.0))
                            .rounded(px(8.0)),
                    )
                }),
        )
}

fn profile(
    demo: Option<&crate::demo::DemoData>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
    compact: bool,
    cx: &gpui::App,
) -> Div {
    // Sin API de Studio para miniaturas no se pinta una vista previa vacía;
    // no se crea otra lectura ni un renderer de cajas.
    let profile = demo.and_then(crate::demo::DemoData::overlay_profile);
    let name = profile.map_or("Sin perfil activo", |profile| profile.name.as_str());
    let meta = profile_metadata(demo, cx);
    orbit::card("", cx)
        .h(px(172.0))
        .when(compact, gpui::Styled::h_auto)
        .flex_none()
        .rounded(px(orbit::FEATURED_RADIUS))
        .shadow(vec![
            gpui::BoxShadow {
                color: rgba(0x0000_006b).into(),
                offset: gpui::point(px(0.0), px(32.0)),
                blur_radius: px(91.0),
                spread_radius: px(0.0),
                inset: false,
            },
            gpui::BoxShadow {
                color: rgba(0xd52f_490a).into(),
                offset: gpui::point(px(0.0), px(0.0)),
                blur_radius: px(42.0),
                spread_radius: px(0.0),
                inset: false,
            },
        ])
        .border_0()
        .p(px(1.0))
        .bg(linear_gradient(
            115.0,
            linear_color_stop(rgba(crate::orbit::legacy_rgba(0xf047_559e, cx)), 0.0),
            linear_color_stop(rgba(crate::orbit::legacy_rgba(0xffff_ff0f, cx)), 1.0),
        ))
        .child(
            orbit::card_body()
                .h_full()
                .when(compact, gpui::Styled::h_auto)
                .rounded(px(orbit::FEATURED_RADIUS - 1.0))
                .bg(linear_gradient(
                    180.0,
                    linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0019_191e, cx)), 0.0),
                    linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0013_1317, cx)), 1.0),
                ))
                .pl(px(24.0))
                .pr(px(18.0))
                .py(px(16.0))
                .child(
                    div()
                        .h_full()
                        .flex()
                        .items_center()
                        .gap(px(28.0))
                        .when(compact, |element| {
                            element.h_auto().flex_col().items_stretch()
                        })
                        .child(
                            profile_info(name, meta, profile.is_some(), navigate, cx)
                                .when(compact, |element| {
                                    element.h_auto().flex_none().gap(px(12.0))
                                }),
                        ),
                ),
        )
}

fn race_rows(
    starts: &[Race],
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
    cx: &gpui::App,
) -> Div {
    let mut race_list = orbit::card_body().flex_1().min_h_0().py(px(21.0));
    if starts.is_empty() {
        race_list = race_list.child(div().w_full().flex().justify_center().child(text(
            "Sin salidas próximas",
            12.0,
            400,
            orbit::ink_3(cx),
            cx,
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
                cx,
            ),
            Section::Calendar,
        ));
    }
    race_list
}

fn profile_rows(
    demo: Option<&crate::demo::DemoData>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
    cx: &gpui::App,
) -> Div {
    let mut profiles = orbit::card_body().flex_1().min_h_0();
    if let Some(profile) = demo.and_then(crate::demo::DemoData::overlay_profile) {
        let state = if profile.active { " · activo" } else { "" };
        profiles = profiles.child(navigate(
            orbit::list_row(
                "home-profile",
                &profile.name,
                &format!("{} widgets · configuración local{state}", profile.widgets),
                profile.active,
                true,
                cx,
            ),
            Section::Studio,
        ));
    } else {
        profiles = profiles.child(div().w_full().flex().justify_center().child(text(
            "Sin perfiles todavía",
            12.0,
            400,
            orbit::ink_3(cx),
            cx,
        )));
    }
    profiles
}

fn lists(
    starts: Option<&[Race]>,
    demo: Option<&crate::demo::DemoData>,
    navigate: &impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
    compact: bool,
    cx: &gpui::App,
) -> Div {
    let profiles = profile_rows(demo, navigate, cx);
    div()
        .flex()
        .flex_1()
        .min_h_0()
        .gap(px(20.0))
        .when(compact, |lists| {
            lists.flex_col().flex_none().items_stretch()
        })
        .when_some(starts, |lists, starts| {
            lists.child(
                orbit::card("", cx)
                    .flex_1()
                    .flex_basis(gpui::relative(0.575))
                    .min_w_0()
                    .min_h(px(362.0))
                    .when(compact, gpui::Styled::flex_none)
                    .child(
                        orbit::card_header("Próximas carreras", cx).child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(12.0))
                                .child(orbit::mono_text(
                                    "Cadencia publicada",
                                    12.0,
                                    orbit::ink_3(cx),
                                    cx,
                                ))
                                .child(navigate(
                                    div()
                                        .id("home-races")
                                        .role(gpui::Role::Button)
                                        .aria_label("Ver todas")
                                        .tab_index(0)
                                        .child(text("Ver todas", 12.0, 500, orbit::ink_3(cx), cx)),
                                    Section::Calendar,
                                )),
                        ),
                    )
                    .child(race_rows(starts, navigate, cx)),
            )
        })
        .child(
            orbit::card("", cx)
                .flex_1()
                .flex_basis(gpui::relative(0.405))
                .when(compact, gpui::Styled::flex_none)
                .min_w_0()
                .flex()
                .flex_col()
                .child(
                    orbit::card_header("Perfiles", cx).child(navigate(
                        div()
                            .id("home-profiles")
                            .role(gpui::Role::Button)
                            .aria_label("Gestionar")
                            .tab_index(0)
                            .child(text("Gestionar", 12.0, 500, orbit::ink_3(cx), cx)),
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
    access: crate::shell::navigation::Access,
    demo: Option<&crate::demo::DemoData>,
    compact: bool,
    navigate: impl Fn(Stateful<Div>, Section) -> Stateful<Div>,
    cx: &gpui::App,
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
    // Sin Calendario (beta) no se anuncian carreras que no existen.
    let races_visible = access.visible(Section::Calendar);
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
        .gap(px(21.0))
        .when(compact, gpui::Styled::flex_none)
        .child(profile(demo, &navigate, compact, cx))
        .child(lists(
            races_visible.then_some(starts.as_slice()),
            demo,
            &navigate,
            compact,
            cx,
        ));
    div()
        .id("home")
        .h_full()
        .when(compact, gpui::Styled::h_auto)
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .mt(px(-50.0))
        .pt(px(34.0))
        .pb(px(13.0))
        .ml(px(-1.0))
        .mr(px(-1.0))
        .child(hero(
            races_visible.then(|| {
                next_race(
                    target(&starts, &calendar.following.series_ids),
                    &navigate,
                    cx,
                )
            }),
            access.lock(Section::Strategy).is_none(),
            salute,
            &navigate,
            compact,
            cx,
        ))
        .child(content)
        .when_some(error.filter(|_| races_visible), |view, error| {
            view.child(orbit::callout(error, cx))
        })
        .when_some(
            calendar.error.clone().filter(|_| races_visible),
            |view, error| view.child(orbit::callout(error, cx)),
        )
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
