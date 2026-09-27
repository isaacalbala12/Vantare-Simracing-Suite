//! Versioned, bounded framing shared by all future local pipe messages.

use std::io::{self, Read, Write};

pub const VERSION: u16 = 1;
pub const HEADER_LEN: usize = 8;
pub const MAX_PAYLOAD_LEN: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum Kind {
    Handshake = 1,
    Configuration = 2,
    ConfigurationAck = 3,
    Snapshot = 4,
    Fact = 5,
    FactAck = 6,
    ResyncRequired = 7,
    Status = 8,
    Stop = 9,
}

impl TryFrom<u16> for Kind {
    type Error = FrameError;

    fn try_from(value: u16) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Handshake),
            2 => Ok(Self::Configuration),
            3 => Ok(Self::ConfigurationAck),
            4 => Ok(Self::Snapshot),
            5 => Ok(Self::Fact),
            6 => Ok(Self::FactAck),
            7 => Ok(Self::ResyncRequired),
            8 => Ok(Self::Status),
            9 => Ok(Self::Stop),
            _ => Err(FrameError::UnknownKind),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameError {
    IncompleteHeader,
    PayloadTooLarge,
    UnsupportedVersion,
    UnknownKind,
    IncompletePayload,
    TrailingBytes,
    Io,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Frame<'a> {
    pub kind: Kind,
    pub payload: &'a [u8],
}

pub fn encode(kind: Kind, payload: &[u8]) -> Result<Vec<u8>, FrameError> {
    if payload.len() > MAX_PAYLOAD_LEN {
        return Err(FrameError::PayloadTooLarge);
    }
    let mut frame = Vec::with_capacity(HEADER_LEN + payload.len());
    frame.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    frame.extend_from_slice(&VERSION.to_le_bytes());
    frame.extend_from_slice(&(kind as u16).to_le_bytes());
    frame.extend_from_slice(payload);
    Ok(frame)
}

pub fn decode(input: &[u8]) -> Result<Frame<'_>, FrameError> {
    let header = input
        .get(..HEADER_LEN)
        .ok_or(FrameError::IncompleteHeader)?;
    let length = u32::from_le_bytes(header[..4].try_into().expect("fixed header")) as usize;
    if length > MAX_PAYLOAD_LEN {
        return Err(FrameError::PayloadTooLarge);
    }
    let version = u16::from_le_bytes(header[4..6].try_into().expect("fixed header"));
    if version != VERSION {
        return Err(FrameError::UnsupportedVersion);
    }
    let kind = Kind::try_from(u16::from_le_bytes(
        header[6..8].try_into().expect("fixed header"),
    ))?;
    let expected = HEADER_LEN + length;
    if input.len() < expected {
        return Err(FrameError::IncompletePayload);
    }
    if input.len() > expected {
        return Err(FrameError::TrailingBytes);
    }
    Ok(Frame {
        kind,
        payload: &input[HEADER_LEN..],
    })
}

/// Reads one frame, including from a stream that returns short reads.
/// The length is checked before allocating the payload buffer.
pub fn read_frame(reader: &mut impl Read) -> Result<(Kind, Vec<u8>), FrameError> {
    let mut header = [0_u8; HEADER_LEN];
    reader
        .read_exact(&mut header)
        .map_err(|error| classify_io(error, FrameError::IncompleteHeader))?;
    let length = u32::from_le_bytes(header[..4].try_into().expect("fixed header")) as usize;
    if length > MAX_PAYLOAD_LEN {
        return Err(FrameError::PayloadTooLarge);
    }
    let version = u16::from_le_bytes(header[4..6].try_into().expect("fixed header"));
    if version != VERSION {
        return Err(FrameError::UnsupportedVersion);
    }
    let kind = Kind::try_from(u16::from_le_bytes(
        header[6..8].try_into().expect("fixed header"),
    ))?;
    let mut payload = vec![0_u8; length];
    reader
        .read_exact(&mut payload)
        .map_err(|error| classify_io(error, FrameError::IncompletePayload))?;
    Ok((kind, payload))
}

pub fn write_frame(writer: &mut impl Write, kind: Kind, payload: &[u8]) -> Result<(), FrameError> {
    let frame = encode(kind, payload)?;
    writer.write_all(&frame).map_err(|_| FrameError::Io)
}

