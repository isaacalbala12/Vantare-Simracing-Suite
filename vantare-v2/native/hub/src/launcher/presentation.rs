//! Composición de la sección y su contexto con el kit compartido.
use super::*;
use crate::orbit::Tone;
use crate::orbit::typography;
use gpui::{linear_color_stop, linear_gradient, px, rgb, rgba};

#[derive(gpui::IntoElement)]
struct TrackedLabel {
    content: gpui::SharedString,
    ink: typography::Ink,
    height: f32,
}

impl gpui::RenderOnce for TrackedLabel {
    fn render(self, window: &mut Window, cx: &mut gpui::App) -> impl IntoElement {
        let height = self.height;
        let width = typography::width(window, &self.content, &self.ink, cx);
        let baseline = typography::baseline(0.0, height, self.ink.size);
        div()
            .id(self.content.clone())
            .role(gpui::Role::Label)
            .aria_label(self.content.clone())
            .w(px(width))
            .h(px(height))
            .flex_none()
            .child(
                gpui::canvas(
                    |_, _, _| (),
                    move |bounds, (), window, cx| {
                        typography::with_origin(
                            (f32::from(bounds.origin.x), f32::from(bounds.origin.y)),
                            || {
                                typography::draw(
                                    window,
                                    cx,
                                    &self.content,
                                    0.0,
                                    baseline,
                                    &self.ink,
                                );
                            },
                        );
                    },
                )
                .size_full(),
            )
    }
}

// Cada familia Inter W<N> ya contiene el peso N; pedirlo de nuevo sintetiza negrita.
pub(super) fn text(
    content: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> gpui::Div {
    let height = size * 1.5;
    let baseline = typography::baseline(0.0, height, size);
    let native_baseline = f32::midpoint(height.round(), size * (1984.0 - 494.0) / 2048.0);
    orbit::text(content, size, weight, color, cx)
        .relative()
        .top(px(baseline - native_baseline))
        .font_weight(
            if cx.global::<orbit::theme::Theme>().interface_font
                == orbit::theme::InterfaceFont::Inter
            {
                gpui::FontWeight::NORMAL
            } else {
                gpui::FontWeight(f32::from(weight))
            },
        )
        .line_height(px(size * 1.5))
}

pub(super) fn tracked_text(
    content: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    spacing: f32,
) -> gpui::Div {
    tracked_line(content, size, weight, color, spacing, size * 1.5)
}

fn tracked_line(
    content: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    spacing: f32,
    height: f32,
) -> gpui::Div {
    // El kit mide la línea completa: una caja por carácter redondea su ancho
    // y acumula errores de tracking, sobre todo en las políticas del perfil.
    div().flex().child(TrackedLabel {
        content: content.into(),
        ink: typography::ink(size, f32::from(weight), spacing / size, rgb(color).into()),
        height,
    })
}

pub(super) use crate::orbit::eyebrow;

use crate::orbit::chip;

#[derive(gpui::IntoElement)]
struct SvgMark {
    data: gpui::SharedString,
    size: f32,
}

impl gpui::RenderOnce for SvgMark {
    fn render(self, window: &mut Window, cx: &mut gpui::App) -> impl IntoElement {
        use std::hash::{Hash, Hasher};
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        self.data.hash(&mut hash);
        self.size.to_bits().hash(&mut hash);
        let key = hash.finish();
        // El renderer de GPUI prepara el SVG una vez por elemento. La primera
        // imagen ya contiene la marca, sin esperar al cargador asíncrono de Img.
        let image = window.use_keyed_state(("launcher-svg", key), cx, |_, cx| {
            cx.svg_renderer()
                .render_single_frame(self.data.as_bytes(), 1.0)
                .map_err(|error| format!("SVG Launcher: {error}"))
        });
        match image.read(cx) {
            Ok(image) => gpui::img(image.clone())
                .size(px(self.size))
                .into_any_element(),
            Err(error) => div()
                .id(("launcher-svg-error", key))
                .role(gpui::Role::Label)
                .aria_label(error.clone())
                .size(px(self.size))
                .child("!")
                .into_any_element(),
        }
    }
}

fn svg_mark(svg: &str, size: f32) -> SvgMark {
    SvgMark {
        data: svg.to_owned().into(),
        size,
    }
}

fn star_mark(filled: bool) -> SvgMark {
    let fill = if filled { "#f04755" } else { "none" };
    let stroke = if filled { "#f04755" } else { "#8a858b" };
    svg_mark(
        &format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="{fill}" stroke="{stroke}" stroke-width="1.4" stroke-linejoin="round"><path d="M8 1.9l1.83 3.86 4.17.6-3 3 .71 4.24L8 11.6l-3.71 2l.71-4.24-3-3 4.17-.6z"/></svg>"#
        ),
        15.0,
    )
}

