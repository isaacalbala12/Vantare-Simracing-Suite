//! First Home slice: host data, preview and navigation. Launch actions follow separately.
use crate::{
    State,
    catalog::{catalog, text},
    design::{Theme, button, label, surface},
    home_assets,
};
use rune::{Cx, El, Family, Image, ImageCache, SurfaceFit, TextStyle, col, el, row};
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
            "background".into(),
            self.cache.svg(
                include_bytes!("../../hub-web/src/renderer/assets/widgets/home-preview-bg.svg")
                    .as_slice(),
                454.0,
                2.0,
            ),
        );
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
fn heading(theme: &Theme, value: &str) -> El {
    label(theme, value)
        .font(TextStyle {
            family: Family::Named("Rajdhani"),
            ..TextStyle::new(15.0, 600.0)
        })
        .role("heading")
}
fn message(theme: &Theme, value: &str) -> El {
    label(theme, value).role("status")
}
fn card(theme: &Theme, key: &str, title: &str) -> El {
    surface(theme)
        .key(key)
        .grow(1.0)
        .min_w(0.0)
        .gap(8.0)
        .child(heading(theme, title))
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
pub fn view(state: &State, cx: &Cx<State>) -> El {
    let theme = &state.theme;
    let data = state.home.value.as_ref();
    let mut page = col().key("home").w_full().gap(12.0).padding(24.0);
    if state.home.failed || state.core.access.blocked || data.is_some_and(|v| v.protected) {
        page = page.child(
            surface(theme)
                .key("home-error")
                .role("status")
                .child(label(
                    theme,
                    text(if data.is_some_and(|v| v.protected) {
                        "home.protected"
                    } else {
                        "home.accessError"
                    }),
                ))
                .child(button(
                    theme,
                    "home-retry",
                    text("home.retry"),
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
    let hero = col()
        .key("home-hero")
        .w_full()
        .h(236.0)
        .padding(24.0)
        .gap(8.0)
        .radius(12.0)
        .gradient(theme.color("wine"), theme.color("bg-base"))
        .border(1.0, theme.color("hero-ring"))
        .child(message(theme, sim))
        .child(label(theme, text("home.welcome")).font(TextStyle {
            family: Family::Named("Rajdhani"),
            ..TextStyle::new(46.0, 600.0)
        }))
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
        .child(studio_button(state, "home-studio", text("home.studio")));
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
                .child(heading(theme, text("home.layout")))
                .child(label(theme, text("home.preview")))
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
                    label(
                        theme,
                        catalog()["home"]["widgets"][widget.kind.key()]
                            .as_str()
                            .unwrap(),
                    )
                    .key(format!("home-chip-{index}")),
                );
            }
            if value.layout.widgets.len() > 3 {
                chips = chips.child(label(
                    theme,
                    catalog()["home"]["plus"]
                        .as_str()
                        .unwrap()
                        .replace("917", &(value.layout.widgets.len() - 3).to_string()),
                ));
            }
            overlay = overlay
                .child(chips)
                .child(
                    row()
                        .gap(16.0)
                        .child(
                            label(theme, format!("{}\n{}", text("home.dash"), text("home.hz")))
                                .grow(1.0),
                        )
                        .child(
                            label(
                                theme,
                                format!("{}\n{}", value.layout.widgets.len(), text("home.visible")),
                            )
                            .grow(1.0),
                        )
                        .child(
                            label(
                                theme,
                                format!("{}\n{}", text("home.dash"), text("home.cpu")),
                            )
                            .grow(1.0),
                        ),
                )
                .child(studio_button(state, "home-edit", text("home.edit")));
        }
        let mut profiles: Vec<_> = value
            .profiles
            .iter()
            .filter(|p| p.last_launched_at.is_some())
            .collect();
        profiles.sort_by_cached_key(|p| std::cmp::Reverse(p.last_launched_at.clone()));
        if profiles.is_empty() {
            activity = activity
                .child(message(theme, text("home.noActivity")))
                .child(label(theme, text("home.activityDescription")));
        }
        for profile in profiles.into_iter().take(8) {
            activity = activity.child(
                col()
                    .key(format!("home-activity-{}", profile.id))
                    .gap(4.0)
                    .child(label(
                        theme,
                        catalog()["home"]["lastLaunch"]
                            .as_str()
                            .unwrap()
                            .replace("__VANTARE_NAME__", &profile.name),
                    ))
                    .child(label(
                        theme,
                        profile
                            .last_launched_at
                            .as_deref()
                            .unwrap_or(text("home.noDate")),
                    )),
            );
        }
    } else {
        overlay = overlay.child(message(theme, text("home.loading")));
        activity = activity.child(message(theme, text("home.loading")));
    }
    page = page.child(row().gap(12.0).child(overlay).child(activity));
    let mut rail = col()
        .key("home-rail")
        .w(300.0)
        .h_full()
        .padding(16.0)
        .gap(12.0)
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .fill(theme.color("bg-sidebar"))
        .child(heading(theme, text("home.status")));
    if let Some(value) = data {
        let favorite = value
            .profiles
            .iter()
            .find(|p| Some(&p.id) == value.favorite.as_ref());
        rail = rail
            .child(label(theme, text("home.lmu")))
            .child(message(theme, sim))
            .child(label(theme, text("home.favorite")))
            .child(label(
                theme,
                favorite.map_or(text("home.noFavorite"), |p| &p.name),
            ))
            .child(label(theme, text("home.betaTitle")))
            .child(label(theme, &value.version));
        if let LaunchProgress::Running { text: progress } = &value.launch {
            rail = rail
                .child(message(theme, text("home.launching")))
                .child(message(theme, progress));
        }
        if state.core.access.verified && !state.core.access.blocked && state.core.access.tester {
            rail = rail
                .child(label(theme, text("home.testing")))
                .child(label(theme, text("home.testerAccess")));
        }
    } else {
        rail = rail.child(message(theme, text("home.loading")));
    }
    rail = rail.child(heading(theme, text("home.templates")));
    for (index, kind) in ["standings", "relative", "fuel-strategy", "delta"]
        .into_iter()
        .enumerate()
    {
        let title = catalog()["home"]["templates"][index].as_str().unwrap();
        rail = rail
            .child(
                picture(state, kind, 260.0, 92.0, false)
                    .role("img")
                    .label(title),
            )
            .child(studio_button(
                state,
                &format!("home-template-{kind}"),
                title,
            ));
    }
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
        assert_eq!(assets.images.len(), home_assets::WIDGETS.len() + 1);
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
