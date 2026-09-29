use std::collections::VecDeque;
use std::io;
use std::path::Path;

use vantare_domain::{CarId, Quality, SessionId, Snapshot};

use super::recording::Recording;

const DEFAULT_RETENTION: usize = 256;

/// Último evento reconocido. `index` es del journal; no es la secuencia de foto.
/// El consumidor guarda este valor después de procesar y hacer ACK.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cursor {
    pub epoch: u64,
    pub index: u64,
}

/// Cambio observado, nunca inferido a través de un dato ausente u obsoleto.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PitEvent {
    pub cursor: Cursor,
    pub sequence: u64,
    pub session: SessionId,
    pub car: CarId,
    pub was_in_pits: bool,
    pub in_pits: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GapReason {
    CoreRestart,
    Retention,
    InvalidCursor,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Delivery {
    Event(PitEvent),
    /// Frontera declarada: no deducir hechos a través de ella. En modo
    /// volátil reconstruir desde la foto actual antes de reconocer la base.
    Gap {
        reason: GapReason,
        resume_at: Cursor,
    },
}

/// Estado del consumidor, fuera del núcleo. Sin ACK, `poll` repite la entrega.
pub struct Consumer {
    cursor: Cursor,
    pending: Option<Delivery>,
}

impl Consumer {
    pub fn new(cursor: Cursor) -> Self {
        Self {
            cursor,
            pending: None,
        }
    }

    pub fn cursor(&self) -> Cursor {
        self.cursor
    }

    /// Puede leer disco con recording activo; ejecutar fuera de adquisición.
    pub fn poll(&mut self, journal: &Journal) -> io::Result<Option<Delivery>> {
        if self.pending.is_none() {
            self.pending = journal.read(self.cursor)?;
        }
        Ok(self.pending)
    }

    /// Reconoce solo la entrega pendiente; sin entrega no avanza.
    pub fn ack(&mut self) {
        if let Some(delivery) = self.pending.take() {
            self.cursor = match delivery {
                Delivery::Event(event) => event.cursor,
                Delivery::Gap { resume_at, .. } => resume_at,
            };
        }
    }
}

/// Un escritor; memoria acotada independientemente del número de consumidores.
/// Observar solo encola. La persistencia explícita se hace fuera de adquisición.
pub struct Journal {
    tail: Cursor,
    /// Punto de arranque de esta época, después del prefijo recuperado.
    start: Cursor,
    retention: usize,
    events: VecDeque<PitEvent>,
    recording: Option<Recording>,
}

impl Journal {
    pub(crate) fn volatile(epoch: u64) -> Self {
        let start = Cursor { epoch, index: 0 };
        Self {
            tail: start,
            start,
            retention: DEFAULT_RETENTION,
            events: VecDeque::new(),
            recording: None,
        }
    }

    /// `recording = None` no abre ni crea ficheros. Retención debe ser positiva.
    pub(crate) fn open(epoch: u64, retention: usize, recording: Option<&Path>) -> io::Result<Self> {
        if retention == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "retención cero",
            ));
        }
        let recording = recording.map(Recording::open).transpose()?;
        if recording
            .as_ref()
            .is_some_and(|r| r.last().is_some_and(|c| c.epoch >= epoch))
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "época no creciente",
            ));
        }
        let index = recording
            .as_ref()
            .and_then(Recording::last)
            .map_or(0, |c| c.index);
        let start = Cursor { epoch, index };
        Ok(Self {
            tail: start,
            start,
            retention,
            events: VecDeque::new(),
            recording,
        })
    }

    /// Base coherente para un consumidor nuevo que reconstruye desde la foto.
    pub fn tail(&self) -> Cursor {
        self.tail
    }

    /// Durabilidad confirmada únicamente por `sync_all`, nunca por observar.
    pub fn durable_cursor(&self) -> Option<Cursor> {
        self.recording.as_ref().and_then(Recording::last)
    }

    /// Persiste la cola y confirma durabilidad. Sin recording devuelve `None`.
    /// Si la cola perdió eventos sin persistir, falla explícitamente: no escribe
    /// una historia incompleta como si fuera continua. Un error de disco también
    /// se devuelve; el núcleo sigue publicando fotos y eventos volátiles.
    pub fn persist(&mut self) -> io::Result<Option<Cursor>> {
        let Some(recording) = &mut self.recording else {
            return Ok(None);
        };
        recording.persist(&self.events)?;
        Ok(recording.last())
    }

    pub(crate) fn observe(&mut self, previous: &Snapshot, next: &Snapshot) {
        if previous.epoch != next.epoch || previous.state.session.id != next.state.session.id {
            return;
        }
        let (Some(before), Some(after)) = (previous.state.player_car(), next.state.player_car())
        else {
            return;
        };
        let (Quality::Reliable(was_in_pits), Quality::Reliable(in_pits)) =
            (before.in_pits, after.in_pits)
        else {
            return;
        };
        if before.id != after.id || was_in_pits == in_pits {
            return;
        }
        self.tail.index += 1;
        if self.events.len() == self.retention {
            self.events.pop_front();
        }
        self.events.push_back(PitEvent {
            cursor: self.tail,
            sequence: next.sequence,
            session: next.state.session.id,
            car: after.id,
            was_in_pits,
            in_pits,
        });
    }

    fn gap(&self, reason: GapReason) -> Delivery {
        Delivery::Gap {
            reason,
            resume_at: self.tail,
        }
    }

    fn read(&self, cursor: Cursor) -> io::Result<Option<Delivery>> {
        // Un cursor de una época anterior puede recuperar su prefijo durable.
        if let Some(recording) = &self.recording {
            match recording.read(cursor, self.start)? {
                super::recording::Read::Event(event) => return Ok(Some(Delivery::Event(event))),
                super::recording::Read::Boundary(resume_at) => {
                    return Ok(Some(Delivery::Gap {
                        reason: GapReason::CoreRestart,
                        resume_at,
                    }));
                }
                super::recording::Read::Invalid => {
                    if cursor.epoch != self.tail.epoch {
                        return Ok(Some(self.gap(GapReason::InvalidCursor)));
                    }
                }
                super::recording::Read::End => {}
            }
        }
        if cursor.epoch != self.tail.epoch {
            return Ok(Some(Delivery::Gap {
                reason: GapReason::CoreRestart,
                // Recording permite recuperar también la cola nueva. El modo
                // volátil reconstruye desde la foto actual y salta a su base.
                resume_at: if self.recording.is_some() {
                    self.start
                } else {
                    self.tail
                },
            }));
        }
        if cursor.index < self.start.index || cursor.index > self.tail.index {
            return Ok(Some(self.gap(GapReason::InvalidCursor)));
        }
        if cursor == self.tail {
            return Ok(None);
        }
        let next = self
            .events
            .iter()
            .find(|event| event.cursor.index > cursor.index);
        match next {
            Some(event) if event.cursor.index == cursor.index + 1 => {
                Ok(Some(Delivery::Event(*event)))
            }
            _ => Ok(Some(self.gap(GapReason::Retention))),
        }
    }
}
