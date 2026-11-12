//! Stored widget settings; extracted without changing serialization or normalization.
pub const FUEL_HISTORY_MIN: u8 = 1;
pub const FUEL_HISTORY_MAX: u8 = 8;
pub const FUEL_HISTORY_STEP: u8 = 1;
use crate::fuel_strategy;
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "FuelStrategyWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Sistema de diseño: Vantare (principal) o Eficiencia (heredado).
    pub design_system: crate::look::Look,
    pub style: crate::look::Tone,
    pub accent: crate::look::Accent,
    /// Tamaño Vantare: `compact` (230), `standard` (300) o `expanded` (460).
    pub size: String,
    /// Marca Vantare: decisión inyectada por el host según la licencia.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "bindings", ts(optional))]
    pub brand_visible: Option<bool>,
    #[serde(default)]
    pub content_version: u8,
    pub history_rows: u8,
    pub show_projection: bool,
    pub source: String,
    pub units: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self::for_look(crate::look::Look::default())
    }
}

impl Settings {
    /// Única fuente de los ajustes base: el Look cambia solo la presentación.
    #[must_use]
    pub fn for_look(design_system: crate::look::Look) -> Self {
        Self {
            design_system,
            style: crate::look::Tone::Neo,
            accent: crate::look::Accent::Red,
            size: super::TABLE_SIZE_STANDARD.into(),
            brand_visible: None,
            content_version: 1,
            history_rows: fuel_strategy::Config::default().history_rows,
            show_projection: fuel_strategy::Config::default().show_projection,
            source: "fuel".into(),
            units: "liters".into(),
        }
    }
}

impl Settings {
    /// Ajustes por defecto del sistema Eficiencia heredado.
    #[must_use]
    pub fn eficiencia() -> Self {
        Self::for_look(crate::look::Look::Eficiencia)
    }
}

impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "source=virtual-energy:live",
        "El Look Eficiencia conserva el estado histórico no disponible",
    )];
}

impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        let legacy_rich =
            self.content_version == 0 && self.design_system == crate::look::Look::Vantare;
        Self {
            content_version: 1,
            history_rows: if legacy_rich {
                4
            } else {
                self.history_rows.clamp(FUEL_HISTORY_MIN, FUEL_HISTORY_MAX)
            },
            show_projection: if legacy_rich {
                true
            } else {
                self.show_projection
            },
            source: if !legacy_rich && self.source == "virtual-energy" {
                "virtual-energy"
            } else {
                "fuel"
            }
            .into(),
            units: "liters".into(),
            size: match self.size.as_str() {
                super::TABLE_SIZE_COMPACT | super::TABLE_SIZE_EXPANDED => self.size.clone(),
                _ => super::TABLE_SIZE_STANDARD.into(),
            },
            ..self.clone()
        }
    }
}
