//! Inicio del layout C sobre los mismos renderizadores de Studio y Desktop.
use super::Hub;
use crate::{Section, orbit};
use gpui::{Context, Div, Entity, Window, div, prelude::*, px, rgb, rgba};
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
            .flex_none()
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
                    .flex_none()
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
    /// Inicio: el centro es la página; «Estado» y «Plantillas» forman la barra derecha (R10.2).
    pub(super) fn foundation_home(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> (Div, Vec<orbit::RailSection>) {
        let adapt = *cx.global::<orbit::Adapt>();
        let gap = adapt.gap();
        let center_width = adapt.center_width() - 2.0 * adapt.padding().1;
        let overlay_width = (center_width - gap) / 2.0 - 40.0;
        let template_width = (adapt.rail_width() - 32.0 - gap) / 2.0 - 20.0;
        let compact = adapt.center_width() < 1100.0;
        let short = adapt.density != orbit::adapt::Density::A;
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
        let launch =
            orbit::play_button("home-launch", &launch_label, adapt.hero_button(), true, cx)
                .tab_stop(profile.is_some() && launching.is_none())
                .when(profile.is_none() || launching.is_some(), |button| {
                    orbit::disabled(button, "Perfil no disponible o lanzamiento en curso")
                })
                .on_click(cx.listener(|hub, _, _, cx| hub.launch_favorite(cx)));
        let studio = orbit::button("home-studio", "Abrir Studio", cx)
            .h(px(36.0))
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
        let quick_launch = orbit::play_button("home-quick-launch", "", 36.0, false, cx)
            .size(px(36.0))
            .rounded(px(8.0))
            .p(px(0.0))
            .aria_label("Lanzar perfil seleccionado")
            .tab_stop(enabled)
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
        let search = orbit::ghost_button("home-command", "", cx)
            .flex_1()
            .min_w_0()
            .overflow_hidden()
            .relative()
            .justify_start()
            .pl(px(36.0))
            .gap(px(12.0))
            .aria_label("Busca, abre o lanza algo en Vantare…")
            .child(orbit::text(
                "Busca, abre o lanza algo en Vantare…",
                14.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
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
            .h(px(if short { 52.0 } else { 60.0 }))
            .flex_none()
            .rounded(px(orbit::skin(cx).radius.panel))
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
            .justify_between()
            .w(px(if adapt.show_secondary() { 360.0 } else { 300.0 }))
            .flex_none()
            .bg(orbit::tint(orbit::canvas(cx), 0.72))
            .p(px(if compact { 16.0 } else { 20.0 }))
            .gap(px(if compact { 4.0 } else { 8.0 }))
            .child(orbit::meta("Perfil favorito", 10.0, orbit::ink_3(cx), cx))
            .child(orbit::text(profile_name.to_owned(), 24.0, 600, orbit::ink(cx), cx)
                .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
                .whitespace_nowrap().text_ellipsis().overflow_hidden())
            .child(orbit::text(profile_steps, 12.0, 400, orbit::ink_2(cx), cx))
            .when_some(profile.as_ref(), |card, profile| {
                card.child(self.launcher.read(cx).profile_app_tiles(profile, cx))
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
        let now = self
            .demo
            .as_ref()
            .and_then(|demo| demo.fixed_now().ok())
            .unwrap_or_else(chrono::Utc::now)
            .with_timezone(&chrono::Local);
        let salute = match chrono::Timelike::hour(&now) {
            0..12 => "Buenos días",
            12..20 => "Buenas tardes",
            _ => "Buenas noches",
        };
        let hero = orbit::hero_surface(cx)
            .h(px(match adapt.density { orbit::adapt::Density::A => 300.0, orbit::adapt::Density::M => 236.0, _ => 200.0 }))
            .flex_none()
            .flex_row()
            .items_center()
            .gap(px(24.0))
            .px(px(if compact { 24.0 } else { 40.0 }))
            .py(px(if short { 22.0 } else { 32.0 }))
            .child(
                orbit::circuit(cx)
                    .absolute()
                    .right(px(0.0))
                    .top(px(0.0))
                    .w(gpui::relative(0.58))
                    .h_full(),
            )
            .child(
                div()
                    .relative()
                    .flex_1()
                    .h_full()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(if short { 8.0 } else { 12.0 }))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .child(orbit::live_dot(cx))
                            .child(orbit::meta(
                                &format!("{} · {status}", now.format("%a %-d %b")),
                                10.0,
                                orbit::ink_2(cx),
                                cx,
                            )),
                    )
                    .child(
                        orbit::text(
                            format!("{salute}, {name}"),
                            if compact { 38.0 } else { 54.0 },
                            600,
                            orbit::ink(cx),
                            cx,
                        )
                        .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
                        .line_height(px(if compact { 40.0 } else { 56.0 })),
                    )
                    .child(orbit::text(
                        if connected {
                            "Telemetría conectada. Prepara tu próxima sesión."
                        } else {
                            "Tu cabina está lista. Esperando simulador."
                        },
                        14.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(div().flex_1())
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .flex_none()
                            .gap(px(8.0))
                            .child(launch)
                            .child(studio),
                    ),
            )
            .when(center_width >= 1000.0, |hero| hero.child(favorite.relative()));
        let overlay = orbit::neo_card(cx)
            .flex_1()
            .gap(px(8.0))
            .child(orbit::neo_header("Overlay en pista", "v-studio", cx))
            .child(self.home_previews.thumbnail(
                0,
                overlay_width,
                if !adapt.show_optional() {
                    96.0
                } else if compact {
                    150.0
                } else {
                    260.0
                },
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
            // Alto B/XS (R9.5): fuera chips y cifras para que la tarjeta no se corte.
            .when(adapt.show_optional(), |card| {
                card.child(
                    div().flex().flex_wrap().gap(px(6.0)).children(
                        if compact {
                            ["Standings", "Relative", "+2"].as_slice()
                        } else {
                            ["Standings", "Relative", "Fuel", "Delta"].as_slice()
                        }
                        .iter()
                        .map(|label| orbit::pill(label, orbit::Tone::Neutral, cx)),
                    ),
                )
            })
            .when(adapt.show_optional(), |card| {
                card.child(
                    div().flex().gap(px(24.0)).children(
                        [
                            ("—", if compact { "Hz" } else { "Hz de telemetría" }),
                            (
                                "—",
                                if compact {
                                    "Widgets"
                                } else {
                                    "Widgets en pista"
                                },
                            ),
                            ("—", "CPU"),
                        ]
                        .map(|(value, label)| {
                            div()
                                .flex_1()
                                .min_w_0()
                                .child(orbit::text(value, 24.0, 600, orbit::ink(cx), cx))
                                .child(orbit::text(label, 12.0, 400, orbit::ink_3(cx), cx))
                        }),
                    ),
                )
            })
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(8.0))
                    .child(
                        orbit::primary_button("home-edit-overlay", "Editar overlay", cx).on_click(
                            cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)),
                        ),
                    )
                    .child(orbit::disabled(
                        orbit::button("home-stop-overlay", "Detener", cx),
                        "El control del overlay desde Inicio estará disponible próximamente",
                    )),
            );

        let now = chrono::Local::now().fixed_offset();
        let activity_rows = div()
            .id("home-activity-list")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .children(
                self.launcher
                    .read(cx)
                    .saved_profiles()
                    .iter()
                    .filter(|profile| profile.last_launched_at.is_some())
                    .take(8)
                    .filter_map(|profile| {
                        profile.last_launched_at.as_ref().map(|at| {
                            div()
                                .flex()
                                .items_center()
                                .gap(px(8.0))
                                .border_b_1()
                                .border_color(rgba(orbit::line_row(cx)))
                                .child(
                                    orbit::summary_row(
                                        format!("{} lanzado", profile.name),
                                        orbit::activity_time(at, now),
                                        "v-launch",
                                        cx,
                                    )
                                    .border_0()
                                    .flex_1()
                                    .min_w_0(),
                                )
                                .child(orbit::pill("Lanzado", orbit::Tone::Neutral, cx))
                        })
                    }),
            );
        let activity = orbit::neo_card(cx)
            .flex_1()
            .min_w_0()
            .min_h_0()
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
            .when(
                self.launcher.read(cx).saved_profiles().iter().any(|p| p.last_launched_at.is_some()),
                |card| card.child(orbit::scroll_fade(activity_rows, cx.global::<orbit::design::Tokens>().colors.neo_bottom)),
            )
            .when(
                !self
                    .launcher
                    .read(cx)
                    .saved_profiles()
                    .iter()
                    .any(|p| p.last_launched_at.is_some()),
                |card| {
                    card.child(div().flex_1().min_h_0().flex().flex_col().items_center().justify_center().gap(px(16.0))
                        .child(orbit::icon("clock", 40.0, orbit::ink_3(cx)))
                        .child(orbit::text("Tu actividad empieza con un lanzamiento", 16.0, 600, orbit::ink(cx), cx).text_center())
                        .child(orbit::text("Lanza un perfil desde Launcher. Su último lanzamiento aparecerá aquí.", 14.0, 400, orbit::ink_3(cx), cx).max_w(px(320.0)).text_center()))
                },
            );
        let center = div()
            .id("home-center")
            .flex_grow(1.0)
            .flex_basis(gpui::relative(2.0 / 3.0))
            .min_w_0()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(hero)
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .when(f32::from(window.viewport_size().height) <= 900.0, |row| {
                        row.min_h(px(440.0))
                    })
                    .flex()
                    .gap(px(gap))
                    .child(overlay)
                    .child(activity),
            );
        let state = div()
            .flex_none()
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .border_b_1()
                    .border_color(gpui::rgba(orbit::line(cx)))
                    .child(
                        orbit::summary_row("Le Mans Ultimate", status, "v-helmet", cx)
                            .border_b_0()
                            .min_h(px(48.0))
                            .flex_1()
                            .min_w_0(),
                    )
                    .child(orbit::pill(
                        if connected { "Conectado" } else { "Esperando" },
                        if connected {
                            orbit::Tone::Success
                        } else {
                            orbit::Tone::Neutral
                        },
                        cx,
                    )),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .border_b_1()
                    .border_color(gpui::rgba(orbit::line(cx)))
                    .child(
                        orbit::summary_row(
                            profile_name.to_owned(),
                            "Perfil favorito",
                            "v-launch",
                            cx,
                        )
                        .border_b_0()
                        .min_h(px(48.0))
                        .flex_1()
                        .min_w_0(),
                    )
                    .child(orbit::pill(
                        if profile.is_some() {
                            "Guardado"
                        } else {
                            "Sin perfil"
                        },
                        orbit::Tone::Neutral,
                        cx,
                    )),
            )
            .when(self.shell.access.tester, |card| {
                card.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .border_b_1()
                        .border_color(gpui::rgba(orbit::line(cx)))
                        .child(
                            orbit::summary_row(
                                "Testing Center",
                                "Acceso de tester",
                                "v-testing",
                                cx,
                            )
                            .border_b_0()
                            .min_h(px(48.0))
                            .flex_1()
                            .min_w_0(),
                        )
                        .child(orbit::pill("Tester", orbit::Tone::Accent, cx)),
                )
            })
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .border_b_1()
                    .border_color(gpui::rgba(orbit::line(cx)))
                    .child(
                        orbit::summary_row("Beta para testers", "Acceso gratuito", "key", cx)
                            .border_b_0()
                            .min_h(px(48.0))
                            .flex_1()
                            .min_w_0(),
                    )
                    .child(orbit::pill("Beta", orbit::Tone::Neutral, cx)),
            );
        let mut templates = div().flex_1().min_h_0().flex().flex_col().gap(px(gap));
        // Alto B/XS: solo la primera fila de plantillas (`.op-b`).
        for row in 0..if adapt.show_optional() { 2 } else { 1 } {
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
                        .child(
                            orbit::button(title, "Abrir Studio", cx)
                                .self_start()
                                .on_click(
                                    cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)),
                                ),
                        )
                }),
            ));
        }
        let page = div()
            .size_full()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(composer)
            .child(center);
        let templates_title = if adapt.show_secondary() {
            "Plantillas para tu próxima sesión"
        } else {
            "Plantillas"
        };
        (
            page,
            vec![
                orbit::RailSection::new("Estado", "pulse", state),
                orbit::RailSection::new(templates_title, "v-studio", templates).grow(),
            ],
        )
    }
}
