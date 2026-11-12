//! Stored widget settings; extracted without changing serialization or normalization.
pub const GAP_MAX: f32 = 12.0;

pub const GAP_MIN: f32 = 0.0;

pub const DEFAULT_GAP: f32 = 2.0;

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Look: los layouts anteriores a #1566 no lo guardan y siguen en Eficiencia.
    #[serde(default = "eficiencia")]
    pub design_system: crate::look::Look,
    pub style: crate::look::Tone,
    pub accent: crate::look::Accent,
    /// Marca Vantare: decisión inyectada por el host según la licencia.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_visible: Option<bool>,
    pub transparent_background: bool,
    pub show_brake_peak: bool,
    pub gap: f32,
}

impl Default for Settings {
    fn default() -> Self {
        Self::for_look(crate::look::Look::default())
    }
}

impl Settings {
    /// El pico de frenada solo existe en el diseño Vantare.
    #[must_use]
    pub fn supports_brake_peak(&self) -> bool {
        self.design_system == crate::look::Look::Vantare
    }
}

impl Settings {
    /// Ajustes del sistema Eficiencia (captura de paridad y layouts anteriores).
    #[must_use]
    pub fn eficiencia() -> Self {
        Self::for_look(eficiencia())
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
            brand_visible: None,
            transparent_background: false,
            show_brake_peak: true,
            gap: DEFAULT_GAP,
        }
    }
}

impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
}

impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            gap: if self.gap.is_finite() {
                self.gap.clamp(GAP_MIN, GAP_MAX)
            } else {
                DEFAULT_GAP
            },
            ..self.clone()
        }
    }
}

fn eficiencia() -> crate::look::Look {
    crate::look::Look::Eficiencia
}
