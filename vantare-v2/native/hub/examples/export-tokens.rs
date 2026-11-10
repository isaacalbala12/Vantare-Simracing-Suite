//! One-time export for ADR 0107. The JSON becomes the web design source afterwards.
use serde_json::{Map, Value, json};
use vantare_hub::orbit::{
    self,
    skin::{Ramp, Skin},
    theme::{Palette, Scheme, Theme, design_tokens},
};
fn rgb(value: u32) -> String {
    format!("#{value:06x}")
}
fn rgba(value: u32) -> String {
    format!("#{value:08x}")
}
fn ramp(value: Ramp, angle: u16, alpha: bool) -> String {
    let color = if alpha { rgba } else { rgb };
    format!(
        "linear-gradient({angle}deg, {} 0%, {} {}%)",
        color(value.from),
        color(value.to),
        value.end * 100.0
    )
}
fn semantic_values(skin: &Skin) -> Map<String, Value> {
    let mut values = Map::new();
    values.insert("bg-base".into(), json!(rgb(skin.base)));
    values.insert("surface-1".into(), json!(rgb(skin.l1)));
    values.insert("surface-2".into(), json!(rgb(skin.l2)));
    values.insert("surface-3".into(), json!(rgb(skin.l3)));
    values.insert("surface-elevated".into(), json!(rgb(skin.el)));
    values.insert("text-1".into(), json!(rgb(skin.text1)));
    values.insert("text-2".into(), json!(rgb(skin.text2)));
    values.insert("text-3".into(), json!(rgb(skin.text3)));
    values.insert("text-caption".into(), json!(rgb(skin.cap)));
    values.insert("text-on-primary".into(), json!(rgb(skin.on_primary)));
    values.insert("accent".into(), json!(rgb(skin.accent)));
    values.insert("accent-bright".into(), json!(rgb(skin.accent_bright)));
    values.insert("accent-fill".into(), json!(rgb(skin.accent_fill)));
    values.insert("wine".into(), json!(rgb(skin.wine)));
    values.insert("ok".into(), json!(rgb(skin.ok)));
    values.insert("ok-tint".into(), json!(rgb(skin.ok_tint)));
    values.insert("warn".into(), json!(rgb(skin.warn)));
    values.insert("warn-tint".into(), json!(rgb(skin.warn_tint)));
    values.insert("err".into(), json!(rgb(skin.err)));
    values.insert("err-tint".into(), json!(rgb(skin.err_tint)));
    values.insert("wash".into(), json!(rgba(skin.wash)));
    values.insert("line-sidebar".into(), json!(rgba(skin.sidebar_line)));
    values.insert("neo-light".into(), json!(rgba(skin.neo_light)));
    values.insert("hover".into(), json!(rgba(skin.hover)));
    values.insert("active".into(), json!(rgba(skin.active)));
    values.insert("line-1".into(), json!(rgba(skin.line1)));
    values.insert("line-2".into(), json!(rgba(skin.line2)));
    values.insert("line-3".into(), json!(rgba(skin.line3)));
    values.insert("accent-tint".into(), json!(rgba(skin.accent_tint)));
    values.insert("hero-light".into(), json!(rgba(skin.hero_light)));
    values.insert("hero-ring".into(), json!(rgba(skin.hero_ring)));
    values.insert("now-light".into(), json!(rgba(skin.now_light)));
    values.insert("now-ring".into(), json!(rgba(skin.now_ring)));
    values.insert("nav-light".into(), json!(rgba(skin.nav_light)));
    values.insert("nav-ring".into(), json!(rgba(skin.nav_ring)));
    values.insert("selection".into(), json!(rgba(skin.selection)));
    values.insert("focus-ring".into(), json!(rgba(skin.selection)));
    values.insert("live-halo".into(), json!(rgba(skin.live_halo)));
    values.insert("progress-glow".into(), json!(rgba(skin.progress_glow)));
    values.insert("bg-window".into(), json!(rgb(skin.window.to)));
    values.insert("bg-sidebar".into(), json!(rgb(skin.sidebar.to)));
    values.insert("surface-panel".into(), json!(rgba((skin.l1 << 8) | 0xcc)));
    values.insert("grad-window".into(), json!(ramp(skin.window, 155, false)));
    values.insert("grad-sidebar".into(), json!(ramp(skin.sidebar, 180, false)));
    values.insert("grad-neo".into(), json!(ramp(skin.neo, 155, false)));
    values.insert("grad-hero".into(), json!(ramp(skin.hero, 118, false)));
    values.insert(
        "grad-hero-wash".into(),
        json!(ramp(skin.hero_wash, 160, true)),
    );
    values.insert("grad-now".into(), json!(ramp(skin.now, 120, false)));
    values.insert(
        "grad-now-wash".into(),
        json!(ramp(skin.now_wash, 160, true)),
    );
    values.insert(
        "grad-nav-active".into(),
        json!(ramp(skin.nav_active, 135, false)),
    );
    values.insert("grad-button".into(), json!(ramp(skin.button, 135, false)));
    values.insert(
        "grad-button-hover".into(),
        json!(ramp(skin.button_hover, 135, false)),
    );
    values.insert("grad-brand".into(), json!(ramp(skin.brand, 135, false)));
    values.insert("grad-live".into(), json!(ramp(skin.live, 90, false)));
    values.insert(
        "grad-progress".into(),
        json!(ramp(skin.progress, 90, false)),
    );
    values
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut themes = Map::new();
    let mut canonical = Value::Null;
    for palette in Palette::ALL {
        let mut schemes = Map::new();
        for (name, scheme) in [("light", Scheme::Light), ("dark", Scheme::Dark)] {
            let skin = Skin::resolve(palette, scheme);
            let _theme = Theme::resolve(palette, scheme, 100, 80);
            let design = design_tokens(&skin);
            if palette == Palette::Vantare && scheme == Scheme::Dark {
                canonical = json!({"geometry":{"sidebar":design.geometry.sidebar,"sidebarCollapsed":design.geometry.sidebar_collapsed,"gap":design.geometry.gap,"gutter":design.geometry.gutter,"controlHeight":design.geometry.control_height,"topbar":design.geometry.topbar},"fonts":{"body":design.fonts.body,"display":design.fonts.display,"mono":design.fonts.mono,"bodySize":design.fonts.body_size,"smallSize":design.fonts.small_size,"titleSize":design.fonts.title_size},"shadow":{"alpha":design.shadow.alpha,"blur":design.shadow.blur,"y":design.shadow.y}});
            }
            let values = semantic_values(&skin);
            schemes.insert(name.into(), Value::Object(values));
        }
        themes.insert(
            serde_json::to_value(palette)?
                .as_str()
                .ok_or("palette")?
                .into(),
            Value::Object(schemes),
        );
    }
    let first = themes
        .get("vantare")
        .and_then(|v| v.get("dark"))
        .and_then(Value::as_object)
        .ok_or("theme")?;
    let semantic: Vec<_> = first.keys().collect();
    let result = json!({"version":1, "source":"ADR 0107; native/hub orbit skin/theme", "semantic":semantic, "themes":themes,
        "primitives":{"nativeDesign":canonical, "row-h":orbit::ROW_H,"chip-h":orbit::CHIP_H,"pill-h":orbit::PILL_H,
          "text-body":orbit::BODY,"text-small":orbit::SECONDARY,"text-micro":orbit::MICRO,
          "control-h":36,"topbar-h":52,"sidebar-w":272,"sidebar-w-collapsed":76,
          "palette-w":orbit::PALETTE_W,"popover-w":orbit::POPOVER_W,"option-h":orbit::OPTION_H,
          "segment-h":orbit::SEGMENT_H,"field-w":orbit::FIELD_W,"textarea-h":orbit::TEXTAREA_H,
          "radius-xs":4,"radius-sm":6,"radius-md":8,"radius-lg":10,"radius-xl":14,"radius-panel":10,"radius-pill":999,
          "disabled-opacity":orbit::DISABLED,"z-menu":orbit::MENU_Z,"z-modal":orbit::MODAL_Z,"z-toast":110,
          "space":[4,6,8,9,12,14,16,20,28,32],"duration":[120,180,260]}});
    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(())
}
