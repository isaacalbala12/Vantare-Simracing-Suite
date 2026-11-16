//! Lectura de la agenda local en el host; sin I/O en la proyección ni el pintor.
use gpui::{App, Global};
use std::path::Path;
use vantare_domain::session_alerts::CalendarInput;
use vantare_ipc::session_alerts::Feed;

#[derive(Default)]
pub(crate) struct Agenda(pub Vec<CalendarInput>);
impl Global for Agenda {}

pub fn path_for_layout(layout: &Path) -> std::path::PathBuf {
    vantare_ipc::session_alerts::calendar_path(layout)
}

pub(crate) fn poll(path: &Path, cx: &mut App) {
    let now = vantare_ipc::control::wall_ms().unwrap_or(0);
    let next = read(path, now);
    if cx.try_global::<Agenda>().is_none_or(|old| old.0 != next) {
        cx.set_global(Agenda(next));
        cx.refresh_windows();
    }
}
/// La lectura vive en `ipc`; aquí solo queda el punto que usan el sondeo y su test.
fn read(path: &Path, now: u64) -> Vec<CalendarInput> {
    Feed::read_file(path, now)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_or_invalid_feed_has_no_alerts() {
        assert_eq!(
            read(Path::new("/absent/calendar-alerts.json"), 0),
            [] as [vantare_domain::session_alerts::CalendarInput; 0]
        );
    }
}
