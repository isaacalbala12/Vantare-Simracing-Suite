//! Stored widget settings; extracted without changing serialization or normalization.
use super::columns as options;
use super::look::{Accent, Look, Tone};
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
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
    pub practice_columns: Option<Vec<options::ColumnSetting>>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
    pub brand_visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
            class_scope: "player-class".into(),
            classification_mode: "normal".into(),
            player_window: false,
            window_around: 4,
            show_session_header: true,
            template_id: "signature".into(),
            header_first: "none".into(),
            header_second: "none".into(),
            show_session_footer: true,
            footer_first: "track".into(),
            footer_second: "estimatedLaps".into(),
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
        settings.row_count = settings.row_count.clamp(1, 30);
        if settings.class_scope != "all-classes" {
            settings.class_scope = "player-class".into();
        }
        if settings.classification_mode != "multiclass" {
            settings.classification_mode = "normal".into();
        }
        if settings.content_version == 0 && settings.design_system == Look::Vantare {
            settings.class_scope = if settings.classification_mode == "multiclass" {
                "all-classes"
            } else {
                "player-class"
            }
            .into();
        }
        settings.content_version = 1;
        if ![0, 2, 4, 6, 8].contains(&settings.window_around) {
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
            columns.truncate(12);
        }
        if let Some(slots) = &mut settings.footer_slots {
            slots.truncate(9);
        }

        if !["signature", "broadcast"].contains(&settings.template_id.as_str()) {
            settings.template_id = "signature".into();
        }
        let choices = [
            "none",
            "trackTemperature",
            "airTemperature",
            "estimatedLaps",
            "totalLaps",
            "track",
            "remaining",
            "rain",
            "wetness",
        ];
        for (value, fallback) in [
            (&mut settings.header_first, "none"),
            (&mut settings.header_second, "none"),
            (&mut settings.footer_first, "track"),
            (&mut settings.footer_second, "estimatedLaps"),
        ] {
            if !choices.contains(&value.as_str()) {
                *value = fallback.into();
            }
        }
        settings
    }
}
