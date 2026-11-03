//! Kit del sistema de diseño Vantare (#1497), compartido por sus widgets:
//! estilo editable en vivo, primitivas de pintado sobre el kit GPUI, movimiento
//! de filas y edición del orden de columnas. Cada widget conserva su ViewModel
//! puro y su layout; aquí solo vive lo común.

pub(crate) mod columns;
pub(crate) mod motion;
pub(crate) mod paint;
pub(crate) mod style;

pub(crate) fn waiting(facts: Option<(vantare_domain::SourceState, bool)>) -> bool {
    facts.is_none_or(|(source, player_present)| {
        !player_present
            || matches!(
                source,
                vantare_domain::SourceState::Waiting | vantare_domain::SourceState::Lost
            )
    })
}

pub(crate) fn waiting_text(
    language: vantare_domain::format::Language,
    uppercase: bool,
) -> &'static str {
    use vantare_domain::format::Language::{En, Es};
    match (language, uppercase) {
        (Es, false) => "Esperando al simulador",
        (En, false) => "Waiting for the simulator",
        (Es, true) => "ESPERANDO AL SIMULADOR",
        (En, true) => "WAITING FOR THE SIMULATOR",
    }
}
