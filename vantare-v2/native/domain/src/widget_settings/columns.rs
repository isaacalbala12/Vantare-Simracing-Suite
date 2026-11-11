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

impl ColumnSetting {
    pub fn relative_width(&self) -> f32 {
        match self.width_preset.as_str() {
            "xs" => 20.0,
            "sm" => 36.0,
            "md" => 60.0,
            "lg" => 90.0,
            _ => match self.metric_id.as_str() {
                "position" => 24.0,
                "class" => 6.0,
                "carNumber" => 28.0,
                "driverName" => 120.0,
                "gap" => 48.0,
                _ => 62.0,
            },
        }
    }
}
impl ColumnSetting {
    pub fn driver_name(&self, value: &str) -> String {
        vantare_domain::standings::driver_name(
            value,
            &self.format.mode,
            self.format.max_chars.unwrap_or(16).min(64),
        )
    }
}
