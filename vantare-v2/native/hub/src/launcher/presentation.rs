//! Composición de la sección y su contexto con el kit compartido.
use super::*;
use crate::orbit::{Tone, chip, text};
use gpui::{linear_color_stop, linear_gradient, px, rgb, rgba};

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

fn monogram(label: &str, size: f32, first: u32, second: u32) -> gpui::Div {
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
            linear_color_stop(rgb(first), 0.0),
            linear_color_stop(rgb(second), 1.0),
        ))
        .text_size(px(if size >= 46.0 {
            11.5
        } else if size >= 39.0 {
            10.5
        } else {
            9.0
        }))
        .font_family("Inter W800")
        .font_weight(gpui::FontWeight(800.0))
        .text_color(rgb(crate::orbit::WHITE))
        .child(label.to_owned())
}

fn app_mark(app: &App, size: f32) -> gpui::Div {
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
    monogram(&abbreviation, size, first, second)
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

fn profile_mark(name: &str, featured: bool, size: f32) -> gpui::Div {
    let (first, second) = if featured {
        (crate::orbit::CORAL, crate::orbit::CARMINE)
    } else {
        (crate::orbit::CYAN, 0x002a_5b8f)
    };
    monogram(&profile_initials(name), size, first, second)
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
        .font_family("Inter W400")
        .text_color(rgb(crate::orbit::INK_3))
        .cursor_pointer()
        .hover(|style| {
            style
                .bg(rgba(crate::orbit::LINE_ROW))
                .text_color(rgb(crate::orbit::INK))
        })
        .child(mark)
}

fn trash_mark() -> gpui::Div {
    let stroke = rgb(orbit::INK_3);
    div()
        .relative()
        .size(px(15.0))
        .child(
            div()
                .absolute()
                .top(px(4.0))
                .left(px(3.5))
                .w(px(8.0))
                .h(px(9.0))
                .rounded(px(1.5))
                .border_1()
                .border_color(stroke),
        )
        .child(
            div()
                .absolute()
                .top(px(2.0))
                .left(px(2.0))
                .w(px(11.0))
                .h(px(1.0))
                .bg(stroke),
        )
        .child(
            div()
                .absolute()
                .top(px(1.0))
                .left(px(6.0))
                .w(px(3.0))
                .h(px(1.0))
                .bg(stroke),
        )
        .child(
            div()
                .absolute()
                .top(px(6.0))
                .left(px(6.0))
                .w(px(1.0))
                .h(px(4.0))
                .bg(stroke),
        )
        .child(
            div()
                .absolute()
                .top(px(6.0))
                .left(px(8.0))
                .w(px(1.0))
                .h(px(4.0))
                .bg(stroke),
        )
}

fn stat_tile(
    label: &str,
    value: String,
    unit: Option<&str>,
    sub: Option<&str>,
    available: bool,
) -> gpui::Div {
    let mut value_line = div()
        .mt(px(6.0))
        .flex()
        .items_baseline()
        .gap(px(6.0))
        .font_family("Cascadia Code")
        .text_size(px(22.0))
        .font_weight(gpui::FontWeight(700.0))
        .text_color(rgb(if available {
            crate::orbit::INK
        } else {
            crate::orbit::INK_4
        }))
        .child(value);
    if let Some(unit) = unit {
        value_line = value_line.child(text(unit, 12.0, 400, crate::orbit::INK_3));
    }
    orbit::card("")
        .flex_1()
        .min_w(px(0.0))
        .p(px(14.0))
        .px(px(18.0))
        .rounded(px(18.0))
        .child(orbit::eyebrow(label).text_size(px(11.0)))
        .child(value_line)
        .when_some(sub, |tile, sub| {
            tile.child(
                text(sub, 11.5, 400, crate::orbit::INK_4)
                    .mt(px(4.0))
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
        .child(orbit::callout(message));
    if conflict {
        panel = panel.child(
            button("launcher-reload", "Recargar datos locales")
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
        let mut profiles = orbit::card_body().child(orbit::eyebrow(format!(
            "Perfiles · {}",
            self.store.document.profiles.len()
        )));
        let visible: Vec<_> = self
            .sorted_profiles()
            .into_iter()
            .filter(|profile| self.profile_matches(profile, query))
            .collect();
        for (index, profile) in visible.iter().enumerate() {
            let row_launch = (*profile).clone();
            let launch = (*profile).clone();
            let can_launch = launchable(
                profile,
                &self.discovered,
                self.scanning || self.chain.is_some(),
            );
            profiles = profiles.child(
                div()
                    .id(("context-profile-group", index))
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        orbit::profile_avatar(
                            "context-profile-avatar",
                            &profile.name,
                            profile.favorite,
                            true,
                        )
                        .tab_stop(false),
                    )
                    .child(
                        orbit::list_row(
                            ("context-profile", index),
                            &profile.name,
                            &self.chain_names(profile),
                            false,
                            true,
                        )
                        .flex_1()
                        .min_w_0()
                        .when(can_launch, |row| {
                            row.on_click(cx.listener(move |this, _, _, cx| {
                                this.start(row_launch.clone(), cx);
                            }))
                        })
                        .when(!can_launch, |row| {
                            row.tab_stop(false).opacity(orbit::DISABLED)
                        }),
                    )
                    .child(
                        button("context-launch", "▶")
                            .aria_label(format!("Lanzar {}", profile.name))
                            .when(can_launch, |button| {
                                button.on_click(cx.listener(move |this, _, _, cx| {
                                    this.start(launch.clone(), cx);
                                }))
                            })
                            .when(!can_launch, |button| {
                                button.tab_stop(false).opacity(orbit::DISABLED)
                            }),
                    ),
            );
        }
        if visible.is_empty() {
            profiles = profiles.child(orbit::empty_state(
                "Sin perfiles",
                "Crea un perfil o cambia la búsqueda.",
            ));
        }
        profiles
    }

    pub fn quick_profiles(&self, query: &str, cx: &mut Context<Self>) -> gpui::Div {
        self.context_profiles(query, cx)
    }

    pub fn context_column(&self, window: &Window, cx: &mut Context<Self>) -> gpui::Div {
        let query = self.query.read(cx).value.clone();
        let profiles = self.context_profiles(&query, cx);
        let mut favorites = orbit::card_body().child(orbit::eyebrow("Favoritas"));
        let mut count = 0;
        for (index, app) in self
            .store
            .document
            .apps
            .iter()
            .filter(|app| app.favorite && matches_query(&query, &[&app.name, category(app)]))
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
                )
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.app_editor(Some(edit.clone()), window, cx);
                })),
            );
        }
        if count == 0 {
            favorites = favorites.child(text(
                "Sin favoritas: marca la estrella de una aplicación.",
                orbit::BODY,
                400,
                orbit::INK_2,
            ));
        }
        let detected = self
            .discovered
            .apps
            .iter()
            .filter(|app| app.availability.found)
            .count();
        orbit::column("Launcher", env!("CARGO_PKG_VERSION"))
            .w(px(orbit::column_width(f32::from(window.viewport_size().width))))
            .child(orbit::card_body().child(text("Buscar aplicaciones y perfiles", orbit::SECONDARY, 500, orbit::INK_3)).child(self.query.clone()))
            .child(div().id("launcher-context").flex_1().min_h_0().overflow_y_scroll()
                .child(profiles).child(favorites)
                .child(orbit::card_body().child(orbit::eyebrow(format!("Catálogo · {} · {detected} detectadas", self.store.document.apps.len())))
                    .child(text("La detección busca en el registro y Steam. Accesos directos: pendiente.", orbit::SECONDARY, 400, orbit::INK_3))))
            .child(orbit::card_body()
                .child(orbit::eyebrow("Próximas carreras"))
                .child(chip("pendiente · contexto de calendario", Tone::Neutral))
                .child(orbit::eyebrow("Perfil de overlay"))
                .child(chip("pendiente · perfil activo", Tone::Neutral)))
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
        let meta = if self.last_scan.is_some() {
            format!("{detected} detectadas")
        } else {
            format!("{} en catálogo", self.store.document.apps.len())
        };
        let mut rows = div().flex().flex_col().gap(px(2.0));
        for (index, app) in apps.iter().enumerate() {
            rows = rows.child(self.app_row(index, app, cx));
        }
        if apps.is_empty() {
            rows = rows.child(text("Sin aplicaciones", orbit::BODY, 400, orbit::INK_3));
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
            .border_color(rgba(orbit::LINE))
            .bg(rgba(0x1011_14c9))
            .child(Self::catalog_heading(meta))
            .child(
                div()
                    .id("launcher-app-list")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .p(px(14.0))
                    .child(rows),
            )
            .child(Self::catalog_add_app_action(cx))
    }

    fn catalog_heading(meta: String) -> gpui::Div {
        div()
            .h(px(60.0))
            .flex_none()
            .flex()
            .items_center()
            .px(px(20.0))
            .border_b_1()
            .border_color(rgba(0xffff_ff0d))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(10.0))
                    .child(
                        text("Aplicaciones", 15.0, 700, orbit::INK)
                            .flex_1()
                            .min_w_0()
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis(),
                    )
                    .child(text(meta, 10.5, 500, orbit::INK_3).font_family("Cascadia Code")),
            )
    }

    fn catalog_add_app_action(cx: &Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("launcher-add-app")
            .h(px(64.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(12.0))
            .mx(px(20.0))
            .border_t_1()
            .border_color(rgba(orbit::LINE_ROW))
            .child(
                div()
                    .size(px(32.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(9.0))
                    .border_1()
                    .border_color(rgba(orbit::LINE_STRONG))
                    .text_size(px(17.0))
                    .text_color(rgb(orbit::INK_3))
                    .child("+"),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(text("Añadir aplicación", 13.0, 650, orbit::INK_2))
                    .child(text(
                        "Elige un ejecutable que la detección no encontró.",
                        11.0,
                        400,
                        orbit::INK_3,
                    )),
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
            .h(px(46.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(10.0))
            .px(px(8.0))
            .rounded(px(11.0))
            .hover(|style| style.bg(rgba(0xffff_ff08)))
            .child(app_mark(app, 39.0))
            .child(
                div()
                    .id(("launcher-app-edit", index))
                    .flex_1()
                    .min_w_0()
                    .child(
                        text(app.name.clone(), 13.0, 650, orbit::INK_2)
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis(),
                    )
                    .child(
                        text(app_method(app), 11.0, 400, orbit::INK_3)
                            .overflow_hidden()
                            .whitespace_nowrap()
                            .text_ellipsis(),
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.app_editor(Some(editable.clone()), window, cx);
                    })),
            )
            .child(chip(label, tone))
            .child(
                icon_button(
                    "launcher-app-favorite",
                    format!("Favorita: {}", app.name),
                    if app.favorite { "★" } else { "☆" },
                )
                .when(app.favorite, |button| button.text_color(rgb(orbit::CORAL)))
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
                orbit::INK_2,
            ))
            .child(text(
                "No se borra nada de tu disco. Si algún perfil la usa como paso, quítala del perfil primero.",
                orbit::SECONDARY,
                400,
                orbit::INK_3,
            ))
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
            rows = rows.child(text("Sin perfiles", orbit::BODY, 400, orbit::INK_3));
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
                .border_color(rgba(orbit::LINE_STRONG))
                .cursor_pointer()
                .hover(|style| style.border_color(rgba(0xf047_556b)))
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
                        .border_color(rgba(orbit::INK_3))
                        .text_size(px(20.0))
                        .text_color(rgb(orbit::INK_3))
                        .child("+"),
                )
                .child(
                    div()
                        .child(text("Crear perfil", 15.0, 650, orbit::INK))
                        .child(text(
                            "Organiza aplicaciones y ejecuta sus pasos en orden.",
                            12.5,
                            400,
                            orbit::INK_2,
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
        let chain = self.profile_chain(profile);
        let featured = index == 0;
        // Las capturas Wails de referencia conservan la superficie de perfil
        // en #0f0f12. El shell puede aportar la elevación alrededor, pero esta
        // sección no debe aclarar el relleno al dibujar el degradado Featured.
        let (background_start, background_end) = (0x000f_0f12, 0x000f_0f12);
        div()
            .id(("launcher-profile", index))
            .relative()
            .overflow_hidden()
            .p(px(22.0))
            .pl(px(24.0))
            .rounded(px(if featured { 25.0 } else { 18.0 }))
            .border_1()
            .border_color(rgba(orbit::LINE))
            .bg(linear_gradient(
                170.0,
                linear_color_stop(rgb(background_start), 0.0),
                linear_color_stop(rgb(background_end), 1.0),
            ))
            .child(
                div()
                    .absolute()
                    .top_0()
                    .bottom_0()
                    .left_0()
                    .w(px(3.0))
                    .bg(linear_gradient(
                        180.0,
                        linear_color_stop(
                            rgb(if featured { orbit::CORAL } else { orbit::INK_4 }),
                            0.0,
                        ),
                        linear_color_stop(
                            rgb(if featured {
                                orbit::CARMINE
                            } else {
                                orbit::SURFACE_3
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
                    text("Sin pasos todavía.", orbit::BODY, 400, orbit::INK_3)
                        .px(px(2.0))
                        .py(px(10.0)),
                )
            })
            .when(!profile.steps.is_empty(), |body| body.child(chain))
            .child(Self::policy_chips(profile).mt(px(14.0)))
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
        let description = self.demo_descriptions.get(&profile.id).cloned();
        div()
            .flex()
            .items_start()
            .gap(px(16.0))
            .child(profile_mark(&profile.name, featured, 46.0))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(orbit::eyebrow(if featured && profile.favorite {
                        "Perfil destacado · Favorito"
                    } else if featured {
                        "Perfil destacado"
                    } else {
                        "Perfil"
                    }))
                    .child(text(profile.name.clone(), 18.0, 690, orbit::INK).mt(px(5.0)))
                    .when_some(description, |copy, description| {
                        copy.child(text(description, 12.5, 400, orbit::INK_2).mt(px(5.0)))
                    }),
            )
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .child(
                        icon_button(
                            "launcher-edit-profile",
                            format!("Editar {}", profile.name),
                            "✎",
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.profile_editor(edit.clone(), window, cx);
                            },
                        )),
                    )
                    .child(
                        orbit::primary_button("launch-profile", "▶ Lanzar")
                            .when(can_launch, |button| {
                                button.on_click(cx.listener(move |this, _, _, cx| {
                                    this.start(launch.clone(), cx);
                                }))
                            })
                            .when(!can_launch, |button| {
                                button.tab_stop(false).opacity(orbit::DISABLED)
                            }),
                    ),
            )
    }

    fn profile_chain(&self, profile: &Profile) -> gpui::Div {
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
                .child(div().w_full().h(px(1.0)).bg(rgba(orbit::LINE))),
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
                    .flex_1()
                    .min_w(px(150.0))
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .py(px(9.0))
                    .pl(px(9.0))
                    .pr(px(12.0))
                    .rounded(px(12.0))
                    .border_1()
                    .border_color(rgba(0xffff_ff12))
                    .bg(linear_gradient(
                        170.0,
                        linear_color_stop(rgb(0x0022_2228), 0.0),
                        linear_color_stop(rgb(0x0018_181d), 1.0),
                    ))
                    .child(app_mark(app, 26.0))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(
                                text(app.name.clone(), 12.5, 650, orbit::INK)
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
                                    orbit::INK_3,
                                )
                                .font_family("Cascadia Code"),
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
                        .child(div().size(px(6.0)).rounded(px(3.0)).bg(rgb(0x005f_5b62))),
                );
            }
        }
        chain.mt(px(18.0))
    }
    fn policy_chips(profile: &Profile) -> gpui::Div {
        let policy = profile.effective_policy();
        div()
            .flex()
            .flex_wrap()
            .gap(px(6.0))
            .child(chip(
                match policy.already_running {
                    Running::Ask => "YA ABIERTA · PREGUNTAR",
                    Running::Reuse => "YA ABIERTA · REUTILIZAR",
                    Running::Restart => "YA ABIERTA · REINICIAR",
                },
                Tone::Neutral,
            ))
            .child(chip(
                match policy.failure {
                    Failure::Ask => "FALLO · PREGUNTAR",
                    Failure::Stop => "FALLO · DETENER",
                    Failure::Continue => "FALLO · CONTINUAR",
                },
                Tone::Neutral,
            ))
            .child(chip(
                &format!("FALLO · REINTENTAR ×{}", policy.max_retries),
                Tone::Neutral,
            ))
            .child(chip(
                match policy.exit {
                    Close::Ask => "AL SALIR · PREGUNTAR",
                    Close::Leave => "AL SALIR · DEJAR ABIERTAS",
                    Close::CloseStarted => "AL SALIR · CERRAR INICIADAS",
                },
                Tone::Neutral,
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
                button("duplicate-profile", "Duplicar").on_click(cx.listener(
                    move |this, _, window, cx| {
                        this.new_profile(Some(duplicate.clone()), window, cx);
                    },
                )),
            )
            .child(button("delete-profile", "Eliminar").on_click(cx.listener(
                move |this, _, _, cx| {
                    this.edit(
                        |doc| {
                            doc.profiles.retain(|profile| profile.id != remove);
                            if doc.lmu_trigger_profile.as_deref() == Some(&remove) {
                                doc.lmu_trigger_profile = None;
                            }
                            Ok(())
                        },
                        cx,
                    );
                },
            )))
            .child(
                button(
                    "trigger-profile",
                    if triggered {
                        "LMU · activado"
                    } else {
                        "Al abrir LMU"
                    },
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

    fn stats(&self) -> gpui::Div {
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
        div()
            .h(px(106.0))
            .flex_none()
            .flex()
            .gap(px(21.0))
            .child(stat_tile(
                "Aplicaciones",
                self.store.document.apps.len().to_string(),
                Some("en catálogo"),
                Some(&format!("{detected} detectadas")),
                true,
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
            ))
            .child(stat_tile(
                "Última ejecución",
                "—".into(),
                None,
                Some("sin ejecuciones registradas"),
                false,
            ))
            .child(stat_tile(
                "Atajo global",
                "—".into(),
                None,
                Some("sin atajo asignado"),
                false,
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
            ));
        }
        let controls = if self.chain.is_some() {
            div().child(
                button("cancel-chain", "Cancelar cadena").on_click(cx.listener(
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
                        button("retry-failed", "Reintentar pasos fallidos").on_click(cx.listener(
                            |this, _, _, cx| {
                                this.retry(super::super::chain::RetryScope::Failed, cx);
                            },
                        )),
                    )
                })
                .child(
                    button("retry-all", "Reintentar cadena entera").on_click(cx.listener(
                        |this, _, _, cx| this.retry(super::super::chain::RetryScope::All, cx),
                    )),
                )
        };
        orbit::card("Progreso de la cadena").child(progress.child(controls))
    }

    fn launcher_heading(&self, detection_label: &str, detection_ran: bool) -> gpui::Div {
        div()
            .h(px(110.0))
            .flex_none()
            .flex()
            .items_start()
            .justify_between()
            .gap(px(21.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(orbit::eyebrow("Aplicaciones y cadenas"))
                    .child(text("Launcher", 34.0, 690, orbit::INK).mt(px(6.0)))
                    .child(
                        text(
                            "Detecta aplicaciones compatibles, organiza perfiles y ejecuta sus pasos en orden.",
                            orbit::BODY,
                            400,
                            orbit::INK_2,
                        )
                        .mt(px(7.0)),
                    ),
            )
            .child(orbit::pill(
                if self.scanning {
                    "DETECTANDO…"
                } else {
                    detection_label
                },
                if self.scanning {
                    Tone::Warning
                } else if detection_ran {
                    Tone::Success
                } else {
                    Tone::Neutral
                },
            ))
    }

    fn launcher_columns(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("launcher-profile-list")
            .flex_1()
            .min_h_0()
            .flex()
            .gap(px(21.0))
            .child(
                div()
                    .w(px(338.0))
                    .flex_none()
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
                    .overflow_y_scroll()
                    .child(self.profiles(cx)),
            )
    }
}

impl Render for Launcher {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
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
        let detection_label = self.last_scan.map_or_else(
            || {
                if detection_ran {
                    "DETECCIÓN EJECUTADA".into()
                } else {
                    "DETECCIÓN PENDIENTE".into()
                }
            },
            |when| format!("DETECCIÓN EJECUTADA {}", when.format("%d/%m, %H:%M")),
        );
        let mut page = div()
            .id("launcher")
            .w_full()
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .min_w_0()
            .pt(px(24.0))
            .pb(px(20.0))
            .gap(px(21.0))
            .child(self.launcher_heading(&detection_label, detection_ran))
            .child(self.stats())
            .when_some(self.error.clone(), |page, error| {
                page.child(error_panel(error, cx))
            })
            .when(!self.progress.is_empty(), |page| {
                page.child(self.progress_panel(cx))
            })
            .child(self.launcher_columns(cx));
        for warning in &self.discovered.warnings {
            page = page.child(orbit::callout(warning.clone()));
        }
        page
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
