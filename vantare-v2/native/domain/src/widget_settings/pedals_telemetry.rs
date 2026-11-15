//! Stored settings extracted without changing wire bytes or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "PedalsTelemetryWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub steering_wheel: String,
    pub show_clutch: bool,
    /// Eficiencia no dibuja posición aunque el contenido general la conserve.
    pub show_position: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            steering_wheel: "generic".into(),
            show_clutch: true,
            show_position: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "showPosition",
        "PedalsAdvancedEfficiency no dibuja posición",
    )];

    #[must_use]
    pub fn normalized(&self) -> Self {
        if crate::pedals_telemetry::WHEELS.contains(&self.steering_wheel.as_str()) {
            self.clone()
        } else {
            Self {
                steering_wheel: "generic".into(),
                ..self.clone()
            }
        }
    }
}
