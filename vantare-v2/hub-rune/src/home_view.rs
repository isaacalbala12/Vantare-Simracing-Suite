//! Home uses the host projection and launch contract; assets and labels come from Electron.
use crate::{
    State,
    catalog::{catalog, text},
    design::{Theme, body_style, button, button_content, caption, display, label, surface, symbol},
    home_assets,
};
use rune::{Cx, El, Image, ImageCache, SurfaceFit, col, el, row};
use std::collections::BTreeMap;
use vantare_hub_host::home::{HomeLayoutView, HomeView, LaunchProgress};

pub struct Assets {
    cache: ImageCache,
    images: BTreeMap<String, Image>,
}
impl Assets {
    pub fn new(waker: rune::Waker, theme: &Theme) -> Self {
        let mut assets = Self {
            cache: ImageCache::new(waker),
            images: BTreeMap::new(),
        };
        assets.update(theme);
        assets.track(theme, None);
        assets
    }
    pub fn update(&mut self, theme: &Theme) {
        self.images = home_assets::WIDGETS
            .iter()
            .map(|(kind, svg)| {
                (
                    (*kind).to_owned(),
                    self.cache
                        .svg(resolve_svg(svg, theme).into_bytes(), 300.0, 2.0),
                )
            })
            .collect();
        self.images.insert(
            "hero".into(),
            self.cache.svg(theme.hero_svg().into_bytes(), 1000.0, 2.0),
        );
        self.images.insert(
            "brand".into(),
            self.cache.svg(
                include_str!("../../hub-web/src/renderer/assets/brand/wordmark.svg")
                    .replace("#FFFFFF", &resolve_svg("var(--text-1)", theme))
                    .into_bytes(),
                106.66,
                2.0,
            ),
        );
        self.images.insert(
            "background".into(),
            self.cache.svg(
                include_bytes!("../../hub-web/src/renderer/assets/widgets/home-preview-bg.svg")
                    .as_slice(),
                454.0,
                2.0,
            ),
        );
    }
    pub fn track(&mut self, theme: &Theme, track: Option<&str>) {
        self.images.retain(|key, _| !key.starts_with("circuit-"));
        if let Some(key) = track_key(track) {
            let resource = &catalog()["home"]["tracks"][key];
            let svg = format!(
                r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{}"><path d="{}" fill="none" stroke="var(--accent-tint)" stroke-width="10"/><path d="{}" fill="none" stroke="var(--hero-ring)" stroke-width="2.5"/></svg>"#,
                resource[0].as_str().unwrap(),
                resource[1].as_str().unwrap(),
                resource[1].as_str().unwrap()
            );
            self.images.insert(
                format!("circuit-{key}"),
                self.cache
                    .svg(resolve_svg(&svg, theme).into_bytes(), 400.0, 1.5),
            );
        }
    }
    fn picture(&self, key: &str, width: f32, height: f32, fill: bool) -> El {
        let element = el().size(width, height);
        self.images.get(key).map_or(element.clone(), |image| {
            element.pixels_fit(
                image.pixels(),
                if fill {
                    SurfaceFit::Fill
                } else {
                    SurfaceFit::Fit
                },
            )
        })
    }
}
fn track_key(track: Option<&str>) -> Option<&'static str> {
    match track {
        None => Some("lemans_h"),
        Some(track) => catalog()["home"]["trackAliases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|pair| track.to_lowercase().contains(pair[0].as_str().unwrap()))
            .and_then(|pair| pair[1].as_str()),
    }
}
fn resolve_svg(svg: &str, theme: &Theme) -> String {
    let mut rest = svg;
    let mut output = String::new();
    while let Some(start) = rest.find("var(--") {
        output.push_str(&rest[..start]);
        let end = rest[start..].find(')').expect("shared SVG variable closes") + start;
        let name = rest[start + 6..end].split(',').next().unwrap();
        let c = theme.color(name);
        output.push_str(&format!(
            "rgba({},{},{},{})",
            (rune::color::srgb_encode(c.r) * 255.0).round(),
            (rune::color::srgb_encode(c.g) * 255.0).round(),
            (rune::color::srgb_encode(c.b) * 255.0).round(),
            c.a
        ));
        rest = &rest[end + 1..];
    }
    output.push_str(rest);
    output
}
pub fn brand(state: &State) -> El {
    picture(state, "brand", 106.66, 14.0, false)
        .label(text("shell.brand"))
        .role("img")
}
fn heading(theme: &Theme, value: &str) -> El {
    caption(theme, value)
}
fn small(theme: &Theme, value: impl Into<String>) -> El {
    label(theme, value)
        .font(body_style(12.0, 400.0))
        .color(theme.color("text-3"))
}
fn badge(theme: &Theme, value: &str) -> El {
    badge_tone(theme, value, false)
}
fn badge_tone(theme: &Theme, value: &str, accent: bool) -> El {
    let (background, foreground) = if accent {
        ("accent-tint", "accent-bright")
    } else if value == text("home.connectedBadge") {
        ("ok-tint", "ok")
    } else {
        ("bg-sidebar", "text-1")
    };
    row()
        .padding(6.0)
        .radius(4.0)
        .fill(theme.color(background))
        .border(
            1.0,
            theme.color(if accent || value == text("home.connectedBadge") {
                background
            } else {
                "line-1"
            }),
        )
        .child(
            label(theme, value)
                .font(body_style(12.0, 500.0))
                .color(theme.color(foreground)),
        )
}
fn metric(theme: &Theme, value: &str, name: &str) -> El {
    col()
        .grow(1.0)
        .gap(2.0)
        .child(label(theme, value).font(body_style(24.0, 600.0)).h(36.0))
        .child(small(theme, name).font(body_style(11.0, 400.0)))
}
fn status_row(theme: &Theme, key: &str, name: &str, title: &str, subtitle: &str, tag: &str) -> El {
    row()
        .key(key)
        .w_full()
        .min_h(58.0)
        .center_y()
        .gap(10.0)
        .padding(6.0)
        .border_sides([0.0, 0.0, 1.0, 0.0], theme.color("line-1"))
        .child(
            row()
                .size(32.0, 32.0)
                .center()
                .radius(5.0)
                .fill(theme.color("surface-2"))
                .child(symbol(theme, name, 18.0)),
        )
        .child(
            col()
                .min_w(0.0)
                .grow(1.0)
                .gap(4.0)
                .child(label(theme, title).font(body_style(14.0, 650.0)))
                .child(small(theme, subtitle)),
        )
        .child(badge_tone(theme, tag, tag == text("home.tester")))
}
fn parsed_date(value: &str) -> Option<chrono::DateTime<chrono::FixedOffset>> {
    chrono::DateTime::parse_from_rfc3339(value).ok()
}
fn activity_date(value: &str) -> String {
    parsed_date(value).map_or_else(
        || text("home.noDate").to_owned(),
        |date| {
            date.with_timezone(&chrono::Local)
                .format("%d/%m · %H:%M")
                .to_string()
        },
    )
}
fn message(theme: &Theme, value: &str) -> El {
    label(theme, value).role("status")
}
fn card(theme: &Theme, key: &str, title: &str) -> El {
    surface(theme).key(key).grow(1.0).min_w(0.0).gap(8.0).child(
        row()
            .h(24.0)
            .center_y()
            .gap(10.0)
            .child(symbol(
                theme,
                if key == "home-activity" {
                    "clock"
                } else {
                    "v-studio"
                },
                16.0,
            ))
            .child(heading(theme, title).grow(1.0))
            .child(if key == "home-activity" {
                button_content(
                    theme,
                    "home-activity-all",
                    text("home.all"),
                    small(theme, text("home.all").to_uppercase())
                        .font(body_style(11.0, 400.0).family(rune::Family::Named("Space Mono"))),
                    |s: &mut State| {
                        s.activity_open = true;
                        s.commands_open = false;
                    },
                )
                .padding(0.0)
                .min_h(20.0)
                .h(20.0)
                .fill(theme.color("surface-1"))
            } else {
                el()
            }),
    )
}
fn picture(state: &State, kind: &str, width: f32, height: f32, fill: bool) -> El {
    state.home_assets.as_ref().map_or_else(
        || el().size(width, height),
        |assets| assets.picture(kind, width, height, fill),
    )
}
/// Same union/centering formula as Electron's LayoutPreview, including negative coordinates.
fn preview_boxes(layout: &HomeLayoutView, width: f32, height: f32) -> Vec<[f32; 4]> {
    if layout.widgets.is_empty() {
        return Vec::new();
    }
    let left = layout
        .widgets
        .iter()
        .map(|w| w.x as f32)
        .fold(f32::INFINITY, f32::min);
    let top = layout
        .widgets
        .iter()
        .map(|w| w.y as f32)
        .fold(f32::INFINITY, f32::min);
    let right = layout
        .widgets
        .iter()
        .map(|w| w.x as f32 + w.w as f32)
        .fold(f32::NEG_INFINITY, f32::max);
    let bottom = layout
        .widgets
        .iter()
        .map(|w| w.y as f32 + w.h as f32)
        .fold(f32::NEG_INFINITY, f32::max);
    let w = (right - left).max(1.0);
    let h = (bottom - top).max(1.0);
    let scale = ((width - 16.0) / w)
        .min((height - 16.0) / h)
        .clamp(0.01, 1.0);
    layout
        .widgets
        .iter()
        .map(|widget| {
            [
                (width - w * scale) / 2.0 + (widget.x as f32 - left) * scale,
                (height - h * scale) / 2.0 + (widget.y as f32 - top) * scale,
                widget.w as f32 * scale,
                widget.h as f32 * scale,
            ]
        })
        .collect()
}
fn preview(state: &State, value: &HomeView, cx: &Cx<State>) -> El {
    let [width, height] = cx
        .layout_size("home-layout-preview")
        .unwrap_or([300.0, 228.0]);
    let mut content = el()
        .key("home-layout-preview")
        .w_full()
        .h(228.0)
        .radius(8.0)
        .clip_rounded(8.0)
        .child(picture(state, "background", width, height, true));
    if value.layout.widgets.is_empty() {
        content = content.child(message(&state.theme, text("home.noWidgets")));
    }
    for (index, (widget, [x, y, w, h])) in value
        .layout
        .widgets
        .iter()
        .zip(preview_boxes(&value.layout, width, height))
        .enumerate()
    {
        let kind = widget.kind.key();
        let name = catalog()["home"]["widgets"][&kind]
            .as_str()
            .expect("shared widget name");
        content = content.child(
            picture(state, &kind, w, h, true)
                .key(format!("home-preview-{index}"))
                .label(name)
                .role("img")
                .opacity(f32::from(widget.opacity) / 100.0)
                .pin(Some(x), Some(y), None, None),
        );
    }
    content
}
fn studio(state: &mut State) {
    if state.core.access.verified && !state.core.access.blocked {
        state.section = "studio".into();
    }
}
fn studio_button(state: &State, key: &str, title: &str) -> El {
    button(&state.theme, key, title, studio)
        .disabled(!state.core.access.verified || state.core.access.blocked)
}
fn launch_button(state: &State, favorite: bool) -> El {
    let theme = &state.theme;
    let title = if state
        .home
        .value
        .as_ref()
        .is_some_and(|v| v.profiles.is_empty())
        && favorite
    {
        text("home.create").to_owned()
    } else if matches!(
        state.home.launch_problem,
        Some(crate::home::LaunchProblem::Uncertain { .. })
    ) {
        text("home.launchUncertainLabel").to_owned()
    } else if state.home.launching() {
        text("home.launching").to_owned()
    } else if favorite {
        catalog()["home"]["launch"].as_str().unwrap().replace(
            "__VANTARE_NAME__",
            state
                .home
                .choice(true)
                .map_or(text("home.noFavorite"), |p| &p.name),
        )
    } else {
        text("home.selectedLaunch").to_owned()
    };
    let empty = favorite
        && state
            .home
            .value
            .as_ref()
            .is_some_and(|v| v.profiles.is_empty() && !v.protected);
    let allowed = if empty {
        state.core.access.verified && !state.core.access.blocked && !state.home.launching()
    } else {
        state.home.can_launch(&state.core, favorite)
    };
    let foreground = theme.color(if allowed { "text-on-accent" } else { "text-3" });
    let mut content = row()
        .gap(10.0)
        .center_y()
        .child(symbol(theme, "play", 12.0).color(foreground));
    if favorite {
        content = content.child(
            label(theme, &title)
                .font(body_style(14.0, 600.0))
                .color(foreground),
        );
        if !empty {
            content = content.child(shortcut(theme, text("home.ctrlL")).color(foreground));
        }
    }
    let button = button_content(
        theme,
        if favorite {
            "home-launch-favorite"
        } else {
            "home-launch-selected"
        },
        &title,
        content,
        move |s: &mut State| {
            if empty {
                if s.core.access.verified && !s.core.access.blocked {
                    s.section = "launcher".into();
                }
            } else {
                s.home.queue_launch(&s.core, favorite);
            }
        },
    )
    .disabled(!allowed)
    .h(if favorite { 46.0 } else { 36.0 })
    .fill(theme.color(if allowed { "accent-fill" } else { "surface-2" }))
    .border(1.0, theme.color("accent-bright"));
    if favorite {
        button
    } else {
        button.w(36.0).min_w(36.0).padding(0.0)
    }
}
fn shortcut(theme: &Theme, value: &str) -> El {
    label(theme, value)
        .font(body_style(10.0, 400.0).family(rune::Family::Named("Space Mono")))
        .color(theme.color("text-3"))
}
pub fn activity_rows(state: &State, limit: usize) -> El {
    let theme = &state.theme;
    let mut content = col().w_full().gap(8.0);
    if let Some(value) = &state.home.value {
        let mut profiles: Vec<_> = value
            .profiles
            .iter()
            .filter(|p| p.last_launched_at.is_some())
            .collect();
        profiles.sort_by_cached_key(|p| {
            std::cmp::Reverse(
                p.last_launched_at
                    .as_deref()
                    .and_then(parsed_date)
                    .map_or(0, |d| d.timestamp_millis()),
            )
        });
        if profiles.is_empty() {
            content = content
                .child(message(theme, text("home.noActivity")))
                .child(label(theme, text("home.activityDescription")));
        }
        for profile in profiles.into_iter().take(limit) {
            content = content.child(
                row()
                    .key(format!("home-activity-{}", profile.id))
                    .w_full()
                    .min_h(58.0)
                    .gap(10.0)
                    .center_y()
                    .child(symbol(theme, "clock", 18.0))
                    .child(
                        col()
                            .grow(1.0)
                            .min_w(0.0)
                            .gap(4.0)
                            .child(
                                label(
                                    theme,
                                    catalog()["home"]["lastLaunch"]
                                        .as_str()
                                        .unwrap()
                                        .replace("__VANTARE_NAME__", &profile.name),
                                )
                                .font(body_style(14.0, 650.0)),
                            )
                            .child(small(
                                theme,
                                activity_date(profile.last_launched_at.as_deref().unwrap_or("")),
                            )),
                    )
                    .child(badge_tone(
                        theme,
                        catalog()["home"]["sources"]["launcher"].as_str().unwrap(),
                        true,
                    )),
            );
        }
    } else {
        content = content.child(message(theme, text("home.loading")));
    }
    content
}
pub fn view(state: &State, cx: &Cx<State>) -> El {
    let theme = &state.theme;
    let data = state.home.value.as_ref();
    let mut page = col().key("home").w_full().gap(12.0).px(24.0).py(16.0);
    if state.home.failed
        || state.home.launch_problem.is_some()
        || state.core.access.blocked
        || data.is_some_and(|v| v.protected)
    {
        page = page.child(
            surface(theme)
                .key("home-error")
                .role("status")
                .child(
                    label(
                        theme,
                        text(
                            if matches!(
                                state.home.launch_problem,
                                Some(crate::home::LaunchProblem::Uncertain { .. })
                            ) {
                                "home.launchUncertain"
                            } else if matches!(
                                state.home.launch_problem,
                                Some(crate::home::LaunchProblem::ConditionsChanged)
                            ) {
                                "home.launchChanged"
                            } else if state.home.launch_problem.is_some() {
                                "home.failed"
                            } else if data.is_some_and(|v| v.protected) {
                                "home.protected"
                            } else {
                                "home.accessError"
                            },
                        ),
                    )
                    .w_full()
                    .wrap(),
                )
                .child(button(
                    theme,
                    "home-retry",
                    text(
                        if matches!(
                            state.home.launch_problem,
                            Some(crate::home::LaunchProblem::Uncertain { .. })
                        ) {
                            "home.checkLaunch"
                        } else {
                            "home.retry"
                        },
                    ),
                    |s: &mut State| s.home.retry(),
                )),
        );
    }
    let connected = data.is_some_and(|v| v.sim.connected);
    let empty = data.is_some_and(|v| v.profiles.is_empty());
    let sim = text(if connected {
        "home.connected"
    } else {
        "home.waiting"
    });
    let selected = state
        .home
        .choice(false)
        .map_or(text("home.selectProfile"), |p| p.name.as_str());
    let mut composer = row()
        .key("home-composer")
        .w_full()
        .h(52.0)
        .px(12.0)
        .gap(10.0)
        .center_y()
        .radius(10.0)
        .fill(theme.color("surface-1"))
        .border(1.0, theme.color("line-1"))
        .border_layout()
        .child(
            button_content(
                theme,
                "home-search",
                text("home.search"),
                row()
                    .w_full()
                    .gap(12.0)
                    .center_y()
                    .child(symbol(theme, "search", 16.0).key("home-search-icon"))
                    .child(
                        label(theme, text("home.search"))
                            .key("home-search-placeholder")
                            .color(theme.color("text-3"))
                            .grow(1.0)
                            .min_w(0.0)
                            .truncate(),
                    ),
                crate::home_chrome::open_commands,
            )
            .grow(1.0)
            .min_w(0.0)
            .h(36.0)
            .padding(0.0)
            .px(8.0)
            .justify_start()
            .fill(theme.color("surface-1")),
        )
        .child(
            button_content(
                theme,
                "home-select",
                selected,
                row()
                    .w_full()
                    .gap(8.0)
                    .center_y()
                    .child(
                        label(theme, selected)
                            .font(body_style(14.0, 400.0))
                            .color(theme.color("text-2"))
                            .grow(1.0)
                            .min_w(0.0)
                            .truncate(),
                    )
                    .child(symbol(theme, "down", 12.0).key("home-select-arrow")),
                |s: &mut State| s.home.choosing = !s.home.choosing,
            )
            .w(168.0)
            .min_w(168.0)
            .h(38.0)
            .padding(0.0)
            .px(12.0)
            .fill(theme.color("surface-1"))
            .border(1.0, theme.color("line-1"))
            .border_layout()
            .expanded(state.home.choosing)
            .disabled(data.is_none_or(|v| v.profiles.is_empty())),
        )
        .child(
            shortcut(theme, text("home.ctrlK"))
                .px(5.0)
                .py(2.0)
                .border(1.0, theme.color("line-1"))
                .border_layout()
                .fill(theme.color("surface-2")),
        )
        .child(launch_button(state, false));
    if state.home.choosing
        && let Some(value) = data
    {
        let mut options = col()
            .key("home-profile-options")
            .role("group")
            .label(text("home.profile"));
        for profile in &value.profiles {
            let id = profile.id.clone();
            options = options.child(button(
                theme,
                &format!("home-profile-{}", profile.id),
                &profile.name,
                move |s: &mut State| {
                    s.home.selected = id.clone();
                    s.home.choosing = false;
                },
            ));
        }
        composer = composer.child(options);
    }
    page = page.child(composer);
    let [window_width, window_height] = cx.layout_size("hub").unwrap_or([1440.0, 900.0]);
    let hero_height = if window_height >= 1000.0 {
        300.0
    } else if window_height < 820.0 {
        200.0
    } else {
        236.0
    };
    let hero_width = cx.layout_size("home-hero").map_or(600.0, |size| size[0]);
    let circuit = track_key(data.and_then(|v| v.sim.track.as_deref())).map_or_else(el, |key| {
        picture(
            state,
            &format!("circuit-{key}"),
            hero_width * 0.58,
            hero_height,
            false,
        )
        .a11y_hidden()
        .pin(None, Some(0.0), Some(0.0), None)
    });
    let mut hero = col()
        .key("home-hero")
        .w_full()
        .h(hero_height)
        .padding(24.0)
        .gap(8.0)
        .radius(12.0)
        .clip_rounded(12.0)
        .fill(theme.color("bg-base"))
        .border(1.0, theme.color("hero-ring"));
    // Paint the image as the hero's background, below the circuit and content.
    if let Some(image) = state
        .home_assets
        .as_ref()
        .and_then(|a| a.images.get("hero"))
    {
        hero = hero.pixels_fit(image.pixels(), SurfaceFit::Fill);
    }
    let hero = hero
        .child(circuit)
        .child(
            small(
                theme,
                format!(
                    "{} · {}",
                    crate::home_chrome::now(state).format("%d/%m"),
                    sim
                )
                .to_uppercase(),
            )
            .key("home-session")
            .font(rune::TextStyle {
                tracking: 0.8,
                ..body_style(10.0, 400.0).family(rune::Family::Named("Space Mono"))
            }),
        )
        .child(
            display(
                theme,
                crate::home_chrome::greeting(
                    if empty { "" } else { &state.display_name },
                    crate::home_chrome::now(state),
                ),
                46.0,
            )
            .key("home-greeting"),
        )
        .child(label(
            theme,
            text(if empty {
                "home.emptySubtitle"
            } else if connected {
                "home.connectedSubtitle"
            } else {
                "home.subtitle"
            }),
        ))
        .child(el().grow(1.0))
        .child(
            row().gap(8.0).child(launch_button(state, true)).child(
                studio_button(state, "home-studio", text("home.studio"))
                    .fill(theme.color("bg-base").alpha(0.0))
                    .border(1.0, theme.color("line-3")),
            ),
        );
    page = page.child(hero);
    let mut overlay = card(theme, "home-overlay", text("home.overlay"));
    let mut activity = card(theme, "home-activity", text("home.activity"));
    if let Some(value) = data {
        if empty && !connected {
            overlay = overlay
                .child(heading(theme, text("home.prepare")))
                .child(label(theme, text("home.prepareDescription")))
                .child(studio_button(
                    state,
                    "home-templates",
                    text("home.templatesAction"),
                ));
        } else {
            overlay = overlay
                .child(preview(state, value, cx))
                .child(
                    row()
                        .center_y()
                        .child(
                            label(theme, text("home.layout"))
                                .font(body_style(22.0, 650.0))
                                .grow(1.0),
                        )
                        .child(badge(theme, text("home.preview"))),
                )
                .child(message(
                    theme,
                    text(if connected {
                        "home.telemetry"
                    } else {
                        "home.waiting"
                    }),
                ));
            let mut chips = row().gap(6.0);
            for (index, widget) in value.layout.widgets.iter().take(3).enumerate() {
                chips = chips.child(
                    badge(
                        theme,
                        catalog()["home"]["widgets"][widget.kind.key()]
                            .as_str()
                            .unwrap(),
                    )
                    .key(format!("home-chip-{index}")),
                );
            }
            if value.layout.widgets.len() > 3 {
                chips = chips.child(badge(
                    theme,
                    &catalog()["home"]["plus"].as_str().unwrap().replace(
                        "__VANTARE_COUNT__",
                        &(value.layout.widgets.len() - 3).to_string(),
                    ),
                ));
            }
            overlay = overlay
                .child(chips)
                .child(
                    row()
                        .gap(16.0)
                        .child(metric(theme, text("home.dash"), text("home.hz")))
                        .child(metric(
                            theme,
                            &value.layout.widgets.len().to_string(),
                            text("home.visible"),
                        ))
                        .child(metric(theme, text("home.dash"), text("home.cpu"))),
                )
                .child(
                    row()
                        .gap(8.0)
                        .child(
                            button_content(
                                theme,
                                "home-edit",
                                text("home.edit"),
                                label(theme, text("home.edit"))
                                    .font(body_style(14.0, 600.0))
                                    .color(theme.color("bg-base")),
                                studio,
                            )
                            .fill(theme.color("text-1"))
                            .disabled(!state.core.access.verified || state.core.access.blocked),
                        )
                        .child(
                            button(theme, "home-stop", text("home.stop"), |_: &mut State| {})
                                .disabled(true)
                                .help(text("home.stopReason")),
                        ),
                );
        }
        activity = activity.child(activity_rows(state, 8));
    } else {
        overlay = overlay.child(message(theme, text("home.loading")));
        activity = activity.child(message(theme, text("home.loading")));
    }
    page = page.child(row().gap(12.0).child(overlay).child(activity));
    let mut status = col()
        .key("home-status-section")
        .w_full()
        .min_h(298.0)
        .gap(8.0)
        .child(
            row()
                .gap(10.0)
                .center_y()
                .child(symbol(theme, "pulse", 16.0))
                .child(heading(theme, text("home.status"))),
        );
    if let Some(value) = data {
        let favorite = value
            .profiles
            .iter()
            .find(|p| Some(&p.id) == value.favorite.as_ref());
        status = status
            .child(status_row(
                theme,
                "home-status-sim",
                "v-helmet",
                text("home.lmu"),
                sim,
                text(if connected {
                    "home.connectedBadge"
                } else {
                    "home.waitingBadge"
                }),
            ))
            .child(status_row(
                theme,
                "home-status-profile",
                "v-launch",
                favorite.map_or(text("home.noProfile"), |p| &p.name),
                text("home.favorite"),
                text(if favorite.is_some() {
                    "home.saved"
                } else {
                    "home.noProfile"
                }),
            ));
        if state.core.access.verified && !state.core.access.blocked && state.core.access.tester {
            status = status.child(status_row(
                theme,
                "home-status-testing",
                "v-testing",
                text("home.testing"),
                text("home.testerAccess"),
                text("home.tester"),
            ));
        }
        status = status.child(status_row(
            theme,
            "home-status-version",
            "key",
            text("home.betaTitle"),
            &value.version,
            text("home.beta"),
        ));
        if let LaunchProgress::Running { text: progress } = &value.launch {
            status = status.child(message(theme, progress));
        }
    } else {
        status = status.child(message(theme, text("home.loading")));
    }
    let rail_width = (window_width * 0.22).clamp(320.0, 400.0);
    let tile_width = (rail_width - 44.0) / 2.0;
    let mut rail = col()
        .key("home-rail")
        .w(320.0)
        .h_full()
        .padding(16.0)
        .gap(18.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .fill(theme.color("bg-sidebar"))
        .border(1.0, theme.color("line-1"))
        .child(status)
        .child(
            row()
                .gap(10.0)
                .center_y()
                .child(symbol(theme, "v-studio", 16.0))
                .child(heading(theme, text("home.templates"))),
        );
    for (line, kinds) in [["standings", "relative"], ["fuel-strategy", "delta"]]
        .into_iter()
        .enumerate()
    {
        let mut pair = row().gap(12.0);
        for (column, kind) in kinds.into_iter().enumerate() {
            let title = catalog()["home"]["templates"][line * 2 + column]
                .as_str()
                .unwrap();
            let content = col()
                .w(tile_width)
                .min_w(0.0)
                .gap(8.0)
                .child(
                    picture(state, kind, tile_width, 92.0, false)
                        .role("img")
                        .label(title),
                )
                .child(
                    label(theme, title)
                        .font(body_style(13.0, 650.0))
                        .w(tile_width)
                        .truncate(),
                )
                .child(
                    small(theme, text("home.localTemplate"))
                        .key(format!("home-template-caption-{kind}"))
                        .w(tile_width)
                        .truncate(),
                );
            pair = pair.child(
                button_content(
                    theme,
                    &format!("home-template-{kind}"),
                    title,
                    content,
                    studio,
                )
                .w(tile_width)
                .min_w(0.0)
                .padding(0.0)
                .fill(theme.color("bg-sidebar"))
                .disabled(!state.core.access.verified || state.core.access.blocked),
            );
        }
        rail = rail.child(pair);
    }
    rail = rail.w(rail_width);

    row()
        .key("home-screen")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .child(
            col()
                .grow(1.0)
                .min_w(0.0)
                .h_full()
                .scroll(rune::ScrollSpec {
                    stick_bottom: false,
                })
                .child(page),
        )
        .child(rail)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hero_keeps_the_shared_red_gradient_in_the_cpu_image_atlas() {
        for scheme in ["light", "dark"] {
            let theme = Theme::load("vantare", scheme).unwrap();
            let cache = ImageCache::new(std::sync::Arc::new(|| {}));
            let image = cache.svg(theme.hero_svg().into_bytes(), 1000.0, 1.0);
            image.wait().unwrap();
            let mut rt =
                rune::Runtime::new((), |_, _| el(), (1000.0, 236.0), rune::Env::new(true, 1.0));
            let placed = rt.images.place(image.pixels(), [1000.0, 236.0]).unwrap();
            let page = &rt.images.pages[placed.page];
            let [x, y, _, _] = placed.rect;
            let pixel = |dx, dy| {
                let offset = (((y + dy) * page.width + x + dx) * 4) as usize;
                <[u8; 4]>::try_from(&page.data[offset..offset + 4]).unwrap()
            };
            let left = pixel(30, 118);
            let right = pixel(970, 118);
            assert!(
                left[0] > left[1] + 30,
                "{scheme}: hero must stay red, {left:?} -> {right:?}"
            );
            assert_ne!(left, right, "{scheme}: gradient must vary across the hero");
        }
    }
    #[test]
    fn inicio_base_composer_matches_electron_geometry_in_both_schemes_at_three_scales() {
        for scheme in ["light", "dark"] {
            for scale in [1.0, 1.25, 1.5] {
                let mut state = crate::init();
                crate::capture_preset(&mut state, &format!("home-{scheme}")).unwrap();
                state.core.access.verified = true;
                state.home.value = Some(
                    serde_json::from_value(catalog()["home"]["scenes"]["inicio-base"].clone())
                        .unwrap(),
                );
                let fonts =
                    rune::text::TextSystem::new(crate::design::FONTS, ("Inter W400", "Space Mono"));
                let mut rt = rune::Runtime::with_text(
                    state,
                    crate::view,
                    (1440.0, 900.0),
                    rune::Env::new(true, scale),
                    fonts,
                );
                for _ in 0..4 {
                    rt.frame(0.0);
                }
                let elements = rt.elements();
                let rect = |key: &str| {
                    elements
                        .iter()
                        .find(|e| e.key.as_deref() == Some(key))
                        .unwrap()
                        .rect
                };
                let composer = rect("home-composer");
                let icon = rect("home-search-icon");
                let placeholder = rect("home-search-placeholder");
                let selector = rect("home-select");
                let arrow = rect("home-select-arrow");
                let play = rect("home-launch-selected");
                // Electron: 1px border + 12px inset, then search icon at 8px and text at 36px.
                assert!(
                    (icon[0] - composer[0] - 21.0).abs() <= 1.0,
                    "{scheme}/{scale}: {icon:?}"
                );
                assert!((placeholder[0] - composer[0] - 49.0).abs() <= 1.0);
                assert!((selector[2] - 168.0).abs() <= 1.0);
                assert!((selector[3] - 38.0).abs() <= 1.0);
                assert!(placeholder[0] + placeholder[2] < selector[0]);
                assert!(
                    arrow[0] > selector[0] + 140.0
                        && arrow[0] + arrow[2] < selector[0] + selector[2]
                );
                assert!((play[2] - 36.0).abs() <= 1.0);
                assert!(rt.find("home-studio").is_some());
                assert!(rt.find("home-rail-studio").is_none());
            }
        }
    }
    #[test]
    fn unavailable_core_keeps_home_in_place_and_template_captions_stay_in_their_tiles() {
        for width in [1280.0, 1440.0, 1920.0] {
            let mut hero_top = None;
            for connected in [false, true] {
                let mut state = crate::init();
                state.collapsed = true;
                state.core.access.verified = true;
                state.core.access.tester = true;
                if connected {
                    state.core.services = vantare_hub_host::protocol::LinkState::Connected;
                }
                state.home.value = Some(
                    serde_json::from_value(catalog()["home"]["scenes"]["inicio-base"].clone())
                        .unwrap(),
                );
                let fonts =
                    rune::text::TextSystem::new(crate::design::FONTS, ("Inter W400", "Space Mono"));
                let mut rt = rune::Runtime::with_text(
                    state,
                    crate::view,
                    (width, 900.0),
                    rune::Env::new(true, 1.0),
                    fonts,
                );
                for _ in 0..4 {
                    rt.frame(0.0);
                }
                let elements = rt.elements();
                let hero = elements
                    .iter()
                    .find(|e| e.key.as_deref() == Some("home-hero"))
                    .unwrap();
                if let Some(top) = hero_top {
                    assert_eq!(
                        hero.rect[1], top,
                        "core state must not shift Home vertically"
                    );
                }
                hero_top = Some(hero.rect[1]);
                for kind in ["standings", "relative", "fuel-strategy", "delta"] {
                    let tile = elements
                        .iter()
                        .find(|e| e.key.as_deref() == Some(&format!("home-template-{kind}")))
                        .unwrap();
                    let caption = elements
                        .iter()
                        .find(|e| {
                            e.key.as_deref() == Some(&format!("home-template-caption-{kind}"))
                        })
                        .unwrap();
                    assert!(caption.rect[0] >= tile.rect[0] - 0.1, "{width}: {kind}");
                    assert!(
                        caption.rect[0] + caption.rect[2] <= tile.rect[0] + tile.rect[2] + 0.1,
                        "{width}: {kind} caption must not invade its neighbor"
                    );
                }
            }
        }
    }
    #[test]
    fn activity_dates_convert_the_offset_and_reject_invalid_values() {
        let a = parsed_date("2026-10-05T18:02:00+02:00").unwrap();
        let b = parsed_date("2026-10-05T16:02:00Z").unwrap();
        assert_eq!(a.timestamp_millis(), b.timestamp_millis());
        assert_eq!(
            activity_date("2026-10-05T18:02:00+02:00"),
            activity_date("2026-10-05T16:02:00Z")
        );
        assert_eq!(
            a.with_timezone(&chrono::Utc)
                .format("%d/%m · %H:%M")
                .to_string(),
            "05/10 · 16:02"
        );
        for invalid in ["", "not a date", "2026-02-30T10:00:00Z"] {
            assert_eq!(activity_date(invalid), text("home.noDate"));
        }
    }
    #[test]
    fn shared_previews_decode_on_the_cpu_and_keep_authored_srgb_colors() {
        let theme = Theme::load("vantare", "dark").unwrap();
        let authored: serde_json::Value =
            serde_json::from_str(include_str!("../../hub-web/design/tokens.json")).unwrap();
        let expected = authored["themes"]["vantare"]["dark"]["ill-panel"]
            .as_str()
            .unwrap();
        let rgb = u32::from_str_radix(&expected.trim_start_matches('#')[..6], 16).unwrap();
        let encoded = resolve_svg("var(--ill-panel)", &theme);
        assert!(
            encoded.starts_with(&format!(
                "rgba({},{},{},",
                (rgb >> 16) & 255,
                (rgb >> 8) & 255,
                rgb & 255
            )),
            "linear colors must return to their authored sRGB bytes"
        );
        let assets = Assets::new(std::sync::Arc::new(|| {}), &theme);
        assert_eq!(
            home_assets::WIDGETS.len(),
            vantare_hub_host::home::HomeWidgetKind::ALL.len()
        );
        assert_eq!(assets.images.len(), home_assets::WIDGETS.len() + 4);
        for (kind, image) in assets.images {
            image
                .wait()
                .unwrap_or_else(|error| panic!("{kind}: {error:?}"));
        }
    }
    #[test]
    fn shared_svgs_resolve_in_every_palette_without_a_device() {
        let tokens: serde_json::Value =
            serde_json::from_str(include_str!("../../hub-web/design/tokens.json")).unwrap();
        for palette in tokens["themes"].as_object().unwrap().keys() {
            for scheme in ["dark", "light"] {
                let theme = Theme::load(palette, scheme).unwrap();
                for (_, svg) in home_assets::WIDGETS {
                    assert!(!resolve_svg(svg, &theme).contains("var(--"));
                }
            }
        }
    }
    #[test]
    fn home_hero_adapts_to_three_viewports_without_graphics() {
        for (width, height, expected) in [
            (1280.0, 720.0, 200.0),
            (1440.0, 900.0, 236.0),
            (1920.0, 1080.0, 300.0),
        ] {
            let mut state = crate::init();
            state.core.access.verified = true;
            let mut rt = rune::Runtime::new(
                state,
                crate::view,
                (width, height),
                rune::Env::new(true, 1.0),
            );
            for _ in 0..4 {
                rt.frame(0.0);
            }
            let hero = rt
                .elements()
                .into_iter()
                .find(|e| e.key.as_deref() == Some("home-hero"))
                .unwrap();
            assert!(
                (hero.rect[3] - expected).abs() < 0.1,
                "{width}x{height}: {:?}",
                hero.rect
            );
            for control in rt.elements().into_iter().filter(|e| e.focusable) {
                assert!(control.label.is_some_and(|label| !label.is_empty()));
            }
        }
    }
    #[test]
    fn circuit_aliases_match_electron_and_unknown_tracks_are_not_invented() {
        assert_eq!(track_key(None), Some("lemans_h"));
        assert_eq!(track_key(Some("Circuit de la Sarthe")), Some("lemans_h"));
        assert_eq!(track_key(Some("SPA Francorchamps")), Some("spa_h"));
        assert_eq!(track_key(Some("unknown track")), None);
    }
    #[test]
    fn preview_centers_the_union_and_preserves_the_relative_positions() {
        let value: HomeView =
            serde_json::from_value(catalog()["home"]["scenes"]["inicio-base"].clone()).unwrap();
        let boxes = preview_boxes(&value.layout, 300.0, 228.0);
        assert_eq!(boxes.len(), value.layout.widgets.len());
        for [x, y, w, h] in &boxes {
            assert!(*x >= 7.9 && *y >= 7.9 && x + w <= 292.1 && y + h <= 220.1);
        }
        let mut shifted = value.layout.clone();
        for widget in &mut shifted.widgets {
            widget.x -= 20_000;
            widget.y -= 20_000;
        }
        assert_eq!(preview_boxes(&shifted, 300.0, 228.0), boxes);
        shifted.widgets.clear();
        assert!(preview_boxes(&shifted, 300.0, 228.0).is_empty());
    }
}
