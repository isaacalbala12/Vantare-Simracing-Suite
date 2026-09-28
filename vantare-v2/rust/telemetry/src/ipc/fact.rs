//! Ordered Engineer fact payload. Framing and transport ACK are separate.

use serde::Serialize;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use super::{FrameError, Kind, snapshot::ProductMetadata};
use crate::core::session::{FactKind, SessionFact};

pub const PRODUCT_ENGINEER_V1: &str = "engineer-v1";
pub const MAX_FACT_PAYLOAD: usize = 4 << 10;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FactEncodeError {
    InvalidCursor,
    InvalidOccurredAt,
    TooLarge,
    Json,
    Frame(FrameError),
}

#[derive(Serialize)]
struct Wire<'a> {
    product: &'static str,
    stream: u64,
    fact: FactEnvelope<'a>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FactEnvelope<'a> {
    canonical_version: u8,
    projection_version: u8,
    epoch: u64,
    sequence: u64,
    captured_at: &'a str,
    fact: FactValue<'a>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FactValue<'a> {
    sequence: u64,
    kind: &'static str,
    occurred_at: String,
    vehicle_id: &'a str,
    lap: i32,
}

pub fn encode_engineer(
    fact: &SessionFact,
    stream: u64,
    metadata: ProductMetadata<'_>,
) -> Result<Vec<u8>, FactEncodeError> {
    if stream == 0
        || metadata.epoch == 0
        || metadata.sequence == 0
        || metadata.captured_at.is_empty()
        || fact.sequence == 0
    {
        return Err(FactEncodeError::InvalidCursor);
    }
    let occurred_at = OffsetDateTime::from_unix_timestamp_nanos(i128::from(fact.occurred_utc_ns))
        .map_err(|_| FactEncodeError::InvalidOccurredAt)?
        .format(&Rfc3339)
        .map_err(|_| FactEncodeError::InvalidOccurredAt)?;
    let kind = match fact.kind {
        FactKind::SessionStarted => "session.started",
        FactKind::SessionEnded => "session.ended",
        FactKind::LapCompleted => "lap.completed",
        FactKind::PitEntered => "pit.entered",
        FactKind::PitExited => "pit.exited",
        FactKind::DriverChanged => "driver.changed",
        FactKind::ConnectionLost => "connection.lost",
        FactKind::ConnectionRecovered => "connection.recovered",
    };
    let wire = Wire {
        product: PRODUCT_ENGINEER_V1,
        stream,
        fact: FactEnvelope {
            canonical_version: 1,
            projection_version: 1,
            epoch: metadata.epoch,
            sequence: metadata.sequence,
            captured_at: metadata.captured_at,
            fact: FactValue {
                sequence: fact.sequence,
                kind,
                occurred_at,
                vehicle_id: fact.identity.vehicle_id.as_deref().unwrap_or(""),
                lap: fact.lap.unwrap_or(0),
            },
        },
    };
    let payload = serde_json::to_vec(&wire).map_err(|_| FactEncodeError::Json)?;
    if payload.len() > MAX_FACT_PAYLOAD {
        return Err(FactEncodeError::TooLarge);
    }
    super::encode(Kind::Fact, &payload).map_err(FactEncodeError::Frame)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::session::FactIdentity;

    #[test]
    fn go_engineer_fact_example_crosses_rust_frame() {
        let fact = SessionFact {
            sequence: 12,
            kind: FactKind::LapCompleted,
            occurred_utc_ns: 1_785_229_260_000_000_000,
            identity: FactIdentity {
                event_id: "event-2".into(),
                session_id: "session-2".into(),
                vehicle_id: Some("car-4".into()),
                driver_id: "driver-2".into(),
                team_id: "team-2".into(),
                stint_id: None,
            },
            previous_identity: None,
            lap: Some(7),
        };
        let metadata = ProductMetadata {
            epoch: 3,
            sequence: 5,
            captured_at: "2026-07-28T09:00:00Z",
        };
        let frame = encode_engineer(&fact, 15, metadata).unwrap();
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/testdata/engineer-fact-frame-rust-v1.bin"
        );
        if std::env::var("VANTARE_IPC_ORACLE_UPDATE").as_deref() == Ok("1") {
            std::fs::write(path, &frame).unwrap();
        }
        assert_eq!(std::fs::read(path).unwrap(), frame);
        let decoded = super::super::decode(&frame).unwrap();
        assert_eq!(decoded.kind, Kind::Fact);
        let value: serde_json::Value = serde_json::from_slice(decoded.payload).unwrap();
        assert_eq!(value["fact"]["fact"]["kind"], "lap.completed");
        assert_eq!(value["fact"]["fact"]["occurredAt"], "2026-07-28T09:01:00Z");
        assert_eq!(value["fact"]["fact"]["lap"], 7);
        let mut oversized = fact.clone();
        oversized.identity.vehicle_id = Some("x".repeat(MAX_FACT_PAYLOAD));
        assert_eq!(
            encode_engineer(&oversized, 15, metadata),
            Err(FactEncodeError::TooLarge)
        );
        assert_eq!(
            encode_engineer(
                &SessionFact {
                    sequence: 0,
                    ..fact
                },
                15,
                metadata
            ),
            Err(FactEncodeError::InvalidCursor)
        );
    }
}
