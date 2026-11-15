//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "FastestLapWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_personal: bool,
    pub show_class: bool,
    pub duration_seconds: u8,
    pub show_driver: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_personal: true,
            show_class: true,
            duration_seconds: 6,
            show_driver: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            duration_seconds: self.duration_seconds.clamp(3, 15),
            ..self.clone()
        }
    }
}
