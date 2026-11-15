//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "RadarWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_phrases: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self { show_phrases: true }
    }
}
impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        self.clone()
    }
    /// `RadarFunctional` no ofrece ajustes visuales ni de contenido.
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
}
