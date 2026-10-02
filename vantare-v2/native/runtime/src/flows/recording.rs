//! JSONL: eventos v1 y bases v2. Un solo propietario del fichero por contrato.

use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::{self, BufRead, BufReader, Read as _, Write};
use std::path::{Path, PathBuf};

use super::{Cursor, Event, GapReason};
use serde_json::Value;

const MAX_RECORD_BYTES: u64 = 256;
const ABORTED: &[u8] = b"\tABORTED\n";

pub(super) enum Read {
    Event(Event),
    Boundary(GapReason, Cursor),
    End,
    Invalid,
}

pub(super) struct Recording {
    path: PathBuf,
    file: File,
    last: Option<Cursor>,
    durable_event: Option<Cursor>,
    failed: bool,
    #[cfg(test)]
    pub(super) fail_write: Option<i32>,
    #[cfg(test)]
    pub(super) fail_sync: Option<i32>,
}

impl Recording {
    pub(super) fn open(path: &Path) -> io::Result<Self> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .read(true)
            .open(path)?;
        let mut reader = BufReader::new(File::open(path)?);
        let mut last = None;
        let mut durable_event = None;
        loop {
            match next(&mut reader)? {
                Line::Event(event) => {
                    validate_order(last, event)?;
                    last = Some(event.cursor());
                    durable_event = last;
                }
                Line::Base(cursor) => {
                    validate_base(last, cursor)?;
                    last = Some(cursor);
                }
                Line::Aborted => {}
                Line::End => break,
                Line::Torn => {
                    // No truncar ni reescribir el prefijo: cerrar solo la cola
                    // sin newline, que nunca pudo confirmarse como durable.
                    file.write_all(ABORTED)?;
                    file.sync_all()?;
                    break;
                }
            }
        }
        // Un registro completo puede proceder de un append cuya confirmación
        // se perdió. Sincronizar también ese prefijo antes de exponerlo durable.
        file.sync_all()?;
        Ok(Self {
            path: path.to_owned(),
            file,
            last,
            durable_event,
            failed: false,
            #[cfg(test)]
            fail_write: None,
            #[cfg(test)]
            fail_sync: None,
        })
    }

    pub(super) fn durable_event(&self) -> Option<Cursor> {
        self.durable_event
    }

    pub(super) fn watermark(&self) -> Option<Cursor> {
        self.last
    }

    pub(super) fn path(&self) -> &Path {
        &self.path
    }

    pub(super) fn begin(&mut self, cursor: Cursor) -> io::Result<()> {
        validate_base(self.last, cursor)?;
        let line = serde_json::json!([2, cursor.index, cursor.epoch]).to_string();
        self.append(&line)?;
        self.last = Some(cursor);
        Ok(())
    }

    fn append(&mut self, line: &str) -> io::Result<()> {
        let result = (|| {
            #[cfg(test)]
            if let Some(code) = self.fail_write.take() {
                return Err(io::Error::from_raw_os_error(code));
            }
            self.file.write_all(line.as_bytes())?;
            self.file.write_all(b"\n")?;
            #[cfg(test)]
            if let Some(code) = self.fail_sync.take() {
                return Err(io::Error::from_raw_os_error(code));
            }
            self.file.sync_all()
        })();
        if result.is_err() {
            self.failed = true;
        }
        result
    }

    pub(super) fn persist(&mut self, events: &VecDeque<Event>) -> io::Result<()> {
        if self.failed {
            return Err(io::Error::other(
                "recording falló; reabrir antes de escribir",
            ));
        }
        let mut last = self.last;
        let confirmed = self.last.map_or(0, |c| c.index);
        for event in events.iter().filter(|e| e.cursor().index > confirmed) {
            validate_order(last, *event)?;
            let line = event.record().to_string();
            self.append(&line)?;
            // Cada evento se confirma solo después de su propia sincronización.
            self.last = Some(event.cursor());
            self.durable_event = self.last;
            last = self.last;
        }
        Ok(())
    }

    pub(super) fn read(&self, cursor: Cursor, start: Cursor) -> io::Result<Read> {
        let mut reader = BufReader::new(File::open(&self.path)?);
        let mut valid = cursor == start;
        let mut previous: Option<Cursor> = None;
        // ponytail: búsqueda lineal en disco por lectura; añadir índice solo
        // con consumidores/volúmenes que midan este coste. Memoria constante.
        loop {
            match next(&mut reader)? {
                Line::Base(base)
                    if self.last.is_some_and(|last| {
                        base.epoch <= last.epoch && base.index <= last.index
                    }) =>
                {
                    if cursor.epoch < base.epoch
                        || (cursor.epoch == base.epoch && cursor.index < base.index)
                    {
                        return Ok(Read::Boundary(GapReason::RecordingDisabled, base));
                    }
                    valid |= cursor == base;
                    previous = Some(base);
                }
                Line::Event(event) if event.cursor().index <= self.last.map_or(0, |c| c.index) => {
                    // La cola volátil pudo avanzar más allá del prefijo
                    // durable. Una nueva época se recupera desde su comienzo,
                    // incluso si reutiliza esos índices no confirmados.
                    if event.cursor().epoch > cursor.epoch {
                        return Ok(Read::Boundary(
                            GapReason::CoreRestart,
                            Cursor {
                                epoch: event.cursor().epoch,
                                index: event.cursor().index - 1,
                            },
                        ));
                    }
                    if event.cursor() == cursor {
                        valid = true;
                    } else if event.cursor().epoch == cursor.epoch
                        && event.cursor().index > cursor.index
                    {
                        // Base virtual al empezar una época: justo antes de
                        // su primer evento, incluso entre épocas recuperadas.
                        valid |= event.cursor().index == cursor.index + 1
                            && previous
                                .is_none_or(|p| p.index == cursor.index && p.epoch < cursor.epoch);
                        if !valid {
                            return Ok(Read::Invalid);
                        }
                        return Ok(Read::Event(event));
                    }
                    previous = Some(event.cursor());
                }
                Line::Aborted => {}
                _ => return Ok(if valid { Read::End } else { Read::Invalid }),
            }
        }
    }
}

