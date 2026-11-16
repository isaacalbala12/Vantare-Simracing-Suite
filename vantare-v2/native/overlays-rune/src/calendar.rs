//! Agenda local del calendario: se lee en el anfitrión, nunca en el pintor.
//! Mismo tope que GPUI (64 KiB) y un JSON inválido se queda en una lista vacía.
use std::io::Read;
use std::path::Path;
use vantare_domain::widget_settings::{Kind, Settings};
use vantare_ipc::{
    layout::Layout,
    session_alerts::{Feed, calendar_path},
};

/// Un JSON más grande que esto no se lee: ni la agenda ni su copia pesan tanto.
const LIMIT: u64 = 65_536;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Read,
    TooLarge,
    Parse,
}
impl Error {
    pub fn message(self) -> &'static str {
        match self {
            Self::Read => "no se pudo leer la agenda",
            Self::TooLarge => "la agenda pasa de 64 KiB",
            Self::Parse => "la agenda no es un JSON válido",
        }
    }
}

/// Eventos vigentes de la agenda del layout; un fichero ausente es una agenda vacía.
pub(crate) fn read(
    layout: &Path,
    now: u64,
) -> Result<Vec<vantare_domain::session_alerts::CalendarInput>, Error> {
    let path = calendar_path(layout);
    let Ok(mut file) = std::fs::File::open(&path) else {
        return Ok(Vec::new());
    };
    let mut bytes = Vec::new();
    if file.take(LIMIT + 1).read_to_end(&mut bytes).is_err() {
        return Err(Error::Read);
    }
    if bytes.len() as u64 > LIMIT {
        return Err(Error::TooLarge);
    }
    let feed = serde_json::from_slice::<Feed>(&bytes).map_err(|_| Error::Parse)?;
    Ok(feed.current(now))
}

/// Solo se toca el disco si el diseño trae un Avisos de sesión.
pub(crate) fn wanted(layout: &Layout) -> bool {
    layout
        .instances
        .iter()
        .any(|instance| matches!(instance.settings, Settings::SessionAlerts(_)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str, contents: &[u8]) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("vantare-agenda-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("carpeta");
        let layout = dir.join("layout.json");
        std::fs::write(calendar_path(&layout), contents).expect("agenda");
        layout
    }
    fn feed(now: u64) -> String {
        format!(
            r#"{{"version":1,"updatedAtMs":{now},"events":[{{"id":"race","label":"Spa","startsAtMs":{}}}]}}"#,
            now + 60_000
        )
    }

    #[test]
    fn a_valid_agenda_gives_its_events_and_a_missing_file_is_empty() {
        let layout = temp("valid", feed(1_000).as_bytes());
        let events = read(&layout, 1_000).expect("agenda");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].label, "Spa");
        let absent = std::env::temp_dir().join("vantare-agenda-sin-fichero/layout.json");
        assert_eq!(read(&absent, 1_000).expect("vacía"), []);
    }

    #[test]
    fn an_invalid_or_oversized_document_is_an_error_not_a_panic() {
        let layout = temp("invalid", b"{no es json}");
        assert_eq!(read(&layout, 1_000).unwrap_err(), Error::Parse);
        let layout = temp("huge", &vec![b'{'; LIMIT as usize + 1]);
        assert_eq!(read(&layout, 1_000).unwrap_err(), Error::TooLarge);
    }

    #[test]
    fn the_calendar_is_only_read_when_the_design_wants_it() {
        let layout: Layout = serde_json::from_str(
            r#"{"version":2,"instances":[{"id":"a","x":0,"y":0,"settings":{"kind":"session-alerts"}}]}"#,
        )
        .expect("diseño");
        assert!(wanted(&layout));
        let mut other = layout.clone();
        other.instances[0].settings = Settings::default_for(Kind::Pedals);
        assert!(!wanted(&other));
        let mut empty = layout;
        empty.instances.clear();
        assert!(!wanted(&empty));
    }
}
