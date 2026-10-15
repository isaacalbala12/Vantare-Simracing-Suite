//! Lectura de la agenda local en el host; sin I/O en la proyección ni el pintor.
use gpui::{App, Global};
use std::{io::Read, path::Path};
use vantare_domain::session_alerts::CalendarInput;
use vantare_ipc::session_alerts::Feed;

#[derive(Default)]
pub(crate) struct Agenda(pub Vec<CalendarInput>);
impl Global for Agenda {}

pub(crate) fn poll(directory: &Path, cx: &mut App) {
    let now = vantare_ipc::control::wall_ms().unwrap_or(0);
    let next = read(&directory.join(vantare_ipc::session_alerts::FILE), now);
    if cx.try_global::<Agenda>().is_none_or(|old| old.0 != next) {
        cx.set_global(Agenda(next));
        cx.refresh_windows();
    }
}
fn read(path: &Path, now: u64) -> Vec<CalendarInput> {
    let Ok(file) = std::fs::File::open(path) else {
        return vec![];
    };
    let mut bytes = Vec::new();
    if file.take(65537).read_to_end(&mut bytes).is_err() || bytes.len() > 65536 {
        return vec![];
    }
    serde_json::from_slice::<Feed>(&bytes).map_or_else(|_| vec![], |feed| feed.current(now))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_or_invalid_feed_has_no_alerts() {
        assert!(read(Path::new("/absent/calendar-alerts.json"), 0).is_empty());
    }
}
