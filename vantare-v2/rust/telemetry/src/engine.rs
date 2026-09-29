//! One candidate owns the admitted LMU frame and all dependent state changes.

use crate::core;
use crate::core::facts::FactCursor;
use crate::core::facts::FactError;
use crate::lmu::freshness::{FreshnessGate, STALL_LIMIT_NS};
use crate::lmu::fusion::{self, SessionFloor};
use crate::lmu::mapper::ClockChange;
use crate::lmu::pipeline::{LmuVehicleState, Pipeline, PipelineCandidate, PipelineError};
use crate::lmu::rest::RestCache;
use crate::lmu::{self, AdmissionError, SessionType};
use crate::quality::{Field, Freshness};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EngineError {
    Admission(AdmissionError),
    Pipeline(PipelineError),
}

pub struct Engine {
    pipeline: Pipeline,
    rest: RestCache,
    floor: SessionFloor,
    freshness_gate: FreshnessGate,
}

pub struct EngineCandidate {
    pipeline: PipelineCandidate,
    floor: SessionFloor,
    freshness_gate: FreshnessGate,
}

impl Engine {
    pub fn new(slot_grace_frames: u64, fact_stream_id: u64) -> Result<Self, FactError> {
        Ok(Self {
            pipeline: Pipeline::new(slot_grace_frames, fact_stream_id)?,
            rest: RestCache::default(),
            floor: SessionFloor::default(),
            freshness_gate: FreshnessGate::default(),
        })
    }

    pub fn rest_cache_mut(&mut self) -> &mut RestCache {
        &mut self.rest
    }
    pub fn pipeline(&self) -> &Pipeline {
        &self.pipeline
    }

    pub fn acknowledge_fact(&mut self, cursor: FactCursor) -> Result<FactCursor, FactError> {
        self.pipeline.acknowledge_fact(cursor)
    }

    pub fn prepare(
        &self,
        shared_bytes: &[u8],
        verified_build: &str,
        shared_received_ns: u64,
        now_ns: u64,
        occurred_utc_ns: i64,
    ) -> Result<EngineCandidate, EngineError> {
        let mut grid =
            lmu::admit_v13(shared_bytes, verified_build).map_err(EngineError::Admission)?;
        let mut freshness_gate = self.freshness_gate.clone();
        let clock_change = if let Field::Present {
            value: source_ns,
            freshness: Freshness::Fresh,
            ..
        } = &grid.session.source_time_ns
        {
            let change = ClockChange::classify(freshness_gate.previous_source_ns(), *source_ns);
            if freshness_gate.observe(now_ns, *source_ns) {
                grid.mark_stale();
            }
            change
        } else {
            ClockChange::Continuous
        };
        let mut floor = self.floor.clone();
        floor.observe_shm(
            &grid,
            shared_received_ns,
            clock_change == ClockChange::Reset,
        );
        fusion::join_car_numbers(&mut grid, &self.rest, now_ns, floor.floor_ns());
        let fused = fusion::fuse_session(&grid, shared_received_ns, &self.rest, now_ns);
        let weather = fusion::fuse_weather(
            &grid,
            shared_received_ns,
            &self.rest,
            now_ns,
            floor.floor_ns(),
        );
        let player = fusion::fuse_player(&grid, shared_received_ns, &self.rest, now_ns);
        if let Some(row) = grid
            .player_index
            .and_then(|index| grid.vehicles.get_mut(index))
        {
            row.position = player.position.field;
            row.completed_laps = player.completed_laps.field;
            row.pit_stop_count = player.pit_stop_count.field;
        }
        let pipeline = self
            .pipeline
            .prepare(grid, &fused, &weather, clock_change, occurred_utc_ns)
            .map_err(EngineError::Pipeline)?;
        Ok(EngineCandidate {
            pipeline,
            floor,
            freshness_gate,
        })
    }

    pub fn commit(
        &mut self,
        candidate: EngineCandidate,
    ) -> Result<&core::Batch<SessionType, LmuVehicleState>, EngineError> {
        self.pipeline
            .commit(candidate.pipeline)
            .map_err(EngineError::Pipeline)?;
        self.floor = candidate.floor;
        self.freshness_gate = candidate.freshness_gate;
        Ok(self
            .pipeline
            .current()
            .expect("pipeline commit installed batch"))
    }

    pub fn current(&self) -> Option<&core::Batch<SessionType, LmuVehicleState>> {
        self.pipeline.current()
    }

