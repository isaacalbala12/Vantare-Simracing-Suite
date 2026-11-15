//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "HeadToHeadWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub target: String,
    /// Muestra los sectores fiables de la última vuelta y la mejor vuelta.
    pub show_sectors: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            target: "ahead".into(),
            show_sectors: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];

    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut settings = self.clone();
        if settings.target != "behind" {
            settings.target = "ahead".into();
        }
        settings
    }
}
