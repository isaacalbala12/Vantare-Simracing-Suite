//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "RacingFlagsWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// 0 identifica el color negro heredado, antes ignorado por este pintor.
    #[serde(default)]
    pub content_version: u8,
    pub text_color: String,
    pub show_sector_flags: bool,
    pub hide_when_green: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            content_version: 1,
            text_color: "#ece6e7".into(),
            show_sector_flags: true,
            hide_when_green: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];

    #[must_use]
    pub fn normalized(&self) -> Self {
        let value = self.text_color.as_bytes();
        let legacy_black = self.content_version == 0 && self.text_color == "#000000";
        if !legacy_black
            && value.len() == 7
            && value[0] == b'#'
            && value[1..].iter().all(u8::is_ascii_hexdigit)
        {
            Self {
                content_version: self.content_version.max(1),
                text_color: self.text_color.to_ascii_lowercase(),
                ..self.clone()
            }
        } else {
            Self {
                content_version: self.content_version.max(1),
                text_color: Self::default().text_color,
                ..self.clone()
            }
        }
    }
}
