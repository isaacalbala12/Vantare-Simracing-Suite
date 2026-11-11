//! Stored widget settings; extracted without changing serialization or normalization.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
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
            size: "pill".into(),
            reference: "best".into(),
            show_bar: true,
            show_sectors: true,
            transparent_background: false,
            brand_visible: None,
            template_id: "instrument".into(),
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
            template_id: if self.template_id == "capsule" {
                "capsule"
            } else {
                "instrument"
            }
            .into(),
            size: match self.size.as_str() {
                "bar" | "expanded" => self.size.clone(),
                _ => "pill".into(),
            },
            reference: match if self.content_version == 0
                && self.design_system == crate::look::Look::Eficiencia
            {
                "best"
            } else {
                self.reference.as_str()
            } {
                "optimal" | "leader" => self.reference.clone(),
                _ => "best".into(),
            },
            ..self.clone()
        }
    }
}
