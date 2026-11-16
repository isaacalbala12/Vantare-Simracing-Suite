//! Agenda local del calendario: la lee el anfitrión, nunca el pintor.
use std::path::Path;
use vantare_domain::widget_settings::Settings;
use vantare_ipc::{
    layout::Layout,
    session_alerts::{Feed, calendar_path},
};

/// Solo se toca el disco si el diseño trae un Avisos de sesión.
pub(crate) fn wanted(layout: &Layout) -> bool {
    layout
        .instances
        .iter()
        .any(|instance| matches!(instance.settings, Settings::SessionAlerts(_)))
}

/// Eventos vigentes de la agenda que vive junto al diseño; la lectura la hace `ipc`.
pub(crate) fn read(layout: &Path, now: u64) -> Vec<vantare_domain::session_alerts::CalendarInput> {
    Feed::read_file(&calendar_path(layout), now)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_calendar_is_only_read_when_the_design_wants_it() {
        let layout = Layout::from_json(
            br#"{"version":2,"instances":[{"id":"a","x":0,"y":0,"settings":{"kind":"session-alerts"}}]}"#,
        )
        .expect("diseño");
        assert!(wanted(&layout));
        let other = Layout::from_json(
            br#"{"version":2,"instances":[{"id":"a","x":0,"y":0,"settings":{"kind":"pedals"}}]}"#,
        )
        .expect("diseño");
        assert!(!wanted(&other), "otro widget no toca la agenda");
        let mut empty = layout;
        empty.instances.clear();
        assert!(!wanted(&empty), "sin instancias no hay lectura");
    }
}