fn classify_io(error: io::Error, truncated: FrameError) -> FrameError {
    if error.kind() == io::ErrorKind::UnexpectedEof {
        truncated
    } else {
        FrameError::Io
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    struct ShortIo<T>(T);

    impl<T: Read> Read for ShortIo<T> {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            let count = buffer.len().min(2);
            self.0.read(&mut buffer[..count])
        }
    }

    impl<T: Write> Write for ShortIo<T> {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            self.0.write(&buffer[..buffer.len().min(2)])
        }

        fn flush(&mut self) -> io::Result<()> {
            self.0.flush()
        }
    }

    #[test]
    fn round_trip_each_message_kind() {
        for raw_kind in 1..=9 {
            let kind = Kind::try_from(raw_kind).unwrap();
            let encoded = encode(kind, &[0, 1, 255]).unwrap();
            assert_eq!(
                encoded,
                [3, 0, 0, 0, 1, 0, raw_kind as u8, 0, 0, 1, 255],
                "Go and Rust must use the same fixed wire bytes"
            );
            assert_eq!(
                decode(&encoded).unwrap(),
                Frame {
                    kind,
                    payload: &[0, 1, 255]
                }
            );
        }
    }

    #[test]
    fn rejects_invalid_boundaries_before_using_payload() {
        let valid = encode(Kind::Handshake, &[7]).unwrap();
        assert_eq!(decode(&valid[..7]), Err(FrameError::IncompleteHeader));
        assert_eq!(decode(&valid[..8]), Err(FrameError::IncompletePayload));
        assert_eq!(
            decode(&[valid.as_slice(), &[0]].concat()),
            Err(FrameError::TrailingBytes)
        );

        let mut oversized = valid.clone();
        oversized[..4].copy_from_slice(&((MAX_PAYLOAD_LEN + 1) as u32).to_le_bytes());
        assert_eq!(decode(&oversized), Err(FrameError::PayloadTooLarge));

        let mut wrong_version = valid.clone();
        wrong_version[4..6].copy_from_slice(&(VERSION + 1).to_le_bytes());
        assert_eq!(decode(&wrong_version), Err(FrameError::UnsupportedVersion));

        let mut unknown_kind = valid;
        unknown_kind[6..8].copy_from_slice(&0_u16.to_le_bytes());
        assert_eq!(decode(&unknown_kind), Err(FrameError::UnknownKind));
        assert_eq!(Kind::try_from(10), Err(FrameError::UnknownKind));
    }

    #[test]
    fn accepts_the_numeric_limit_and_rejects_the_next_byte() {
        assert!(encode(Kind::Snapshot, &vec![0; MAX_PAYLOAD_LEN]).is_ok());
        assert_eq!(
            encode(Kind::Snapshot, &vec![0; MAX_PAYLOAD_LEN + 1]),
            Err(FrameError::PayloadTooLarge)
        );
    }

    #[test]
    fn streaming_handles_short_io_and_truncation() {
        let mut writer = ShortIo(Vec::new());
        write_frame(&mut writer, Kind::Status, &[1, 2, 3]).unwrap();
        let encoded = writer.0;
        let mut reader = ShortIo(Cursor::new(encoded.as_slice()));
        assert_eq!(read_frame(&mut reader), Ok((Kind::Status, vec![1, 2, 3])));

        assert_eq!(
            read_frame(&mut Cursor::new(&encoded[..HEADER_LEN - 1])),
            Err(FrameError::IncompleteHeader)
        );
        assert_eq!(
            read_frame(&mut Cursor::new(&encoded[..encoded.len() - 1])),
            Err(FrameError::IncompletePayload)
        );
    }

    #[test]
    fn streaming_rejects_oversize_before_reading_payload() {
        let mut header = [0_u8; HEADER_LEN];
        header[..4].copy_from_slice(&((MAX_PAYLOAD_LEN + 1) as u32).to_le_bytes());
        header[4..6].copy_from_slice(&VERSION.to_le_bytes());
        header[6..8].copy_from_slice(&(Kind::Snapshot as u16).to_le_bytes());
        assert_eq!(
            read_frame(&mut Cursor::new(header)),
            Err(FrameError::PayloadTooLarge)
        );
    }
}
