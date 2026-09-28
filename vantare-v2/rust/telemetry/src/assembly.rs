//! Pure candidate/commit assembly for demand-gated product IPC frames.
//! The later live supervisor owns acquisition, writer queues and ACK delivery.

use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::core::facts::{FactCursor, FactError};
use crate::engine::{Engine, EngineError};
use crate::ipc::{
    self,
    configuration::{Ack, Configuration, ConfigurationError},
    fact::{self, FactEncodeError},
    fact_ack::{self, FactAckError},
    fact_delivery::FactDeliveryLog,
    resync::{self, ResyncError},
    snapshot::{self, ProductMetadata, SnapshotError},
};
use crate::lmu::mapper::ClockChange;
use crate::projection::{engineer, frame, strategy};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssemblyError {
    FactLog(FactError),
    Configuration(ConfigurationError),
    MissingConfiguration,
    StaleConfiguration,
    RevisionExhausted,
    InvalidCapturedAt,
    Engine(EngineError),
    Overlay(frame::FrameError),
    Snapshot(SnapshotError),
    Fact(FactEncodeError),
    FactAck(FactAckError),
    Resync(ResyncError),
}

pub enum FactReplay<'a> {
    Frames(Vec<&'a [u8]>),
    Resync(Vec<u8>),
}

pub struct Assembler {
    engine: Engine,
    active: Option<Configuration>,
    pending: Option<Configuration>,
    delivery_revision: u64,
    fact_delivery: FactDeliveryLog,
}

impl Assembler {
    pub fn new(slot_grace_frames: u64, fact_stream_id: u64) -> Result<Self, AssemblyError> {
        Ok(Self {
            engine: Engine::new(slot_grace_frames, fact_stream_id)
                .map_err(AssemblyError::FactLog)?,
            active: None,
            pending: None,
            delivery_revision: 0,
            fact_delivery: FactDeliveryLog::new(fact_stream_id).map_err(AssemblyError::FactLog)?,
        })
    }

    pub fn configure(&mut self, frame: &[u8]) -> Result<(), AssemblyError> {
        let incoming =
            ipc::configuration::decode_frame(frame).map_err(AssemblyError::Configuration)?;
        if self
            .active
            .as_ref()
            .is_some_and(|active| incoming.revision <= active.revision)
            || self
                .pending
                .as_ref()
                .is_some_and(|pending| incoming.revision <= pending.revision)
        {
            return Err(AssemblyError::StaleConfiguration);
        }
        self.pending = Some(incoming);
        Ok(())
    }

    pub fn engine(&self) -> &Engine {
        &self.engine
    }

    pub fn acknowledge_fact(&mut self, cursor: FactCursor) -> Result<FactCursor, AssemblyError> {
        let confirmed = self
            .engine
            .acknowledge_fact(cursor)
            .map_err(AssemblyError::FactLog)?;
        self.fact_delivery
            .acknowledge(cursor)
            .map_err(AssemblyError::FactLog)?;
        Ok(confirmed)
    }

    pub fn acknowledge_fact_frame(&mut self, frame: &[u8]) -> Result<FactCursor, AssemblyError> {
        let cursor = fact_ack::decode_frame(frame).map_err(AssemblyError::FactAck)?;
        self.acknowledge_fact(cursor)
    }

