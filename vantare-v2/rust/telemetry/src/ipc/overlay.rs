//! Bounded Wails-host proxy protocol. Rust owns the pull state and replies;
//! the host supplies the authenticated window identity and carries bytes.

use serde::Deserialize;
use serde_json::value::RawValue;

use crate::delivery::{DeliveryError, OverlayPull, PullRequest};

use super::{FrameError, Kind};

pub const MAX_COMMAND_PAYLOAD: usize = 1024;
pub const MAX_REPLY_PAYLOAD: usize = 160 * 1024;
const MAX_SENDER_BYTES: usize = 128;
const MAX_SESSION_BYTES: usize = 128;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OverlayError {
    Frame(FrameError),
    InvalidCommand,
    InvalidSnapshot,
    Delivery(DeliveryError),
}

#[derive(Deserialize)]
struct ProductOnly<'a> {
    product: &'a str,
}

#[derive(Deserialize)]
struct OverlayEnvelope<'a> {
    #[serde(borrow)]
    update: &'a RawValue,
}

#[derive(Deserialize)]
struct RevisionOnly {
    revision: u64,
}

/// Retains the exact Rust-produced Overlay update for a later Wails pull.
/// Other products remain on their own delivery paths.
pub fn retain_snapshot_frame(pull: &mut OverlayPull, frame: &[u8]) -> Result<bool, OverlayError> {
    let decoded = super::decode(frame).map_err(OverlayError::Frame)?;
    if decoded.kind != Kind::Snapshot || !decoded.payload.starts_with(b"{") {
        return Ok(false);
    }
    let product: ProductOnly<'_> =
        serde_json::from_slice(decoded.payload).map_err(|_| OverlayError::InvalidSnapshot)?;
    if product.product != super::snapshot::PRODUCT_OVERLAY_V2 {
        return Ok(false);
    }
    let envelope: OverlayEnvelope<'_> =
        serde_json::from_slice(decoded.payload).map_err(|_| OverlayError::InvalidSnapshot)?;
    let update = envelope.update.get();
    let revision: RevisionOnly =
        serde_json::from_str(update).map_err(|_| OverlayError::InvalidSnapshot)?;
    pull.publish_snapshot(revision.revision, update.as_bytes())
        .map_err(OverlayError::Delivery)?;
    Ok(true)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct Command {
    request_id: u64,
    operation: Operation,
    sender: String,
    #[serde(default)]
    session_id: String,
    #[serde(default)]
    ack: u64,
    #[serde(default)]
    sections: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Operation {
    Pull,
    Close,
    CloseSender,
}

pub fn handle_frame(pull: &mut OverlayPull, frame: &[u8]) -> Result<Vec<u8>, OverlayError> {
    let decoded = super::decode(frame).map_err(OverlayError::Frame)?;
    if decoded.kind != Kind::OverlayCommand || decoded.payload.len() > MAX_COMMAND_PAYLOAD {
        return Err(OverlayError::InvalidCommand);
    }
    let command: Command =
        serde_json::from_slice(decoded.payload).map_err(|_| OverlayError::InvalidCommand)?;
    if command.request_id == 0
        || command.sender.is_empty()
        || command.sender.len() > MAX_SENDER_BYTES
        || command.session_id.len() > MAX_SESSION_BYTES
        || command.sections > 1
    {
        return Err(OverlayError::InvalidCommand);
    }
    let response = match command.operation {
        Operation::Pull => {
            if command.session_id.is_empty() {
                return Err(OverlayError::InvalidCommand);
            }
            pull.pull(
                &command.sender,
                PullRequest {
                    session_id: &command.session_id,
                    ack: command.ack,
                    sections: command.sections,
                },
            )
            .map_err(OverlayError::Delivery)?
        }
        Operation::Close => {
            if command.session_id.is_empty() || command.ack != 0 || command.sections != 0 {
                return Err(OverlayError::InvalidCommand);
            }
            pull.close(&command.sender, &command.session_id);
            None
        }
        Operation::CloseSender => {
            if !command.session_id.is_empty() || command.ack != 0 || command.sections != 0 {
                return Err(OverlayError::InvalidCommand);
            }
            pull.close_sender(&command.sender);
            None
        }
    };
    let mut payload = format!("{{\"requestId\":{},\"response\":", command.request_id).into_bytes();
    if let Some(response) = response {
        payload.extend_from_slice(&response.encode_json());
    } else {
        payload.extend_from_slice(b"null");
    }
    payload.push(b'}');
    super::encode(Kind::OverlayReply, &payload).map_err(OverlayError::Frame)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn command(json: &[u8]) -> Vec<u8> {
        super::super::encode(Kind::OverlayCommand, json).unwrap()
    }

    #[test]
    fn pull_reply_is_correlated_and_replayed() {
        let mut pull = OverlayPull::new();
        pull.publish_status(1, br#"{"revision":1}"#).unwrap();
        let request = command(br#"{"requestId":7,"operation":"pull","sender":"studio","sessionId":"s","ack":0,"sections":0}"#);
        let first = handle_frame(&mut pull, &request).unwrap();
        assert_eq!(handle_frame(&mut pull, &request).unwrap(), first);
        let decoded = super::super::decode(&first).unwrap();
        assert_eq!(decoded.kind, Kind::OverlayReply);
        let value: serde_json::Value = serde_json::from_slice(decoded.payload).unwrap();
        assert_eq!(value["requestId"], 7);
        assert_eq!(value["response"]["delivery"], 1);
        assert_eq!(value["response"]["events"][0]["data"]["revision"], 1);
        let ack = command(
            br#"{"requestId":8,"operation":"pull","sender":"studio","sessionId":"s","ack":1}"#,
        );
        let value: serde_json::Value = serde_json::from_slice(
            super::super::decode(&handle_frame(&mut pull, &ack).unwrap())
                .unwrap()
                .payload,
        )
        .unwrap();
        assert_eq!(value["requestId"], 8);
        assert!(value["response"].is_null());
    }

    #[test]
    fn close_and_sender_teardown_release_only_the_matching_window() {
        let mut pull = OverlayPull::new();
        let first =
            command(br#"{"requestId":1,"operation":"pull","sender":"studio","sessionId":"s"}"#);
        handle_frame(&mut pull, &first).unwrap();
        assert!(pull.has_consumers());
        let close =
            command(br#"{"requestId":2,"operation":"close","sender":"studio","sessionId":"s"}"#);
        handle_frame(&mut pull, &close).unwrap();
        assert!(!pull.has_consumers());
        let stale = handle_frame(&mut pull, &first).unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(super::super::decode(&stale).unwrap().payload).unwrap();
        assert!(value["response"].is_null());
        let new =
            command(br#"{"requestId":3,"operation":"pull","sender":"studio","sessionId":"new"}"#);
        handle_frame(&mut pull, &new).unwrap();
        let teardown = command(br#"{"requestId":4,"operation":"closeSender","sender":"studio"}"#);
        handle_frame(&mut pull, &teardown).unwrap();
        assert!(!pull.has_consumers());
    }

    #[test]
    fn invalid_commands_do_not_create_sessions() {
        let mut pull = OverlayPull::new();
        for bad in [
            br#"{"requestId":0,"operation":"pull","sender":"studio","sessionId":"s"}"#.as_slice(),
            br#"{"requestId":1,"operation":"pull","sender":"studio"}"#.as_slice(),
            br#"{"requestId":1,"operation":"close","sender":"studio","sessionId":"s","ack":1}"#
                .as_slice(),
            br#"{"requestId":1,"operation":"pull","sender":"studio","sessionId":"s","unknown":1}"#
                .as_slice(),
            br#"{"requestId":1,"operation":"pull","sender":"studio","sessionId":"s","sections":2}"#
                .as_slice(),
        ] {
            assert_eq!(
                handle_frame(&mut pull, &command(bad)),
                Err(OverlayError::InvalidCommand)
            );
        }
        assert!(!pull.has_consumers());
    }

    #[test]
    fn real_rust_overlay_snapshot_is_retained_without_go_reprojection() {
        let frame = include_bytes!("../../testdata/overlay-snapshot-frame-rust-v1.bin");
        let mut pull = OverlayPull::new();
        assert_eq!(retain_snapshot_frame(&mut pull, frame), Ok(true));
        let request =
            command(br#"{"requestId":9,"operation":"pull","sender":"studio","sessionId":"s"}"#);
        let reply = handle_frame(&mut pull, &request).unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(super::super::decode(&reply).unwrap().payload).unwrap();
        assert_eq!(
            value["response"]["events"][0]["name"],
            "telemetry:overlay-v2:snapshot"
        );
        assert_eq!(
            value["response"]["events"][0]["data"]["frame"]["contract"],
            2
        );
    }
}
