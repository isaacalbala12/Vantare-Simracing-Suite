//! Export the frozen Hub's new-widget defaults without starting GPUI or a window.
use std::{collections::BTreeMap, error::Error};
use vantare_domain::format::Preferences;
use vantare_ui::{Kind, Overlay, Settings};
fn canonical(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(fields) => {
            let sorted: BTreeMap<_, _> = fields
                .into_iter()
                .map(|(key, value)| (key, canonical(value)))
                .collect();
            serde_json::Value::Object(sorted.into_iter().collect())
        }
        serde_json::Value::Array(values) => {
            serde_json::Value::Array(values.into_iter().map(canonical).collect())
        }
        other => other,
    }
}
pub(crate) fn bytes() -> Result<Vec<u8>, Box<dyn Error>> {
    let mut widgets = BTreeMap::new();
    for &kind in Kind::ALL {
        // Identical to the frozen Hub's Editor::new_settings (document.rs).
        let mut settings = Settings::default_for(kind);
        if let Settings::Standings(value) = &mut settings {
            value.apply_session_presets();
        }
        // configured + wanted_size is pure model construction; no App, Window or device.
        let overlay = Overlay::configured(&settings, Preferences::default());
        let (width, height) = overlay.wanted_size();
        if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
            return Err("invalid native widget size".into());
        }
        widgets.insert(
            kind.name(),
            serde_json::json!({"settings":settings,"size":{"width":width,"height":height}}),
        );
    }
    let value = canonical(serde_json::json!({"version":1,"widgets":widgets}));
    let mut bytes = serde_json::to_vec_pretty(&value)?;
    bytes.push(b'\n');
    Ok(bytes)
}
#[cfg_attr(test, allow(dead_code))] // The integration test includes this exporter but never invokes its writer.
fn main() -> Result<(), Box<dyn Error>> {
    let output = std::env::args_os()
        .nth(1)
        .ok_or("usage: widget-defaults <output.json>")?;
    std::fs::write(output, bytes()?)?;
    Ok(())
}