    pub fn source_health(&self, now_ns: u64) -> Option<(u64, bool)> {
        self.pipeline.current()?;
        Some((
            self.freshness_gate.source_age_ns(now_ns)?,
            self.freshness_gate.is_stale_at(now_ns),
        ))
    }

    /// Go stops publishing the frozen on-track frame after leaving a session
    /// when REST is no longer live. Check the new frame's source clock before
    /// suppressing it so the first advancing sample can resume normally.
    pub fn frozen_remnant(
        &self,
        shared_bytes: &[u8],
        verified_build: &str,
        now_ns: u64,
        rest_unavailable: bool,
    ) -> Result<bool, EngineError> {
        if !rest_unavailable
            || self.pipeline.current().is_none()
            || self
                .freshness_gate
                .source_age_ns(now_ns)
                .is_none_or(|age| age < 2 * STALL_LIMIT_NS)
        {
            return Ok(false);
        }
        let grid = lmu::admit_v13(shared_bytes, verified_build).map_err(EngineError::Admission)?;
        Ok(grid.player_index.is_some()
            && matches!(grid.session.source_time_ns, Field::Present { value, .. } if value == self.freshness_gate.previous_source_ns()))
    }
}

impl EngineCandidate {
    pub fn batch(&self) -> &core::Batch<SessionType, LmuVehicleState> {
        self.pipeline.batch()
    }
    pub fn session_remaining(&self) -> &crate::quality::Field<f64> {
        self.pipeline.session_remaining()
    }
    pub fn controls_history(&self) -> &crate::derive::controls::ControlHistory {
        self.pipeline.controls_history()
    }
    pub fn fuel_usage(&self) -> &crate::derive::fuel::FuelUsage {
        self.pipeline.fuel_usage()
    }
    pub fn gaps(&self) -> &crate::derive::gaps::GapSet {
        self.pipeline.gaps()
    }
    pub fn delta(&self) -> &crate::derive::delta::SelfDelta {
        self.pipeline.delta()
    }
    pub fn facts(&self) -> &[crate::core::session::SessionFact] {
        self.pipeline.facts()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::session::FactKind;

    const REAL_44: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");
    const REAL_1400_TRACK: &[u8] = include_bytes!("../../../testdata/lmu-1.4-track-fixture.bin");
    const REAL_1413_TRACK: &[u8] =
        include_bytes!("../../../testdata/lmu-1.4.1.3-track-fixture.bin");

    #[test]
    fn pinned_14_track_frames_prepare_full_canonical_batches() {
        for (build, bytes, vehicles) in [
            ("1.4.0.0", REAL_1400_TRACK, 38_usize),
            ("1.4.1.3", REAL_1413_TRACK, 18_usize),
        ] {
            let mut engine = Engine::new(30, 7).unwrap();
            let candidate = engine.prepare(bytes, build, 100, 100, 1_000).unwrap();
            assert_eq!(candidate.batch().state.vehicles.len(), vehicles, "{build}");
            assert!(candidate.batch().player_id.is_some(), "{build}");
            engine.commit(candidate).unwrap();
            assert_eq!(engine.current().unwrap().cursor.sequence, 1, "{build}");
        }
    }

    #[test]
    fn real_grid_prepares_all_stages_without_publishing_and_retries_after_rejection() {
        let mut engine = Engine::new(30, 7).unwrap();
        let first = engine.prepare(REAL_44, "1.3.0.0", 100, 100, 1_000).unwrap();
        assert_eq!(first.batch().state.vehicles.len(), 44);
        assert_eq!(first.facts()[0].kind, FactKind::SessionStarted);
        assert!(engine.current().is_none());
        engine.commit(first).unwrap();
        assert_eq!(engine.current().unwrap().cursor.sequence, 1);
        assert!(matches!(
            engine.prepare(REAL_44, "1.4.2.1", 200, 200, 2_000),
            Err(EngineError::Admission(AdmissionError::UnsupportedBuild))
        ));
        let retry = engine.prepare(REAL_44, "1.3.0.0", 200, 200, 2_000).unwrap();
        assert_eq!(retry.batch().cursor.sequence, 2);
        assert!(retry.facts().is_empty());
        engine.commit(retry).unwrap();
        assert_eq!(engine.current().unwrap().cursor.sequence, 2);
    }

    #[test]
    fn stalled_source_expires_candidate_but_rejected_candidate_does_not_advance_gate() {
        let mut engine = Engine::new(30, 7).unwrap();
        let first = engine
            .prepare(REAL_44, "1.3.0.0", 0, 0, 1_000_000_000)
            .unwrap();
        engine.commit(first).unwrap();
        let stalled = engine
            .prepare(REAL_44, "1.3.0.0", 500_000_000, 500_000_000, 1_500_000_000)
            .unwrap();
        assert_eq!(
            stalled.batch().state.source_time_ns.quality().1,
            Some(Freshness::Stale)
        );
        let player_id = stalled.batch().player_id.as_ref().unwrap();
        let player = stalled
            .batch()
            .state
            .vehicles
            .iter()
            .find(|vehicle| &vehicle.id == player_id)
            .unwrap();
        assert_eq!(player.value.speed_mps.quality().1, Some(Freshness::Stale));
        drop(stalled);

        let mut resumed = REAL_44.to_vec();
        let source_seconds = f64::from_le_bytes(resumed[1_700..1_708].try_into().unwrap());
        resumed[1_700..1_708].copy_from_slice(&(source_seconds + 1.0).to_le_bytes());
        let candidate = engine
            .prepare(&resumed, "1.3.0.0", 600_000_000, 600_000_000, 1_600_000_000)
            .unwrap();
        assert_eq!(
            candidate.batch().state.source_time_ns.quality().1,
            Some(Freshness::Fresh)
        );
        engine.commit(candidate).unwrap();
        assert_eq!(engine.current().unwrap().cursor.sequence, 2);
    }

    #[test]
    fn rest_can_join_existing_player_but_never_create_rival() {
        let mut engine = Engine::new(30, 9).unwrap();
        engine.rest_cache_mut().accept_standings(
            br#"[{"player":true,"position":3,"lapsCompleted":77}]"#,
            600_000_000,
            600_000_000,
        );
        let prepared = engine
            .prepare(REAL_44, "1.3.0.0", 100, 600_000_000, 1_000)
            .unwrap();
        assert_eq!(prepared.batch().state.vehicles.len(), 44);
        let player_id = prepared.batch().player_id.as_ref().unwrap();
        let player = prepared
            .batch()
            .state
            .vehicles
            .iter()
            .find(|vehicle| &vehicle.id == player_id)
            .unwrap();
        assert_eq!(player.value.completed_laps.value(), Some(&77));
        engine.commit(prepared).unwrap();
        assert_eq!(engine.current().unwrap().state.vehicles.len(), 44);
    }

    #[test]
    fn stale_candidate_cannot_replace_committed_state() {
        let mut engine = Engine::new(30, 11).unwrap();
        let stale = engine.prepare(REAL_44, "1.3.0.0", 100, 100, 1_000).unwrap();
        let first = engine.prepare(REAL_44, "1.3.0.0", 100, 100, 1_000).unwrap();
        engine.commit(first).unwrap();
        assert!(engine.commit(stale).is_err());
        assert_eq!(engine.current().unwrap().cursor.sequence, 1);
    }

    #[test]
    fn reset_is_classified_from_committed_source_clock_only() {
        let mut engine = Engine::new(30, 12).unwrap();
        let first = engine.prepare(REAL_44, "1.3.0.0", 100, 100, 1_000).unwrap();
        let original_epoch = first.batch().cursor.epoch;
        engine.commit(first).unwrap();

        let mut rewound = REAL_44.to_vec();
        let source_seconds = f64::from_le_bytes(rewound[1_700..1_708].try_into().unwrap());
        rewound[1_700..1_708].copy_from_slice(&(source_seconds - 1.0).to_le_bytes());
        let discarded = engine
            .prepare(&rewound, "1.3.0.0", 200, 200, 2_000)
            .unwrap();
        assert!(discarded.batch().cursor.epoch > original_epoch);
        drop(discarded);

        let retry_original = engine.prepare(REAL_44, "1.3.0.0", 200, 200, 2_000).unwrap();
        assert_eq!(retry_original.batch().cursor.epoch, original_epoch);
        drop(retry_original);

        let accepted = engine
            .prepare(&rewound, "1.3.0.0", 200, 200, 2_000)
            .unwrap();
        engine.commit(accepted).unwrap();
        assert!(engine.current().unwrap().cursor.epoch > original_epoch);
    }
}
