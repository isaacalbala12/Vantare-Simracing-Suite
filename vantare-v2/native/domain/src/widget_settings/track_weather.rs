//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "TrackWeatherWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
// Claves independientes del contrato productivo, aunque su renderer aún las ignora.
#[allow(clippy::struct_excessive_bools)]
pub struct Settings {
    /// Columna de 132 × 440 en vez de la tarjeta horizontal de 280 × 210.
    pub vertical: bool,
    pub show_ambient: bool,
    pub show_track: bool,
    pub show_rain: bool,
    pub show_wind: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            vertical: false,
            show_ambient: true,
            show_track: true,
            show_rain: true,
            show_wind: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "showAmbient",
            "TrackWeatherFunctional no consulta este filtro",
        ),
        (
            "showTrack",
            "TrackWeatherFunctional no consulta este filtro",
        ),
        ("showRain", "TrackWeatherFunctional no consulta este filtro"),
        ("showWind", "TrackWeatherFunctional no consulta este filtro"),
    ];
    #[must_use]
    pub fn normalized(&self) -> Self {
        self.clone()
    }
}
