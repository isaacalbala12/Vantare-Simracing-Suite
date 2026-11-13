use rune::color::hex;
use rune::{Color, El, TextStyle, col, text};
use std::collections::BTreeMap;
const TOKENS: &str = include_str!("../../hub-web/design/tokens.json");
pub const COLORS: &[&str] = &[
    "bg-base",
    "surface-2",
    "text-3",
    "accent-bright",
    "accent-fill",
    "hero-ring",
    "wine",
    "text-on-accent",
    "accent-tint",
    "ill-bad",
    "ill-best",
    "ill-edge",
    "ill-good",
    "ill-hi",
    "ill-info",
    "ill-ink",
    "ill-ink-2",
    "ill-panel",
    "ill-row",
    "ill-warn",
    "bg-window",
    "bg-sidebar",
    "surface-1",
    "text-1",
    "text-2",
    "accent",
    "focus-ring",
    "line-1",
    "hover",
    "active",
];
pub const FONTS: &[&[u8]] = &[
    include_bytes!("../../native/ui/assets/fonts/Inter-400.ttf"),
    include_bytes!("../../native/ui/assets/fonts/Inter-500.ttf"),
    include_bytes!("../../native/ui/assets/fonts/Inter-600.ttf"),
    include_bytes!("../../native/ui/assets/fonts/Inter-650.ttf"),
    include_bytes!("../../native/ui/assets/fonts/Inter-700.ttf"),
    include_bytes!("../../native/ui/assets/fonts/Rajdhani.ttf"),
    include_bytes!("../../native/ui/assets/fonts/SpaceMono.ttf"),
];
#[derive(Clone)]
pub struct Theme(BTreeMap<&'static str, Color>);
impl Theme {
    pub fn load(palette: &str, scheme: &str) -> Result<Self, String> {
        let tokens: serde_json::Value = serde_json::from_str(TOKENS).map_err(|e| e.to_string())?;
        COLORS
            .iter()
            .map(|&name| {
                let value = tokens["themes"][palette][scheme][name]
                    .as_str()
                    .and_then(hex)
                    .ok_or_else(|| format!("Invalid theme color: {palette}/{scheme}/{name}"))?;
                Ok((name, value))
            })
            .collect::<Result<BTreeMap<_, _>, String>>()
            .map(Self)
    }
    pub fn color(&self, name: &str) -> Color {
        self.0[name]
    }
}
// The shared TTF's internal family is not the CSS alias used by Electron.
pub const DISPLAY_FAMILY: rune::Family = rune::Family::Named("Rajdhani SemiBold");
// Electron aliases independently instanced Inter files into one CSS family.
// Rune must name each file's internal family to select the requested weight.
pub fn body_style(size: f32, weight: f32) -> TextStyle {
    let family = if weight >= 700.0 {
        "Inter W700"
    } else if weight >= 650.0 {
        "Inter W650"
    } else if weight >= 600.0 {
        "Inter W600"
    } else if weight >= 500.0 {
        "Inter W500"
    } else {
        "Inter W400"
    };
    TextStyle::new(size, weight).family(rune::Family::Named(family))
}
pub fn display(theme: &Theme, value: impl Into<String>, size: f32) -> El {
    label(theme, value).font(body_style(size, 600.0).family(DISPLAY_FAMILY))
}
pub fn caption(theme: &Theme, value: &str) -> El {
    // Match Electron's TrackedCaps: separately laid out glyphs with physical-pixel spacing.
    let mut line = rune::row().gap(1.6).label(value).role("heading");
    for letter in value.to_uppercase().chars() {
        line = line.child(display(theme, letter.to_string(), 15.0).a11y_hidden());
    }
    line
}
pub fn symbol(theme: &Theme, name: &str, size: f32) -> El {
    rune::icon(crate::icons::shared_icon(name), size)
        .color(theme.color("text-2"))
        .a11y_hidden()
}
pub fn label(theme: &Theme, value: impl Into<String>) -> El {
    text(value)
        .font(body_style(14.0, 400.0))
        .color(theme.color("text-1"))
}
pub fn surface(theme: &Theme) -> El {
    col()
        .padding(16.0)
        .gap(12.0)
        .radius(12.0)
        .fill(theme.color("surface-1"))
        .border(1.0, theme.color("line-1"))
}
// Rune's native buttons activate on Space; match Electron's focused-button Enter too.
fn pressable<S: 'static>(element: El, action: impl Fn(&mut S) + 'static) -> El {
    let action = std::rc::Rc::new(action);
    let click = action.clone();
    element
        .on_press(move |state: &mut S| click(state))
        .on_key(move |state: &mut S, event, tx| {
            if event.key != rune::Key::Enter || event.mods != rune::Mods::default() {
                return false;
            }
            if !tx.key_repeat() {
                action(state);
            }
            true
        })
}
pub fn button<S: 'static>(
    theme: &Theme,
    key: &str,
    value: &str,
    action: impl Fn(&mut S) + 'static,
) -> El {
    button_content(
        theme,
        key,
        value,
        label(theme, value).font(body_style(14.0, 600.0)),
        action,
    )
}
pub fn button_content<S: 'static>(
    theme: &Theme,
    key: &str,
    value: &str,
    content: El,
    action: impl Fn(&mut S) + 'static,
) -> El {
    pressable(
        rune::row()
            .center()
            .key(key)
            .padding(10.0)
            .min_h(36.0)
            .radius(6.0)
            .fill(theme.color("active"))
            .label(value)
            .role("button")
            .focusable(true)
            .focus_ring(2.0, 2.0, theme.color("focus-ring"))
            .child(content),
        action,
    )
}
pub fn icon_button<S: 'static>(
    theme: &Theme,
    key: &str,
    value: &str,
    name: &str,
    action: impl Fn(&mut S) + 'static,
) -> El {
    button_content(theme, key, value, symbol(theme, name, 18.0), action)
        .size(36.0, 36.0)
        .padding(8.0)
        .fill(theme.color("bg-sidebar"))
}
pub fn menu_item<S: 'static>(
    theme: &Theme,
    key: &str,
    value: &str,
    selected: bool,
    collapsed: bool,
    image: El,
    action: impl Fn(&mut S) + 'static,
) -> El {
    let mut item = rune::row()
        .key(key)
        .w_full()
        .h(44.0)
        .center_y()
        .padding(12.0)
        .gap(12.0)
        .radius(8.0)
        .fill(theme.color(if selected { "active" } else { "bg-sidebar" }))
        .label(value)
        .role("button")
        .focusable(true)
        .focus_ring(2.0, 2.0, theme.color("focus-ring"))
        .child(image);
    if !collapsed {
        item = item.child(label(theme, value));
    }
    pressable(item, action)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn body_weights_use_the_authored_inter_instances_without_system_fallbacks() {
        let mut fonts = rune::text::TextSystem::new(FONTS, ("Inter W400", "Space Mono"));
        for (index, weight) in [400.0, 500.0, 600.0, 650.0, 700.0].into_iter().enumerate() {
            let layout = fonts.layout_rich("Perfil 0123", &[], body_style(14.0, weight), 1.0, None);
            let runs: Vec<_> = layout.lines().flat_map(|l| l.runs()).collect();
            assert!(!runs.is_empty());
            for run in runs {
                assert_eq!(run.font().data.as_ref(), FONTS[index], "weight {weight}");
            }
        }
    }
    #[test]
    fn display_titles_use_the_shared_rajdhani_face_instead_of_falling_back() {
        let mut fonts = rune::text::TextSystem::new(FONTS, ("Inter", "Inter"));
        let layout = fonts.layout_rich(
            "INICIO 0123",
            &[],
            TextStyle::new(15.0, 600.0).family(DISPLAY_FAMILY),
            1.0,
            None,
        );
        let runs: Vec<_> = layout.lines().flat_map(|l| l.runs()).collect();
        assert!(!runs.is_empty());
        for run in runs {
            assert_eq!(run.font().data.as_ref(), FONTS[5]);
        }
    }
    #[test]
    fn navigation_and_shell_icons_rasterize_without_a_graphics_device() {
        let mut fonts = rune::text::TextSystem::new(FONTS, ("Inter", "Inter"));
        for name in crate::catalog::catalog()["navigation"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["icon"].as_str().unwrap())
            .chain([
                "mark",
                "v-side",
                "v-palette",
                "clock",
                "pulse",
                "key",
                "play",
            ])
        {
            assert!(
                fonts
                    .icon_quad(crate::icons::shared_icon(name), 24, [0.0, 0.0])
                    .is_some(),
                "{name}"
            );
        }
        assert!(fonts.atlas.data.iter().any(|&pixel| pixel > 0));
    }
    #[test]
    fn all_eighteen_appearances_resolve_every_color_used_by_components() {
        let tokens: serde_json::Value = serde_json::from_str(TOKENS).unwrap();
        assert_eq!(tokens["themes"].as_object().unwrap().len(), 9);
        for palette in tokens["themes"].as_object().unwrap().keys() {
            for scheme in ["light", "dark"] {
                let theme = Theme::load(palette, scheme).unwrap();
                for &color in COLORS {
                    let _ = theme.color(color);
                }
            }
        }
        assert!(Theme::load("missing", "dark").is_err());
    }
}
