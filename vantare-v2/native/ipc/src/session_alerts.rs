//! Interfaz local Hub → overlays. Agenda completa, sin datos de cuenta ni protocolo Core.
use serde::{Deserialize, Serialize};
use vantare_domain::session_alerts::CalendarInput;

pub const FILE: &str = "session-alerts-feed.json";

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
/// Lo que la agenda puede ocupar en disco: más que esto no se lee.
const LIMIT: u64 = 65_536;

impl Feed {
    /// Agenda guardada en `path` para `now`. Un fichero ausente, uno que pasa de 64 KiB o
    /// un documento inválido dejan la lista vacía; el primer fallo se registra una vez.
    pub fn read_file(path: &std::path::Path, now: u64) -> Vec<CalendarInput> {
        use std::io::Read as _;
        let Ok(file) = std::fs::File::open(path) else {
            return Vec::new();
        };
        let mut bytes = Vec::new();
        if let Err(error) = file.take(LIMIT + 1).read_to_end(&mut bytes) {
            once(&format!("agenda del calendario: no se pudo leer ({error})"));
            return Vec::new();
        }
        if bytes.len() as u64 > LIMIT {
            once("agenda del calendario: pasa de 64 KiB");
            return Vec::new();
        }
        match serde_json::from_slice::<Self>(&bytes) {
            Ok(feed) => feed.current(now),
            Err(error) => {
                once(&format!("agenda del calendario: JSON inválido ({error})"));
                Vec::new()
            }
        }
    }
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
/// Un solo aviso por proceso: el host sondea cada 500 ms y no debe repetirlo.
fn once(message: &str) {
    static ONCE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);
    if ONCE.swap(false, std::sync::atomic::Ordering::Relaxed) {
        eprintln!("{message}");
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
        assert_eq!(
            feed.current(20_001),
            [] as [vantare_domain::session_alerts::CalendarInput; 0]
        );
        assert_eq!(
            feed.current(0),
            [] as [vantare_domain::session_alerts::CalendarInput; 0]
        );
        feed.version = 2;
        assert_eq!(
            feed.current(10_000),
            [] as [vantare_domain::session_alerts::CalendarInput; 0]
        );
        feed.version = 1;
        feed.events = vec![feed.events[0].clone(); 257];
        assert_eq!(
            feed.current(10_000),
            [] as [vantare_domain::session_alerts::CalendarInput; 0]
        );
    }
    /// La lógica anterior de `ui::session_alerts::calendar::read`, copiada literalmente para
    /// comparar caso por caso antes de borrarla de `ui`.
    fn old_read(path: &std::path::Path, now: u64) -> Vec<CalendarInput> {
        use std::io::Read as _;
        let Ok(file) = std::fs::File::open(path) else {
            return vec![];
        };
        let mut bytes = Vec::new();
        if file.take(65537).read_to_end(&mut bytes).is_err() || bytes.len() > 65536 {
            return vec![];
        }
        serde_json::from_slice::<Feed>(&bytes).map_or_else(|_| vec![], |feed| feed.current(now))
    }

    #[test]
    fn read_file_matches_the_previous_ui_logic() {
        let dir = std::env::temp_dir().join(format!("vantare-ipc-agenda-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("carpeta");
        let now = 1_000_u64;
        let valid = format!(
            r#"{{"version":1,"updatedAtMs":{now},"events":[{{"id":"race","label":"Spa","startsAtMs":{}}}]}}"#,
            now + 60_000
        );
        let mut exact = valid.clone();
        exact.push_str(&" ".repeat(65_536 - exact.len()));
        assert_eq!(exact.len(), 65_536);
        let mut over = exact.clone();
        over.push(' ');
        assert_eq!(over.len(), 65_537);
        for (name, bytes) in [
            ("valid", valid.as_bytes()),
            ("exact", exact.as_bytes()),
            ("over", over.as_bytes()),
            ("invalid", b"{no es json}".as_slice()),
            ("empty", b"".as_slice()),
        ] {
            let path = dir.join(format!("{name}.json"));
            std::fs::write(&path, bytes).expect("agenda");
            assert_eq!(Feed::read_file(&path, now), old_read(&path, now), "{name}");
        }
        let absent = dir.join("absent.json");
        assert_eq!(
            Feed::read_file(&absent, now),
            old_read(&absent, now),
            "ausente"
        );
    }
}
