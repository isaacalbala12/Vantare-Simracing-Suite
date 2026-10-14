//! Contrato neutral de eventos. El transporte aporta ACL/identidad y plazos;
//! el codec solo limita/valida JSON. Nunca usar en el hilo de adquisición.

use std::io::{self, Read, Write};

use serde_json::{Value, json};
use vantare_domain::{CarId, SessionId, Snapshot};

use super::{Consumer, Cursor, Delivery, Event, GapReason, Journal, PitEvent, RecordingStatus};

pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
const FRAME: &str = "vantare.events.v1";
const HELLO: &str = "vantare.events.hello.v1";
const ACK: &str = "vantare.events.ack.v1";

#[derive(Clone, Debug, PartialEq)]
pub struct Frame {
    pub snapshot: Snapshot,
    pub tail: Cursor,
    pub durable: Option<Cursor>,
    pub recording: RecordingStatus,
    pub delivery: Option<Delivery>,
}

impl Frame {
    /// Foto y tail se toman en el mismo turno del propietario. Serialización
    /// y poll con disco se hacen en su worker, sobre ese corte inmutable.
    pub fn capture(
        snapshot: &Snapshot,
        journal: &Journal,
        consumer: Option<&mut Consumer>,
    ) -> io::Result<Self> {
        let frame = Self {
            snapshot: snapshot.clone(),
            tail: journal.tail(),
            durable: journal.durable_cursor(),
            recording: journal.recording_status(),
            delivery: consumer
                .map(|consumer| consumer.poll(journal))
                .transpose()?
                .flatten(),
        };
        frame.validate()?;
        Ok(frame)
    }

