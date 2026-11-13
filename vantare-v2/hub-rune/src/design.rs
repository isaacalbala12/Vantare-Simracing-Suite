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
pub fn label(theme: &Theme, value: impl Into<String>) -> El {
    text(value)
        .font(TextStyle::new(14.0, 400.0))
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
    pressable(
        col()
            .key(key)
            .padding(10.0)
            .radius(8.0)
            .fill(theme.color("active"))
            .label(value)
            .role("button")
            .focusable(true)
            .focus_ring(2.0, 2.0, theme.color("focus-ring"))
            .child(label(theme, value)),
        action,
    )
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
        .padding(10.0)
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
