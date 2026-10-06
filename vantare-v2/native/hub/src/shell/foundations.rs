//! Inicio del layout C sobre los mismos renderizadores de Studio y Desktop.
use super::Hub;
use crate::{Section, orbit};
use gpui::{Context, Div, Entity, Window, div, prelude::*, px, rgb};
use vantare_domain::{Snapshot, format::Preferences};
use vantare_ui::{Kind, Overlay, Settings};
struct Preview {
    view: Entity<Overlay>,
    scale: std::cell::Cell<f32>,
}
pub(super) struct Previews(Vec<Preview>);
/// Fixtures existentes, separadas de la ruta IPC del producto.
pub(super) fn capture_photos() -> Result<[Snapshot; 5], String> {
    let load = |name: &str| {
        crate::scene::Scene::open(
            std::path::Path::new(crate::scene::FIXTURES).join(format!("{name}.snapshot.json")),
        )
        .map(|scene| scene.snapshot().clone())
    };
    let standings = load("standings")?;
    Ok([
        standings.clone(),
        standings,
        load("relative")?,
        load("fuel-strategy")?,
        load("delta")?,
    ])
}
impl Previews {
    pub fn new(
        snapshot: &Snapshot,
        prefs: Preferences,
        qa: Option<&[Snapshot; 5]>,
        cx: &mut gpui::App,
    ) -> Self {
        let photos = qa.map_or([snapshot; 5], <[Snapshot; 5]>::each_ref);
        let kinds = [
            Kind::Standings,
            Kind::Standings,
            Kind::Relative,
            Kind::FuelStrategy,
            Kind::Delta,
        ];
        let previews = kinds
            .into_iter()
            .zip(photos)
            .enumerate()
            .map(|(index, (kind, photo))| {
                let mut settings = Settings::default_for(kind);
                if let Settings::Standings(standings) = &mut settings {
                    standings.row_count = if index == 0 { 6 } else { 4 };
                }
                let mut overlay = Overlay::configured(&settings, prefs);
                let view = cx.new(|cx| {
                    overlay.ingest(photo, cx);
                    overlay
                });
                Preview {
                    view,
                    scale: std::cell::Cell::new(1.0),
                }
            })
            .collect();
        Self(previews)
    }
    pub fn ingest(&self, snapshot: &Snapshot, cx: &mut gpui::App) {
        for preview in &self.0 {
            preview
                .view
                .update(cx, |preview, cx| preview.ingest(snapshot, cx));
        }
    }
    fn thumbnail(&self, index: usize, width: f32, height: f32, cx: &mut gpui::App) -> Div {
        let preview = &self.0[index];
        let (widget_width, widget_height) = preview.view.read(cx).wanted_size();
        let scale = ((width - 16.0).max(1.0) / widget_width)
            .min((height - 16.0).max(1.0) / widget_height)
            .min(1.0);
        if (preview.scale.replace(scale) - scale).abs() > f32::EPSILON {
            preview.view.update(cx, |overlay, cx| {
                if let Err(error) = overlay.set_preview_scale(scale) {
                    eprintln!("miniatura: {error}");
                }
                cx.notify();
            });
        }
        div()
            .w_full()
            .h(px(height))
            .min_w_0()
            .overflow_hidden()
            .rounded(px(12.0))
            .bg(orbit::gradient([0x20_2530, 0x10_1115], 180.0))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .w(px(widget_width * scale))
                    .h(px(widget_height * scale))
                    .child(preview.view.clone()),
            )
    }
}
/// Selector efímero de perfiles; las opciones provienen del controlador Launcher.
pub(super) fn profile_choice(
    launcher: &Entity<crate::launcher::view::Launcher>,
    window: &mut Window,
    cx: &mut Context<Hub>,
) -> Entity<orbit::Choice> {
    let profiles = launcher.read(cx).saved_profiles();
    let selected = launcher
        .read(cx)
        .default_profile_id()
        .and_then(|id| profiles.iter().position(|profile| profile.id == id));
    let options = profiles
        .iter()
        .map(|profile| orbit::OptionItem::new(profile.name.clone()))
        .collect();
    let choice = cx.new(|cx| {
        orbit::Choice::new(
            "Perfil de lanzamiento",
            orbit::ChoiceKind::Dropdown,
            options,
            selected,
            window,
            cx,
        )
    });
    cx.observe(&choice, |_, _, cx| cx.notify()).detach();
    cx.observe(launcher, |hub, launcher, cx| {
        let profiles = launcher.read(cx).saved_profiles();
        let labels: Vec<_> = profiles
            .iter()
            .map(|profile| profile.name.clone())
            .collect();
        let favorite = launcher
            .read(cx)
            .default_profile_id()
            .and_then(|id| profiles.iter().position(|profile| profile.id == id));
        let previous: Vec<_> = hub
            .home_profile
            .read(cx)
            .state
            .options
            .iter()
            .map(|option| option.label.clone())
            .collect();
        if labels != previous {
            hub.home_profile.update(cx, |choice, cx| {
                choice.state = orbit::ChoiceState::new(
                    labels.into_iter().map(orbit::OptionItem::new).collect(),
                    favorite,
                );
                cx.notify();
            });
        }
    })
    .detach();
    choice
}
impl Hub {
    #[allow(clippy::too_many_lines)] // Composición lineal del layout C; las piezas se comparten en Orbit.
    pub(super) fn foundation_home(&self, window: &Window, cx: &mut Context<Self>) -> Div {
        let tokens = cx.global::<orbit::design::Tokens>();
        let gap = tokens.geometry.gap;
        let title_size = tokens.fonts.title_size;
        let hero_gradient = tokens.gradients.hero;
        let available = f32::from(window.viewport_size().width)
            - self.sidebar_width(cx)
            - 2.0 * tokens.geometry.gutter;
        let center_width = (available - gap) * 2.0 / 3.0;
        let context_width = (available - gap) / 3.0;
        let overlay_width = (center_width - gap) / 2.0 - 40.0;
        let template_width = (context_width - gap) / 2.0 - 20.0;
        let compact = f32::from(window.viewport_size().width) < 1700.0;
        let name = self.demo.as_ref().map_or("piloto", |demo| {
            demo.user
                .full_name
                .split_whitespace()
                .next()
                .unwrap_or("piloto")
        });
        let connected = self.previous_source == Some(true);
        let status = if connected {
            "LMU conectado"
        } else {
            "Esperando simulador"
        };
        let profile = self
            .launcher
            .read(cx)
            .default_profile_id()
            .and_then(|id| {
                self.launcher
                    .read(cx)
                    .saved_profiles()
                    .iter()
                    .find(|profile| profile.id == id)
            })
            .cloned();
        let profile_name = profile
            .as_ref()
            .map_or("Sin perfil favorito", |profile| profile.name.as_str());
        let profile_steps = profile.as_ref().map_or_else(
            || "Crea un perfil en Launcher".to_owned(),
            |profile| format!("{} pasos de lanzamiento", profile.steps.len()),
        );
        let launching = self.launcher.read(cx).launch_progress();
        let launch_label = launching.map_or_else(
            || format!("Lanzar {profile_name}"),
            |(ready, total)| format!("Lanzando… {ready}/{total}"),
        );
        let launch = orbit::play_button(
            "home-launch",
            &launch_label,
            if compact { 44.0 } else { 58.0 },
            true,
            cx,
        )
        .tab_stop(profile.is_some() && launching.is_none())
        .when(profile.is_none() || launching.is_some(), |button| {
            orbit::disabled(button, "Perfil no disponible o lanzamiento en curso")
        })
        .on_click(cx.listener(|hub, _, _, cx| hub.launch_favorite(cx)));
        let studio = orbit::button("home-studio", "Abrir Studio", cx)
            .rounded_full()
            .bg(gpui::transparent_black())
            .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)));
        let selected = self
            .home_profile
            .read(cx)
            .state
            .selected
            .and_then(|index| self.launcher.read(cx).saved_profiles().get(index))
            .map(|profile| profile.id.clone());
        let enabled = launching.is_none() && selected.is_some();
        let quick_launch = orbit::carmine_button("home-quick-launch", "", cx)
            .size(px(40.0))
            .rounded_full()
            .p(px(0.0))
            .aria_label("Lanzar perfil seleccionado")
            .tab_stop(enabled)
            .child(orbit::icon("play", 16.0, orbit::ink(cx)))
            .when(!enabled, |button| {
                orbit::disabled(button, "Selecciona un perfil disponible")
            })
            .on_click(cx.listener(move |hub, _, _, cx| {
                if hub.launcher.read(cx).launch_progress().is_none()
                    && let Some(id) = &selected
                {
                    hub.launch_profile(id, cx);
                }
            }));
        let search =
            orbit::ghost_button("home-command", "Busca, abre o lanza algo en Vantare…", cx)
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .relative()
                .justify_start()
                .pl(px(36.0))
                .child(
                    orbit::icon("search", 16.0, orbit::ink_3(cx))
                        .absolute()
                        .left(px(8.0))
                        .top(px(10.0)),
                )
                .when(!compact, |button| {
                    button.child(orbit::text(
                        "«abre el editor con Standings»",
                        14.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                })
                .on_click(cx.listener(|hub, _, window, cx| hub.toggle_palette(window, cx)));
        let composer = div()
            .w_full()
            .h(px(60.0))
            .flex_none()
            .rounded_full()
            .border_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .bg(rgb(orbit::surface_2(cx)))
            .px(px(12.0))
            .flex()
            .items_center()
            .gap(px(10.0))
            .child(search)
            .child(self.home_profile.clone())
            .child(orbit::keycap("Ctrl K", cx))
            .child(quick_launch);
        let last_progress = profile
            .as_ref()
            .and_then(|profile| self.launcher.read(cx).profile_progress(&profile.id));
        #[allow(clippy::cast_precision_loss)] // Cociente visual de un número acotado de pasos.
        let fraction =
            last_progress.map_or(0.0, |(ready, total)| ready as f32 / total.max(1) as f32);
        let favorite = orbit::neo_card(cx)
            .h_full()
            .justify_between()
            .w(gpui::relative(0.36))
            .flex_none()
            .bg(orbit::tint(orbit::canvas(cx), 0.35))
            .p(px(if compact { 16.0 } else { 20.0 }))
            .gap(px(if compact { 4.0 } else { 8.0 }))
            .child(orbit::text(
                "Perfil favorito",
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
            .child(orbit::text(
                profile_name.to_owned(),
                if compact { 20.0 } else { 24.0 },
                600,
                orbit::ink(cx),
                cx,
            ))
            .child(orbit::text(profile_steps, 12.0, 400, orbit::ink_2(cx), cx))
            .when_some(profile.as_ref(), |card, profile| {
                card.child(self.launcher.read(cx).profile_app_chips(profile, cx))
            })
            .child(orbit::progress(fraction, cx))
            .child(orbit::text(
                profile
                    .as_ref()
                    .and_then(|profile| profile.last_launched_at.as_deref())
                    .map_or_else(
                        || "Sin lanzamientos".to_owned(),
                        |at| {
                            format!(
                                "Último · {}",
                                chrono::DateTime::parse_from_rfc3339(at).map_or_else(
                                    |_| at.to_owned(),
                                    |date| date.format("%d/%m %H:%M").to_string()
                                )
                            )
                        },
                    ),
                11.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
            .when_some(last_progress, |card, (ready, total)| {
                card.child(orbit::text(
                    format!("{ready}/{total} pasos listos"),
                    12.0,
                    500,
                    orbit::green(cx),
                    cx,
                ))
            });
        let hero = orbit::neo_card(cx)
            .relative()
            .child(
                orbit::icon("track", 420.0, orbit::coral(cx))
                    .h(px(264.0))
                    .absolute()
                    .right(px(if compact { 160.0 } else { 330.0 }))
                    .top(px(-4.0))
                    .opacity(0.10),
            )
            .h(px(if compact { 260.0 } else { 300.0 }))
            .flex_none()
            .flex_row()
            .items_center()
            .px(px(40.0))
            .py(px(32.0))
            .bg(orbit::gradient(hero_gradient, 120.0))
            .child(
                div()
                    .flex_1()
                    .h_full()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(orbit::text(status, 13.0, 400, orbit::ink_2(cx), cx))
                    .child(
                        orbit::text(
                            format!("Buenas tardes, {name}"),
                            if compact {
                                title_size * 0.75
                            } else {
                                title_size
                            },
                            600,
                            orbit::ink(cx),
                            cx,
                        )
                        .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
                        .line_height(px(if compact {
                            title_size * 0.75
                        } else {
                            title_size
                        })),
                    )
                    .child(orbit::text(
                        "Tu cabina para la próxima sesión.",
                        14.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(div().flex_1())
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap(px(8.0))
                            .child(launch)
                            .child(studio),
                    ),
            )
            .child(favorite);
        let overlay = orbit::neo_card(cx)
            .flex_1()
            .gap(px(8.0))
            .child(orbit::neo_header("Overlay en pista", "v-studio", cx))
            .child(self.home_previews.thumbnail(
                0,
                overlay_width,
                if compact { 150.0 } else { 260.0 },
                cx,
            ))
            .child(orbit::text("Standings", 22.0, 600, orbit::ink(cx), cx))
            .child(orbit::text(
                if connected {
                    "Telemetría en vivo"
                } else {
                    "Vista previa · esperando simulador"
                },
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
            .child(
                div().flex().flex_wrap().gap(px(6.0)).children(
                    ["Standings", "Relative", "Fuel", "Delta"]
                        .map(|label| orbit::pill(label, orbit::Tone::Neutral, cx)),
                ),
            )
            .child(
                orbit::primary_button("home-edit-overlay", "Editar overlay", cx)
                    .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx))),
            );
        let now = chrono::Local::now().fixed_offset();
        let unread = self.notifications.read(cx).unread();
        let activity_rows = div()
            .id("home-activity-list")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .child(orbit::summary_row(
                "Notificaciones",
                format!("{unread} sin leer"),
                "v-bell",
                cx,
            ))
            .children(
                self.launcher
                    .read(cx)
                    .saved_profiles()
                    .iter()
                    .filter_map(|profile| {
                        profile.last_launched_at.as_ref().map(|at| {
                            orbit::summary_row(
                                profile.name.clone(),
                                orbit::activity_time(at, now),
                                "v-launch",
                                cx,
                            )
                        })
                    }),
            );
        let activity = orbit::neo_card(cx)
            .flex_1()
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(orbit::neo_header("Actividad", "clock", cx).flex_1())
                    .child(
                        orbit::ghost_button("home-activity", "Ver todo", cx).on_click(
                            cx.listener(|hub, _, _, cx| hub.navigate(Section::Notifications, cx)),
                        ),
                    ),
            )
            .child(activity_rows);
        let center = div()
            .flex_grow(1.0)
            .flex_basis(gpui::relative(2.0 / 3.0))
            .min_w_0()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(hero)
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .gap(px(gap))
                    .child(overlay)
                    .child(activity),
            );
        let state = orbit::neo_card(cx)
            .min_h(px(if compact { 260.0 } else { 300.0 }))
            .flex_none()
            .gap(px(0.0))
            .child(orbit::neo_header("Estado", "pulse", cx))
            .child(orbit::summary_row("Le Mans Ultimate", status, "v-helmet", cx).min_h(px(48.0)))
            .child(
                orbit::summary_row(profile_name.to_owned(), "Perfil favorito", "v-launch", cx)
                    .min_h(px(48.0)),
            )
            .when(self.shell.access.tester, |card| {
                card.child(
                    orbit::summary_row("Testing Center", "Acceso de tester", "v-testing", cx)
                        .min_h(px(48.0)),
                )
            })
            .child(
                orbit::summary_row("Beta para testers", "Acceso gratuito", "key", cx)
                    .min_h(px(48.0)),
            );
        let mut templates = div()
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(orbit::neo_header(
                "Plantillas para tu próxima sesión",
                "v-studio",
                cx,
            ));
        for row in 0..2 {
            templates = templates.child(div().flex_1().min_h_0().flex().gap(px(gap)).children(
                (row * 2..row * 2 + 2).map(|index| {
                    let title = [
                        "Standings multiclase",
                        "Relative compacto",
                        "Fuel y stint",
                        "Delta y sectores",
                    ][index];
                    orbit::neo_card(cx)
                        .flex_1()
                        .p(px(10.0))
                        .gap(px(8.0))
                        .overflow_hidden()
                        .child(self.home_previews.thumbnail(
                            index + 1,
                            template_width,
                            if compact { 90.0 } else { 150.0 },
                            cx,
                        ))
                        .child(orbit::text(title, 13.0, 600, orbit::ink(cx), cx))
                        .child(orbit::button(title, "Abrir Studio", cx).on_click(
                            cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)),
                        ))
                }),
            ));
        }
        let context = div()
            .flex_basis(gpui::relative(1.0 / 3.0))
            .flex_grow(1.0)
            .min_w_0()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(state)
            .child(templates);
        div()
            .size_full()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(composer)
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .gap(px(gap))
                    .child(center)
                    .child(context),
            )
    }
}
