//! Inicio del layout C sobre los mismos renderizadores de Studio y Desktop.
use super::Hub;
use crate::{Section, orbit};
use gpui::{Context, Div, Entity, Window, div, prelude::*, px, rgb, rgba};
use vantare_domain::{Snapshot, format::Preferences};
use vantare_ui::{Kind, Overlay, Settings};
struct Preview {
    view: Entity<Overlay>,
    scale: std::cell::Cell<f32>,
    lock: Option<&'static str>,
}
struct PrimaryPreview {
    layout: vantare_ui::layout::Layout,
    access: Option<super::navigation::Access>,
    views: Vec<Preview>,
}
pub(super) struct Previews {
    templates: Vec<Preview>,
    primary: std::cell::RefCell<Option<PrimaryPreview>>,
    snapshot: std::cell::RefCell<Snapshot>,
}
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
fn thumbnail_items(layout: &vantare_ui::layout::Layout) -> Vec<&vantare_ui::layout::Instance> {
    layout
        .instances
        .iter()
        .filter(|item| item.visible)
        .collect()
}
fn thumbnail_host(
    item: &vantare_ui::layout::Instance,
    left: f32,
    top: f32,
    scale: f32,
    view: impl IntoElement,
) -> Div {
    div()
        .absolute()
        .left(px((item.x - left) * scale))
        .top(px((item.y - top) * scale))
        .opacity(item.opacity)
        .child(view)
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
                    lock: None,
                }
            })
            .collect();
        Self {
            templates: previews,
            primary: std::cell::RefCell::new(None),
            snapshot: std::cell::RefCell::new(snapshot.clone()),
        }
    }
    pub fn ingest(&self, snapshot: &Snapshot, cx: &mut gpui::App) {
        self.snapshot.replace(snapshot.clone());
        if let Some(primary) = self.primary.borrow().as_ref() {
            for preview in primary
                .views
                .iter()
                .filter(|preview| preview.lock.is_none())
            {
                preview
                    .view
                    .update(cx, |overlay, cx| overlay.ingest(snapshot, cx));
            }
        }
        for preview in &self.templates {
            preview
                .view
                .update(cx, |preview, cx| preview.ingest(snapshot, cx));
        }
    }
    fn thumbnail(&self, index: usize, width: f32, height: f32, cx: &mut gpui::App) -> Div {
        Self::render_thumbnail(&self.templates[index], width, height, cx)
    }
    /// Misma configuración y renderer que Studio/Desktop; solo ajusta la escala de la vista previa.
    fn layout_thumbnail(
        &self,
        layout: &vantare_ui::layout::Layout,
        access: Option<super::navigation::Access>,
        width: f32,
        height: f32,
        cx: &mut gpui::App,
    ) -> Div {
        let mut primary = self.primary.borrow_mut();
        if primary
            .as_ref()
            .is_none_or(|previous| previous.layout != *layout || previous.access != access)
        {
            let views = layout
                .instances
                .iter()
                .filter(|item| item.visible)
                .map(|item| {
                    let lock = access.and_then(|access| access.widget_lock(item.settings.kind()));
                    let mut overlay = Overlay::configured(&item.settings, layout.preferences);
                    overlay.set_frame_size(item.geometry.size);
                    let view = cx.new(|cx| {
                        if lock.is_none() {
                            overlay.ingest(&self.snapshot.borrow(), cx);
                        }
                        overlay
                    });
                    Preview {
                        view,
                        scale: std::cell::Cell::new(1.0),
                        lock,
                    }
                })
                .collect();
            *primary = Some(PrimaryPreview {
                layout: layout.clone(),
                access,
                views,
            });
        }
        let previews = &primary.as_ref().expect("vista inicializada").views;
        let items = thumbnail_items(layout);
        let left = items
            .iter()
            .map(|item| item.x)
            .fold(f32::INFINITY, f32::min);
        let top = items
            .iter()
            .map(|item| item.y)
            .fold(f32::INFINITY, f32::min);
        let (right, bottom) =
            items
                .iter()
                .zip(previews)
                .fold((left, top), |(right, bottom), (item, preview)| {
                    let (w, h) = preview.view.read(cx).frame_size();
                    (right.max(item.x + w), bottom.max(item.y + h))
                });
        let scale = ((width - 16.0) / (right - left).max(1.0))
            .min((height - 16.0) / (bottom - top).max(1.0))
            .clamp(0.01, 1.0);
        let mut stage = div()
            .relative()
            .w(px((right - left) * scale))
            .h(px((bottom - top) * scale))
            .flex_none();
        for (item, preview) in items.iter().zip(previews) {
            if (preview.scale.replace(scale) - scale).abs() > f32::EPSILON {
                preview.view.update(cx, |overlay, cx| {
                    if let Err(error) = overlay.set_preview_scale(scale) {
                        eprintln!("miniatura: {error}");
                    }
                    cx.notify();
                });
            }
            let view = if let Some(reason) = preview.lock {
                let (w, h) = preview.view.read(cx).frame_size();
                div()
                    .w(px(w * scale))
                    .h(px(h * scale))
                    .child(orbit::catalog_placeholder(reason, cx))
                    .into_any_element()
            } else {
                preview.view.clone().into_any_element()
            };
            let mut host = thumbnail_host(item, left, top, scale, view);
            // El candado describe contenido retenido incluso si su opacidad guardada es cero.
            if preview.lock.is_some() {
                host = host.opacity(1.0);
            }
            stage = stage.child(host);
        }
        div()
            .w_full()
            .h(px(height))
            .min_h_0()
            .overflow_hidden()
            .rounded(px(8.0))
            .bg(orbit::gradient([0x0020_2530, 0x0010_1115], 180.0))
            .flex()
            .items_center()
            .justify_center()
            .child(stage)
    }
    fn render_thumbnail(preview: &Preview, width: f32, height: f32, cx: &mut gpui::App) -> Div {
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
/// Estados globales derivados, sin perfiles ni actividad de ejemplo.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HomeState {
    Session,
    Empty,
    Loading,
    AccessError,
}
fn home_state(pending: bool, error: bool, profiles: usize) -> HomeState {
    if error {
        HomeState::AccessError
    } else if pending {
        HomeState::Loading
    } else if profiles == 0 {
        HomeState::Empty
    } else {
        HomeState::Session
    }
}

