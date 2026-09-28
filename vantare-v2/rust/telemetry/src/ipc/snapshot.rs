//! Overlay V2 Snapshot payload v1 carried by the bounded IPC frame.

use serde::Serialize;
use serde_json::{Value, json};

use super::{FrameError, Kind};

pub const PRODUCT_OVERLAY_V2: &str = "overlay-v2";
pub const PRODUCT_ENGINEER_V1: &str = "engineer-v1";
pub const PRODUCT_STRATEGY_V1: &str = "strategy-v1";

#[derive(Clone, Copy)]
pub struct ProductMetadata<'a> {
    pub epoch: u64,
    pub sequence: u64,
    pub captured_at: &'a str,
}

#[derive(Serialize)]
struct TypedEnvelope<'a, T: Serialize> {
    product: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    identity: Option<EngineerIdentity<'a>>,
    snapshot: TypedSnapshot<'a, T>,
}

#[derive(Clone, Copy, Serialize)]
pub struct EngineerIdentity<'a> {
    pub event: &'a str,
    pub session: &'a str,
    pub vehicle: &'a str,
    pub team: &'a str,
    pub driver: &'a str,
}

#[derive(Serialize)]
struct OverlayEnvelope<'a> {
    product: &'static str,
    update: &'a Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TypedSnapshot<'a, T: Serialize> {
    canonical_version: u8,
    projection_version: u8,
    epoch: u64,
    sequence: u64,
    captured_at: &'a str,
    #[serde(flatten)]
    payload: &'a T,
}

/// Serializes the borrowed, typed Engineer grid directly. This avoids the
/// per-field serde_json::Value allocation path in the hot publisher.
pub fn encode_engineer_typed(
    payload: &crate::projection::engineer::EngineerView<'_>,
    metadata: ProductMetadata<'_>,
    identity: Option<EngineerIdentity<'_>>,
) -> Result<Vec<u8>, SnapshotError> {
    if metadata.epoch == 0 || metadata.sequence == 0 || metadata.captured_at.is_empty() {
        return Err(SnapshotError::InvalidUpdate);
    }
    let envelope = TypedEnvelope {
        product: PRODUCT_ENGINEER_V1,
        identity,
        snapshot: TypedSnapshot {
            canonical_version: 1,
            projection_version: 1,
            epoch: metadata.epoch,
            sequence: metadata.sequence,
            captured_at: metadata.captured_at,
            payload,
        },
    };
    let payload = serde_json::to_vec(&envelope).map_err(|_| SnapshotError::InvalidUpdate)?;
    super::encode(Kind::Snapshot, &payload).map_err(SnapshotError::Frame)
}

