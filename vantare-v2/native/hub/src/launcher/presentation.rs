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

pub(super) fn eyebrow(content: impl Into<gpui::SharedString>, cx: &gpui::App) -> gpui::Div {
    let content: gpui::SharedString = content.into();
    tracked_text(content.to_uppercase(), 11.0, 800, orbit::ink_3(cx), 0.99)
}

fn chip(label: &str, tone: Tone, cx: &gpui::App) -> gpui::Div {
    if orbit::is_mono(cx) {
        return orbit::chip(label, tone, cx);
    }
    div()
        .h(px(26.0))
        .px(px(10.0))
        .rounded(px(8.0))
        .flex_none()
        .flex()
        .items_center()
        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff09, cx)))
        .child(tracked_text(
            label.to_uppercase(),
            10.0,
            700,
            tone.color(cx),
            0.6,
        ))
}

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

fn pencil_mark() -> SvgMark {
    // Geometría productiva de LauncherOrbitPage.tsx.
    svg_mark(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#8a858b" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L6 12H4v-2z"/></svg>"##,
        15.0,
    )
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

fn hotkey_keys(hotkey: &str) -> Vec<String> {
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

fn launch_button(featured: bool, cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    div()
        .id("launch-profile")
        .role(gpui::Role::Button)
        .aria_label("Lanzar perfil")
        .tab_index(0)
        .h(px(39.0))
        .px(px(12.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(12.0))
        .border_1()
        .border_color(if featured {
            rgb(crate::orbit::legacy_rgb(0x00f3_eeee, cx))
        } else {
            rgba(orbit::line(cx))
        })
        .bg(if featured {
            rgb(crate::orbit::legacy_rgb(0x00f3_eeee, cx))
        } else {
            rgba(crate::orbit::legacy_rgba(0xffff_ff04, cx))
        })
        .cursor_pointer()
        .focus_visible(|style| style.border_2().border_color(rgb(orbit::coral(cx))))
        .child(text(
            "▶ Lanzar",
            13.0,
            650,
            if featured {
                cx.global::<crate::orbit::theme::Theme>().primary_ink
            } else {
                orbit::ink_3(cx)
            },
            cx,
        ))
}

fn policy_chip(label: &str, cx: &gpui::App) -> gpui::Div {
    div()
        .flex_none()
        .h(px(26.0))
        .px(px(8.0))
        .flex()
        .items_center()
        .rounded(px(8.0))
        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff09, cx)))
        .child(tracked_text(label, 10.0, 700, orbit::ink_3(cx), 0.6))
}

