//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "BroadcastTowerWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub driver_carousel: bool,
    pub row_count: usize,
    pub show_weather: bool,
    /// SOF está desactivado también en el contrato Eficiencia productivo.
    pub show_sof: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            driver_carousel: false,
            row_count: 11,
            show_weather: false,
            show_sof: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showSof",
        "Eficiencia no ofrece SOF y Snapshot no transporta rating",
    )];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.row_count = value.row_count.clamp(3, 11);
        value.show_sof = false;
        value
    }
}
