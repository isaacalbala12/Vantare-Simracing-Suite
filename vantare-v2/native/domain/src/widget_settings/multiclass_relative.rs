//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "MulticlassRelativeWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub row_count: usize,
    pub class_mode: String,
    pub show_class_divider: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            row_count: 7,
            class_mode: "all".into(),
            show_class_divider: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.row_count = crate::multiclass_relative::row_count(value.row_count);
        if !["all", "same", "other"].contains(&value.class_mode.as_str()) {
            value.class_mode = "all".into();
        }
        value
    }
}