fn hero_height(adapt: orbit::Adapt) -> f32 {
    // La altura del hero sigue el viewport; la preferencia de densidad conserva gaps y filas.
    if adapt.height >= 1000.0 {
        300.0
    } else if adapt.height >= 820.0 {
        236.0
    } else {
        200.0
    }
}
fn lower_height(adapt: orbit::Adapt, error: bool) -> f32 {
    let (top, _, bottom) = adapt.padding();
    adapt.height
        - 52.0
        - top
        - bottom
        - if adapt.show_notes() { 60.0 } else { 52.0 }
        - 2.0 * adapt.gap()
        - hero_height(adapt)
        - if error { 60.0 + adapt.gap() } else { 0.0 }
}
fn visible_settings(layout: &vantare_ui::layout::Layout) -> Vec<&Settings> {
    layout
        .instances
        .iter()
        .filter(|item| item.visible)
        .map(|item| &item.settings)
        .collect()
}

impl Hub {
    fn home_loading(
        composer: Div,
        hero: Div,
        adapt: orbit::Adapt,
        cx: &gpui::App,
    ) -> (Div, Vec<orbit::RailSection>) {
        let skeletons = |overlay: bool| {
            let mut card = orbit::neo_card(cx)
                .flex_1()
                .min_h_0()
                .gap(px(14.0))
                .child(orbit::skeleton(0.3, 14.0, cx));
            if overlay {
                card = card.child(
                    div()
                        .flex()
                        .gap(px(20.0))
                        .child(orbit::skeleton(1.0, 225.0, cx).flex_1())
                        .when(adapt.center_width() >= 1100.0, |row| {
                            row.child(
                                div()
                                    .w(px(150.0))
                                    .flex_none()
                                    .flex()
                                    .flex_col()
                                    .gap(px(14.0))
                                    .child(orbit::skeleton(1.0, 24.0, cx))
                                    .child(orbit::skeleton(0.6, 14.0, cx)),
                            )
                        }),
                );
            } else {
                for _ in 0..5 {
                    card = card.child(orbit::skeleton(1.0, 42.0, cx));
                }
            }
            card
        };
        let (top, _, _) = adapt.padding();
        let status_height =
            top + if adapt.show_notes() { 60.0 } else { 52.0 } + adapt.gap() + hero_height(adapt)
                - 63.0;
        (
            div()
                .size_full()
                .min_h_0()
                .flex()
                .flex_col()
                .gap(px(adapt.gap()))
                .child(composer)
                .child(hero)
                .child(
                    div()
                        .flex_1()
                        .min_h_0()
                        .flex()
                        .gap(px(adapt.gap()))
                        .child(skeletons(true))
                        .child(skeletons(false)),
                ),
            vec![
                orbit::RailSection::new(
                    "Estado",
                    "pulse",
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(12.0))
                        .min_h(px(status_height))
                        .children((0..4).map(|_| orbit::skeleton(1.0, 36.0, cx))),
                ),
                orbit::RailSection::new(
                    "Plantillas",
                    "v-studio",
                    div()
                        .grid()
                        .grid_cols(2)
                        .gap(px(12.0))
                        .children((0..4).map(|_| {
                            orbit::neo_card(cx)
                                .min_h(px(150.0))
                                .child(orbit::skeleton(1.0, 90.0, cx))
                        })),
                )
                .grow(),
            ],
        )
    }
    #[allow(clippy::too_many_lines)] // Composición lineal del layout C; las piezas se comparten en Orbit.
    fn home_overlay(
        preview: Option<Div>,
        widget_labels: &[&str],
        connected: bool,
        adapt: orbit::Adapt,
        cx: &mut Context<Self>,
    ) -> Div {
        let widget_count = widget_labels.len();
        let has_preview = preview.is_some();
        orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .p(px(16.0))
            .gap(px(8.0))
            .child(orbit::neo_header("Overlay en pista", "v-studio", cx))
            .when_some(preview, |card, preview| {
                let height = (lower_height(adapt, false)
                    - if adapt.show_optional() { 260.0 } else { 158.0 })
                .clamp(110.0, 340.0);
                card.child(preview.h(px(height)).flex_none())
            })
            .when(!has_preview, |card| {
                card.child(
                    div()
                        .flex_1()
                        .min_h_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(orbit::text(
                            "Ningún widget visible en tu layout",
                            14.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        )),
                )
            })
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(orbit::text("Layout local", 22.0, 600, orbit::ink(cx), cx).flex_1())
                    .child(orbit::pill("Vista previa", orbit::Tone::Neutral, cx)),
            )
            .child(orbit::text(
                if connected {
                    "Telemetría conectada"
                } else {
                    "Esperando simulador"
                },
                12.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
            .when(adapt.show_optional(), |card| {
                card.child(
                    div()
                        .flex()
                        .gap(px(6.0))
                        .children(
                            widget_labels
                                .iter()
                                .take(3)
                                .map(|label| orbit::pill(label, orbit::Tone::Neutral, cx)),
                        )
                        .when(widget_count > 3, |chips| {
                            chips.child(orbit::pill(
                                &format!("+{}", widget_count - 3),
                                orbit::Tone::Neutral,
                                cx,
                            ))
                        }),
                )
            })
            .when(adapt.show_optional(), |card| {
                card.child(
                    div().flex().gap(px(16.0)).children(
                        [
                            ("—".to_owned(), "Hz"),
                            (widget_count.to_string(), "Widgets visibles"),
                            ("—".to_owned(), "CPU"),
                        ]
                        .map(|(value, label)| {
                            div()
                                .flex_1()
                                .min_w_0()
                                .child(orbit::text(value, 24.0, 600, orbit::ink(cx), cx))
                                .child(orbit::text(label, 11.0, 400, orbit::ink_3(cx), cx))
                        }),
                    ),
                )
            })
            .child(
                div()
                    .flex()
                    .flex_none()
                    .gap(px(8.0))
                    .child(
                        orbit::primary_button("home-edit-overlay", "Editar overlay", cx).on_click(
                            cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)),
                        ),
                    )
                    .child(orbit::pending_button(
                        "home-stop-overlay",
                        "Detener",
                        "Control de overlays desde Inicio: próximamente",
                        cx,
                    )),
            )
    }
    fn home_overlay_onboarding(cx: &mut Context<Self>) -> Div {
        orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(12.0))
            .child(orbit::icon("v-studio", 32.0, orbit::ink_3(cx)))
            .child(orbit::text(
                "Prepara tu overlay",
                16.0,
                600,
                orbit::ink(cx),
                cx,
            ))
            .child(
                orbit::text(
                    "Elige una plantilla y ajusta tu layout en Studio.",
                    13.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                )
                .text_center(),
            )
            .child(
                orbit::small_button("home-first-overlay", "Ver plantillas", cx)
                    .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx))),
            )
    }

    fn home_first_steps(cx: &gpui::App) -> Div {
        orbit::neo_card(cx)
            .w(px(360.0))
            .flex_none()
            .p(px(20.0))
            .gap(px(12.0))
            .child(orbit::eyebrow("Así funciona", cx))
            .children(
                [
                    (
                        "1 · Elige tus apps",
                        "Crea tu perfil en Launcher",
                        "v-launch",
                    ),
                    (
                        "2 · Ajusta tu overlay",
                        "Elige una plantilla en Studio",
                        "v-studio",
                    ),
                    (
                        "3 · Lanza con Ctrl L",
                        "Abre las apps de tu perfil en orden",
                        "v-keys",
                    ),
                ]
                .map(|(label, note, icon)| orbit::summary_row(label, note, icon, cx).border_b_0()),
            )
    }

    fn home_recent(&self, cx: &Context<Self>) -> Vec<(String, i64, &'static str, orbit::Tone)> {
        let mut recent = self.notifications.read(cx).home_activity();
        recent.extend(
            self.launcher
                .read(cx)
                .saved_profiles()
                .iter()
                .filter_map(|profile| {
                    let at =
                        chrono::DateTime::parse_from_rfc3339(profile.last_launched_at.as_deref()?)
                            .ok()?;
                    Some((
                        format!("{} · último lanzamiento", profile.name),
                        at.timestamp_millis(),
                        "Launcher",
                        orbit::Tone::Accent,
                    ))
                }),
        );
        recent.sort_by_key(|(_, at, _, _)| std::cmp::Reverse(*at));
        recent.truncate(8);
        recent
    }
    fn home_activity(&self, cx: &mut Context<Self>) -> Div {
        let recent = self.home_recent(cx);
        let activity_rows = div()
            .id("home-activity-list")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .children(recent.iter().map(|(title, at, kind, tone)| {
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .border_b_1()
                    .border_color(rgba(orbit::line_row(cx)))
                    .child(
                        orbit::summary_row(
                            title.clone(),
                            chrono::DateTime::from_timestamp_millis(*at).map_or_else(
                                || "Sin fecha".into(),
                                |date| {
                                    date.with_timezone(&chrono::Local)
                                        .format("%d/%m · %H:%M")
                                        .to_string()
                                },
                            ),
                            "clock",
                            cx,
                        )
                        .border_0()
                        .flex_1()
                        .min_w_0(),
                    )
                    .child(orbit::pill(kind, *tone, cx))
            }));
        orbit::neo_card(cx)
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
                        orbit::header_link("home-activity", "VER TODO", cx).on_click(
                            cx.listener(|hub, _, _, cx| hub.navigate(Section::Notifications, cx)),
                        ),
                    ),
            )
            .when(!recent.is_empty(), |card| {
                card.child(orbit::scroll_fade(
                    activity_rows,
                    cx.global::<orbit::design::Tokens>().colors.neo_bottom,
                ))
            })
            .when(recent.is_empty(), |card| {
                card.child(
                    div()
                        .flex_1()
                        .min_h_0()
                        .flex()
                        .flex_col()
                        .items_center()
                        .justify_center()
                        .gap(px(12.0))
                        .child(orbit::icon("clock", 32.0, orbit::ink_3(cx)))
                        .child(
                            orbit::text("Todavía no hay actividad", 16.0, 600, orbit::ink(cx), cx)
                                .text_center(),
                        )
                        .child(
                            orbit::text(
                                "Tus avisos y lanzamientos aparecerán aquí.",
                                13.0,
                                400,
                                orbit::ink_3(cx),
                                cx,
                            )
                            .text_center(),
                        ),
                )
            })
    }
    #[allow(clippy::too_many_arguments, clippy::too_many_lines)] // Acciones productivas ya compuestas por Inicio, sin estado duplicado.
    fn home_hero(
        &self,
        adapt: orbit::Adapt,
        state: HomeState,
        connected: bool,
        launch: gpui::AnyElement,
        studio: gpui::AnyElement,
        favorite: Div,
        cx: &mut Context<Self>,
    ) -> Div {
        let empty = state == HomeState::Empty;
        let loading = state == HomeState::Loading;
        let compact = adapt.center_width() < 1100.0;
        let short = adapt.height < 1000.0;
        let name = self.demo.as_ref().map_or("piloto", |demo| {
            demo.user
                .full_name
                .split_whitespace()
                .next()
                .unwrap_or("piloto")
        });
        let status = if connected {
            "LMU conectado"
        } else {
            "Esperando simulador"
        };
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
        let greeting = if empty {
            "Bienvenido a Vantare".to_owned()
        } else {
            format!("{salute}, {name}")
        };
        orbit::hero_surface(cx)
            .h(px(hero_height(adapt)))
            .flex_none()
            .flex_row()
            .items_center()
            .gap(px(24.0))
            .px(px(if compact { 24.0 } else { 40.0 }))
            .py(px(if short { 22.0 } else { 32.0 }))
            .child(
                orbit::circuit(self.studio.read(cx).home_track().filter(|_| connected), cx)
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
                    .when(!loading, |hero| {
                        hero.child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(8.0))
                                .child(if connected {
                                    orbit::live_dot(cx)
                                } else {
                                    orbit::status_dot(orbit::Tone::Neutral, 8.0, cx)
                                })
                                .child(orbit::meta(
                                    &format!(
                                        "{} · {status}{}",
                                        now.format("%d/%m"),
                                        self.studio
                                            .read(cx)
                                            .home_track()
                                            .filter(|_| connected && adapt.show_secondary())
                                            .map_or(String::new(), |track| format!(" · {track}"))
                                    ),
                                    10.0,
                                    orbit::ink_2(cx),
                                    cx,
                                )),
                        )
                    })
                    .child(
                        orbit::text(
                            greeting.clone(),
                            if !adapt.show_optional() {
                                38.0
                            } else if short {
                                46.0
                            } else if compact {
                                44.0
                            } else {
                                54.0
                            },
                            600,
                            orbit::ink(cx),
                            cx,
                        )
                        .id("home-greeting")
                        .w_full()
                        .min_w_0()
                        .flex_none()
                        .whitespace_nowrap()
                        .text_ellipsis()
                        .overflow_hidden()
                        .aria_label(greeting.clone())
                        .tooltip(move |_, cx| cx.new(|_| orbit::Tooltip(greeting.clone())).into())
                        .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
                        .line_height(px(if !adapt.show_optional() {
                            40.0
                        } else if short {
                            48.0
                        } else if compact {
                            46.0
                        } else {
                            56.0
                        })),
                    )
                    .when(!loading && adapt.show_optional(), |hero| {
                        hero.child(orbit::text(
                            if empty {
                                "Crea un perfil para abrir tus aplicaciones en orden."
                            } else if connected {
                                "Telemetría conectada. Prepara tu próxima sesión."
                            } else {
                                "Tu cabina está lista. Esperando simulador."
                            },
                            14.0,
                            400,
                            orbit::ink_2(cx),
                            cx,
                        ))
                    })
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
            .when(adapt.width > 1600.0 && adapt.show_optional(), |hero| {
                hero.child(favorite.relative())
            })
    }
    #[allow(clippy::too_many_lines)] // Composición declarativa restante: composer, perfil y carril.
    /// Inicio: el centro es la página; «Estado» y «Plantillas» forman la barra derecha (R10.2).
    pub(super) fn foundation_home(
        &self,
        _window: &Window,
        cx: &mut Context<Self>,
    ) -> (Div, Vec<orbit::RailSection>) {
        let adapt = self.shell.adapt;
        let gap = adapt.gap();
        let center_width = adapt.center_width() - 2.0 * adapt.padding().1;
        let overlay_width = (center_width - gap) / 2.0 - 32.0;
        let layout = self.studio.read(cx).home_layout().clone();
        let visible = visible_settings(&layout);
        let widget_labels: Vec<_> = visible
            .iter()
            .map(|settings| settings.kind().label())
            .collect();
        let main_settings = visible.first().map(|settings| (*settings).clone());
        let template_width = (adapt.rail_width() - 32.0 - gap) / 2.0;
        let (pending, access_error) = self.remote.read(cx).home_access();
        let mut state = home_state(
            pending,
            access_error.is_some() || self.shell.access.blocked,
            self.launcher.read(cx).saved_profiles().len(),
        );
        // Variantes solo del banco de captura; no alteran servicios ni permisos.
        if let Some(capture) = &self.capture {
            state = match capture.name.as_str() {
                "inicio-base" => HomeState::Session,
                "inicio-vacio" => HomeState::Empty,
                "inicio-cargando" => HomeState::Loading,
                "inicio-error" => HomeState::AccessError,
                _ if capture.home_session() => HomeState::Session,
                _ => state,
            };
        }
        let preview_height = (lower_height(adapt, state == HomeState::AccessError)
            - if adapt.show_optional() { 260.0 } else { 158.0 })
        .max(90.0);
        let compact = adapt.center_width() < 1100.0;
        let short = adapt.density != orbit::adapt::Density::A;
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
        let empty = state == HomeState::Empty;
        let launch = orbit::play_button(
            "home-launch",
            if empty {
                "Crear mi primer perfil"
            } else {
                &launch_label
            },
            adapt.hero_button(),
            !empty,
            cx,
        )
        .tab_stop(empty || profile.is_some() && launching.is_none())
        .when(
            !empty && (profile.is_none() || launching.is_some()),
            |button| orbit::disabled(button, "Perfil no disponible o lanzamiento en curso"),
        )
        .on_click(cx.listener(move |hub, _, window, cx| {
            if empty {
                hub.navigate(Section::Launcher, cx);
                hub.launcher
                    .update(cx, |launcher, cx| launcher.create_home_profile(window, cx));
            } else {
                hub.launch_favorite(cx);
            }
        }));
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
                    "«Studio» · «Launcher»",
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
            .p(px(if compact || short { 16.0 } else { 20.0 }))
            .gap(px(if compact || short { 4.0 } else { 8.0 }))
            .child(orbit::meta("Perfil favorito", 10.0, orbit::ink_3(cx), cx))
            .child(
                orbit::text(profile_name.to_owned(), 24.0, 600, orbit::ink(cx), cx)
                    .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
                    .whitespace_nowrap()
                    .text_ellipsis()
                    .overflow_hidden(),
            )
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
            .when_some(
                last_progress.filter(|_| adapt.show_notes()),
                |card, (ready, total)| {
                    card.child(orbit::text(
                        format!("{ready}/{total} pasos listos"),
                        12.0,
                        500,
                        orbit::green(cx),
                        cx,
                    ))
                },
            );
        let favorite = match state {
            HomeState::Empty => Self::home_first_steps(cx),
            HomeState::Loading => orbit::neo_card(cx)
                .w(px(360.0))
                .flex_none()
                .p(px(20.0))
                .gap(px(12.0))
                .children((0..4).map(|_| orbit::skeleton(1.0, 18.0, cx))),
            _ => favorite,
        };
        let hero = self.home_hero(
            adapt,
            state,
            connected,
            launch.into_any_element(),
            studio.into_any_element(),
            favorite,
            cx,
        );
        if state == HomeState::Loading {
            return Self::home_loading(composer, hero, adapt, cx);
        }
        let preview = main_settings.as_ref().map(|_| {
            self.home_previews.layout_thumbnail(
                &layout,
                self.studio.read(cx).catalog_access(),
                overlay_width,
                preview_height,
                cx,
            )
        });
        let overlay = if state == HomeState::Empty && !connected {
            Self::home_overlay_onboarding(cx)
        } else {
            Self::home_overlay(preview, &widget_labels, connected, adapt, cx)
        };

        let activity = self.home_activity(cx);
        let center = div()
            .id("home-center")
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
        // Align the second rail section with the cards below the hero.
        let (top, _, _) = adapt.padding();
        let composer_height = if adapt.show_notes() { 60.0 } else { 52.0 };
        let status_height = top
            + composer_height
            + adapt.gap()
            + hero_height(adapt)
            + if state == HomeState::AccessError {
                60.0 + adapt.gap()
            } else {
                0.0
            };
        let status_body = div()
            .min_h(px(status_height - 63.0)) // rail inset, header, bottom padding and separator
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
                            .min_h(px(adapt.row_height()))
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
                        .min_h(px(adapt.row_height()))
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
                            .min_h(px(adapt.row_height()))
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
                        orbit::summary_row(
                            "Beta para testers",
                            option_env!("VANTARE_VERSION").unwrap_or(env!("CARGO_PKG_VERSION")),
                            "key",
                            cx,
                        )
                        .border_b_0()
                        .min_h(px(adapt.row_height()))
                        .flex_1()
                        .min_w_0(),
                    )
                    .child(orbit::pill("Beta", orbit::Tone::Neutral, cx)),
            );
        let status_body = if empty && !connected {
            div()
                .min_h(px(status_height - 63.0))
                .flex_none()
                .flex()
                .flex_col()
                .items_center()
                .gap(px(12.0))
                .pt(px(24.0))
                .child(orbit::icon("v-helmet", 32.0, orbit::ink_3(cx)))
                .child(orbit::text(
                    "Esperando a Le Mans Ultimate",
                    14.0,
                    600,
                    orbit::ink(cx),
                    cx,
                ))
                .child(
                    orbit::text(
                        "Abre LMU y entra en pista para recibir telemetría.",
                        13.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    )
                    .text_center(),
                )
        } else {
            status_body
        };
        let mut templates = div().flex_1().min_h_0().flex().flex_col().gap(px(gap));
        // Alto B/XS: solo la primera fila de plantillas (`.op-b`).
        for row in 0..if adapt.show_optional() { 2 } else { 1 } {
            templates = templates.child(div().flex_none().min_h_0().flex().gap(px(gap)).children(
                (row * 2..row * 2 + 2).map(|index| {
                    let title = [
                        "Standings multiclase",
                        "Relative compacto",
                        "Fuel y stint",
                        "Delta y sectores",
                    ][index];
                    orbit::button(("home-template", index), "", cx)
                        .aria_label(format!("{title} · Abrir Studio"))
                        .flex_1()
                        .min_w_0()
                        .h_auto()
                        .flex_col()
                        .items_start()
                        .bg(gpui::transparent_black())
                        .border_0()
                        .p(px(0.0))
                        .gap(px(8.0))
                        .overflow_hidden()
                        .child(
                            self.home_previews
                                .thumbnail(index + 1, template_width, 92.0, cx),
                        )
                        .child(orbit::text(title, 13.0, 600, orbit::ink(cx), cx))
                        .child(orbit::text(
                            "Plantilla local · Abrir Studio",
                            11.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        ))
                        .on_click(cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)))
                }),
            ));
        }
        let banner = (state == HomeState::AccessError).then(|| {
            orbit::neo_card(cx)
                .flex_none()
                .flex_row()
                .items_center()
                .p(px(10.0))
                .gap(px(12.0))
                .child(
                    orbit::text(
                        "No se pudo verificar el acceso. Tus perfiles locales siguen disponibles.",
                        12.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    )
                    .flex_1()
                    .min_w_0(),
                )
                .child(
                    orbit::button("home-access-retry", "Reintentar", cx)
                        .flex_none()
                        .on_click(cx.listener(|hub, _, _, cx| {
                            hub.remote
                                .update(cx, crate::services::view::Remote::retry_home_access);
                        })),
                )
        });
        let page = div()
            .size_full()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(gap))
            .when_some(banner, gpui::ParentElement::child)
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
                orbit::RailSection::new("Estado", "pulse", status_body),
                orbit::RailSection::new(templates_title, "v-studio", templates).grow(),
            ],
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn states_follow_service_facts_and_error_precedes_loading() {
        for (pending, error, profiles, expected) in [
            (false, false, 1, HomeState::Session),
            (false, false, 0, HomeState::Empty),
            (true, false, 0, HomeState::Loading),
            (true, false, 2, HomeState::Loading),
            (false, true, 0, HomeState::AccessError),
            (true, true, 2, HomeState::AccessError),
        ] {
            assert_eq!(home_state(pending, error, profiles), expected);
        }
    }
    #[test]
    fn unavailable_layout_never_supplies_mockup_widgets() {
        let mut layout = vantare_ui::layout::Layout::default();
        assert!(visible_settings(&layout).is_empty());
        layout.instances.push(vantare_ui::layout::Instance {
            geometry: vantare_ui::geometry::Geometry::default(),
            id: "real-pedals".into(),
            x: 0.0,
            y: 0.0,
            visible: true,
            opacity: 1.0,
            settings: Settings::default_for(Kind::Pedals),
        });
        layout.instances.push(vantare_ui::layout::Instance {
            geometry: vantare_ui::geometry::Geometry::default(),
            id: "hidden-standings".into(),
            x: 0.0,
            y: 0.0,
            visible: false,
            opacity: 1.0,
            settings: Settings::default_for(Kind::Standings),
        });
        let settings = visible_settings(&layout);
        assert_eq!(settings.len(), 1);
        assert_eq!(settings[0].kind(), Kind::Pedals);
    }
    #[test]
    fn seven_sizes_leave_complete_lower_cards_in_both_rail_states() {
        for (width, height) in [
            (1280.0, 720.0),
            (1366.0, 768.0),
            (1440.0, 900.0),
            (1512.0, 900.0),
            (1920.0, 1080.0),
            (1680.0, 1050.0),
            (2048.0, 1152.0),
        ] {
            for open in [false, true] {
                let adapt = orbit::Adapt::new(width, height, None, open);
                let (top, _, bottom) = adapt.padding();
                for error in [false, true] {
                    let lower = lower_height(adapt, error);
                    assert!(
                        lower >= 298.0,
                        "{width}x{height} rail={open} error={error}: {lower}"
                    );
                    assert!(top + bottom + 52.0 + hero_height(adapt) + lower < height);
                }
            }
        }
    }
}

