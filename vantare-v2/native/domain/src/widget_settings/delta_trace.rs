//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "DeltaTraceWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub reference: String,
    pub window_seconds: f64,
    pub show_sectors: bool,
    pub show_track_map: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            reference: "best".into(),
            window_seconds: 4.0,
            show_sectors: true,
            show_track_map: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "showSectors",
            "El diseño mantiene los indicadores de sector en el pie",
        ),
        (
            "showTrackMap",
            "Snapshot no publica trackPath ni turnInsight",
        ),
    ];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            reference: match self.reference.as_str() {
                "optimal" | "leader" => self.reference.clone(),
                _ => "best".into(),
            },
            window_seconds: if self.window_seconds.is_finite() {
                self.window_seconds.clamp(1.0, 8.0)
            } else {
                4.0
            },
            ..self.clone()
        }
    }
}