/// Wraps a complete Engineer or Strategy observation with the canonical
/// metadata supplied by the committed batch clock. Publication remains gated
/// by the future runtime supervisor and consumer demand.
pub fn encode_observation(
    product: &str,
    payload: &Value,
    metadata: ProductMetadata<'_>,
) -> Result<Vec<u8>, SnapshotError> {
    if !matches!(product, PRODUCT_ENGINEER_V1 | PRODUCT_STRATEGY_V1)
        || metadata.epoch == 0
        || metadata.sequence == 0
        || metadata.captured_at.is_empty()
        || payload
            .get("capabilities")
            .and_then(Value::as_array)
            .is_none()
        || payload.get("player").and_then(Value::as_object).is_none()
        || (product == PRODUCT_ENGINEER_V1
            && payload.get("vehicles").and_then(Value::as_array).is_none())
    {
        return Err(SnapshotError::InvalidUpdate);
    }
    let mut snapshot = payload.clone();
    let Some(object) = snapshot.as_object_mut() else {
        return Err(SnapshotError::InvalidUpdate);
    };
    if [
        "canonicalVersion",
        "projectionVersion",
        "epoch",
        "sequence",
        "capturedAt",
    ]
    .iter()
    .any(|key| object.contains_key(*key))
    {
        return Err(SnapshotError::InvalidUpdate);
    }
    object.insert("canonicalVersion".into(), json!(1));
    object.insert("projectionVersion".into(), json!(1));
    object.insert("epoch".into(), json!(metadata.epoch));
    object.insert("sequence".into(), json!(metadata.sequence));
    object.insert("capturedAt".into(), json!(metadata.captured_at));
    let payload = serde_json::to_vec(&json!({"product": product, "snapshot": snapshot}))
        .map_err(|_| SnapshotError::InvalidUpdate)?;
    super::encode(Kind::Snapshot, &payload).map_err(SnapshotError::Frame)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SnapshotError {
    InvalidUpdate,
    InvalidSourceState,
    Frame(FrameError),
}

/// Serializes one complete update. The 8 MiB frame limit is checked before
/// publication; no partial frame is produced on rejection.
pub fn encode_overlay(update: &Value) -> Result<Vec<u8>, SnapshotError> {
    let Some(frame) = update.get("frame").and_then(Value::as_object) else {
        return Err(SnapshotError::InvalidUpdate);
    };
    if frame.get("contract").and_then(Value::as_u64) != Some(2)
        || frame.get("algorithm").and_then(Value::as_u64) != Some(2)
        || frame
            .get("sectionMask")
            .and_then(Value::as_u64)
            .is_none_or(|mask| mask > 2047)
    {
        return Err(SnapshotError::InvalidUpdate);
    }
    for section in [
        "session",
        "player",
        "controls",
        "standings",
        "relative",
        "relativeSettled",
        "relativeSameClass",
        "delta",
        "fuel",
        "spotter",
        "radar",
        "damage",
        "weather",
        "capabilities",
    ] {
        if frame.get(section).is_none_or(Value::is_null) {
            return Err(SnapshotError::InvalidUpdate);
        }
    }
    let state = update
        .get("source")
        .and_then(|source| source.get("state"))
        .and_then(Value::as_str);
    if !matches!(
        state,
        Some(
            "stopped"
                | "detecting"
                | "connecting"
                | "live"
                | "degraded"
                | "stale"
                | "error"
                | "stopping"
        )
    ) {
        return Err(SnapshotError::InvalidSourceState);
    }
    let payload = serde_json::to_vec(&OverlayEnvelope {
        product: PRODUCT_OVERLAY_V2,
        update,
    })
    .map_err(|_| SnapshotError::InvalidUpdate)?;
    super::encode(Kind::Snapshot, &payload).map_err(SnapshotError::Frame)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;
    use crate::projection::engineer;

    #[test]
    fn real_static_44_full_update_survives_snapshot_frame() {
        let golden: Value = serde_json::from_slice(include_bytes!(
            "../../testdata/overlay-core-slices-go-v1.json"
        ))
        .unwrap();
        let update = &golden["full"];
        let frame = encode_overlay(update).unwrap();
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/testdata/overlay-snapshot-frame-rust-v1.bin"
        );
        if std::env::var("VANTARE_IPC_ORACLE_UPDATE").as_deref() == Ok("1") {
            std::fs::write(path, &frame).unwrap();
        }
        assert_eq!(std::fs::read(path).unwrap(), frame);
        let decoded = super::super::decode(&frame).unwrap();
        assert_eq!(decoded.kind, Kind::Snapshot);
        let payload: Value = serde_json::from_slice(decoded.payload).unwrap();
        assert_eq!(payload["product"], PRODUCT_OVERLAY_V2);
        assert_eq!(payload["update"], *update);
    }

    #[test]
    fn rejects_incomplete_update_and_unknown_source_before_encoding() {
        assert_eq!(
            encode_overlay(&json!({})),
            Err(SnapshotError::InvalidUpdate)
        );
        let mut update: Value = serde_json::from_slice(include_bytes!(
            "../../testdata/overlay-core-slices-go-v1.json"
        ))
        .unwrap();
        update = update["full"].clone();
        update["source"]["state"] = json!("unknown");
        assert_eq!(
            encode_overlay(&update),
            Err(SnapshotError::InvalidSourceState)
        );
        update["source"]["state"] = json!("live");
        update["frame"]["sectionMask"] = json!(4096);
        assert_eq!(encode_overlay(&update), Err(SnapshotError::InvalidUpdate));
        update["frame"]["sectionMask"] = json!(2047);
        update["frame"].as_object_mut().unwrap().remove("fuel");
        assert_eq!(encode_overlay(&update), Err(SnapshotError::InvalidUpdate));
    }

    #[test]
    fn real_static_44_engineer_and_strategy_snapshot_frames() {
        let golden: Value = serde_json::from_slice(include_bytes!(
            "../../testdata/overlay-core-slices-go-v1.json"
        ))
        .unwrap();
        for (product, key, file) in [
            (
                PRODUCT_ENGINEER_V1,
                "engineer",
                "engineer-snapshot-frame-rust-v1.bin",
            ),
            (
                PRODUCT_STRATEGY_V1,
                "strategy",
                "strategy-snapshot-frame-rust-v1.bin",
            ),
        ] {
            let metadata = ProductMetadata {
                epoch: 1,
                sequence: 1,
                captured_at: "1970-01-01T00:01:40Z",
            };
            let frame = if product == PRODUCT_ENGINEER_V1 {
                const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");
                let engine = Engine::new(30, 15).unwrap();
                let prepared = engine
                    .prepare(REAL_44, "1.3.0.0", 100, 100, 100_000_000_000)
                    .unwrap();
                let view = engineer::build_typed(
                    prepared.batch(),
                    prepared.session_remaining(),
                    prepared.gaps(),
                );
                encode_engineer_typed(&view, metadata, None).unwrap()
            } else {
                encode_observation(product, &golden[key], metadata).unwrap()
            };
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("testdata")
                .join(file);
            if std::env::var("VANTARE_IPC_ORACLE_UPDATE").as_deref() == Ok("1") {
                std::fs::write(&path, &frame).unwrap();
            }
            assert_eq!(std::fs::read(&path).unwrap(), frame);
            let decoded = super::super::decode(&frame).unwrap();
            assert_eq!(decoded.kind, Kind::Snapshot);
            let wire: Value = serde_json::from_slice(decoded.payload).unwrap();
            assert_eq!(wire["product"], product);
            assert_eq!(wire["snapshot"]["player"], golden[key]["player"]);
        }
        assert_eq!(
            encode_observation(
                "unknown",
                &golden["strategy"],
                ProductMetadata {
                    epoch: 1,
                    sequence: 1,
                    captured_at: "1970-01-01T00:01:40Z",
                }
            ),
            Err(SnapshotError::InvalidUpdate)
        );
    }
}
