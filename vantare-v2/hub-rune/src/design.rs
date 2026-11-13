use rune::color::hex;
use rune::{Color, El, TextStyle, col, text};
use std::collections::BTreeMap;
const TOKENS: &str = include_str!("../../hub-web/design/tokens.json");
pub const COLORS: &[&str] = &[
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
    include_bytes!("../../native/ui/assets/fonts/Inter-700.ttf"),
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
    pub fn color(&self, name: &'static str) -> Color {
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
pub fn button<S: 'static>(
    theme: &Theme,
    key: &str,
    value: &str,
    action: impl Fn(&mut S) + 'static,
) -> El {
    col()
        .key(key)
        .padding(10.0)
        .radius(8.0)
        .fill(theme.color("active"))
        .label(value)
        .role("button")
        .focusable(true)
        .focus_ring(2.0, 2.0, theme.color("focus-ring"))
        .child(label(theme, value))
        .on_press(action)
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
        .child(image)
        .on_press(action);
    if !collapsed {
        item = item.child(label(theme, value));
    }
    item
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
