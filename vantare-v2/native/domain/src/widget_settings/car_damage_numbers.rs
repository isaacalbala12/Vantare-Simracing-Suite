//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "CarDamageNumbersWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_tyres: bool,
    pub format: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_tyres: true,
            format: "percent".into(),
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            format: "percent".into(),
            ..self.clone()
        }
    }
}
