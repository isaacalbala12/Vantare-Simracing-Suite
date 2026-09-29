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
    RecordingDisabled,
}

/// Degradar recording no detiene fotos ni el journal volátil.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RecordingStatus {
    Disabled,
    Active,
    Degraded(io::ErrorKind),
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
    recording_status: RecordingStatus,
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
            recording_status: RecordingStatus::Disabled,
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
            .is_some_and(|r| r.watermark().is_some_and(|c| c.epoch >= epoch))
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "época no creciente",
            ));
        }
        let index = recording
            .as_ref()
            .and_then(Recording::watermark)
            .map_or(0, |c| c.index);
        let start = Cursor { epoch, index };
        Ok(Self {
            tail: start,
            start,
            retention,
            events: VecDeque::new(),
            recording_status: if recording.is_some() {
                RecordingStatus::Active
            } else {
                RecordingStatus::Disabled
            },
            recording,
        })
    }

    /// Base coherente para un consumidor nuevo que reconstruye desde la foto.
    pub fn tail(&self) -> Cursor {
        self.tail
    }

    /// Durabilidad confirmada únicamente por `sync_all`, nunca por observar.
    pub fn durable_cursor(&self) -> Option<Cursor> {
        self.recording.as_ref().and_then(Recording::durable_event)
    }

    pub fn recording_status(&self) -> RecordingStatus {
        self.recording_status
    }

    /// Opt-in/out fuera de adquisición. Activar tarde NO persiste el tramo
    /// volátil anterior. Un solo fichero por journal conserva los confirmados.
    /// Desactivar conserva el archivo para recuperación, sin escribir nada.
    pub fn set_recording(&mut self, path: Option<&Path>) -> io::Result<()> {
        let Some(path) = path else {
            self.recording_status = RecordingStatus::Disabled;
            return Ok(());
        };
        if let Some(recording) = &self.recording {
            if recording.path() != path {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "un solo fichero de recording por journal",
                ));
            }
            if self.recording_status == RecordingStatus::Active {
                return Ok(());
            }
        }
        let result = Recording::open(path).and_then(|mut recording| {
            recording.begin(self.tail)?;
            Ok(recording)
        });
        match result {
            Ok(recording) => {
                self.recording = Some(recording);
                self.recording_status = RecordingStatus::Active;
                Ok(())
            }
            Err(error) => {
                self.recording_status = RecordingStatus::Degraded(error.kind());
                Err(error)
            }
        }
    }

    /// Persiste la cola y confirma durabilidad. Sin recording devuelve `None`.
    /// Si la cola perdió eventos sin persistir, falla explícitamente: no escribe
    /// una historia incompleta como si fuera continua. Un error de disco también
    /// se devuelve; el núcleo sigue publicando fotos y eventos volátiles.
    pub fn persist(&mut self) -> io::Result<Option<Cursor>> {
        match self.recording_status {
            RecordingStatus::Disabled => return Ok(None),
            RecordingStatus::Degraded(kind) => {
                return Err(io::Error::new(
                    kind,
                    "recording degradado; reactivar explícitamente",
                ));
            }
            RecordingStatus::Active => {}
        }
        let Some(recording) = &mut self.recording else {
            return Ok(None);
        };
        if let Err(error) = recording.persist(&self.events) {
            self.recording_status = RecordingStatus::Degraded(error.kind());
            return Err(error);
        }
        Ok(recording.durable_event())
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
        let Some(index) = self
            .tail
            .index
            .checked_add(1)
            .filter(|index| *index < u64::MAX)
        else {
            self.recording_status = RecordingStatus::Degraded(io::ErrorKind::InvalidData);
            return;
        };
        self.tail.index = index;
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
        // En el núcleo vivo también se recuperan tramos no grabados que aún
        // estén retenidos. Las bases de disco solo saltan huecos ya perdidos.
        if cursor.epoch == self.tail.epoch
            && let Some(event) = self
                .events
                .iter()
                .find(|event| cursor.index.checked_add(1) == Some(event.cursor.index))
        {
            return Ok(Some(Delivery::Event(*event)));
        }
        // Un cursor de una época anterior puede recuperar su prefijo durable.
        if let Some(recording) = &self.recording {
            match recording.read(cursor, self.start)? {
                super::recording::Read::Event(event) => return Ok(Some(Delivery::Event(event))),
                super::recording::Read::Boundary(reason, resume_at) => {
                    return Ok(Some(Delivery::Gap { reason, resume_at }));
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

#[cfg(test)]
mod failure_tests {
    use super::*;
    use crate::flows::tests::{TestFile, photo};

    #[test]
    fn disk_full_and_failed_sync_degrade_without_confirming_or_stopping_memory() {
        // Inyección del error de sistema de disco lleno en append y fsync.
        // No llena un disco real; el fichero y el journal sí son productivos.
        let full = if cfg!(windows) { 112 } else { 28 };
        for sync in [false, true] {
            let file = TestFile::new();
            let mut journal = Journal::open(1, 2, Some(&file.0)).unwrap();
            let before = Snapshot {
                epoch: 1,
                sequence: 1,
                state: photo(1, false).state,
                ..Snapshot::default()
            };
            let after = Snapshot {
                epoch: 1,
                sequence: 2,
                state: photo(2, true).state,
                ..Snapshot::default()
            };
            journal.observe(&before, &after);
            let recording = journal.recording.as_mut().unwrap();
            if sync {
                recording.fail_sync = Some(full);
            } else {
                recording.fail_write = Some(full);
            }
            let error = journal.persist().unwrap_err();
            assert_eq!(error.raw_os_error(), Some(full));
            assert_eq!(
                journal.recording_status(),
                RecordingStatus::Degraded(error.kind())
            );
            assert_eq!(journal.durable_cursor(), None);
            assert!(journal.persist().is_err(), "no retry incierto");
            let mut consumer = Consumer::new(Cursor { epoch: 1, index: 0 });
            assert!(matches!(
                consumer.poll(&journal).unwrap(),
                Some(Delivery::Event(_))
            ));
            journal.observe(
                &after,
                &Snapshot {
                    sequence: 3,
                    ..before
                },
            );
            consumer.ack();
            assert!(matches!(
                consumer.poll(&journal).unwrap(),
                Some(Delivery::Event(_))
            ));
        }
    }
}
