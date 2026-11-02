//! Vocabulario de frescura compartido. No decide capacidades ni conoce simuladores.
use crate::{Capability, Snapshot, SourceState};
use std::time::Duration;

pub const STALL_LIMIT: Duration = Duration::from_millis(500);
pub const SITUATION_CONFIRM: Duration = Duration::from_millis(250);

/// Motivo neutral de una transición; el adaptador puede añadir su diagnóstico.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Reason {
    Waiting,
    Advancing,
    Paused,
    AdapterStale,
    AdapterStaleWithAdvance,
    Lost,
    Silence,
    PauseSilence,
    Disconnected,
    PlayerClockFrozen,
}

impl Reason {
    pub const fn of_source(state: SourceState) -> Self {
        match state {
            SourceState::Waiting => Self::Waiting,
            SourceState::Live => Self::Advancing,
            SourceState::Paused => Self::Paused,
            SourceState::Stale => Self::AdapterStale,
            SourceState::Lost => Self::Lost,
        }
    }

    pub const fn text(self) -> &'static str {
        match self {
            Self::Waiting => "sin sesión admitida",
            Self::Advancing => "reloj de fuente avanzando",
            Self::Paused => "adaptador: pausa confirmada",
            Self::AdapterStale => "adaptador: fuente caducada",
            Self::AdapterStaleWithAdvance => {
                "adaptador: fuente caducada pese a un nuevo reloj de origen"
            }
            Self::Lost => "pipe sin actividad >=5000ms",
            Self::Silence => "núcleo: origin.source_time sin avance >=500ms",
            Self::PauseSilence => "núcleo: confirmación de pausa ausente >=500ms",
            Self::Disconnected => "adaptador desconectado; degradación inmediata",
            Self::PlayerClockFrozen => "adaptador: reloj del jugador sin avance >=500ms",
        }
    }
}

/// Convención vigente del adaptador: conserva datos del jugador, ya caducados.
/// No deduce capacidades ni hace que sus señales se publiquen como frescas.
pub fn player_clock_frozen(snapshot: &Snapshot) -> bool {
    snapshot.state.capabilities.driver_inputs == Capability::WithData
}

/// La proyección actual puede conservarse al entrar en pausa. Una foto Live
/// con scoring o jugador caducado no reemplaza la última proyección viva.
pub fn shows_last_live(snapshot: &Snapshot) -> bool {
    snapshot.state.source_state == SourceState::Paused
        || (snapshot.state.source_state == SourceState::Live
            && !player_clock_frozen(snapshot)
            && snapshot.state.capabilities.positions != Capability::WithData)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retained_projection_table_preserves_all_source_and_capability_states() {
        let mut s = Snapshot::default();
        for source in [
            SourceState::Waiting,
            SourceState::Live,
            SourceState::Paused,
            SourceState::Stale,
            SourceState::Lost,
        ] {
            s.state.source_state = source;
            for inputs in [
                Capability::Unsupported,
                Capability::Supported,
                Capability::WithData,
                Capability::Fresh,
            ] {
                s.state.capabilities.driver_inputs = inputs;
                for positions in [
                    Capability::Unsupported,
                    Capability::Supported,
                    Capability::WithData,
                    Capability::Fresh,
                ] {
                    s.state.capabilities.positions = positions;
                    assert_eq!(player_clock_frozen(&s), inputs == Capability::WithData);
                    let expected = match source {
                        SourceState::Paused => true,
                        SourceState::Live => {
                            inputs != Capability::WithData && positions != Capability::WithData
                        }
                        _ => false,
                    };
                    assert_eq!(
                        shows_last_live(&s),
                        expected,
                        "{source:?} {inputs:?} {positions:?}"
                    );
                }
            }
        }
    }
}
