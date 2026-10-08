//! Strict receiver-retention acknowledgement from the Go host.

use serde::Deserialize;

use super::{FrameError, Kind};
use crate::core::facts::FactCursor;

pub const MAX_FACT_ACK_PAYLOAD: usize = 128;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FactAckError {
    Frame(FrameError),
    WrongKind,
    TooLarge,
    InvalidPayload,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Wire {
    stream: u64,
    sequence: u64,
}

pub fn decode_frame(frame: &[u8]) -> Result<FactCursor, FactAckError> {
    let decoded = super::decode(frame).map_err(FactAckError::Frame)?;
    if decoded.kind != Kind::FactAck {
        return Err(FactAckError::WrongKind);
    }
    if decoded.payload.len() > MAX_FACT_ACK_PAYLOAD {
        return Err(FactAckError::TooLarge);
    }
    let wire: Wire =
        serde_json::from_slice(decoded.payload).map_err(|_| FactAckError::InvalidPayload)?;
    if wire.stream == 0 || wire.sequence == 0 {
        return Err(FactAckError::InvalidPayload);
    }
    Ok(FactCursor {
        stream: wire.stream,
        sequence: wire.sequence,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const GO_ACK: &[u8] = include_bytes!("../../testdata/fact-ack-frame-go-v1.bin");

    #[test]
    fn go_ack_frame_decodes_and_rejects_wrong_cursor_or_schema() {
        assert_eq!(
            decode_frame(GO_ACK),
            Ok(FactCursor {
                stream: 15,
                sequence: 1
            })
        );
        assert_eq!(
            decode_frame(&super::super::encode(Kind::Stop, &[]).unwrap()),
            Err(FactAckError::WrongKind)
        );
        for payload in [
            br#"{"stream":0,"sequence":1}"#.as_slice(),
            br#"{"stream":15,"sequence":0}"#.as_slice(),
            br#"{"stream":15,"sequence":1,"extra":1}"#.as_slice(),
        ] {
            let frame = super::super::encode(Kind::FactAck, payload).unwrap();
            assert_eq!(decode_frame(&frame), Err(FactAckError::InvalidPayload));
        }
    }
}
