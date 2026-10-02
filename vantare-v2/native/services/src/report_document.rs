//! Contrato cerrado: solo texto del usuario, nunca tokens/logs/diagnósticos.
use serde::{Deserialize, Serialize};

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
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub report_id: String,
    pub report_state: String,
    pub idempotent: bool,
    pub created_at: String,
}
