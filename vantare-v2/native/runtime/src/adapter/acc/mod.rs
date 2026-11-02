//! ACC: shared memory del jugador y broadcasting UDP v4 de la parrilla.
//! Solo salen adaptadores y `Observation` neutrales; el protocolo queda aquí.

mod bytes;
#[cfg(windows)]
mod live;
mod protocol;
mod replay;
#[cfg(windows)]
#[allow(unsafe_code)]
mod shm;
mod translate;
#[cfg(windows)]
mod udp;
mod velocity;

#[cfg(test)]
mod velocity_corpus_tests;

#[cfg(test)]
mod situation_tests;

#[cfg(windows)]
pub use live::Acc;
pub use replay::{AccReplay, open_acc_replay};

/// Detalle de diagnóstico del adaptador, sin intervenir en la frescura común.
fn freshness_detail(snapshot: &vantare_domain::Snapshot) -> Option<&'static str> {
    use vantare_domain::{SourceState, freshness::player_clock_frozen};
    match snapshot.state.source_state {
        SourceState::Paused => Some("ACC: graphics.status=PAUSE vigente"),
        SourceState::Stale => Some("ACC: frescura de las páginas SHM y UDP"),
        SourceState::Live if player_clock_frozen(snapshot) => {
            Some("ACC: reloj del jugador o contenido del bloque sin avance")
        }
        _ => None,
    }
}

#[cfg(test)]
mod freshness_diagnostic_tests {
    #[test]
    fn detail_is_owned_by_the_adapter_and_never_changes_the_snapshot() {
        use vantare_domain::{Capability, Snapshot, SourceState};
        let mut s = Snapshot::default();
        for state in [
            SourceState::Waiting,
            SourceState::Live,
            SourceState::Paused,
            SourceState::Stale,
            SourceState::Lost,
        ] {
            s.state.source_state = state;
            for inputs in [Capability::Fresh, Capability::WithData] {
                s.state.capabilities.driver_inputs = inputs;
                let before = s.clone();
                let detail = super::freshness_detail(&s);
                let expected = state == SourceState::Paused
                    || state == SourceState::Stale
                    || (state == SourceState::Live && inputs == Capability::WithData);
                assert_eq!(detail.is_some(), expected);
                if let Some(detail) = detail {
                    assert!(detail.starts_with("ACC:"));
                }
                assert_eq!(s, before);
            }
        }
    }
}
