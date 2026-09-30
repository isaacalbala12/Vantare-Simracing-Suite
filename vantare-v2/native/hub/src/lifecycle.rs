//! Flanco de entrada al juego: solo fotos IPC, nunca escenas de Workshop.
use vantare_domain::{Snapshot, SourceKind};

/// La primera foto, incluso Live, establece la referencia y no cierra el Hub.
pub fn should_close(previous: Option<SourceKind>, snapshot: &Snapshot) -> bool {
    // TODO(ISA-1430): exigir también snapshot.state.source_state == SourceState::Live
    // al integrar DTO v4. Este checkout solo expone SourceKind (DTO v3).
    previous == Some(SourceKind::Replay) && snapshot.origin.source.kind == SourceKind::Live
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_an_observed_non_live_to_live_edge_closes() {
        let mut snapshot = Snapshot::default();
        assert!(!should_close(None, &snapshot));
        assert!(!should_close(Some(SourceKind::Live), &snapshot));
        assert!(should_close(Some(SourceKind::Replay), &snapshot));
        snapshot.origin.source.kind = SourceKind::Replay;
        assert!(!should_close(None, &snapshot));
        assert!(!should_close(Some(SourceKind::Live), &snapshot));
        assert!(!should_close(Some(SourceKind::Replay), &snapshot));
    }
}
