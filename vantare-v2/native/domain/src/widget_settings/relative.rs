//! Stored widget settings; extracted without changing serialization or normalization.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Sistema de diseño: Vantare (principal) o Eficiencia (heredado).
    pub design_system: crate::look::Look,
    #[serde(default)]
    pub content_version: u8,
    pub style: crate::look::Tone,
    pub accent: crate::look::Accent,
    pub columns: Option<Vec<super::columns::ColumnSetting>>,
    pub range_ahead: usize,
    pub range_behind: usize,
    pub class_scope: String,
    pub include_player: bool,
    pub row_height_mode: String,
    pub footer_slots: Vec<String>,
    /// Marca Vantare: decisión inyectada por el host según la licencia
    /// (como en Standings). Sin decisión no se pinta.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_visible: Option<bool>,
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
            columns: None,
            range_ahead: 3,
            range_behind: 3,
            class_scope: "sameClass".into(),
            include_player: true,
            row_height_mode: "compact".into(),
            footer_slots: Vec::new(),
            brand_visible: None,
        }
    }
}

impl Settings {
    /// Relative del sistema Eficiencia heredado.
    #[must_use]
    pub fn eficiencia() -> Self {
        Self::for_look(crate::look::Look::Eficiencia)
    }
}

impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "includePlayer",
            "parseRelativeContent conserva siempre al jugador; el inspector productivo no ofrece ocultarlo",
        ),
        (
            "rowHeightMode",
            "RelativeFunctional conserva filas de 28 px; fill solo figura en su clave de presentación",
        ),
        (
            "columns.format.display/decimals",
            "el VM v2 productivo siempre formatea la vuelta completa con tres decimales",
        ),
    ];
}

impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut value = self.clone();
        value.range_ahead = value.range_ahead.min(8);
        value.range_behind = value.range_behind.min(8);
        value.include_player = true;
        if value.content_version == 0 && value.design_system == crate::look::Look::Vantare {
            value.class_scope = "sameClass".into();
        } else if value.class_scope != "sameClass" {
            value.class_scope = "all".into();
        }
        if value.row_height_mode != "fill" {
            value.row_height_mode = "compact".into();
        }
        value.footer_slots.truncate(9);
        if value.content_version == 0
            && value.design_system == crate::look::Look::Eficiencia
            && let Some(columns) = &mut value.columns
        {
            columns.truncate(7);
            columns.retain(|c| {
                [
                    "position",
                    "class",
                    "carNumber",
                    "driverName",
                    "gap",
                    "bestLap",
                    "lastLap",
                ]
                .contains(&c.metric_id.as_str())
            });
        }
        value.content_version = 1;
        value
    }
}
