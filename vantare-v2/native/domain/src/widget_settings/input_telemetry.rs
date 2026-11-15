//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "InputTelemetryWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub history_seconds: u8,
    pub show_clutch: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            history_seconds: 6,
            show_clutch: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            history_seconds: self.history_seconds.clamp(1, 8),
            ..self.clone()
        }
    }
}
