//! Contrato cerrado: texto y miniaturas locales, nunca tokens/logs/diagnósticos.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportV2 {
    pub contract_version: String,
    pub report_id: String,
    pub channel: String,
    pub title: String,
    pub body: String,
    pub consent: bool,
    pub idempotency_key: String,
    pub variant: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<serde_json::Value>,
}

/// Temporal containment until the server validates uploaded evidence (VANTA-131).
pub const SCREENSHOTS_AVAILABLE: bool = false;

pub const FIELD_LIMITS: [usize; 4] = [2048, 2048, 2048, 4096];
pub const FIELD_PLACEHOLDERS: [&str; 4] = [
    "Qué hiciste",
    "Qué esperabas",
    "Qué ocurrió",
    "Contexto adicional · opcional",
];
pub const MODULES: [(&str, &str); 15] = [
    ("unknown", "Sin determinar"),
    ("hub", "Hub"),
    ("launcher", "Launcher"),
    ("settings", "Ajustes"),
    ("overlay_studio", "Overlay Studio"),
    ("overlay_runtime", "Overlays en pista"),
    ("telemetry", "Telemetría"),
    ("telemetry_analysis", "Análisis de telemetría"),
    ("engineer", "Ingeniero"),
    ("strategy", "Estrategia"),
    ("calendar", "Calendario"),
    ("billing", "Facturación"),
    ("account", "Cuenta"),
    ("updater", "Actualizaciones"),
    ("testing_center", "Testing Center"),
];

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Fields {
    pub action_text: String,
    pub expected_text: String,
    pub observed_text: String,
    pub context_text: String,
    pub module: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Draft {
    pub schema_version: u8,
    pub idempotency_key: String,
    pub fields: Fields,
    #[serde(default)]
    pub screenshots: Vec<ScreenshotPreview>,
}
/// Miniatura local; nunca se envía al servidor ni contiene rutas de usuario.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScreenshotPreview {
    pub id: String,
    pub jpeg: String,
    pub width: u32,
    pub height: u32,
    pub byte_size: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preview {
    pub id: String,
    pub digest: String,
    pub payload: String,
    pub account_id: String,
    pub channel: String,
    pub retry: bool,
    #[serde(default)]
    pub screenshots: Vec<ScreenshotPreview>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub report_id: String,
    pub report_state: String,
    pub idempotent: bool,
    pub created_at: String,
}
