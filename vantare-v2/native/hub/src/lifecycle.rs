//! Cierre por actividad de la fuente neutral; la escena Workshop no participa.
use vantare_domain::{Snapshot, SourceKind, SourceState};

pub fn is_live(snapshot: &Snapshot) -> bool {
    snapshot.origin.source.kind == SourceKind::Live
        && snapshot.state.source_state == SourceState::Live
}

/// La primera foto, incluso Live, establece la referencia y no cierra el Hub.
/// Un acceso a medias o la pantalla de acceso tampoco: cerrar perdería el
/// inicio de sesión (#1464).
pub fn should_close(previous: Option<bool>, snapshot: &Snapshot, signing_in: bool) -> bool {
    !signing_in && previous == Some(false) && is_live(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn initial_live_and_waiting_stale_lost_or_replay_never_close() {
        for (kind, state, closes_after_non_live) in [
            (SourceKind::Live, SourceState::Waiting, false),
            (SourceKind::Live, SourceState::Live, true),
            (SourceKind::Live, SourceState::Stale, false),
            (SourceKind::Live, SourceState::Lost, false),
            (SourceKind::Replay, SourceState::Waiting, false),
            (SourceKind::Replay, SourceState::Live, false),
            (SourceKind::Replay, SourceState::Stale, false),
            (SourceKind::Replay, SourceState::Lost, false),
        ] {
            let mut snapshot = Snapshot::default();
            snapshot.origin.source.kind = kind;
            snapshot.state.source_state = state;
            assert!(
                !should_close(None, &snapshot, false),
                "primera foto: {kind:?}/{state:?}"
            );
            assert!(
                !should_close(Some(true), &snapshot, false),
                "sin flanco: {kind:?}/{state:?}"
            );
            assert_eq!(
                should_close(Some(false), &snapshot, false),
                closes_after_non_live,
                "{kind:?}/{state:?}"
            );
        }
    }
    #[test]
    fn waiting_or_stale_to_live_edges_close_and_do_not_repeat() {
        for state in [SourceState::Waiting, SourceState::Stale, SourceState::Lost] {
            let mut snapshot = Snapshot::default();
            snapshot.state.source_state = state;
            assert!(!should_close(None, &snapshot, false));
            let previous = is_live(&snapshot);
            snapshot.state.source_state = SourceState::Live;
            assert!(should_close(Some(previous), &snapshot, false));
            assert!(!should_close(Some(is_live(&snapshot)), &snapshot, false));
        }
    }
    #[test]
    fn sign_in_in_progress_keeps_the_hub_open_on_the_live_edge() {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        assert!(should_close(Some(false), &snapshot, false));
        assert!(!should_close(Some(false), &snapshot, true));
    }
}
