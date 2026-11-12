//! Stored widget settings; extracted without changing serialization or normalization.
pub const STANDINGS_FOOTER_METRICS: &[&str] = &[
    STANDINGS_INFO_NONE,
    STANDINGS_INFO_TRACK,
    STANDINGS_INFO_ESTIMATED_LAPS,
];
pub const STANDINGS_CLASSIFICATION_MODES: &[&str] = &[
    STANDINGS_CLASSIFICATION_NORMAL,
    STANDINGS_CLASSIFICATION_MULTICLASS,
];
pub const STANDINGS_SCOPES: &[&str] = &[STANDINGS_SCOPE_PLAYER_CLASS, STANDINGS_SCOPE_ALL_CLASSES];
pub const STANDINGS_VANTARE_COLUMNS: &[&str] = &[
    super::columns::COLUMN_METRIC_POSITION,
    super::columns::COLUMN_METRIC_POSITIONS_GAINED,
    super::columns::COLUMN_METRIC_DRIVER_NUMBER,
    super::columns::COLUMN_METRIC_DRIVER_NAME,
    super::columns::COLUMN_METRIC_VEHICLE,
    super::columns::COLUMN_METRIC_TIRE_COMPOUND,
    super::columns::COLUMN_METRIC_PIT,
    super::columns::COLUMN_METRIC_SECTORS,
    super::columns::COLUMN_METRIC_LAST_LAP,
    super::columns::COLUMN_METRIC_BEST_LAP,
    super::columns::COLUMN_METRIC_INTERVAL,
    super::columns::COLUMN_METRIC_GAP,
];
pub const STANDINGS_ROWS_MIN: usize = 1;
pub const STANDINGS_ROWS_MAX: usize = 30;
pub const STANDINGS_ROWS_STEP: usize = 1;
pub const STANDINGS_COLUMNS_MAX: usize = 12;
pub const STANDINGS_CLASSIFICATION_NORMAL: &str = "normal";
pub const STANDINGS_CLASSIFICATION_MULTICLASS: &str = "multiclass";
pub const STANDINGS_TEMPLATE_SIGNATURE: &str = "signature";
pub const STANDINGS_TEMPLATE_BROADCAST: &str = "broadcast";
pub const STANDINGS_TEMPLATES: &[&str] =
    &[STANDINGS_TEMPLATE_SIGNATURE, STANDINGS_TEMPLATE_BROADCAST];
pub const STANDINGS_SCOPE_PLAYER_CLASS: &str = "player-class";
pub const STANDINGS_SCOPE_ALL_CLASSES: &str = "all-classes";
pub const STANDINGS_WINDOW_AROUND: &[usize] = &[0, 2, 4, 6, 8];
pub const STANDINGS_INFO_NONE: &str = "none";
pub const STANDINGS_INFO_TRACK_TEMPERATURE: &str = "trackTemperature";
pub const STANDINGS_INFO_AIR_TEMPERATURE: &str = "airTemperature";
pub const STANDINGS_INFO_ESTIMATED_LAPS: &str = "estimatedLaps";
pub const STANDINGS_INFO_TOTAL_LAPS: &str = "totalLaps";
pub const STANDINGS_INFO_TRACK: &str = "track";
pub const STANDINGS_INFO_REMAINING: &str = "remaining";
pub const STANDINGS_INFO_RAIN: &str = "rain";
pub const STANDINGS_INFO_WETNESS: &str = "wetness";
pub const STANDINGS_INFORMATION_KEYS: &[&str] = &[
    STANDINGS_INFO_NONE,
    STANDINGS_INFO_TRACK_TEMPERATURE,
    STANDINGS_INFO_AIR_TEMPERATURE,
    STANDINGS_INFO_ESTIMATED_LAPS,
    STANDINGS_INFO_TOTAL_LAPS,
    STANDINGS_INFO_TRACK,
    STANDINGS_INFO_REMAINING,
    STANDINGS_INFO_RAIN,
    STANDINGS_INFO_WETNESS,
];
use super::columns as options;
use super::look::{Accent, Look, Tone};
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "bindings", ts(rename = "StandingsWidgetSettings"))]
#[serde(default, rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // Opciones productivas independientes, no estados excluyentes.
pub struct Settings {
    pub design_system: Look,
    /// V1: contenido normalizado antes de separar su Look (layouts antiguos migran en memoria).
    #[serde(default)]
    pub content_version: u8,
    pub style: Tone,
    pub accent: Accent,
    pub row_count: usize,
    /// Columnas de carrera y, en layouts anteriores a #1564, de todas las sesiones.
    pub columns: Option<Vec<options::ColumnSetting>>,
    /// Pestañas Práctica y Qualy (#1564); `None` usa `columns`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "bindings", ts(optional))]
    pub practice_columns: Option<Vec<options::ColumnSetting>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "bindings", ts(optional))]
    pub qualifying_columns: Option<Vec<options::ColumnSetting>>,
    pub class_scope: String,
    pub classification_mode: String,
    pub player_window: bool,
    pub window_around: usize,
    pub show_session_header: bool,
    pub template_id: String,
    pub header_first: String,
    pub header_second: String,
    pub show_session_footer: bool,
    pub footer_first: String,
    pub footer_second: String,
    pub show_brand: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "bindings", ts(optional))]
    pub brand_visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "bindings", ts(optional))]
    pub footer_slots: Option<Vec<String>>,
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
            style: Tone::Neo,
            accent: Accent::Red,
            row_count: 20,
            columns: None,
            practice_columns: None,
            qualifying_columns: None,
            class_scope: STANDINGS_SCOPE_PLAYER_CLASS.into(),
            classification_mode: STANDINGS_CLASSIFICATION_NORMAL.into(),
            player_window: false,
            window_around: 4,
            show_session_header: true,
            template_id: STANDINGS_TEMPLATE_SIGNATURE.into(),
            header_first: STANDINGS_INFO_NONE.into(),
            header_second: STANDINGS_INFO_NONE.into(),
            show_session_footer: true,
            footer_first: STANDINGS_INFO_TRACK.into(),
            footer_second: STANDINGS_INFO_ESTIMATED_LAPS.into(),
            show_brand: false,
            brand_visible: None,
            footer_slots: None,
        }
    }
}

impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "headerFirst/headerSecond",
        "claves legacy: Eficiencia eliminó la segunda banda de información",
    )];
}

impl Settings {
    /// Standings del sistema Eficiencia heredado (Signature por defecto).
    #[must_use]
    pub fn eficiencia() -> Self {
        Self::for_look(crate::look::Look::Eficiencia)
    }
}

impl Settings {
    #[must_use]
    pub fn normalized(&self) -> Self {
        let mut settings = self.clone();
        settings.row_count = settings
            .row_count
            .clamp(STANDINGS_ROWS_MIN, STANDINGS_ROWS_MAX);
        if settings.class_scope != STANDINGS_SCOPE_ALL_CLASSES {
            settings.class_scope = STANDINGS_SCOPE_PLAYER_CLASS.into();
        }
        if settings.classification_mode != STANDINGS_CLASSIFICATION_MULTICLASS {
            settings.classification_mode = STANDINGS_CLASSIFICATION_NORMAL.into();
        }
        if settings.content_version == 0 && settings.design_system == Look::Vantare {
            settings.class_scope =
                if settings.classification_mode == STANDINGS_CLASSIFICATION_MULTICLASS {
                    STANDINGS_SCOPE_ALL_CLASSES
                } else {
                    STANDINGS_SCOPE_PLAYER_CLASS
                }
                .into();
        }
        settings.content_version = 1;
        if !STANDINGS_WINDOW_AROUND.contains(&settings.window_around) {
            settings.window_around = 4;
        }
        for columns in [
            &mut settings.columns,
            &mut settings.practice_columns,
            &mut settings.qualifying_columns,
        ]
        .into_iter()
        .flatten()
        {
            columns.truncate(STANDINGS_COLUMNS_MAX);
        }
        if let Some(slots) = &mut settings.footer_slots {
            slots.truncate(super::FOOTER_ITEMS_MAX);
        }

        if !STANDINGS_TEMPLATES.contains(&settings.template_id.as_str()) {
            settings.template_id = STANDINGS_TEMPLATE_SIGNATURE.into();
        }
        let choices = STANDINGS_INFORMATION_KEYS;
        for (value, fallback) in [
            (&mut settings.header_first, STANDINGS_INFO_NONE),
            (&mut settings.header_second, STANDINGS_INFO_NONE),
            (&mut settings.footer_first, STANDINGS_INFO_TRACK),
            (&mut settings.footer_second, STANDINGS_INFO_ESTIMATED_LAPS),
        ] {
            if !choices.contains(&value.as_str()) {
                *value = fallback.into();
            }
        }
        settings
    }
}
