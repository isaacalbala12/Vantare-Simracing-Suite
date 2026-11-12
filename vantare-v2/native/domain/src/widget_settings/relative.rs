//! Stored widget settings; extracted without changing serialization or normalization.
pub const RELATIVE_SCOPES: &[&str] = &[RELATIVE_SCOPE_ALL, RELATIVE_SCOPE_SAME_CLASS];
pub const RELATIVE_VANTARE_COLUMNS: &[&str] = &[
    super::columns::COLUMN_METRIC_POSITION,
    super::columns::COLUMN_METRIC_CAR_NUMBER,
    super::columns::COLUMN_METRIC_DRIVER_NAME,
    super::columns::COLUMN_METRIC_VEHICLE,
    super::columns::COLUMN_METRIC_LAP_DELTA,
    super::columns::COLUMN_METRIC_DRIVER_RATING,
    super::columns::COLUMN_METRIC_SAFETY_RATING,
    super::columns::COLUMN_METRIC_TREND,
    super::columns::COLUMN_METRIC_GAP,
    super::columns::COLUMN_METRIC_TRACK_STRIP,
];
pub const RELATIVE_RANGE_MAX: usize = 8;
pub const RELATIVE_RANGE_MIN: usize = 0;
pub const RELATIVE_RANGE_STEP: usize = 1;
/// Only when content version is zero and the design system is Eficiencia (legacy).
pub const RELATIVE_LEGACY_EFICIENCIA_COLUMNS_MAX: usize = 7;
pub const RELATIVE_SCOPE_ALL: &str = "all";
pub const RELATIVE_SCOPE_SAME_CLASS: &str = "sameClass";
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "RelativeWidgetSettings"))]
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
    #[cfg_attr(feature = "bindings", ts(optional))]
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
            class_scope: RELATIVE_SCOPE_SAME_CLASS.into(),
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
        value.range_ahead = value.range_ahead.min(RELATIVE_RANGE_MAX);
        value.range_behind = value.range_behind.min(RELATIVE_RANGE_MAX);
        value.include_player = true;
        if value.content_version == 0 && value.design_system == crate::look::Look::Vantare {
            value.class_scope = RELATIVE_SCOPE_SAME_CLASS.into();
        } else if value.class_scope != RELATIVE_SCOPE_SAME_CLASS {
            value.class_scope = RELATIVE_SCOPE_ALL.into();
        }
        if value.row_height_mode != "fill" {
            value.row_height_mode = "compact".into();
        }
        value.footer_slots.truncate(super::FOOTER_ITEMS_MAX);
        if value.content_version == 0
            && value.design_system == crate::look::Look::Eficiencia
            && let Some(columns) = &mut value.columns
        {
            columns.truncate(RELATIVE_LEGACY_EFICIENCIA_COLUMNS_MAX);
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