fn app_palette(id: &str) -> (u32, u32) {
    match id {
        "lmu" => (0x00f0_4755, 0x0077_162c),
        "obs" => (0x004a_4f5c, 0x001f_2229),
        "crewchief" => (0x00f0_a63a, 0x008a_4a12),
        "discord" => (0x0072_89da, 0x003a_4a99),
        "spotify" => (0x001d_b954, 0x000e_5a2b),
        "motec" => (0x005c_cbd5, 0x001f_5f6a),
        "simhub" => (0x00c9_a2ff, 0x005b_3aa0),
        _ => (0x004a_4750, 0x0026_242b),
    }
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

fn app_mark(app: &App, size: f32, cx: &gpui::App) -> gpui::Div {
    if app.id == "motec" {
        // Misma marca SVG que frontend/src/hub/launcher/brand-assets.ts.
        return div()
            .size(px(size))
            .flex_none()
            .rounded(px(if size >= 39.0 { 11.0 } else { 8.0 }))
            .bg(rgb(orbit::surface_2(cx)))
            .overflow_hidden()
            .flex()
            .items_center()
            .justify_center()
            .child(svg_mark(include_str!("motec.svg"), size * 0.74));
    }
    let abbreviation = match app.id.as_str() {
        "crewchief" => "CC".to_owned(),
        "discord" => "DC".to_owned(),
        "lmu" => "LMU".to_owned(),
        "motec" => "MT".to_owned(),
        "obs" => "OBS".to_owned(),
        "simhub" => "SH".to_owned(),
        "spotify" => "SP".to_owned(),
        _ => app.name.chars().take(2).collect::<String>().to_uppercase(),
    };
    let (first, second) = app_palette(&app.id);
    monogram(&abbreviation, size, first, second, cx).when(size <= 26.0, |mark| {
        // En Wails, .orbit-chain-step span también estiliza el span del monograma.
        mark.items_start()
            .justify_start()
            .font_family(crate::orbit::mono_family(cx))
            .font_weight(gpui::FontWeight::NORMAL)
            .text_size(px(10.5))
            .line_height(px(12.6))
            .text_color(rgb(orbit::ink_3(cx)))
            .mt(px(2.0))
    })
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

fn stat_tile(
    label: &str,
    value: impl IntoElement,
    unit: Option<&str>,
    sub: Option<&str>,
    available: bool,
    cx: &gpui::App,
) -> gpui::Div {
    let mut value_line = div()
        .mt(px(9.0))
        .flex_none()
        .flex()
        .items_baseline()
        .gap(px(6.0))
        .font_family(crate::orbit::mono_family(cx))
        .text_size(px(22.0))
        .line_height(px(26.4))
        .font_weight(gpui::FontWeight(700.0))
        .text_color(rgb(if available {
            crate::orbit::ink(cx)
        } else {
            crate::orbit::ink_4(cx)
        }))
        .child(value);
    if let Some(unit) = unit {
        value_line = value_line.child(text(unit, 12.0, 400, crate::orbit::ink_3(cx), cx));
    }
    orbit::card("", cx)
        .flex_1()
        .min_w(px(0.0))
        .p(px(14.0))
        .px(px(18.0))
        .rounded(px(18.0))
        .child(tracked_text(label.to_uppercase(), 11.0, 700, orbit::ink_3(cx), 0.44).flex_none())
        .child(value_line)
        .when_some(sub, |tile, sub| {
            tile.child(
                text(sub, 11.5, 400, crate::orbit::ink_4(cx), cx)
                    .mt(px(6.0))
                    .line_height(px(17.25))
                    .flex_none()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .text_ellipsis(),
            )
        })
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

fn matches_query(query: &str, values: &[&str]) -> bool {
    let query = query.trim().to_lowercase();
    values
        .iter()
        .any(|value| value.to_lowercase().contains(&query))
}

fn category(app: &App) -> &'static str {
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
    fn profile_matches(&self, profile: &Profile, query: &str) -> bool {
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
                    16.0,
                    400,
                    orbit::ink(cx),
                    cx,
                )
                .line_height(px(24.0))
                .mt(px(10.0)),
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
        let demo = !self.demo_descriptions.is_empty();
        orbit::column(
            "Launcher",
            if demo {
                "v0.3.9"
            } else {
                option_env!("VANTARE_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
            },
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
        .child(
            context_block(cx)
                .child(context_heading_action(
                    "Próximas carreras",
                    text("Ver todas", 11.5, 400, orbit::ink_3(cx), cx),
                    cx,
                ))
                .child(
                    text(
                        if demo {
                            "Sin salidas próximas"
                        } else {
                            "Contexto de carreras no disponible"
                        },
                        16.0,
                        400,
                        orbit::ink(cx),
                        cx,
                    )
                    .line_height(px(24.0))
                    .mt(px(12.0)),
                ),
        )
        .child(
            context_block(cx)
                .pt(px(16.0))
                .mt(px(10.0))
                .child(context_heading_action(
                    "Perfil de overlay",
                    chip(if demo { "DETENIDO" } else { "—" }, Tone::Neutral, cx),
                    cx,
                ))
                .child(
                    text(
                        if demo {
                            "Sin perfiles todavía"
                        } else {
                            "Contexto de overlay no disponible"
                        },
                        16.0,
                        400,
                        orbit::ink(cx),
                        cx,
                    )
                    .line_height(px(24.0))
                    .mt(px(12.0)),
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
        let meta = if !self.demo_descriptions.is_empty() {
            format!("07 jul, 19:40 · {detected} detectadas")
        } else if let Some(when) = self.last_scan {
            format!("{} · {detected} detectadas", when.format("%d/%m, %H:%M"))
        } else {
            format!("{} en catálogo", self.store.document.apps.len())
        };
        let mut rows = div().flex().flex_col().gap(px(2.0)).px(px(2.0));
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
        div()
            .id("launcher-app-catalog")
            .flex()
            .flex_col()
            .flex_1()
            .min_h_0()
            .overflow_hidden()
            .rounded(px(18.0))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(rgba(crate::orbit::legacy_rgba(0x1011_14c9, cx)))
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
        div()
            .h(px(60.0))
            .flex_none()
            .flex()
            .items_center()
            .px(px(20.0))
            .border_b_1()
            .border_color(rgba(crate::orbit::legacy_rgba(0xffff_ff0d, cx)))
            .child(
                div()
                    .w_full()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(10.0))
                    .child(
                        text("Aplicaciones", 15.0, 700, orbit::ink(cx), cx)
                            .flex_1()
                            .min_w_0()
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis(),
                    )
                    .child(
                        text(meta, 12.0, 500, orbit::ink_3(cx), cx)
                            .font_family(crate::orbit::mono_family(cx))
                            .flex_none(),
                    ),
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
        let (label, tone) = if !self.demo_descriptions.is_empty() && app.id == "obs" {
            ("DETECTADA", Tone::Neutral)
        } else {
            availability(detected, self.scanning)
        };
        let editable = app.clone();
        let removable_app = app.clone();
        let removable = !CATALOG.iter().any(|entry| entry.id == app.id);
        let favorite_id = id.clone();
        div()
            .id(("launcher-app", index))
            .h(px(51.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(10.0))
            .px(px(8.0))
            .rounded(px(11.0))
            .hover(|style| style.bg(rgba(crate::orbit::legacy_rgba(0xffff_ff08, cx))))
            .child(app_mark(app, 39.0, cx))
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
            .child(
                icon_button(
                    "launcher-app-remove",
                    format!("Eliminar {}", app.name),
                    trash_mark(),
                    cx,
                )
                .when(removable, |button| {
                    button.on_click(cx.listener(move |this, _, window, cx| {
                        this.request_app_removal(&removable_app, window, cx);
                    }))
                })
                .when(!removable, |button| {
                    button.tab_stop(false).opacity(orbit::DISABLED)
                }),
            )
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

    fn profiles(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut rows = div().flex().flex_col().gap(px(21.0));
        let query = &self.query.read(cx).value;
        let profiles: Vec<_> = self
            .sorted_profiles()
            .into_iter()
            .filter(|profile| self.profile_matches(profile, query))
            .collect();
        for (index, profile) in profiles.iter().enumerate() {
            rows = rows.child(self.profile_card(index, profile, cx));
        }
        if profiles.is_empty() {
            rows = rows.child(text("Sin perfiles", orbit::BODY, 400, orbit::ink_3(cx), cx));
        }
        rows.child(
            div()
                .id("launcher-add-profile")
                .min_h(px(90.0))
                .flex_none()
                .flex()
                .items_center()
                .gap(px(16.0))
                .p(px(20.0))
                .rounded(px(18.0))
                .border_1()
                .border_dashed()
                .border_color(rgba(orbit::line_strong(cx)))
                .cursor_pointer()
                .hover(|style| style.border_color(rgba(crate::orbit::legacy_rgba(0xf047_556b, cx))))
                .child(
                    div()
                        .size(px(46.0))
                        .flex_none()
                        .flex()
                        .items_center()
                        .justify_center()
                        .rounded(px(13.0))
                        .border_1()
                        .border_dashed()
                        .border_color(rgba(orbit::ink_3(cx)))
                        .text_size(px(20.0))
                        .text_color(rgb(orbit::ink_3(cx)))
                        .child("+"),
                )
                .child(
                    div()
                        .child(text("Crear perfil", 15.0, 650, orbit::ink(cx), cx))
                        .child(text(
                            "Organiza aplicaciones y ejecuta sus pasos en orden.",
                            12.5,
                            400,
                            orbit::ink_2(cx),
                            cx,
                        )),
                )
                .on_click(cx.listener(|this, _, window, cx| this.new_profile(None, window, cx))),
        )
    }

    fn profile_card(
        &self,
        index: usize,
        profile: &Profile,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let chain = self.profile_chain(profile, cx);
        let featured = index == 0;
        // Las capturas Wails de referencia conservan la superficie de perfil
        // en #0f0f12. El shell puede aportar la elevación alrededor, pero esta
        // sección no debe aclarar el relleno al dibujar el degradado Featured.
        let (background_start, background_end) = (0x000f_0f12, 0x000f_0f12);
        div()
            .id(("launcher-profile", index))
            .relative()
            .overflow_hidden()
            .py(px(20.0))
            .px(px(22.0))
            .rounded(px(18.0))
            .border_1()
            .border_color(rgba(orbit::line(cx)))
            .bg(linear_gradient(
                170.0,
                linear_color_stop(rgb(background_start), 0.0),
                linear_color_stop(rgb(background_end), 1.0),
            ))
            .child(
                div()
                    .absolute()
                    .top(px(8.0))
                    .bottom(px(8.0))
                    .left_0()
                    .w(px(3.0))
                    .rounded(px(1.5))
                    .when(featured, |bar| {
                        bar.shadow(vec![gpui::BoxShadow {
                            color: rgba(0xf047_5580).into(),
                            offset: gpui::point(px(0.0), px(0.0)),
                            blur_radius: px(18.0),
                            spread_radius: px(0.0),
                            inset: false,
                        }])
                    })
                    .bg(linear_gradient(
                        180.0,
                        linear_color_stop(
                            rgb(if featured {
                                orbit::coral(cx)
                            } else {
                                orbit::ink_4(cx)
                            }),
                            0.0,
                        ),
                        linear_color_stop(
                            rgb(if featured {
                                orbit::carmine(cx)
                            } else {
                                orbit::surface_3(cx)
                            }),
                            1.0,
                        ),
                    )),
            )
            .flex()
            .flex_col()
            .child(self.profile_card_header(profile, featured, cx))
            .when(profile.steps.is_empty(), |body| {
                body.child(
                    text("Sin pasos todavía.", orbit::BODY, 400, orbit::ink_3(cx), cx)
                        .px(px(2.0))
                        .py(px(10.0)),
                )
            })
            .when(!profile.steps.is_empty(), |body| body.child(chain))
            .child(self.policy_chips(profile, cx).mt(px(14.0)))
    }

    fn profile_card_header(
        &self,
        profile: &Profile,
        featured: bool,
        cx: &Context<Self>,
    ) -> gpui::Div {
        let edit = profile.clone();
        let launch = profile.clone();
        let can_launch = launchable(
            profile,
            &self.discovered,
            self.scanning || self.chain.is_some(),
        );
        let description = self
            .demo_descriptions
            .get(&profile.id)
            .cloned()
            .or_else(|| (!profile.description.is_empty()).then(|| profile.description.clone()));
        let actions = div()
            .absolute()
            .top_0()
            .right_0()
            .flex_none()
            .flex()
            .items_center()
            .gap(px(6.0))
            .child(
                icon_button(
                    "launcher-edit-profile",
                    format!("Editar {}", profile.name),
                    pencil_mark(),
                    cx,
                )
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.profile_editor(edit.clone(), window, cx);
                })),
            )
            .child(
                launch_button(featured, cx)
                    .when(can_launch, |button| {
                        button.on_click(cx.listener(move |this, _, _, cx| {
                            this.start(launch.clone(), cx);
                        }))
                    })
                    .when(!can_launch, |button| {
                        button
                            .tab_stop(false)
                            .when(self.demo_descriptions.is_empty(), |button| {
                                button.opacity(orbit::DISABLED)
                            })
                    }),
            );
        div()
            .relative()
            .child(
                div()
                    .flex()
                    .items_start()
                    .gap(px(16.0))
                    .child(profile_mark(&profile.name, featured, 46.0, cx))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .pt(px(6.0))
                            .pr(px(125.0))
                            .child(eyebrow(
                                if featured && profile.favorite {
                                    "Perfil destacado · Favorito"
                                } else if featured {
                                    "Perfil destacado"
                                } else {
                                    "Perfil"
                                },
                                cx,
                            ))
                            .child(
                                tracked_line(
                                    profile.name.clone(),
                                    18.0,
                                    700,
                                    orbit::ink(cx),
                                    -0.36,
                                    27.0,
                                )
                                .line_height(px(27.0))
                                .mt(px(5.0))
                                .relative()
                                .top(px(2.0)),
                            ),
                    ),
            )
            .when_some(description, |header, description| {
                header.child(
                    text(description, 12.5, 400, orbit::ink_2(cx), cx)
                        .line_height(px(18.75))
                        .ml(px(62.0))
                        .mr(px(134.0))
                        .mt(px(5.0))
                        .relative()
                        .top(px(2.0)),
                )
            })
            .child(actions)
    }

    fn profile_chain(&self, profile: &Profile, cx: &gpui::App) -> gpui::Div {
        let mut chain = div().relative().flex().min_w_0().items_stretch();
        chain = chain.child(
            div()
                .absolute()
                .top_0()
                .bottom_0()
                .left(px(24.0))
                .right(px(24.0))
                .flex()
                .items_center()
                .child(div().w_full().h(px(1.0)).bg(rgba(orbit::line(cx)))),
        );
        for (step_index, step) in profile.steps.iter().enumerate() {
            let Some(app) = self
                .store
                .document
                .apps
                .iter()
                .find(|app| app.id == step.app_id)
            else {
                continue;
            };
            let delay = if step_index == 0 {
                profile.first_step_delay
            } else {
                step.delay_seconds
            };
            chain = chain.child(
                div()
                    .id(("profile-step", step_index))
                    .relative()
                    .flex_none()
                    .w(px(150.0
                        + if app.id == "lmu" && profile.steps.len() == 3 {
                            14.0
                        } else {
                            0.0
                        }))
                    .min_w(px(150.0))
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .py(px(9.0))
                    .pl(px(9.0))
                    .pr(px(12.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(crate::orbit::legacy_rgba(0xffff_ff12, cx)))
                    .bg(linear_gradient(
                        170.0,
                        linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0022_2228, cx)), 0.0),
                        linear_color_stop(rgb(crate::orbit::legacy_rgb(0x0018_181d, cx)), 1.0),
                    ))
                    .child(app_mark(app, 26.0, cx))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(
                                text(app.name.clone(), 12.5, 650, orbit::ink(cx), cx)
                                    .overflow_hidden()
                                    .whitespace_nowrap()
                                    .text_ellipsis(),
                            )
                            .child(
                                text(
                                    if delay == 0 {
                                        "sin espera".into()
                                    } else {
                                        format!("+{delay} s")
                                    },
                                    10.5,
                                    400,
                                    orbit::ink_3(cx),
                                    cx,
                                )
                                .font_family(crate::orbit::mono_family(cx))
                                .line_height(px(12.6))
                                .mt(px(2.0)),
                            ),
                    ),
            );
            if step_index + 1 < profile.steps.len() {
                chain = chain.child(
                    div()
                        .w(px(26.0))
                        .flex_none()
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            div()
                                .size(px(6.0))
                                .rounded(px(3.0))
                                .bg(rgb(crate::orbit::legacy_rgb(0x005f_5b62, cx))),
                        ),
                );
            }
        }
        chain.mt(px(19.0))
    }
    fn policy_chips(&self, profile: &Profile, cx: &gpui::App) -> gpui::Div {
        let mut policy = profile.effective_policy();
        // Escena Pro congelada en orbit-launcher-harness.tsx; solo presentación demo.
        if !self.demo_descriptions.is_empty() && profile.id == "pro" {
            policy.already_running = Running::Restart;
            policy.exit = Close::Started;
        }
        div()
            .flex()
            .flex_wrap()
            .gap(px(6.0))
            .child(policy_chip(
                match policy.already_running {
                    Running::Ask => "YA ABIERTA · PREGUNTAR",
                    Running::Reuse => "YA ABIERTA · REUTILIZAR",
                    Running::Restart => "YA ABIERTA · REINICIAR",
                },
                cx,
            ))
            .child(policy_chip(
                match policy.failure {
                    Failure::Ask => "FALLO · PREGUNTAR",
                    Failure::Stop => "FALLO · DETENER",
                    Failure::Continue => "FALLO · CONTINUAR",
                },
                cx,
            ))
            .when(policy.max_retries > 0, |row| {
                row.child(policy_chip(
                    &format!("FALLO · REINTENTAR ×{}", policy.max_retries),
                    cx,
                ))
            })
            .child(policy_chip(
                match policy.exit {
                    Close::Ask => "AL SALIR · PREGUNTAR",
                    Close::Leave => "AL SALIR · DEJAR ABIERTAS",
                    Close::Started => "AL SALIR · CERRAR LANZADAS",
                },
                cx,
            ))
    }
    pub(super) fn profile_actions(&self, profile: &Profile, cx: &mut Context<Self>) -> gpui::Div {
        let duplicate = profile.clone();
        let favorite = profile.id.clone();
        let remove = profile.id.clone();
        let trigger = profile.id.clone();
        let triggered = self.store.document.lmu_trigger_profile.as_deref() == Some(&profile.id);
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .child(
                button(
                    "favorite-profile",
                    if profile.favorite {
                        "★ Favorito"
                    } else {
                        "☆ Favorito"
                    },
                    cx,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.edit(
                        |doc| {
                            let profile = doc
                                .profiles
                                .iter_mut()
                                .find(|p| p.id == favorite)
                                .ok_or("perfil inexistente")?;
                            profile.favorite = !profile.favorite;
                            Ok(())
                        },
                        cx,
                    );
                })),
            )
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

    fn stats(&self, compact: bool, cx: &gpui::App) -> gpui::Div {
        let detected = self
            .discovered
            .apps
            .iter()
            .filter(|app| app.availability.found)
            .count();
        let favorites = self
            .store
            .document
            .profiles
            .iter()
            .filter(|profile| profile.favorite)
            .count();
        // Estos tres valores pertenecen al SNAPSHOT del harness Wails, no al runtime.
        let demo = !self.demo_descriptions.is_empty();
        let last = if demo {
            Some("07 jul, 19:42".into())
        } else {
            last_run(&self.store.document.profiles)
        };
        let keys = hotkey_keys(if demo {
            "ctrl+alt+l"
        } else {
            self.sorted_profiles()
                .first()
                .map_or("", |profile| profile.hotkey.as_str())
        });
        let mut shortcut = div().flex().items_center().gap(px(8.0));
        for (index, key) in keys.iter().enumerate() {
            if index > 0 {
                shortcut = shortcut.child(text("+", 18.0, 700, orbit::ink_4(cx), cx));
            }
            shortcut = shortcut.child(
                div()
                    .h(px(26.0))
                    .min_w(px(27.0))
                    .px(px(6.0))
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(7.0))
                    .border_1()
                    .border_color(rgba(orbit::line_strong(cx)))
                    .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff04, cx)))
                    .child(orbit::mono_text(key.clone(), 11.0, orbit::ink_3(cx), cx)),
            );
        }
        if keys.is_empty() {
            shortcut = shortcut.child("—");
        }
        div()
            .h(px(107.0))
            .flex_none()
            .grid()
            .grid_cols(4)
            .when(compact, |stats| stats.grid_cols(2).h_auto())
            .gap(px(21.0))
            .child(stat_tile(
                "Aplicaciones",
                self.store.document.apps.len().to_string(),
                Some("en catálogo"),
                Some(&format!("{detected} detectadas")),
                true,
                cx,
            ))
            .child(stat_tile(
                "Perfiles",
                self.store.document.profiles.len().to_string(),
                Some("cadenas"),
                Some(&format!(
                    "{favorites} favorito{}",
                    if favorites == 1 { "" } else { "s" }
                )),
                true,
                cx,
            ))
            .child(stat_tile(
                "Última ejecución",
                last.clone().unwrap_or_else(|| "—".into()),
                None,
                last.is_none().then_some("sin ejecuciones registradas"),
                last.is_some(),
                cx,
            ))
            .child(stat_tile(
                "Atajo global",
                shortcut,
                None,
                Some(if keys.is_empty() {
                    "sin atajo asignado"
                } else {
                    "lanza el perfil destacado"
                }),
                !keys.is_empty(),
                cx,
            ))
    }
    fn progress_panel(&self, cx: &Context<Self>) -> gpui::Div {
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

    fn launcher_heading(
        &self,
        detection_label: &str,
        detection_ran: bool,
        compact: bool,
        cx: &gpui::App,
    ) -> gpui::Div {
        div()
            .h(px(109.0))
            .flex_none()
            .flex()
            .items_start()
            .justify_between()
            .gap(px(21.0))
            .when(compact, |element| element.flex_col().h_auto())
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(eyebrow("Aplicaciones y cadenas", cx).h(px(24.0)).items_center())
                    .child(tracked_line("Launcher", 34.0, 700, orbit::ink(cx), -1.19, 51.0).mt(px(6.0)))
                    .child(
                        text(
                            "Detecta aplicaciones compatibles, organiza perfiles y ejecuta sus pasos en orden.",
                            orbit::BODY,
                            400,
                            orbit::ink_2(cx),
                         cx)
                        .mt(px(7.0)),
                    ),
            )
            .child(div().h(px(29.0)).px(px(12.0)).flex().items_center().rounded(px(15.0))
                .border_1().border_color(rgba(if detection_ran { 0x66d9_8740 } else { orbit::line_strong(cx) }))
                .child(tracked_text(
                if self.scanning {
                    "DETECTANDO…"
                } else {
                    detection_label
                },
                10.0, 750, if detection_ran { orbit::green(cx) } else { orbit::ink_3(cx) }, 0.6,
            )))
    }

    fn launcher_columns(&self, compact: bool, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("launcher-profile-list")
            .flex_1()
            .min_h_0()
            .when(!compact, gpui::Styled::overflow_hidden)
            .flex()
            .gap(px(21.0))
            .when(compact, |element| element.flex_col().flex_none())
            .child(
                div()
                    .w(px(338.0))
                    .when(compact, gpui::Styled::w_full)
                    .h_full()
                    .when(compact, |catalog| catalog.h(px(620.0)))
                    .flex_none()
                    .flex()
                    .flex_col()
                    .min_h_0()
                    .child(self.catalog(cx)),
            )
            .child(
                div()
                    .id("launcher-profile-cards")
                    .flex_1()
                    .min_w(px(0.0))
                    .min_h_0()
                    .pr(px(14.0))
                    .when(
                        !compact,
                        gpui::StatefulInteractiveElement::overflow_y_scroll,
                    )
                    .when(compact, |element| element.flex_none().w_full())
                    .child(self.profiles(cx)),
            )
    }
}