fn last_run(profiles: &[Profile]) -> Option<String> {
    profiles
        .iter()
        .filter_map(|profile| {
            chrono::DateTime::parse_from_rfc3339(profile.last_launched_at.as_deref()?).ok()
        })
        .max()
        .map(|when| {
            use chrono::Datelike;
            let when = when.with_timezone(&chrono::Local);
            let months = [
                "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
            ];
            format!(
                "{:02} {}, {}",
                when.day(),
                months[when.month0() as usize],
                when.format("%H:%M")
            )
        })
}

pub(super) fn hotkey_keys(hotkey: &str) -> Vec<String> {
    hotkey
        .split('+')
        .filter_map(|key| {
            let key = key.trim().to_lowercase();
            match key.as_str() {
                "" => None,
                "ctrl" | "control" => Some("Ctrl".into()),
                "alt" => Some("Alt".into()),
                "shift" => Some("Shift".into()),
                "meta" | "win" => Some("Win".into()),
                _ => Some(key.to_uppercase()),
            }
        })
        .collect()
}

fn context_block(cx: &gpui::App) -> gpui::Div {
    div()
        .border_t_1()
        .border_color(rgba(orbit::line_row(cx)))
        .pt(px(16.0))
        .px(px(2.0))
}

fn context_heading(label: &str, value: String, cx: &gpui::App) -> gpui::Div {
    context_heading_action(
        label,
        orbit::mono_text(value, 10.5, orbit::ink_3(cx), cx),
        cx,
    )
}

fn context_heading_action(label: &str, value: impl IntoElement, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_wrap()
        .items_center()
        .justify_between()
        .px(px(7.0))
        .child(eyebrow(label, cx))
        .child(value)
}

fn monogram(label: &str, size: f32, first: u32, second: u32, cx: &gpui::App) -> gpui::Div {
    div()
        .size(px(size))
        .flex_none()
        .rounded(px(if size >= 46.0 {
            13.0
        } else if size >= 39.0 {
            11.0
        } else {
            8.0
        }))
        .flex()
        .items_center()
        .justify_center()
        .bg(linear_gradient(
            145.0,
            // CSS extiende la diagonal del cuadrado: sin(145°) + |cos(145°)|.
            linear_color_stop(rgb(first), -0.196_364),
            linear_color_stop(rgb(second), 1.196_364),
        ))
        .text_size(px(if size >= 46.0 {
            11.5
        } else if size >= 39.0 {
            10.5
        } else {
            9.0
        }))
        .font_family(crate::orbit::sans_override("Inter W800", cx))
        .font_weight(gpui::FontWeight::NORMAL)
        .text_color(rgb(crate::orbit::ink(cx)))
        .shadow(vec![
            gpui::BoxShadow {
                color: rgba(0x0000_00b3).into(),
                offset: gpui::point(px(0.0), px(6.0)),
                blur_radius: px(16.0),
                spread_radius: px(-6.0),
                inset: false,
            },
            gpui::BoxShadow {
                color: rgba(crate::orbit::legacy_rgba(0xffff_ff33, cx)).into(),
                offset: gpui::point(px(0.0), px(1.0)),
                blur_radius: px(0.0),
                spread_radius: px(0.0),
                inset: true,
            },
        ])
        .child(label.to_owned())
}

fn profile_initials(name: &str) -> String {
    let words: Vec<_> = name
        .split_whitespace()
        .filter(|word| {
            !matches!(
                word.to_lowercase().as_str(),
                "de" | "del" | "la" | "el" | "y"
            )
        })
        .collect();
    match words.as_slice() {
        [] => "··".into(),
        [word] => word.chars().take(3).collect::<String>().to_uppercase(),
        [first, second, ..] => format!(
            "{}{}",
            first.chars().next().unwrap_or_default().to_uppercase(),
            second.chars().next().unwrap_or_default().to_uppercase()
        ),
    }
}

