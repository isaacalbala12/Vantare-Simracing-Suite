//! Flanco de entrada al juego: solo fotos IPC, nunca escenas de Workshop.
use vantare_domain::{Snapshot, SourceKind};

pub fn is_live(snapshot: &Snapshot) -> bool {
    // TODO(ISA-1430): exigir también snapshot.state.source_state == SourceState::Live
    // al integrar DTO v4. Este checkout solo expone SourceKind (DTO v3).
    snapshot.origin.source.kind == SourceKind::Live
}

/// La primera foto, incluso Live, establece la referencia y no cierra el Hub.
pub fn should_close(previous: Option<bool>, snapshot: &Snapshot) -> bool {
    previous == Some(false) && is_live(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_an_observed_non_live_to_live_edge_closes() {
        let mut snapshot = Snapshot::default();
        assert!(!should_close(None, &snapshot));
        assert!(!should_close(Some(true), &snapshot));
        assert!(should_close(Some(false), &snapshot));
        snapshot.origin.source.kind = SourceKind::Replay;
        assert!(!should_close(None, &snapshot));
        assert!(!should_close(Some(true), &snapshot));
        assert!(!should_close(Some(false), &snapshot));
    }
}