#[cfg(test)]
mod thumbnail_host_tests {
    use super::*;
    #[test]
    fn saved_opacity_visibility_order_and_overlap_reach_the_preview_host() {
        let mut layout = vantare_ui::layout::Layout::default();
        for (index, opacity) in [0.0, 0.25, 1.0].into_iter().enumerate() {
            layout.instances.push(vantare_ui::layout::Instance {
                geometry: vantare_ui::geometry::Geometry::default(),
                id: format!("test-{index}"),
                settings: Settings::default_for(Kind::Delta),
                x: 100.0,
                y: 100.0,
                visible: true,
                opacity,
            });
        }
        let mut hidden = layout.instances[0].clone();
        hidden.id = "hidden".into();
        hidden.visible = false;
        layout.instances.insert(1, hidden);
        let visible = thumbnail_items(&layout);
        assert_eq!(
            visible
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["test-0", "test-1", "test-2"]
        );
        for (item, opacity) in visible.iter().zip([0.0, 0.25, 1.0]) {
            let mut host = thumbnail_host(item, 0.0, 0.0, 0.5, div());
            assert_eq!(host.style().opacity, Some(opacity));
            assert_eq!(host.style().inset.left, Some(px(50.0).into()));
            assert_eq!(host.style().inset.top, Some(px(50.0).into()));
        }
    }
}

