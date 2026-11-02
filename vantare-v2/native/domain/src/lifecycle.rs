use crate::{Snapshot, SourceKind, SourceState};

/// Actividad Live usada por Hub y derechos. Una grabación nunca es Live;
/// Paused y Stale conservan su semántica propia, pero no activan este predicado.
pub fn is_live(snapshot: &Snapshot) -> bool {
    snapshot.origin.source.kind == SourceKind::Live
        && snapshot.state.source_state == SourceState::Live
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_live_source_in_live_state_is_live() {
        for kind in [SourceKind::Live, SourceKind::Replay] {
            for state in [
                SourceState::Waiting,
                SourceState::Live,
                SourceState::Paused,
                SourceState::Stale,
                SourceState::Lost,
            ] {
                let mut snapshot = Snapshot::default();
                snapshot.origin.source.kind = kind;
                snapshot.state.source_state = state;
                assert_eq!(
                    is_live(&snapshot),
                    matches!((kind, state), (SourceKind::Live, SourceState::Live)),
                    "{kind:?}/{state:?}"
                );
            }
        }
    }
}
