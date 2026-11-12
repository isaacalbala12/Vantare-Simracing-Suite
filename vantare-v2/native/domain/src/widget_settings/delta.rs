//! Stored widget settings; extracted without changing serialization or normalization.
pub const DELTA_SIZE_PILL: &str = "pill";
pub const DELTA_SIZE_BAR: &str = "bar";
pub const DELTA_SIZE_EXPANDED: &str = "expanded";
pub const DELTA_SIZES: &[&str] = &[DELTA_SIZE_PILL, DELTA_SIZE_BAR, DELTA_SIZE_EXPANDED];
pub const DELTA_REFERENCE_BEST: &str = "best";
pub const DELTA_REFERENCE_OPTIMAL: &str = "optimal";
pub const DELTA_REFERENCE_LEADER: &str = "leader";
pub const DELTA_REFERENCES: &[&str] = &[
    DELTA_REFERENCE_BEST,
    DELTA_REFERENCE_OPTIMAL,
    DELTA_REFERENCE_LEADER,
];
pub const DELTA_TEMPLATE_INSTRUMENT: &str = "instrument";
pub const DELTA_TEMPLATE_CAPSULE: &str = "capsule";
pub const DELTA_TEMPLATES: &[&str] = &[DELTA_TEMPLATE_INSTRUMENT, DELTA_TEMPLATE_CAPSULE];
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "DeltaWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Sistema de diseño: Vantare (principal) o Eficiencia (heredado).
    pub design_system: crate::look::Look,
    #[serde(default)]
    pub content_version: u8,
    pub style: crate::look::Tone,
    pub accent: crate::look::Accent,
    /// Formato Vantare: `pill` (el del Studio), `bar` (380) o `expanded` (768).
    pub size: String,
    /// Referencia Vantare: `best`, `optimal` o `leader`.
    pub reference: String,
    pub show_bar: bool,
    pub show_sectors: bool,
    /// Solo se guarda cuando está activo: los layouts anteriores no cambian de bytes.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub transparent_background: bool,
    /// Marca Vantare: decisión inyectada por el host según la licencia.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_visible: Option<bool>,
    pub template_id: String,
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
            content_version: 1,
            style: crate::look::Tone::Neo,
            accent: crate::look::Accent::Red,
            size: DELTA_SIZE_PILL.into(),
            reference: DELTA_REFERENCE_BEST.into(),
            show_bar: true,
            show_sectors: true,
            transparent_background: false,
            brand_visible: None,
            template_id: DELTA_TEMPLATE_INSTRUMENT.into(),
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
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "reference=session-best",
            "No hay delta independiente frente a la mejor vuelta absoluta de la sesión; la mejor propia, óptima y líder sí están disponibles",
        ),
        (
            "reference=previous-lap",
            "Snapshot no publica una serie de la vuelta anterior",
        ),
    ];
}

impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            content_version: 1,
            template_id: if self.template_id == DELTA_TEMPLATE_CAPSULE {
                DELTA_TEMPLATE_CAPSULE
            } else {
                DELTA_TEMPLATE_INSTRUMENT
            }
            .into(),
            size: match self.size.as_str() {
                DELTA_SIZE_BAR | DELTA_SIZE_EXPANDED => self.size.clone(),
                _ => DELTA_SIZE_PILL.into(),
            },
            reference: match if self.content_version == 0
                && self.design_system == crate::look::Look::Eficiencia
            {
                DELTA_REFERENCE_BEST
            } else {
                self.reference.as_str()
            } {
                DELTA_REFERENCE_OPTIMAL | DELTA_REFERENCE_LEADER => self.reference.clone(),
                _ => DELTA_REFERENCE_BEST.into(),
            },
            ..self.clone()
        }
    }
}
