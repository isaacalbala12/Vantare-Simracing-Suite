//! Exact reviewed contribution payload; no account identity, secrets or local paths.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Item {
    System,
    Session,
    AppLog,
    TelemetryFragment,
    PosthogSession,
}
impl Item {
    pub const ALL: [Self; 5] = [
        Self::System,
        Self::Session,
        Self::AppLog,
        Self::TelemetryFragment,
        Self::PosthogSession,
    ];
    pub fn key(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Session => "telemetry_summary",
            Self::AppLog => "app_log",
            Self::TelemetryFragment => "telemetry_fragment",
            Self::PosthogSession => "posthog_session",
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Selection {
    pub items: std::collections::BTreeSet<Item>,
}
impl Default for Selection {
    fn default() -> Self {
        Self {
            items: Item::ALL.into_iter().collect(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Attachment {
    pub kind: String,
    pub content: String,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Packet {
    pub id: String,
    pub title: String,
    pub body: String,
    pub context: serde_json::Value,
    pub attachments: Vec<Attachment>,
}
impl Packet {
    /// Used by both the read-only preview and the network owner.
    pub fn rpc_payload(&self, channel: &str) -> serde_json::Value {
        serde_json::json!({"p_id":self.id,"p_channel":channel,"p_title":self.title,
            "p_body":self.body,"p_context":self.context,"p_attachments":self.attachments})
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preview {
    pub id: String,
    pub channel: String,
    pub packet: Packet,
}