#[cfg(test)]
mod catalog_tests {
    use super::*;
    #[test]
    fn home_catalog_changes_without_editing_the_retained_document() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let mut layout = vantare_ui::layout::Layout::default();
            for kind in [Kind::Standings, Kind::Radar] {
                layout.instances.push(vantare_ui::layout::Instance {
                    id: kind.name().into(),
                    settings: Settings::default_for(kind),
                    x: 40.0,
                    y: 20.0,
                    visible: true,
                    opacity: 0.25,
                    geometry: vantare_ui::geometry::Geometry::default(),
                });
            }
            let original = layout.clone();
            let previews = Previews::new(&Snapshot::default(), layout.preferences, None, cx);
            for catalog in [
                vantare_ipc::control::CatalogAccess::LaunchV1,
                vantare_ipc::control::CatalogAccess::Pro,
                vantare_ipc::control::CatalogAccess::LaunchV1,
            ] {
                let access = super::super::navigation::Access {
                    verified: true,
                    catalog,
                    ..Default::default()
                };
                let _stage = previews.layout_thumbnail(&layout, Some(access), 500.0, 200.0, cx);
                let primary = previews.primary.borrow();
                let primary = primary.as_ref().expect("miniatura");
                assert!(primary.views[0].lock.is_none());
                assert_eq!(primary.views[1].lock, access.widget_lock(Kind::Radar));
                assert_eq!(primary.layout, original);
            }
            previews.ingest(&Snapshot::default(), cx);
            assert_eq!(layout, original);
            cx.quit();
        });
    }
}