fn validate_order(last: Option<Cursor>, event: Event) -> io::Result<()> {
    event.validate()?;
    let index = last.map_or(0, |c| c.index);
    if Some(event.cursor().index) != index.checked_add(1)
        || last.is_some_and(|c| event.cursor().epoch < c.epoch)
        || event.cursor().index == u64::MAX
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "journal discontinuo",
        ));
    }
    Ok(())
}

fn validate_base(last: Option<Cursor>, base: Cursor) -> io::Result<()> {
    if base.index == u64::MAX || last.is_some_and(|c| c.epoch > base.epoch || c.index > base.index)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "base de recording inválida",
        ));
    }
    Ok(())
}

enum Line {
    Event(Event),
    Base(Cursor),
    Aborted,
    Torn,
    End,
}

fn next(reader: &mut impl BufRead) -> io::Result<Line> {
    let mut bytes = Vec::new();
    let count = reader
        .take(MAX_RECORD_BYTES + 1)
        .read_until(b'\n', &mut bytes)?;
    if count == 0 {
        return Ok(Line::End);
    }
    if count as u64 > MAX_RECORD_BYTES
        || (!bytes.ends_with(b"\n") && count as u64 + ABORTED.len() as u64 > MAX_RECORD_BYTES)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "registro demasiado grande",
        ));
    }
    if !bytes.ends_with(b"\n") {
        return Ok(Line::Torn);
    }
    if bytes.ends_with(ABORTED) {
        return Ok(Line::Aborted);
    }
    decode(&bytes)
}

fn decode(bytes: &[u8]) -> io::Result<Line> {
    let invalid = || io::Error::new(io::ErrorKind::InvalidData, "registro de eventos inválido");
    let value: Value = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    let fields = value.as_array().ok_or_else(invalid)?;
    let number = |index: usize| fields[index].as_u64().ok_or_else(invalid);
    if fields.len() == 3 && fields[0].as_u64() == Some(2) {
        return Ok(Line::Base(Cursor {
            index: number(1)?,
            epoch: number(2)?,
        }));
    }
    Event::decode(&value).map(Line::Event)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use super::*;
    use crate::flows::PitEvent;
    use vantare_domain::{CarId, SessionId};

    #[test]
    fn failed_append_never_confirms_durability_or_retries_an_uncertain_write() {
        let file = super::super::tests::TestFile::new();
        let mut recording = Recording::open(&file.0).unwrap();
        // Un handle real de solo lectura fuerza un error de escritura sin
        // llenar el disco del usuario ni añadir una abstracción de producción.
        recording.file = File::open(&file.0).unwrap();
        let events = VecDeque::from([Event::Pit(PitEvent {
            cursor: Cursor { epoch: 1, index: 1 },
            sequence: 2,
            session: SessionId(0),
            car: CarId(7),
            was_in_pits: false,
            in_pits: true,
        })]);
        assert!(recording.persist(&events).is_err());
        assert!(recording.failed);
        assert_eq!(recording.durable_event(), None);
        assert!(recording.persist(&events).is_err());
        assert!(std::fs::read(&file.0).unwrap().is_empty());
    }
}
