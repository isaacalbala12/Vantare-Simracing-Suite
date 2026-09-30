use std::collections::VecDeque;
use std::io;
use std::path::Path;

use vantare_domain::{CarId, Quality, SessionId, Snapshot, SourceState};

use super::recording::Recording;
use super::{Event, Fact, FactKind, FlagSignal};

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
    Fact(Fact),
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
                Delivery::Fact(event) => event.cursor,
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
    events: VecDeque<Event>,
    recording: Option<Recording>,
    recording_status: RecordingStatus,
    lost_before: Option<u64>,
}

impl Journal {
    pub(crate) fn volatile(epoch: u64) -> Self {
        Self::at(Cursor { epoch, index: 0 })
    }

    pub(crate) fn at(start: Cursor) -> Self {
        Self {
            tail: start,
            start,
            retention: DEFAULT_RETENTION,
            events: VecDeque::new(),
            recording: None,
            recording_status: RecordingStatus::Disabled,
            lost_before: None,
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
            lost_before: None,
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
        if previous.sequence == 0 || previous.epoch != next.epoch {
            return;
        }
        if previous.state.source_state != next.state.source_state {
            self.fact(
                next,
                FactKind::SourceChanged {
                    before: previous.state.source_state,
                    after: next.state.source_state,
                },
            );
        }
        if previous.state.session.id != next.state.session.id {
            self.fact(
                next,
                FactKind::SessionChanged {
                    previous: previous.state.session.id,
                },
            );
            return;
        }
        if let (Quality::Reliable(before), Quality::Reliable(after)) =
            (&previous.state.session.state, &next.state.session.state)
            && before != after
        {
            self.fact(
                next,
                FactKind::SessionStateChanged {
                    before: *before,
                    after: *after,
                },
            );
        }
        if previous.state.source_state != SourceState::Live
            || next.state.source_state != SourceState::Live
        {
            return;
        }
        if let (Quality::Reliable(before), Quality::Reliable(after)) =
            (&previous.state.flags, &next.state.flags)
        {
            for (flags, other, active) in [(before, after, false), (after, before, true)] {
                for flag in flags.iter().filter(|flag| !other.contains(flag)) {
                    if let Some(kind) = FlagSignal::of(&flag.kind) {
                        self.fact(
                            next,
                            FactKind::FlagChanged {
                                kind,
                                scope: flag.scope,
                                active,
                            },
                        );
                    }
                }
            }
        }
        let (Some(before), Some(after)) = (previous.state.player_car(), next.state.player_car())
        else {
            return;
        };
        if before.id != after.id {
            return;
        }
        if let (Quality::Reliable(a), Quality::Reliable(b)) = (before.laps, after.laps)
            && a.checked_add(1) == Some(b)
        {
            self.fact(
                next,
                FactKind::LapCompleted {
                    car: after.id,
                    completed: b,
                },
            );
        }
        if let (Quality::Reliable(was_in_pits), Quality::Reliable(in_pits)) =
            (before.in_pits, after.in_pits)
            && was_in_pits != in_pits
        {
            self.push(Event::Pit(PitEvent {
                cursor: self.tail,
                sequence: next.sequence,
                session: next.state.session.id,
                car: after.id,
                was_in_pits,
                in_pits,
            }));
        }
    }

    fn fact(&mut self, next: &Snapshot, kind: FactKind) {
        self.push(Event::Fact(Fact {
            cursor: self.tail,
            sequence: next.sequence,
            session: next.state.session.id,
            kind,
        }));
    }

    fn push(&mut self, mut event: Event) {
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
        match &mut event {
            Event::Pit(e) => e.cursor = self.tail,
            Event::Fact(e) => e.cursor = self.tail,
        }
        if self.events.len() == self.retention {
            self.events.pop_front();
        }
        self.events.push_back(event);
    }

    /// Copia acotada para el corte inmutable del worker, solo si cambia tail.
    pub fn retained(&self) -> Vec<Event> {
        self.events.iter().copied().collect()
    }

    /// Replica las identidades ya asignadas por Core. No genera hechos nuevos.
    pub(crate) fn replicate(&mut self, tail: Cursor, ring: &[Event]) -> io::Result<()> {
        let invalid = || io::Error::new(io::ErrorKind::InvalidData, "corte de eventos discontinuo");
        if tail.epoch != self.tail.epoch || tail.index < self.tail.index || tail.index == u64::MAX {
            return Err(invalid());
        }
        if tail == self.tail {
            return Ok(());
        }
        if ring.last().is_none_or(|e| e.cursor() != tail) {
            return Err(invalid());
        }
        for event in ring {
            event.validate()?;
            if event.cursor().epoch != tail.epoch {
                return Err(invalid());
            }
        }
        if ring
            .windows(2)
            .any(|pair| pair[0].cursor().index.checked_add(1) != Some(pair[1].cursor().index))
        {
            return Err(invalid());
        }
        let pending: Vec<_> = ring
            .iter()
            .filter(|e| e.cursor().index > self.tail.index)
            .copied()
            .collect();
        if let Some(first) = pending.first()
            && self.tail.index.checked_add(1) != Some(first.cursor().index)
        {
            self.events.clear();
            self.tail.index = first.cursor().index - 1;
            self.lost_before = Some(self.tail.index);
            if self.recording_status == RecordingStatus::Active {
                self.recording_status = RecordingStatus::Degraded(io::ErrorKind::InvalidData);
            }
        }
        for event in pending {
            self.push(event);
        }
        if self.tail != tail {
            return Err(invalid());
        }
        Ok(())
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
                .find(|event| cursor.index.checked_add(1) == Some(event.cursor().index))
        {
            return Ok(Some(event.delivery()));
        }
        // Un cursor de una época anterior puede recuperar su prefijo durable.
        if let Some(recording) = &self.recording {
            match recording.read(cursor, self.start)? {
                super::recording::Read::Event(event) => return Ok(Some(event.delivery())),
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
        if self.lost_before.is_some_and(|lost| cursor.index < lost) {
            return Ok(Some(self.gap(GapReason::Retention)));
        }
        if cursor == self.tail {
            return Ok(None);
        }
        let next = self
            .events
            .iter()
            .find(|event| event.cursor().index > cursor.index);
        match next {
            Some(event) if event.cursor().index == cursor.index + 1 => Ok(Some(event.delivery())),
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
            let mut before = Snapshot {
                epoch: 1,
                sequence: 1,
                state: photo(1, false).state,
                ..Snapshot::default()
            };
            let mut after = Snapshot {
                epoch: 1,
                sequence: 2,
                state: photo(2, true).state,
                ..Snapshot::default()
            };
            before.state.source_state = SourceState::Live;
            after.state.source_state = SourceState::Live;
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
