//! Pure appearance migration copied from the frozen Hub.
use super::model::{AppearanceSettings, Palette};
/// Versión de las claves: Vantare = grafito, Classic = carmín desde el feedback 7.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredAppearance {
    pub palette_version: u8,
    #[serde(flatten)]
    pub settings: AppearanceSettings,
}

pub(crate) fn read_settings(
    value: &serde_json::Value,
) -> Result<AppearanceSettings, vantare_ipc::files::Error> {
    vantare_ipc::files::future_version(value, "paletteVersion", 1)?;
    let legacy = value.get("paletteVersion").is_none();
    let mut settings: AppearanceSettings =
        serde_json::from_value(value.clone()).map_err(|error| {
            vantare_ipc::files::Error::InvalidInput(format!("leer apariencia: {error}"))
        })?;
    if legacy && value.get("palette").is_some() {
        settings.palette = match settings.palette {
            Palette::Vantare => Palette::Classic,
            Palette::Classic => Palette::Vantare,
            other => other,
        };
    }
    settings.contrast = settings.contrast.clamp(80, 120);
    settings.glass_opacity = settings.glass_opacity.clamp(50, 100);
    Ok(settings)
}