fn profile_mark(name: &str, featured: bool, size: f32, cx: &gpui::App) -> gpui::Div {
    let (first, second) = if featured {
        (0x00ff_6a5f, crate::orbit::carmine(cx))
    } else {
        (crate::orbit::cyan(cx), 0x002a_5b8f)
    };
    monogram(&profile_initials(name), size, first, second, cx)
}

impl Launcher {
    pub(crate) fn create_home_profile(
        &mut self,
        window: &mut gpui::Window,
        cx: &mut gpui::Context<Self>,
    ) {
        self.new_profile(None, window, cx);
    }
    /// Baldosas del kit; los nombres y el orden pertenecen al documento Launcher.
    pub(crate) fn profile_app_tiles(&self, profile: &Profile, cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .gap(px(6.0))
            .children(profile.steps.iter().map(|step| {
                let name = self
                    .store
                    .document
                    .apps
                    .iter()
                    .find(|app| app.id == step.app_id)
                    .map_or(step.app_id.as_str(), |app| app.name.as_str());
                orbit::app_tile(&step.app_id, name, cx)
            }))
    }
    pub fn profile_app_chips(&self, profile: &Profile, cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .gap(px(6.0))
            .children(profile.steps.iter().map(|step| {
                self.store
                    .document
                    .apps
                    .iter()
                    .find(|app| app.id == step.app_id)
                    .map_or_else(
                        || orbit::pill(&step.app_id, Tone::Warning, cx),
                        |app| super::showcase::app_icon(app, 28.0, cx),
                    )
            }))
    }
}

fn app_method(app: &App) -> String {
    let method = CATALOG
        .iter()
        .find(|entry| entry.id == app.id)
        .map_or("Ejecutable", |entry| {
            if entry.steam_id.is_some() {
                "Steam"
            } else {
                "Ejecutable"
            }
        });
    format!("{} · {method}", category(app))
}

fn icon_button(
    id: &'static str,
    label: String,
    mark: impl gpui::IntoElement,
    cx: &gpui::App,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_index(0)
        .size(px(28.0))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(7.0))
        .text_size(px(15.0))
        .font_family(crate::orbit::sans_override("Inter W400", cx))
        .text_color(rgb(crate::orbit::ink_3(cx)))
        .cursor_pointer()
        .hover(|style| {
            style
                .bg(rgba(crate::orbit::line_row(cx)))
                .text_color(rgb(crate::orbit::ink(cx)))
        })
        .child(mark)
}

fn trash_mark() -> SvgMark {
    svg_mark(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#8a858b" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.8 4.3h10.4M6.4 4.3V2.9h3.2v1.4M4.3 4.3l.6 8.2h6.2l.6-8.2M6.7 6.7v3.6M9.3 6.7v3.6"/></svg>"##,
        15.0,
    )
}

pub(super) fn error_panel(message: String, cx: &Context<Launcher>) -> gpui::Div {
    let conflict = message.starts_with("conflicto:");
    let mut panel = div()
        .flex()
        .flex_col()
        .gap(px(8.0))
        .child(orbit::callout(message, cx));
    if conflict {
        panel = panel.child(
            button("launcher-reload", "Recargar datos locales", cx)
                .on_click(cx.listener(|this, _, window, cx| this.reload(window, cx))),
        );
    }
    panel
}

pub(super) fn matches_query(query: &str, values: &[&str]) -> bool {
    let query = query.trim().to_lowercase();
    values
        .iter()
        .any(|value| value.to_lowercase().contains(&query))
}

pub(super) fn category(app: &App) -> &'static str {
    CATALOG
        .iter()
        .find(|entry| entry.id == app.id)
        .map_or("Manual", |entry| entry.category)
}

fn availability(app: Option<&discovery::Detected>, scanning: bool) -> (&'static str, Tone) {
    if scanning {
        return ("ESCANEANDO", Tone::Warning);
    }
    match app.map(|app| &app.availability) {
        Some(value) if value.installed => ("INSTALADA", Tone::Success),
        Some(value) if value.found => ("DETECTADA", Tone::Neutral),
        _ => ("CATÁLOGO", Tone::Neutral),
    }
}

pub(super) fn launchable(profile: &Profile, discovered: &Discovery, busy: bool) -> bool {
    !busy
        && !profile.steps.is_empty()
        && profile.steps.iter().all(|step| {
            discovered
                .app(&step.app_id)
                .is_some_and(|app| app.availability.launchable)
        })
}

