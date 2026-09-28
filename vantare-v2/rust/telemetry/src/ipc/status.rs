//! Bounded process heartbeat and source health; no simulator payload.

use serde::{Deserialize, Serialize};

use super::{FrameError, Kind};

pub const MAX_STATUS_PAYLOAD: usize = 256;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StatusError {
    WrongKind,
    Invalid,
    TooLarge,
    Frame(FrameError),
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum State {
    Detecting,
    Connecting,
    Live,
    Degraded,
    Stale,
    Error,
    Stopping,
    Stopped,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Status {
    pub heartbeat: u64,
    pub state: State,
    pub source_age_ns: Option<u64>,
}

impl Status {
    fn valid(self) -> bool {
        self.heartbeat != 0
            && (!matches!(self.state, State::Live | State::Degraded | State::Stale)
                || self.source_age_ns.is_some())
            && (matches!(self.state, State::Live | State::Degraded | State::Stale)
                || self.source_age_ns.is_none())
    }
}

pub fn encode(status: Status) -> Result<Vec<u8>, StatusError> {
    if !status.valid() {
        return Err(StatusError::Invalid);
    }
    let payload = serde_json::to_vec(&status).map_err(|_| StatusError::Invalid)?;
    if payload.len() > MAX_STATUS_PAYLOAD {
        return Err(StatusError::TooLarge);
    }
    super::encode(Kind::Status, &payload).map_err(StatusError::Frame)
}

pub fn decode(frame: super::Frame<'_>) -> Result<Status, StatusError> {
    if frame.kind != Kind::Status {
        return Err(StatusError::WrongKind);
    }
    if frame.payload.len() > MAX_STATUS_PAYLOAD {
        return Err(StatusError::TooLarge);
    }
    let value: serde_json::Value =
        serde_json::from_slice(frame.payload).map_err(|_| StatusError::Invalid)?;
    let object = value.as_object().ok_or(StatusError::Invalid)?;
    if !object.contains_key("heartbeat")
        || !object.contains_key("state")
        || !object.contains_key("sourceAgeNs")
    {
        return Err(StatusError::Invalid);
    }
    let status: Status = serde_json::from_slice(frame.payload).map_err(|_| StatusError::Invalid)?;
    if !status.valid() {
        return Err(StatusError::Invalid);
    }
    Ok(status)
}

pub fn decode_stop(frame: super::Frame<'_>) -> Result<(), StatusError> {
    if frame.kind != Kind::Stop {
        return Err(StatusError::WrongKind);
    }
    if !frame.payload.is_empty() {
        return Err(StatusError::Invalid);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_roundtrip_and_closed_boundaries() {
        let status = Status {
            heartbeat: 1,
            state: State::Live,
            source_age_ns: Some(0),
        };
        let wire = encode(status).unwrap();
        assert_eq!(decode(super::super::decode(&wire).unwrap()), Ok(status));
        assert_eq!(wire, b"\x2e\x00\x00\x00\x01\x00\x08\x00{\"heartbeat\":1,\"state\":\"live\",\"sourceAgeNs\":0}");
        assert_eq!(
            encode(Status {
                heartbeat: 0,
                ..status
            }),
            Err(StatusError::Invalid)
        );
        assert_eq!(
            encode(Status {
                source_age_ns: None,
                ..status
            }),
            Err(StatusError::Invalid)
        );
        for payload in [
            b"{}".as_slice(),
            b"{\"heartbeat\":1,\"state\":\"detecting\"}",
            b"{\"heartbeat\":1,\"state\":\"live\",\"sourceAgeNs\":null}",
            b"{\"heartbeat\":1,\"state\":\"unknown\",\"sourceAgeNs\":0}",
            b"{\"heartbeat\":1,\"state\":\"live\",\"sourceAgeNs\":0,\"extra\":1}",
            b"{\"heartbeat\":1,\"state\":\"live\",\"sourceAgeNs\":0} trailing",
        ] {
            assert_eq!(
                decode(super::super::Frame {
                    kind: Kind::Status,
                    payload
                }),
                Err(StatusError::Invalid)
            );
        }
        assert_eq!(
            decode(super::super::Frame {
                kind: Kind::Status,
                payload: &vec![b'x'; MAX_STATUS_PAYLOAD + 1]
            }),
            Err(StatusError::TooLarge)
        );
        assert_eq!(
            decode_stop(super::super::Frame {
                kind: Kind::Stop,
                payload: b""
            }),
            Ok(())
        );
        assert_eq!(
            decode_stop(super::super::Frame {
                kind: Kind::Stop,
                payload: b"x"
            }),
            Err(StatusError::Invalid)
        );
    }
}
