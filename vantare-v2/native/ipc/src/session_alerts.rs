//! Interfaz local Hub → overlays. Agenda completa, sin datos de cuenta ni protocolo Core.
use serde::{Deserialize, Serialize};
use vantare_domain::session_alerts::CalendarInput;

pub const FILE: &str = "calendar-alerts.json";

/// Agenda del layout compartido; nunca relativa al directorio privado del Hub.
pub fn calendar_path(layout: &std::path::Path) -> std::path::PathBuf {
    layout.with_file_name(FILE)
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Feed {
    pub version: u8,
    pub updated_at_ms: u64,
    pub events: Vec<Event>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub label: String,
    pub starts_at_ms: u64,
}
impl Feed {
    pub fn current(&self, now: u64) -> Vec<CalendarInput> {
        if self.version != 1
            || self.updated_at_ms > now.saturating_add(5000)
            || now.saturating_sub(self.updated_at_ms) > 10_000
            || self.events.len() > 256
        {
            return Vec::new();
        }
        self.events
            .iter()
            .filter(|e| {
                !e.id.is_empty()
                    && e.id.len() <= 160
                    && e.label.len() <= 256
                    && now < e.starts_at_ms.saturating_add(1500)
            })
            .map(|e| CalendarInput {
                id: e.id.clone(),
                label: e.label.clone(),
                starts_at_ms: e.starts_at_ms,
            })
            .collect()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn agenda_expires_and_rejects_unknown_versions_or_oversized_documents() {
        let mut feed = Feed {
            version: 1,
            updated_at_ms: 10_000,
            events: vec![Event {
                id: "race:1".into(),
                label: "Spa".into(),
                starts_at_ms: 100_000,
            }],
        };
        assert_eq!(feed.current(10_000).len(), 1);
        assert!(feed.current(20_001).is_empty());
        assert!(feed.current(0).is_empty());
        feed.version = 2;
        assert!(feed.current(10_000).is_empty());
        feed.version = 1;
        feed.events = vec![feed.events[0].clone(); 257];
        assert!(feed.current(10_000).is_empty());
    }
}
