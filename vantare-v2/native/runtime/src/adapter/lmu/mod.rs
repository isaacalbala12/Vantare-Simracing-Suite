//! Adaptador de Le Mans Ultimate: memoria compartida `LMU_Data` (rF2
//! `InternalsPlugin`) más REST local. Todo tipo de LMU es privado de este módulo;
//! hacia fuera solo salen `Observation` del dominio. Ver `REVIEW.md`.

mod frame;
mod gate;
#[cfg(windows)]
mod live;
mod open;
mod replay;
mod rest;
#[cfg(windows)]
#[allow(unsafe_code)]
mod shm;
mod translate;

#[cfg(test)]
mod cadence_tests;

#[cfg(windows)]
pub use live::Lmu;
pub use open::open_replay;
pub use replay::{Replay, ReplayEvent};

/// Detalle de diagnóstico del adaptador, sin intervenir en la frescura común.
fn freshness_detail(snapshot: &vantare_domain::Snapshot) -> Option<&'static str> {
    use vantare_domain::{SourceState, freshness::player_clock_frozen};
    match snapshot.state.source_state {
        SourceState::Paused => {
            Some("LMU: SHM mCurrentET sin avance; proceso vivo y REST de sesión vigente")
        }
        SourceState::Stale => Some("LMU: frescura por bloque SHM y confirmación REST"),
        SourceState::Live if player_clock_frozen(snapshot) => {
            Some("LMU: reloj del jugador o contenido del bloque sin avance")
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
                    assert!(detail.starts_with("LMU:"));
                }
                assert_eq!(s, before);
            }
        }
    }
}
