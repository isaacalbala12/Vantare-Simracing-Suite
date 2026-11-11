//! Serialized column options shared by the table widgets.
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Format {
    pub mode: String,
    pub max_chars: Option<usize>,
    pub display: Option<String>,
    pub decimals: Option<u8>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Style {
    pub align: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ColumnSetting {
    pub id: String,
    pub metric_id: String,
    pub enabled: bool,
    pub width_preset: String,
    pub format: Format,
    pub style: Style,
}
impl Default for ColumnSetting {
    fn default() -> Self {
        Self {
            id: String::new(),
            metric_id: String::new(),
            enabled: true,
            width_preset: "auto".into(),
            format: Format::default(),
            style: Style::default(),
        }
    }
}
