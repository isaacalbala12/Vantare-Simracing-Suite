//! Hechos neutrales confirmados por el núcleo, no por diferencias en IPC.
use std::io;

use serde_json::{Value, json};
use vantare_domain::{CarId, FlagKind, FlagScope, SessionId, SessionState, SourceState};

use super::{Cursor, Delivery, PitEvent};

/// Banderas conocidas. El texto de Other sigue íntegro en la foto; Engineer
/// no lo interpreta ni fabrica una voz para una bandera que no conoce.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlagSignal {
    Green,
    Yellow,
    Blue,
    Red,
    White,
    Black,
    Checkered,
}
impl FlagSignal {
    pub fn of(kind: &FlagKind) -> Option<Self> {
        Some(match kind {
            FlagKind::Green => Self::Green,
            FlagKind::Yellow => Self::Yellow,
            FlagKind::Blue => Self::Blue,
            FlagKind::Red => Self::Red,
            FlagKind::White => Self::White,
            FlagKind::Black => Self::Black,
            FlagKind::Checkered => Self::Checkered,
            FlagKind::Other(_) => return None,
        })
    }
    fn code(self) -> u8 {
        match self {
            Self::Green => 0,
            Self::Yellow => 1,
            Self::Blue => 2,
            Self::Red => 3,
            Self::White => 4,
            Self::Black => 5,
            Self::Checkered => 6,
        }
    }
    fn decode(value: &Value) -> io::Result<Self> {
        Ok(match number(value)? {
            0 => Self::Green,
            1 => Self::Yellow,
            2 => Self::Blue,
            3 => Self::Red,
            4 => Self::White,
            5 => Self::Black,
            6 => Self::Checkered,
            _ => return Err(invalid()),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FactKind {
    LapCompleted {
        car: CarId,
        completed: u32,
    },
    FlagChanged {
        kind: FlagSignal,
        scope: FlagScope,
        active: bool,
    },
    SessionChanged {
        previous: SessionId,
    },
    SessionStateChanged {
        before: SessionState,
        after: SessionState,
    },
    SourceChanged {
        before: SourceState,
        after: SourceState,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fact {
    pub cursor: Cursor,
    pub sequence: u64,
    pub session: SessionId,
    pub kind: FactKind,
}

/// Un journal, un índice: v1 boxes y v3 hechos adicionales comparten cursor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    Pit(PitEvent),
    Fact(Fact),
}
impl Event {
    pub fn cursor(self) -> Cursor {
        match self {
            Self::Pit(e) => e.cursor,
            Self::Fact(e) => e.cursor,
        }
    }
    pub fn sequence(self) -> u64 {
        match self {
            Self::Pit(e) => e.sequence,
            Self::Fact(e) => e.sequence,
        }
    }
    pub fn delivery(self) -> Delivery {
        match self {
            Self::Pit(e) => Delivery::Event(e),
            Self::Fact(e) => Delivery::Fact(e),
        }
    }
    pub(super) fn record(self) -> Value {
        match self {
            Self::Pit(e) => json!([
                1,
                e.cursor.index,
                e.cursor.epoch,
                e.sequence,
                e.session.0,
                e.car.0,
                e.was_in_pits,
                e.in_pits
            ]),
            Self::Fact(e) => json!([
                3,
                e.cursor.index,
                e.cursor.epoch,
                e.sequence,
                e.session.0,
                kind_value(e.kind)
            ]),
        }
    }
    pub(super) fn decode(value: &Value) -> io::Result<Self> {
        let fields = value.as_array().ok_or_else(invalid)?;
        let event = match fields.as_slice() {
            [version, index, epoch, sequence, session, car, was, now]
                if version.as_u64() == Some(1) =>
            {
                Self::Pit(PitEvent {
                    cursor: Cursor {
                        epoch: number(epoch)?,
                        index: number(index)?,
                    },
                    sequence: number(sequence)?,
                    session: SessionId(number(session)?),
                    car: CarId(u32_value(car)?),
                    was_in_pits: was.as_bool().ok_or_else(invalid)?,
                    in_pits: now.as_bool().ok_or_else(invalid)?,
                })
            }
            [version, index, epoch, sequence, session, kind] if version.as_u64() == Some(3) => {
                Self::Fact(Fact {
                    cursor: Cursor {
                        epoch: number(epoch)?,
                        index: number(index)?,
                    },
                    sequence: number(sequence)?,
                    session: SessionId(number(session)?),
                    kind: decode_kind(kind)?,
                })
            }
            _ => return Err(invalid()),
        };
        event.validate()?;
        Ok(event)
    }
    pub(super) fn validate(self) -> io::Result<()> {
        if self.cursor().index == 0 || self.cursor().index == u64::MAX || self.sequence() == 0 {
            return Err(invalid());
        }
        let valid = match self {
            Self::Pit(e) => e.was_in_pits != e.in_pits,
            Self::Fact(e) => match e.kind {
                FactKind::LapCompleted { completed, .. } => completed > 0,
                FactKind::SessionChanged { previous } => previous != e.session,
                FactKind::SessionStateChanged { before, after } => before != after,
                FactKind::SourceChanged { before, after } => before != after,
                FactKind::FlagChanged { .. } => true,
            },
        };
        if valid { Ok(()) } else { Err(invalid()) }
    }
}

fn kind_value(kind: FactKind) -> Value {
    match kind {
        FactKind::LapCompleted { car, completed } => json!([0, car.0, completed]),
        FactKind::FlagChanged {
            kind,
            scope,
            active,
        } => json!([1, kind.code(), scope_value(scope), active]),
        FactKind::SessionChanged { previous } => json!([2, previous.0]),
        FactKind::SessionStateChanged { before, after } => {
            json!([3, session_code(before), session_code(after)])
        }
        FactKind::SourceChanged { before, after } => {
            json!([4, source_code(before), source_code(after)])
        }
    }
}
fn decode_kind(value: &Value) -> io::Result<FactKind> {
    let fields = value.as_array().ok_or_else(invalid)?;
    Ok(match fields.as_slice() {
        [code, car, completed] if code.as_u64() == Some(0) => FactKind::LapCompleted {
            car: CarId(u32_value(car)?),
            completed: u32_value(completed)?,
        },
        [code, kind, scope, active] if code.as_u64() == Some(1) => FactKind::FlagChanged {
            kind: FlagSignal::decode(kind)?,
            scope: decode_scope(scope)?,
            active: active.as_bool().ok_or_else(invalid)?,
        },
        [code, previous] if code.as_u64() == Some(2) => FactKind::SessionChanged {
            previous: SessionId(number(previous)?),
        },
        [code, before, after] if code.as_u64() == Some(3) => FactKind::SessionStateChanged {
            before: decode_session(before)?,
            after: decode_session(after)?,
        },
        [code, before, after] if code.as_u64() == Some(4) => FactKind::SourceChanged {
            before: decode_source(before)?,
            after: decode_source(after)?,
        },
        _ => return Err(invalid()),
    })
}
fn scope_value(scope: FlagScope) -> Value {
    match scope {
        FlagScope::Session => json!([0]),
        FlagScope::Sector(n) => json!([1, n]),
        FlagScope::Car(car) => json!([2, car.0]),
    }
}
fn decode_scope(value: &Value) -> io::Result<FlagScope> {
    let fields = value.as_array().ok_or_else(invalid)?;
    Ok(match fields.as_slice() {
        [code] if code.as_u64() == Some(0) => FlagScope::Session,
        [code, n] if code.as_u64() == Some(1) => {
            FlagScope::Sector(u8::try_from(number(n)?).map_err(|_| invalid())?)
        }
        [code, car] if code.as_u64() == Some(2) => FlagScope::Car(CarId(u32_value(car)?)),
        _ => return Err(invalid()),
    })
}
fn session_code(state: SessionState) -> u8 {
    match state {
        SessionState::Preparing => 0,
        SessionState::Running => 1,
        SessionState::Interrupted => 2,
        SessionState::Finished => 3,
    }
}
fn decode_session(value: &Value) -> io::Result<SessionState> {
    Ok(match number(value)? {
        0 => SessionState::Preparing,
        1 => SessionState::Running,
        2 => SessionState::Interrupted,
        3 => SessionState::Finished,
        _ => return Err(invalid()),
    })
}
fn source_code(state: SourceState) -> u8 {
    match state {
        SourceState::Waiting => 0,
        SourceState::Live => 1,
        SourceState::Stale => 2,
        SourceState::Lost => 3,
        SourceState::Paused => 4,
    }
}
fn decode_source(value: &Value) -> io::Result<SourceState> {
    Ok(match number(value)? {
        0 => SourceState::Waiting,
        1 => SourceState::Live,
        2 => SourceState::Stale,
        3 => SourceState::Lost,
        4 => SourceState::Paused,
        _ => return Err(invalid()),
    })
}
fn number(value: &Value) -> io::Result<u64> {
    value.as_u64().ok_or_else(invalid)
}
fn u32_value(value: &Value) -> io::Result<u32> {
    u32::try_from(number(value)?).map_err(|_| invalid())
}
fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "hecho de journal inválido")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pause_transition_survives_journal_recording_and_recovery() {
        let event = Event::Fact(Fact {
            cursor: Cursor { epoch: 1, index: 1 },
            sequence: 2,
            session: SessionId(1),
            kind: FactKind::SourceChanged {
                before: SourceState::Live,
                after: SourceState::Paused,
            },
        });
        assert_eq!(
            Event::decode(&event.record()).expect("recuperar pausa"),
            event
        );
    }
}
