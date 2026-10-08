//! Explicit Go request for retained Fact frames after a verified cursor.

use serde::Deserialize;

use super::{FrameError, Kind};
use crate::core::facts::FactCursor;

pub const MAX_REPLAY_REQUEST_PAYLOAD: usize = 128;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReplayRequestError {
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

pub fn decode_frame(frame: &[u8]) -> Result<FactCursor, ReplayRequestError> {
    let decoded = super::decode(frame).map_err(ReplayRequestError::Frame)?;
    if decoded.kind != Kind::FactReplayRequest {
        return Err(ReplayRequestError::WrongKind);
    }
    if decoded.payload.len() > MAX_REPLAY_REQUEST_PAYLOAD {
        return Err(ReplayRequestError::TooLarge);
    }
    let wire: Wire =
        serde_json::from_slice(decoded.payload).map_err(|_| ReplayRequestError::InvalidPayload)?;
    if wire.stream == 0 {
        return Err(ReplayRequestError::InvalidPayload);
    }
    Ok(FactCursor {
        stream: wire.stream,
        sequence: wire.sequence,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_zero_baseline_but_rejects_foreign_schema_and_bounds() {
        let valid = super::super::encode(Kind::FactReplayRequest, br#"{"stream":15,"sequence":0}"#)
            .unwrap();
        assert_eq!(
            decode_frame(&valid),
            Ok(FactCursor {
                stream: 15,
                sequence: 0
            })
        );
        assert_eq!(
            decode_frame(
                &super::super::encode(Kind::FactAck, br#"{"stream":15,"sequence":1}"#).unwrap()
            ),
            Err(ReplayRequestError::WrongKind)
        );
        for payload in [
            br#"{"stream":0,"sequence":0}"#.as_slice(),
            br#"{"stream":15}"#.as_slice(),
            br#"{"stream":15,"sequence":0,"extra":1}"#.as_slice(),
        ] {
            let frame = super::super::encode(Kind::FactReplayRequest, payload).unwrap();
            assert_eq!(
                decode_frame(&frame),
                Err(ReplayRequestError::InvalidPayload)
            );
        }
        assert_eq!(
            super::super::encode(
                Kind::FactReplayRequest,
                &[b' '; MAX_REPLAY_REQUEST_PAYLOAD + 1]
            ),
            Err(super::super::FrameError::PayloadTooLarge)
        );
    }
}
