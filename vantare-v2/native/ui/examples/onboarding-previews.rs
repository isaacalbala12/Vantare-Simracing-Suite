//! Native preview geometry used by the frozen onboarding, without a window.
use std::{collections::BTreeMap, error::Error};
use vantare_domain::format::Preferences;
use vantare_ui::{Kind, Overlay, Settings};
pub(crate) fn bytes() -> Result<Vec<u8>, Box<dyn Error>> {
    let mut sizes = BTreeMap::new();
    for &kind in Kind::ALL {
        // Identical configuration to frozen shell/onboarding/mod.rs, not the
        // seeded widget defaults: its Standings preview has six rows.
        let mut settings = Settings::default_for(kind);
        if let Settings::Standings(value) = &mut settings {
            value.row_count = 6;
        }
        let overlay = Overlay::configured(&settings, Preferences::default());
        let (width, height) = overlay.wanted_size();
        if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
            return Err("invalid native preview size".into());
        }
        sizes.insert(kind.name(), [width, height]);
    }
    let mut bytes = serde_json::to_vec_pretty(&sizes)?;
    bytes.push(b'\n');
    Ok(bytes)
}
#[cfg_attr(test, allow(dead_code))] // Integration test includes the exporter without running main.
fn main() -> Result<(), Box<dyn Error>> {
    let output = std::env::args_os()
        .nth(1)
        .ok_or("usage: onboarding-previews <output.json>")?;
    std::fs::write(output, bytes()?)?;
    Ok(())
}
