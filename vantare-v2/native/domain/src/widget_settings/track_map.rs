//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "TrackMapWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub show_track_label: bool,
    pub transparent: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            show_track_label: true,
            transparent: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showTrackLabel",
        "TrackMapFunctional dibuja el pie sin consultar showTrackLabel",
    )];
    #[must_use]
    pub fn normalized(&self) -> Self {
        self.clone()
    }
}