    pub fn replay_fact_frames_after(
        &self,
        cursor: FactCursor,
    ) -> Result<FactReplay<'_>, AssemblyError> {
        match self.fact_delivery.replay_after(cursor) {
            Ok(frames) => Ok(FactReplay::Frames(frames)),
            Err(FactError::ResyncRequired { first, next }) => Ok(FactReplay::Resync(
                resync::encode(cursor.stream, first, next).map_err(AssemblyError::Resync)?,
            )),
            Err(error) => Err(AssemblyError::FactLog(error)),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn apply(
        &mut self,
        shared_bytes: &[u8],
        verified_build: &str,
        shared_received_ns: u64,
        now_ns: u64,
        occurred_utc_ns: i64,
        clock_change: ClockChange,
    ) -> Result<Vec<Vec<u8>>, AssemblyError> {
        let config = self
            .pending
            .as_ref()
            .or(self.active.as_ref())
            .ok_or(AssemblyError::MissingConfiguration)?;
        let next_revision = self
            .delivery_revision
            .checked_add(1)
            .ok_or(AssemblyError::RevisionExhausted)?;
        let candidate = self
            .engine
            .prepare(
                shared_bytes,
                verified_build,
                shared_received_ns,
                now_ns,
                occurred_utc_ns,
                clock_change,
            )
            .map_err(AssemblyError::Engine)?;
        let batch = candidate.batch();
        let captured_at = OffsetDateTime::from_unix_timestamp_nanos(i128::from(occurred_utc_ns))
            .map_err(|_| AssemblyError::InvalidCapturedAt)?
            .format(&Rfc3339)
            .map_err(|_| AssemblyError::InvalidCapturedAt)?;
        let metadata = ProductMetadata {
            epoch: batch.cursor.epoch,
            sequence: batch.cursor.sequence,
            captured_at: &captured_at,
        };
        let mut prepared = Vec::new();
        let mut retained_facts = Vec::new();
        if config.consumers.overlay_v2 {
            let preferences = config
                .preferences
                .projection()
                .map_err(AssemblyError::Configuration)?;
            let sections = frame::build_sections(&candidate, &config.source, preferences)
                .map_err(AssemblyError::Overlay)?;
            let update = frame::wrap_full(
                &sections,
                frame::Metadata {
                    revision: next_revision,
                    state: "live",
                    retry: 0,
                    age_ms: 0,
                    degraded_reason: "",
                    epoch: batch.cursor.epoch,
                    sequence: batch.cursor.sequence,
                    section_mask: frame::ALL_SECTIONS_MASK,
                    session_id: &batch.session_id,
                    generated_at: &captured_at,
                    speed_unit: &config.preferences.speed,
                    temperature_unit: &config.preferences.temperature,
                    pressure_unit: &config.preferences.pressure,
                    fuel_unit: &config.preferences.fuel,
                },
            )
            .map_err(AssemblyError::Overlay)?;
            prepared.push(snapshot::encode_overlay(&update).map_err(AssemblyError::Snapshot)?);
        }
        if config.consumers.engineer {
            let view =
                engineer::build_typed(batch, candidate.session_remaining(), candidate.gaps());
            prepared.push(
                snapshot::encode_engineer_typed(&view, metadata)
                    .map_err(AssemblyError::Snapshot)?,
            );
            for fact in candidate.facts() {
                let stream = self.engine.pipeline().fact_high_water().stream;
                let frame =
                    fact::encode_engineer(fact, stream, metadata).map_err(AssemblyError::Fact)?;
                retained_facts.push((fact.sequence, frame.clone()));
                prepared.push(frame);
            }
        }
        if config.consumers.strategy {
            let payload = strategy::build(batch, candidate.session_remaining());
            prepared.push(
                snapshot::encode_observation(snapshot::PRODUCT_STRATEGY_V1, &payload, metadata)
                    .map_err(AssemblyError::Snapshot)?,
            );
        }
        let ack = if self.pending.is_some() {
            Some(
                ipc::configuration::encode_ack(Ack {
                    revision: config.revision,
                    epoch: batch.cursor.epoch,
                    sequence: batch.cursor.sequence,
                })
                .map_err(AssemblyError::Configuration)?,
            )
        } else {
            None
        };
        self.fact_delivery
            .validate_batch(&retained_facts)
            .map_err(AssemblyError::FactLog)?;
        self.engine
            .commit(candidate)
            .map_err(AssemblyError::Engine)?;
        if config.consumers.engineer {
            self.fact_delivery.commit(retained_facts);
        } else {
            self.fact_delivery
                .advance_suppressed(self.engine.pipeline().fact_high_water().sequence);
        }
        if self.pending.is_some() {
            self.active = self.pending.take();
        }
        self.delivery_revision = next_revision;
        if let Some(ack) = ack {
            prepared.insert(0, ack);
        }
        Ok(prepared)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const REAL_44: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");
    const REAL_1400_TRACK: &[u8] = include_bytes!("../../../testdata/lmu-1.4-track-fixture.bin");
    const REAL_1413_TRACK: &[u8] =
        include_bytes!("../../../testdata/lmu-1.4.1.3-track-fixture.bin");
    const CONFIG: &[u8] = include_bytes!("../testdata/configuration-frame-go-v1.bin");
    const FACT_ACK: &[u8] = include_bytes!("../testdata/fact-ack-frame-go-v1.bin");

    #[test]
    fn pinned_14_tracks_reach_demanded_overlay_and_engineer_snapshots() {
        for (build, bytes, count) in [
            ("1.4.0.0", REAL_1400_TRACK, 38),
            ("1.4.1.3", REAL_1413_TRACK, 18),
        ] {
            let mut assembler = Assembler::new(30, 15).unwrap();
            assembler.configure(CONFIG).unwrap();
            let frames = assembler
                .apply(
                    bytes,
                    build,
                    100,
                    100,
                    100_000_000_000,
                    ClockChange::Continuous,
                )
                .unwrap();
            let decoded: Vec<_> = frames
                .iter()
                .map(|frame| ipc::decode(frame).unwrap())
                .collect();
            assert_eq!(decoded[0].kind, ipc::Kind::ConfigurationAck, "{build}");
            let overlay: Value = serde_json::from_slice(decoded[1].payload).unwrap();
            assert_eq!(overlay["product"], "overlay-v2", "{build}");
            assert_eq!(
                overlay["update"]["frame"]["standings"]
                    .as_array()
                    .unwrap()
                    .len(),
                count,
                "{build}"
            );
            let engineer: Value = serde_json::from_slice(decoded[2].payload).unwrap();
            assert_eq!(engineer["product"], "engineer-v1", "{build}");
            assert_eq!(
                engineer["snapshot"]["vehicles"].as_array().unwrap().len(),
                count,
                "{build}"
            );
        }
    }

    #[test]
    fn rejected_batch_does_not_ack_or_commit_then_retries_all_demanded_products() {
        let mut assembler = Assembler::new(30, 15).unwrap();
        assert_eq!(
            assembler.apply(
                REAL_44,
                "1.3.0.0",
                100,
                100,
                100_000_000_000,
                ClockChange::Continuous
            ),
            Err(AssemblyError::MissingConfiguration)
        );
        assembler.configure(CONFIG).unwrap();
        assert!(matches!(
            assembler.configure(CONFIG),
            Err(AssemblyError::StaleConfiguration)
        ));
        assert!(matches!(
            assembler.apply(
                &REAL_44[..100],
                "1.3.0.0",
                100,
                100,
                100_000_000_000,
                ClockChange::Continuous
            ),
            Err(AssemblyError::Engine(_))
        ));
        assert!(assembler.engine().current().is_none());
        let frames = assembler
            .apply(
                REAL_44,
                "1.3.0.0",
                100,
                100,
                100_000_000_000,
                ClockChange::Continuous,
            )
            .unwrap();
        assert!(assembler.engine().current().is_some());
        let decoded: Vec<_> = frames
            .iter()
            .map(|frame| ipc::decode(frame).unwrap())
            .collect();
        assert_eq!(decoded[0].kind, ipc::Kind::ConfigurationAck);
        let ack: Value = serde_json::from_slice(decoded[0].payload).unwrap();
        assert_eq!(ack["revision"], 7);
        assert_eq!(decoded[1].kind, ipc::Kind::Snapshot);
        let overlay: Value = serde_json::from_slice(decoded[1].payload).unwrap();
        assert_eq!(overlay["product"], "overlay-v2");
        assert_eq!(decoded[2].kind, ipc::Kind::Snapshot);
        let engineer: Value = serde_json::from_slice(decoded[2].payload).unwrap();
        assert_eq!(engineer["product"], "engineer-v1");
        assert_eq!(
            engineer["snapshot"]["vehicles"].as_array().unwrap().len(),
            44
        );
        assert!(decoded.iter().any(|frame| frame.kind == ipc::Kind::Fact));
        let high_water = assembler.engine().pipeline().fact_high_water();
        assert_eq!(
            high_water,
            FactCursor {
                stream: 15,
                sequence: 1
            }
        );
        let FactReplay::Frames(replay) = assembler
            .replay_fact_frames_after(FactCursor {
                stream: 15,
                sequence: 0,
            })
            .unwrap()
        else {
            panic!("retained first fact must replay");
        };
        assert_eq!(replay.len(), 1);
        assert_eq!(ipc::decode(replay[0]).unwrap().kind, ipc::Kind::Fact);
        assert_eq!(
            assembler.acknowledge_fact_frame(FACT_ACK).unwrap(),
            high_water
        );
        assert!(matches!(
            assembler.replay_fact_frames_after(high_water).unwrap(),
            FactReplay::Frames(frames) if frames.is_empty()
        ));
        assert!(
            assembler
                .engine()
                .pipeline()
                .replay_facts_after(high_water)
                .unwrap()
                .is_empty()
        );
        assert!(!decoded.iter().any(|frame| {
            serde_json::from_slice::<Value>(frame.payload)
                .ok()
                .is_some_and(|value| value["product"] == "strategy-v1")
        }));

        let source = ipc::decode(CONFIG).unwrap();
        let mut next: Value = serde_json::from_slice(source.payload).unwrap();
        next["revision"] = serde_json::json!(8);
        next["consumers"]["overlayV2"] = serde_json::json!(false);
        next["consumers"]["engineer"] = serde_json::json!(false);
        next["consumers"]["strategy"] = serde_json::json!(true);
        let configuration = ipc::encode(
            ipc::Kind::Configuration,
            &serde_json::to_vec(&next).unwrap(),
        )
        .unwrap();
        assembler.configure(&configuration).unwrap();
        let next_frames = assembler
            .apply(
                REAL_44,
                "1.3.0.0",
                200,
                200,
                101_000_000_000,
                ClockChange::Continuous,
            )
            .unwrap();
        assert_eq!(next_frames.len(), 2);
        let ack = ipc::decode(&next_frames[0]).unwrap();
        assert_eq!(ack.kind, ipc::Kind::ConfigurationAck);
        let ack: Value = serde_json::from_slice(ack.payload).unwrap();
        assert_eq!(ack["revision"], 8);
        let strategy = ipc::decode(&next_frames[1]).unwrap();
        assert_eq!(strategy.kind, ipc::Kind::Snapshot);
        let strategy: Value = serde_json::from_slice(strategy.payload).unwrap();
        assert_eq!(strategy["product"], "strategy-v1");
        let FactReplay::Resync(boundary) = assembler
            .replay_fact_frames_after(FactCursor {
                stream: 15,
                sequence: 0,
            })
            .unwrap()
        else {
            panic!("old subscriber must resync after Engineer demand ends");
        };
        let boundary = ipc::decode(&boundary).unwrap();
        assert_eq!(boundary.kind, ipc::Kind::ResyncRequired);
        let boundary: Value = serde_json::from_slice(boundary.payload).unwrap();
        assert_eq!(boundary["first"], 2);
        assert_eq!(boundary["next"], 2);
        let third = assembler
            .apply(
                REAL_44,
                "1.3.0.0",
                300,
                300,
                102_000_000_000,
                ClockChange::Continuous,
            )
            .unwrap();
        assert_eq!(third.len(), 1);
        assert_eq!(ipc::decode(&third[0]).unwrap().kind, ipc::Kind::Snapshot);
    }
}
