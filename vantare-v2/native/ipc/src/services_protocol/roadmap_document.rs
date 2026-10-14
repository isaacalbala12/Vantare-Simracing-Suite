//! Publicación pública compartida con el Hub, sin red ni identidad.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Localized {
    pub es: String,
    pub en: String,
    pub pt: String,
    pub it: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Item {
    pub id: String,
    pub section: String,
    pub title: Localized,
    pub body: Localized,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub area: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, rename = "dueDate", skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Document {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub items: Vec<Item>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Publication {
    pub id: String,
    pub document: Document,
    pub published_at: String,
}
