//! Tokens congelados desde 261725b7 antes de retirar campos sin consumidores.
use super::*;
fn retained_tokens(t: &Theme) -> serde_json::Value {
    let colors = [
        t.coral,
        t.ember,
        t.red,
        t.cyan,
        t.bronze,
        t.silver,
        t.ink_4,
        t.white,
        t.line_chip,
        t.line_pill,
        t.primary_bg,
        t.canvas,
        t.surface_1,
        t.surface_2,
        t.surface_3,
        t.column_bg,
        t.ink,
        t.ink_2,
        t.ink_3,
        t.ink_muted,
        t.carmine,
        t.carmine_dark,
        t.green,
        t.line,
        t.line_strong,
        t.line_row,
        t.rail_bg,
        t.palette_backdrop,
        t.menu_shadow_color,
        t.palette_shadow_color,
        t.surface_0,
        t.panel_bg,
        t.topbar_bg,
        t.ink_5,
        t.scroll_thumb,
        t.scroll_thumb_hover,
        t.scroll_thumb_idle,
        t.scroll_track,
        t.accent_rgb,
        t.danger,
        t.danger_rgb,
        t.cyan_soft,
        t.wine,
        t.tier_bronze,
        t.tier_silver,
        t.tier_gold,
        t.tyre_soft,
        t.tyre_medium,
        t.tyre_hard,
        t.primary_ink,
    ];
    serde_json::json!({
        "colors": colors.as_slice(),
        "palette": t.palette, "scheme": t.scheme,
        "contrast": t.contrast, "glassOpacity": t.glass_opacity,
        "interfaceFont": t.interface_font, "monoFont": t.mono_font,
        "fontSans": t.font_sans, "fontMono": t.font_mono,
        "scrollSize": t.scroll_size, "panelBlur": t.panel_blur,
        "stage": [t.stage.accent, t.stage.top, t.stage.base],
    })
}

fn all_tokens() -> serde_json::Value {
    let mut tokens = Vec::new();
    for palette in [
        Palette::Vantare,
        Palette::Rose,
        Palette::Grove,
        Palette::Ocean,
        Palette::Ember,
        Palette::Iris,
        Palette::Mono,
    ] {
        for scheme in [Scheme::Dark, Scheme::Light] {
            tokens.push(retained_tokens(&Theme::resolve(palette, scheme, 100, 80)));
        }
    }
    serde_json::json!({"colorFields": ["coral", "ember", "red", "cyan", "bronze", "silver", "ink_4", "white", "line_chip", "line_pill", "primary_bg", "canvas", "surface_1", "surface_2", "surface_3", "column_bg", "ink", "ink_2", "ink_3", "ink_muted", "carmine", "carmine_dark", "green", "line", "line_strong", "line_row", "rail_bg", "palette_backdrop", "menu_shadow_color", "palette_shadow_color", "surface_0", "panel_bg", "topbar_bg", "ink_5", "scroll_thumb", "scroll_thumb_hover", "scroll_thumb_idle", "scroll_track", "accent_rgb", "danger", "danger_rgb", "cyan_soft", "wine", "tier_bronze", "tier_silver", "tier_gold", "tyre_soft", "tyre_medium", "tyre_hard", "primary_ink"], "tokens": tokens})
}

#[test]
fn all_palette_tokens_remain_identical_to_the_frozen_base() {
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("theme_tokens.json")).expect("fixture válida");
    assert_eq!(all_tokens(), expected);
}