impl Launcher {
    pub(super) fn profile_matches(&self, profile: &Profile, query: &str) -> bool {
        matches_query(query, &[&profile.name])
            || profile.steps.iter().any(|step| {
                self.store
                    .document
                    .apps
                    .iter()
                    .find(|app| app.id == step.app_id)
                    .is_some_and(|app| matches_query(query, &[&app.name]))
            })
    }

    fn sorted_profiles(&self) -> Vec<&Profile> {
        let mut profiles: Vec<_> = self.store.document.profiles.iter().collect();
        profiles.sort_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then_with(|| a.name.cmp(&b.name))
        });
        profiles
    }

    fn chain_names(&self, profile: &Profile) -> String {
        profile
            .steps
            .iter()
            .filter_map(|step| {
                self.store
                    .document
                    .apps
                    .iter()
                    .find(|app| app.id == step.app_id)
                    .map(|app| app.name.as_str())
            })
            .collect::<Vec<_>>()
            .join(" → ")
    }

    fn context_profiles(&self, query: &str, cx: &mut Context<Self>) -> gpui::Div {
        let mut profiles = div().child(context_heading(
            "Perfiles",
            self.store.document.profiles.len().to_string(),
            cx,
        ));
        let visible: Vec<_> = self
            .sorted_profiles()
            .into_iter()
            .filter(|profile| self.profile_matches(profile, query))
            .collect();
        let mut rows = div().mt(px(7.0));
        for (index, profile) in visible.iter().enumerate() {
            let row_launch = (*profile).clone();
            let launch = (*profile).clone();
            let can_launch = launchable(
                profile,
                &self.discovered,
                self.scanning || self.chain.is_some(),
            );
            rows = rows.child(
                div()
                    .id(("context-profile-group", index))
                    .h(px(52.0))
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .px(px(8.0))
                    .child(profile_mark(&profile.name, profile.favorite, 32.0, cx))
                    .child(
                        div()
                            .id(("context-profile", index))
                            .role(gpui::Role::Button)
                            .aria_label(profile.name.clone())
                            .tab_index(0)
                            .tab_stop(can_launch)
                            .focus_visible(|style| {
                                style.border_2().border_color(rgb(orbit::coral(cx)))
                            })
                            .flex_1()
                            .min_w_0()
                            .child(
                                text(profile.name.clone(), 14.0, 650, orbit::ink_2(cx), cx)
                                    .line_height(px(20.25))
                                    .overflow_hidden()
                                    .whitespace_nowrap()
                                    .text_ellipsis(),
                            )
                            .child(
                                text(self.chain_names(profile), 10.5, 400, orbit::ink_3(cx), cx)
                                    .line_height(px(15.75))
                                    .overflow_hidden()
                                    .whitespace_nowrap()
                                    .text_ellipsis(),
                            )
                            .when(can_launch, |row| {
                                row.cursor_pointer()
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.start(row_launch.clone(), cx);
                                    }))
                            }),
                    )
                    .child(
                        icon_button(
                            "context-launch",
                            format!("Lanzar {}", profile.name),
                            "▶",
                            cx,
                        )
                        .size(px(24.0))
                        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff06, cx)))
                        .text_size(px(10.0))
                        .when(can_launch, |button| {
                            button.on_click(cx.listener(move |this, _, _, cx| {
                                this.start(launch.clone(), cx);
                            }))
                        })
                        .when(!can_launch, |button| button.tab_stop(false)),
                    ),
            );
        }
        if visible.is_empty() {
            rows = rows.child(text("Sin perfiles", orbit::BODY, 400, orbit::ink_3(cx), cx));
        }
        profiles = profiles.child(rows);
        profiles
    }

    pub fn quick_profiles(&self, query: &str, cx: &mut Context<Self>) -> gpui::Div {
        self.context_profiles(query, cx)
    }

    /// La shell monta esta búsqueda en su ranura de acciones de Launcher.
    pub fn topbar_actions(&self, available_width: f32, cx: &Context<Self>) -> gpui::Div {
        // La ranura queda junto a las migas; este espacio centra el campo
        // en la barra disponible sin alterar los controles comunes del marco.
        div()
            .w(px((available_width / 2.0 - orbit::TOPBAR_GUTTER).max(260.0)))
            .min_w_0()
            .flex()
            .justify_end()
            .child(self.application_search(cx))
    }

    fn application_search(&self, cx: &Context<Self>) -> gpui::Div {
        div()
            .relative()
            .w(px(260.0))
            .child(self.query.clone())
            .when(self.query.read(cx).value.is_empty(), |search| {
                search.child(
                    text("Buscar aplicaciones", 13.5, 400, orbit::ink_4(cx), cx)
                        .absolute()
                        .left(px(14.0))
                        .top(px(10.0)),
                )
            })
    }

    fn context_favorites(&self, query: &str, cx: &mut Context<Self>) -> gpui::Div {
        let mut favorites = div().child(context_heading(
            "Favoritas",
            self.store
                .document
                .apps
                .iter()
                .filter(|app| app.favorite)
                .count()
                .to_string(),
            cx,
        ));
        let mut count = 0;
        for (index, app) in self
            .store
            .document
            .apps
            .iter()
            .filter(|app| app.favorite && matches_query(query, &[&app.name, category(app)]))
            .enumerate()
        {
            count += 1;
            let edit = app.clone();
            favorites = favorites.child(
                orbit::list_row(
                    ("context-favorite", index),
                    &app.name,
                    category(app),
                    false,
                    true,
                    cx,
                )
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.app_editor(Some(edit.clone()), window, cx);
                })),
            );
        }
        if count == 0 {
            favorites = favorites.child(
                text(
                    "Sin favoritas: marca la estrella de una aplicación.",
                    11.5,
                    400,
                    orbit::ink_3(cx),
                    cx,
                )
                .line_height(px(17.25))
                .mt(px(16.0)),
            );
        }
        favorites
    }

    #[allow(clippy::too_many_lines)] // Composición visual; crece al migrar a accesores de tema (#1430).
    pub fn context_column(&self, window: &Window, cx: &mut Context<Self>) -> gpui::Div {
        let query = self.query.read(cx).value.clone();
        let favorites = self.context_favorites(&query, cx);
        let detected = self
            .discovered
            .apps
            .iter()
            .filter(|app| app.availability.found)
            .count();
        orbit::column(
            "Launcher",
            crate::version_label(),
            cx,
        )
        .w(px(orbit::column_width(f32::from(
            window.viewport_size().width,
        ))))
        .child(
            div()
                .id("launcher-context")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .flex()
                .flex_col()
                .gap(px(21.0))
                .pt(px(12.0))
                .child(context_block(cx).child(self.context_profiles(&query, cx)))
                .child(context_block(cx).child(favorites))
                .child(
                    context_block(cx)
                        .child(context_heading(
                            "Catálogo",
                            format!("{} · {detected} detectadas", self.store.document.apps.len()),
                            cx,
                        ))
                        .child(
                            text(
                                "La detección busca en el registro, Steam y los accesos directos.",
                                11.5,
                                400,
                                orbit::ink_3(cx),
                                cx,
                            )
                            .line_height(px(17.25))
                            .mt(px(16.0)),
                        ),
                ),
        )
    }

    fn catalog(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let query = &self.query.read(cx).value;
        let mut apps: Vec<_> = self
            .store
            .document
            .apps
            .iter()
            .filter(|app| matches_query(query, &[&app.name, category(app)]))
            .collect();
        apps.sort_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then_with(|| a.name.cmp(&b.name))
        });
        let detected = self
            .discovered
            .apps
            .iter()
            .filter(|app| app.availability.found)
            .count();
        // La fecha del escaneo ya está en la píldora de la cabecera.
        let meta = if !self.demo_descriptions.is_empty() || self.last_scan.is_some() {
            format!("{detected} detectadas")
        } else {
            format!("{} en catálogo", self.store.document.apps.len())
        };
        let mut rows = div().flex().flex_col().gap(px(8.0));
        for (index, app) in apps.iter().enumerate() {
            rows = rows.child(self.app_row(index, app, cx));
        }
        if apps.is_empty() {
            rows = rows.child(text(
                "Sin aplicaciones",
                orbit::BODY,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        }
        orbit::panel(cx)
            .id("launcher-app-catalog")
            .flex_1()
            .min_h_0()
            .child(Self::catalog_heading(meta, cx))
            .child(
                div()
                    .id("launcher-app-list")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .p(px(21.0))
                    .child(rows)
                    .child(Self::catalog_add_app_action(cx)),
            )
    }

    fn catalog_heading(meta: String, cx: &gpui::App) -> gpui::Div {
        orbit::card_header("Aplicaciones", cx).child(
            text(meta, 12.0, 500, orbit::ink_3(cx), cx)
                .font_family(crate::orbit::mono_family(cx))
                .flex_none(),
        )
    }

    fn catalog_add_app_action(cx: &Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("launcher-add-app")
            .min_h(px(72.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(12.0))
            .mt(px(12.0))
            .p(px(12.0))
            .rounded(px(12.0))
            .border_1()
            .border_dashed()
            .border_color(rgba(orbit::line_strong(cx)))
            .child(
                div()
                    .size(px(32.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(16.0))
                    .border_1()
                    .border_color(rgba(orbit::line_strong(cx)))
                    .text_size(px(17.0))
                    .text_color(rgb(orbit::ink_3(cx)))
                    .child("+"),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(text("Añadir aplicación", 13.0, 650, orbit::ink_2(cx), cx))
                    .child(
                        text(
                            "Elige un ejecutable que la detección no encontró.",
                            11.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        )
                        .whitespace_nowrap()
                        .overflow_hidden()
                        .text_ellipsis(),
                    ),
            )
            .on_click(cx.listener(|this, _, window, cx| this.app_editor(None, window, cx)))
    }

    fn app_row(
        &self,
        index: usize,
        app: &App,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let id = app.id.clone();
        let detected = self.discovered.app(&id);
        let (label, tone) = availability(detected, self.scanning);
        let editable = app.clone();
        let removable_app = app.clone();
        let removable = !CATALOG.iter().any(|entry| entry.id == app.id);
        let favorite_id = id.clone();
        div()
            .id(("launcher-app", index))
            .h(px(64.0))
            .min_w_0()
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgb(orbit::surface_1(cx)))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(10.0))
            .px(px(8.0))
            .rounded(px(11.0))
            .hover(|style| style.bg(rgba(crate::orbit::legacy_rgba(0xffff_ff08, cx))))
            .child(showcase::app_icon(app, 40.0, cx))
            .child(
                div()
                    .id(("launcher-app-edit", index))
                    .flex_1()
                    .min_w_0()
                    .child(
                        text(app.name.clone(), 13.0, 650, orbit::ink_2(cx), cx)
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis(),
                    )
                    .child(
                        text(app_method(app), 11.0, 400, orbit::ink_3(cx), cx)
                            .mt(px(2.0))
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis(),
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.app_editor(Some(editable.clone()), window, cx);
                    })),
            )
            .child(chip(label, tone, cx))
            .child(
                icon_button(
                    "launcher-app-favorite",
                    format!("Favorita: {}", app.name),
                    star_mark(app.favorite),
                    cx,
                )
                .when(app.favorite, |button| {
                    button.text_color(rgb(orbit::coral(cx)))
                })
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.edit(
                        |doc| {
                            let app = doc
                                .apps
                                .iter_mut()
                                .find(|app| app.id == favorite_id)
                                .ok_or("app inexistente")?;
                            app.favorite = !app.favorite;
                            Ok(())
                        },
                        cx,
                    );
                })),
            )
            // Las apps del catálogo no se eliminan: sin papelera muerta en cada fila.
            .when(removable, |row| {
                row.child(
                    icon_button(
                        "launcher-app-remove",
                        format!("Eliminar {}", app.name),
                        trash_mark(),
                        cx,
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.request_app_removal(&removable_app, window, cx);
                    })),
                )
            })
    }

    pub(super) fn app_removal_confirmation(&self, cx: &Context<Self>) -> gpui::Div {
        let name = self
            .pending_app_removal
            .as_ref()
            .and_then(|id| self.store.document.apps.iter().find(|app| &app.id == id))
            .map_or_else(|| "la aplicación".to_owned(), |app| app.name.clone());
        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .when_some(self.error.clone(), |body, error| {
                body.child(error_panel(error, cx))
            })
            .child(text(
                format!("Se eliminará {name} del catálogo del Launcher."),
                orbit::BODY,
                400,
                orbit::ink_2(cx),
             cx))
            .child(text(
                "No se borra nada de tu disco. Si algún perfil la usa como paso, quítala del perfil primero.",
                orbit::SECONDARY,
                400,
                orbit::ink_3(cx),
             cx))
    }

    pub(super) fn profile_actions(&self, profile: &Profile, cx: &mut Context<Self>) -> gpui::Div {
        let duplicate = profile.clone();
        let remove = profile.id.clone();
        let trigger = profile.id.clone();
        let triggered = self.store.document.lmu_trigger_profile.as_deref() == Some(&profile.id);
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .child(
                button("duplicate-profile", "Duplicar", cx).on_click(cx.listener(
                    move |this, _, window, cx| {
                        this.new_profile(Some(duplicate.clone()), window, cx);
                    },
                )),
            )
            .child(
                button("delete-profile", "Eliminar", cx).on_click(cx.listener(
                    move |this, _, window, cx| {
                        this.request_profile_removal(remove.clone(), window, cx);
                    },
                )),
            )
            .child(
                button(
                    "trigger-profile",
                    if triggered {
                        "LMU · activado"
                    } else {
                        "Al abrir LMU"
                    },
                    cx,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    if this.edit(
                        |doc| {
                            doc.lmu_trigger_profile =
                                if doc.lmu_trigger_profile.as_deref() == Some(&trigger) {
                                    None
                                } else {
                                    Some(trigger.clone())
                                };
                            Ok(())
                        },
                        cx,
                    ) {
                        this.trigger = LmuTrigger::default();
                    }
                })),
            )
    }

    pub(super) fn progress_panel(&self, cx: &Context<Self>) -> gpui::Div {
        let mut progress = orbit::card_body();
        for (index, event) in self.progress.iter().enumerate() {
            progress = progress.child(orbit::list_row(
                ("chain-progress", index),
                &event.message,
                &format!(
                    "{:?}{} · {}",
                    event.status,
                    event
                        .pid
                        .map_or(String::new(), |pid| format!(" · PID {pid}")),
                    event.step.map_or_else(
                        || format!("Resultado · éxito: {}", event.success),
                        |step| format!("Paso {}", step + 1)
                    ),
                ),
                false,
                false,
                cx,
            ));
        }
        let controls = if self.chain.is_some() {
            div().child(
                button("cancel-chain", "Cancelar cadena", cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        if let Some(chain) = &this.chain {
                            chain.cancel();
                        }
                        cx.notify();
                    },
                )),
            )
        } else {
            let failed = self.last_profile.as_ref().is_some_and(|profile| {
                !super::super::chain::retry_steps(
                    profile,
                    &self.progress,
                    super::super::chain::RetryScope::Failed,
                )
                .is_empty()
            });
            div()
                .flex()
                .gap_2()
                .when(failed, |row| {
                    row.child(
                        button("retry-failed", "Reintentar pasos fallidos", cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.retry(super::super::chain::RetryScope::Failed, cx);
                            }),
                        ),
                    )
                })
                .child(
                    button("retry-all", "Reintentar cadena entera", cx).on_click(cx.listener(
                        |this, _, _, cx| this.retry(super::super::chain::RetryScope::All, cx),
                    )),
                )
        };
        orbit::card("Progreso de la cadena", cx).child(progress.child(controls))
    }
}