    pub fn validate(&self) -> io::Result<()> {
        if self.tail.epoch != self.snapshot.epoch || self.tail.index == u64::MAX {
            return Err(invalid("foto y cola no comparten época"));
        }
        let within_tail =
            |cursor: Cursor| cursor.epoch <= self.tail.epoch && cursor.index <= self.tail.index;
        if self.durable.is_some_and(|cursor| !within_tail(cursor)) {
            return Err(invalid("durabilidad supera la cola"));
        }
        match self.delivery {
            Some(Delivery::Event(event))
                if !within_tail(event.cursor)
                    || event.cursor.index == 0
                    || event.sequence == 0
                    || event.was_in_pits == event.in_pits
                    || (event.cursor.epoch == self.snapshot.epoch
                        && event.sequence > self.snapshot.sequence) =>
            {
                Err(invalid("evento fuera del corte"))
            }
            Some(Delivery::Gap { resume_at, .. }) if !within_tail(resume_at) => {
                Err(invalid("base supera la cola"))
            }
            Some(Delivery::Fact(fact)) => {
                Event::Fact(fact).validate()?;
                if !within_tail(fact.cursor)
                    || (fact.cursor.epoch == self.snapshot.epoch
                        && fact.sequence > self.snapshot.sequence)
                {
                    return Err(invalid("hecho fuera del corte"));
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

pub fn encode_cursor(cursor: Cursor) -> Value {
    json!([cursor.epoch, cursor.index])
}

pub fn decode_cursor(value: &Value) -> io::Result<Cursor> {
    let fields = array(value, 2)?;
    let cursor = Cursor {
        epoch: number(&fields[0])?,
        index: number(&fields[1])?,
    };
    if cursor.index == u64::MAX {
        return Err(invalid("cursor agotado"));
    }
    Ok(cursor)
}

fn reason_code(reason: GapReason) -> u8 {
    match reason {
        GapReason::CoreRestart => 0,
        GapReason::Retention => 1,
        GapReason::InvalidCursor => 2,
        GapReason::RecordingDisabled => 3,
    }
}

fn decode_reason(value: &Value) -> io::Result<GapReason> {
    match number(value)? {
        0 => Ok(GapReason::CoreRestart),
        1 => Ok(GapReason::Retention),
        2 => Ok(GapReason::InvalidCursor),
        3 => Ok(GapReason::RecordingDisabled),
        _ => Err(invalid("hueco desconocido")),
    }
}

fn recording_value(status: RecordingStatus) -> Value {
    match status {
        RecordingStatus::Disabled => json!([0]),
        RecordingStatus::Active => json!([1]),
        RecordingStatus::Degraded(kind) => json!([
            2,
            match kind {
                io::ErrorKind::StorageFull => "storage_full",
                io::ErrorKind::PermissionDenied => "permission_denied",
                io::ErrorKind::NotFound => "not_found",
                io::ErrorKind::InvalidData => "invalid_data",
                _ => "other",
            }
        ]),
    }
}

fn decode_recording(value: &Value) -> io::Result<RecordingStatus> {
    let fields = value
        .as_array()
        .ok_or_else(|| invalid("estado recording inválido"))?;
    match fields.as_slice() {
        [code] if code.as_u64() == Some(0) => Ok(RecordingStatus::Disabled),
        [code] if code.as_u64() == Some(1) => Ok(RecordingStatus::Active),
        [code, kind] if code.as_u64() == Some(2) => {
            Ok(RecordingStatus::Degraded(match kind.as_str() {
                Some("storage_full") => io::ErrorKind::StorageFull,
                Some("permission_denied") => io::ErrorKind::PermissionDenied,
                Some("not_found") => io::ErrorKind::NotFound,
                Some("invalid_data") => io::ErrorKind::InvalidData,
                Some("other") => io::ErrorKind::Other,
                _ => return Err(invalid("causa recording inválida")),
            }))
        }
        _ => Err(invalid("estado recording inválido")),
    }
}

pub fn write_frame(writer: &mut impl Write, frame: &Frame) -> io::Result<()> {
    frame.validate()?;
    let snapshot = vantare_ipc::snapshot_to_json(&frame.snapshot).map_err(invalid_error)?;
    let delivery = match frame.delivery {
        None => Value::Null,
        Some(Delivery::Event(event)) => json!([
            0,
            encode_cursor(event.cursor),
            event.sequence,
            event.session.0,
            event.car.0,
            event.was_in_pits,
            event.in_pits
        ]),
        Some(Delivery::Gap { reason, resume_at }) => {
            json!([1, reason_code(reason), encode_cursor(resume_at)])
        }
        Some(Delivery::Fact(fact)) => json!([2, Event::Fact(fact).record()]),
    };
    write_value(
        writer,
        &json!([
            FRAME,
            snapshot,
            encode_cursor(frame.tail),
            frame.durable.map(encode_cursor),
            recording_value(frame.recording),
            delivery
        ]),
    )
}

pub fn read_frame(reader: &mut impl Read) -> io::Result<Option<Frame>> {
    let Some(value) = read_value(reader)? else {
        return Ok(None);
    };
    let fields = message(&value, FRAME, 6)?;
    let snapshot = vantare_ipc::snapshot_from_json(
        fields[1]
            .as_str()
            .ok_or_else(|| invalid("falta foto DTO"))?,
    )
    .map_err(invalid_error)?;
    let delivery = if fields[5].is_null() {
        None
    } else {
        let values = fields[5]
            .as_array()
            .ok_or_else(|| invalid("entrega inválida"))?;
        Some(match values.as_slice() {
            [code, cursor, sequence, session, car, was, now] if code.as_u64() == Some(0) => {
                Delivery::Event(PitEvent {
                    cursor: decode_cursor(cursor)?,
                    sequence: number(sequence)?,
                    session: SessionId(number(session)?),
                    car: CarId(u32::try_from(number(car)?).map_err(invalid_error)?),
                    was_in_pits: was.as_bool().ok_or_else(|| invalid("boxes no booleano"))?,
                    in_pits: now.as_bool().ok_or_else(|| invalid("boxes no booleano"))?,
                })
            }
            [code, reason, cursor] if code.as_u64() == Some(1) => Delivery::Gap {
                reason: decode_reason(reason)?,
                resume_at: decode_cursor(cursor)?,
            },
            [code, record] if code.as_u64() == Some(2) => {
                let Event::Fact(fact) = Event::decode(record)? else {
                    return Err(invalid("se esperaba hecho v3"));
                };
                Delivery::Fact(fact)
            }
            _ => return Err(invalid("entrega desconocida")),
        })
    };
    let frame = Frame {
        snapshot,
        tail: decode_cursor(&fields[2])?,
        durable: optional_cursor(&fields[3])?,
        recording: decode_recording(&fields[4])?,
        delivery,
    };
    frame.validate()?;
    Ok(Some(frame))
}

pub fn write_hello(writer: &mut impl Write, cursor: Option<Cursor>) -> io::Result<()> {
    write_value(writer, &json!([HELLO, cursor.map(encode_cursor)]))
}

pub fn read_hello(reader: &mut impl Read) -> io::Result<Option<Cursor>> {
    let value = required_value(reader)?;
    optional_cursor(&message(&value, HELLO, 2)?[1])
}

pub fn write_ack(writer: &mut impl Write, cursor: Cursor) -> io::Result<()> {
    write_value(writer, &json!([ACK, encode_cursor(cursor)]))
}

pub fn read_ack(reader: &mut impl Read) -> io::Result<Cursor> {
    let value = required_value(reader)?;
    decode_cursor(&message(&value, ACK, 2)?[1])
}

fn write_value(writer: &mut impl Write, value: &Value) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(invalid_error)?;
    if bytes.len() > MAX_FRAME_BYTES {
        return Err(invalid("mensaje supera 1 MiB"));
    }
    let length = u32::try_from(bytes.len()).map_err(invalid_error)?;
    writer.write_all(&length.to_le_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()
}

fn read_value(reader: &mut impl Read) -> io::Result<Option<Value>> {
    let mut length = [0; 4];
    if reader.read(&mut length[..1])? == 0 {
        return Ok(None);
    }
    reader.read_exact(&mut length[1..])?;
    let length = u32::from_le_bytes(length) as usize;
    if length > MAX_FRAME_BYTES {
        return Err(invalid("mensaje supera 1 MiB"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(invalid_error)
}

fn required_value(reader: &mut impl Read) -> io::Result<Value> {
    read_value(reader)?.ok_or_else(|| io::Error::from(io::ErrorKind::UnexpectedEof))
}

fn optional_cursor(value: &Value) -> io::Result<Option<Cursor>> {
    if value.is_null() {
        Ok(None)
    } else {
        decode_cursor(value).map(Some)
    }
}

fn array(value: &Value, length: usize) -> io::Result<&[Value]> {
    value
        .as_array()
        .filter(|values| values.len() == length)
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("forma inválida"))
}

fn message<'a>(value: &'a Value, tag: &str, length: usize) -> io::Result<&'a [Value]> {
    let fields = array(value, length)?;
    if fields[0].as_str() != Some(tag) {
        return Err(invalid("versión o mensaje incompatible"));
    }
    Ok(fields)
}

fn number(value: &Value) -> io::Result<u64> {
    value
        .as_u64()
        .ok_or_else(|| invalid("entero sin signo requerido"))
}
fn invalid(text: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, text)
}
fn invalid_error(error: impl std::error::Error + Send + Sync + 'static) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::Core;
    use crate::flows::tests::photo;

    #[test]
    fn snapshot_event_recording_and_gap_round_trip_without_simulator_types() {
        let mut core = Core::new(1);
        let mut consumer = Consumer::new(core.events().tail());
        core.observe(photo(1, false)).unwrap();
        core.observe(photo(2, true)).unwrap();
        let mut frame =
            Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
        for delivery in [
            frame.delivery,
            Some(Delivery::Gap {
                reason: GapReason::RecordingDisabled,
                resume_at: frame.tail,
            }),
            None,
        ] {
            frame.delivery = delivery;
            frame.recording = RecordingStatus::Degraded(io::ErrorKind::StorageFull);
            let mut bytes = Vec::new();
            write_frame(&mut bytes, &frame).unwrap();
            assert_eq!(
                read_frame(&mut bytes.as_slice()).unwrap(),
                Some(frame.clone())
            );
        }
    }

    #[test]
    fn bounds_partial_frames_versions_and_invalid_cuts_are_rejected() {
        let oversized = u32::try_from(MAX_FRAME_BYTES + 1).unwrap().to_le_bytes();
        assert!(
            read_frame(&mut oversized.as_slice()).is_err(),
            "sin leer cuerpo ni reservarlo"
        );
        assert!(read_frame(&mut [1_u8, 0].as_slice()).is_err());
        assert!(decode_cursor(&json!([-1, 0])).is_err());
        assert!(decode_cursor(&json!([1, u64::MAX])).is_err());
        let mut bytes = Vec::new();
        write_value(&mut bytes, &json!(["vantare.events.v999", null])).unwrap();
        assert!(read_frame(&mut bytes.as_slice()).is_err());
        let core = Core::new(1);
        let mut frame = Frame::capture(&core.snapshot(), core.events(), None).unwrap();
        frame.tail.epoch = 2;
        assert!(frame.validate().is_err());
        assert_eq!(read_frame(&mut [].as_slice()).unwrap(), None);
    }

    #[test]
    fn hello_and_ack_preserve_exact_consumer_cursor() {
        let cursor = Cursor {
            epoch: 7,
            index: 42,
        };
        for value in [Some(cursor), None] {
            let mut bytes = Vec::new();
            write_hello(&mut bytes, value).unwrap();
            assert_eq!(read_hello(&mut bytes.as_slice()).unwrap(), value);
        }
        let mut bytes = Vec::new();
        write_ack(&mut bytes, cursor).unwrap();
        assert_eq!(read_ack(&mut bytes.as_slice()).unwrap(), cursor);
    }
}