impl Render for Launcher {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let compact = f32::from(window.viewport_size().width) <= 1360.0;
        if let Some(layer) = &self.form_layer {
            let targets = self.form_targets(cx);
            layer.update(cx, |layer, _| layer.set_targets(targets));
        }
        let detected = self
            .discovered
            .apps
            .iter()
            .filter(|app| app.availability.found)
            .count();
        let detection_ran = self.last_scan.is_some() || detected > 0;
        let detection_label = if self.demo_descriptions.is_empty() {
            self.last_scan.map_or_else(
                || {
                    if detection_ran {
                        "DETECCIÓN EJECUTADA".into()
                    } else {
                        "DETECCIÓN PENDIENTE".into()
                    }
                },
                |when| format!("DETECCIÓN EJECUTADA {}", when.format("%d/%m, %H:%M")),
            )
        } else {
            "DETECCIÓN EJECUTADA 07 JUL, 19:40".into()
        };
        let mut page = div()
            .id("launcher")
            .size_full()
            .h(px(
                f32::from(window.viewport_size().height) - orbit::TOPBAR_H
            ))
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .min_w_0()
            .pt(px(24.0))
            .px(px(31.0))
            .pb(px(20.0))
            .gap(px(21.0))
            .when(compact, |element| element.h_auto().flex_none())
            .child(self.launcher_heading(&detection_label, detection_ran, compact, cx))
            .child(self.stats(compact, cx))
            .when_some(self.error.clone(), |page, error| {
                page.child(error_panel(error, cx))
            })
            .when(!self.progress.is_empty(), |page| {
                page.child(self.progress_panel(cx))
            })
            .child(self.launcher_columns(compact, cx));
        for warning in &self.discovered.warnings {
            page = page.child(orbit::callout(warning.clone(), cx));
        }
        page
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