impl Render for Launcher {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if let Some(layer) = &self.form_layer {
            let targets = self.form_targets(cx);
            layer.update(cx, |layer, _| layer.set_targets(targets));
        }
        if self.page == LauncherPage::Showcase {
            return self.showcase(window, cx).into_any_element();
        }
        if self.page == LauncherPage::Editor {
            return self.editor_page(cx).into_any_element();
        }
        if self.page == LauncherPage::History {
            let adapt = self.adapt;
            let (top, side, bottom) = adapt.padding();
            return div().size_full().min_h_0().flex().flex_col().pt(px(top)).px(px(side)).pb(px(bottom)).gap(px(adapt.gap()))
                .child(orbit::neo_page_header("Historial", "Último lanzamiento registrado de cada perfil; sin historial de intentos persistido.", self.adapt, cx))
                .when_some(last_run(&self.store.document.profiles), |page, last| page.child(orbit::meta(&format!("Último lanzamiento · {last}"), 12.0, orbit::ink_3(cx), cx)))
                .child(self.showcase_history(false, cx)).into_any_element();
        }
        let adapt = self.adapt;
        let (top, side, bottom) = adapt.padding();
        div()
            .id("launcher-applications")
            .size_full()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .pt(px(top))
            .px(px(side))
            .pb(px(bottom))
            .gap(px(adapt.gap()))
            .child(orbit::neo_page_header(
                "Aplicaciones",
                "Gestiona las rutas y aplicaciones de tus perfiles.",
                self.adapt,
                cx,
            ))
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(self.application_search(cx).flex_1())
                    .child(
                        button(
                            "launcher-scan",
                            if self.scanning {
                                "Detectando…"
                            } else {
                                "Detectar aplicaciones"
                            },
                            cx,
                        )
                        .when(self.scanning, |button| {
                            orbit::disabled(button, "Detección en curso")
                        })
                        .on_click(cx.listener(|this, _, _, cx| this.scan(cx))),
                    )
                    .child(
                        button("launcher-local-reload", "Recargar", cx)
                            .on_click(cx.listener(|this, _, window, cx| this.reload(window, cx))),
                    ),
            )
            .when_some(self.error.clone(), |page, error| {
                page.child(error_panel(error, cx))
            })
            .child(self.catalog(cx))
            .into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_ignores_missing_and_invalid_dates_and_uses_latest_instant() {
        let mut recent = Profile::new("recent".into(), "Recent".into());
        recent.last_launched_at = Some("2026-07-07T17:42:00Z".into());
        let expected = last_run(&[recent.clone()]);
        assert!(
            expected
                .as_ref()
                .is_some_and(|value| value.contains(" jul, "))
        );
        let mut earlier = Profile::new("earlier".into(), "Earlier".into());
        earlier.last_launched_at = Some("2026-07-07T19:40:00+02:00".into());
        let mut invalid = Profile::new("invalid".into(), "Invalid".into());
        invalid.last_launched_at = Some("no es una fecha".into());
        assert_eq!(last_run(&[earlier, recent, invalid.clone()]), expected);
        assert_eq!(last_run(&[invalid]), None);
        assert_eq!(last_run(&[]), None);
    }

    #[test]
    fn shortcut_keeps_key_order_and_normalizes_display_names() {
        assert_eq!(hotkey_keys(" CTRL + Alt + l "), ["Ctrl", "Alt", "L"]);
        assert_eq!(hotkey_keys("shift+win+f1"), ["Shift", "Win", "F1"]);
        assert!(hotkey_keys("").is_empty());
    }
    #[test]
    fn search_ignores_case_and_whitespace_and_matches_categories() {
        assert!(matches_query("  oBs  ", &["OBS Studio", "Streaming"]));
        assert!(matches_query("stream", &["OBS Studio", "Streaming"]));
        assert!(matches_query("", &["Discord"]));
        assert!(!matches_query("LMU", &["Discord", "Utilidad"]));
    }
    #[test]
    fn profile_requires_every_app_launchable_and_an_idle_launcher() {
        let mut profile = Profile::new("p".into(), "Perfil".into());
        let mut discovery = Discovery::default();
        assert!(!launchable(&profile, &discovery, false));
        profile.steps.push(Step {
            app_id: "lmu".into(),
            delay_seconds: 0,
            args_override: None,
        });
        assert!(!launchable(&profile, &discovery, false));
        discovery.apps.push(discovery::Detected {
            id: "lmu".into(),
            executable: None,
            source: "Steam",
            availability: discovery::Availability {
                installed: true,
                ..Default::default()
            },
        });
        assert!(!launchable(&profile, &discovery, false));
        discovery.apps[0].availability.launchable = true;
        assert!(launchable(&profile, &discovery, false));
        assert!(!launchable(&profile, &discovery, true));
        profile.steps.push(Step {
            app_id: "obs".into(),
            delay_seconds: 2,
            args_override: None,
        });
        assert!(!launchable(&profile, &discovery, false));
    }
    #[test]
    fn installation_and_detection_are_not_launchability() {
        let mut app = discovery::Detected {
            id: "lmu".into(),
            executable: None,
            source: "Steam",
            availability: discovery::Availability::default(),
        };
        assert_eq!(availability(Some(&app), false).0, "CATÁLOGO");
        app.availability.found = true;
        assert_eq!(availability(Some(&app), false).0, "DETECTADA");
        app.availability.installed = true;
        assert_eq!(availability(Some(&app), false).0, "INSTALADA");
        assert!(!app.availability.launchable);
        assert_eq!(availability(Some(&app), true).0, "ESCANEANDO");
    }
}
