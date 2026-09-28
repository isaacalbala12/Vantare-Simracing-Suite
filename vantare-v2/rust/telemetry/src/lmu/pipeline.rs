//! Transactional LMU adaptation into the simulator-neutral reducer.

use super::mapper::{ClockChange, IdentityMapper, MapError, MapperCandidate};
use super::{
    AdmittedGrid, Damage, FastTelemetry, Fuel, Sector, SessionType, VehicleFields,
    fusion::{FusedSession, FusedWeather},
};
use crate::core;
use crate::derive;
use crate::quality::Field;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PipelineError {
    Mapping(MapError),
    IdentityMismatch,
    Reduction(core::Reject),
}

pub type LmuVehicleState = core::VehicleState<Sector, Fuel, Damage>;

pub struct Pipeline {
    mapper: IdentityMapper,
    reducer: core::Reducer<SessionType, LmuVehicleState>,
    session_remaining: Option<Field<f64>>,
}

pub struct PipelineCandidate {
    mapper: MapperCandidate,
    reduced: core::Candidate<SessionType, LmuVehicleState>,
    session_remaining: Field<f64>,
}

impl Pipeline {
    pub fn new(slot_grace_frames: u64) -> Self {
        Self {
            mapper: IdentityMapper::new(slot_grace_frames),
            reducer: core::Reducer::new(),
            session_remaining: None,
        }
    }

    pub fn prepare(
        &self,
        grid: AdmittedGrid,
        fused: &FusedSession,
        weather: &FusedWeather,
        clock_change: ClockChange,
    ) -> Result<PipelineCandidate, PipelineError> {
        let (mapper, identity) = self
            .mapper
            .prepare(&grid, fused, clock_change)
            .map_err(PipelineError::Mapping)?
            .split();
        let session_remaining =
            derive::session_remaining(&fused.source_time_ns.field, &grid.session.end_time_seconds);
        if grid.vehicles.len() != identity.vehicles.len()
            || !grid
                .vehicles
                .iter()
                .zip(&identity.vehicles)
                .all(|(row, id)| row.source_id == id.source_id)
        {
            return Err(PipelineError::IdentityMismatch);
        }
        let AdmittedGrid {
            vehicles: source_vehicles,
            session,
            ..
        } = grid;
        let vehicles = source_vehicles
            .into_iter()
            .zip(identity.vehicles)
            .map(|(value, id)| core::Vehicle {
                id: id.vehicle_id,
                value: map_vehicle(value),
            })
            .collect();
        let state = core::ObservedState {
            source_time_ns: fused.source_time_ns.field.clone(),
            end_time_seconds: session.end_time_seconds,
            maximum_laps: session.maximum_laps,
            track_name: fused.track_name.field.clone(),
            session_type: fused.session_type.field.clone(),
            vehicle_count: fused.vehicle_count.field.clone(),
            player_present: fused.player_present.field.clone(),
            ambient_temp_c: weather.ambient_temp_c.clone(),
            track_temp_c: weather.track_temp_c.clone(),
            rain_fraction: weather.rain_fraction.clone(),
            wetness_fraction: weather.wetness_fraction.clone(),
            session_flag: match &weather.global_yellow {
                Field::Present {
                    value: true,
                    provenance,
                    freshness,
                } => Field::Present {
                    value: core::SessionFlag::Yellow,
                    provenance: *provenance,
                    freshness: *freshness,
                },
                _ => Field::Missing,
            },
            vehicles,
            track_length: session.track_length,
        };
        let batch = core::Batch {
            event_id: "lmu-event-1".to_owned(),
            session_id: identity.session_id,
            player_id: identity.player_id,
            cursor: identity.cursor,
            state,
        };
        let reduced = self
            .reducer
            .prepare(batch)
            .map_err(PipelineError::Reduction)?;
        Ok(PipelineCandidate {
            mapper,
            reduced,
            session_remaining,
        })
    }

    pub fn commit(
        &mut self,
        candidate: PipelineCandidate,
    ) -> Result<&core::Batch<SessionType, LmuVehicleState>, core::Reject> {
        self.reducer.commit(candidate.reduced)?;
        self.mapper.commit_candidate(candidate.mapper);
        self.session_remaining = Some(candidate.session_remaining);
        Ok(self.reducer.current().expect("commit installed a batch"))
    }

    pub fn current(&self) -> Option<&core::Batch<SessionType, LmuVehicleState>> {
        self.reducer.current()
    }

    pub fn session_remaining(&self) -> Option<&Field<f64>> {
        self.session_remaining.as_ref()
    }
}

impl PipelineCandidate {
    pub fn batch(&self) -> &core::Batch<SessionType, LmuVehicleState> {
        self.reduced.batch()
    }

    pub fn session_remaining(&self) -> &Field<f64> {
        &self.session_remaining
    }
}

fn map_vehicle(source: VehicleFields) -> LmuVehicleState {
    let VehicleFields {
        source_id: _,
        driver_name,
        vehicle_name,
        vehicle_class,
        car_number,
        player,
        position,
        completed_laps,
        sector,
        lap_distance,
        lap_progress_time,
        best_lap_time,
        last_lap_time,
        estimated_lap_time,
        in_pit,
        pit_stop_count,
        penalty_count,
        time_behind_next,
        laps_behind_next,
        time_behind_leader,
        laps_behind_leader,
        world_position,
        local_velocity,
        orientation,
        fast,
    } = source;
    let FastTelemetry {
        lap_number,
        gear,
        engine_rpm,
        speed_mps,
        throttle,
        brake,
        clutch,
        fuel,
        delta_best_seconds,
        tyre_wear,
        damage,
    } = fast.unwrap_or(FastTelemetry {
        lap_number: Field::Missing,
        gear: Field::Missing,
        engine_rpm: Field::Missing,
        speed_mps: Field::Missing,
        throttle: Field::Missing,
        brake: Field::Missing,
        clutch: Field::Missing,
        fuel: Field::Missing,
        delta_best_seconds: Field::Missing,
        tyre_wear: Field::Missing,
        damage: Field::Missing,
    });
    core::VehicleState {
        driver_name,
        name: vehicle_name,
        vehicle_class,
        car_number,
        player,
        sector,
        lap_distance,
        lap_progress_time,
        best_lap_time,
        last_lap_time,
        estimated_lap_time,
        lap_number,
        gear,
        engine_rpm,
        speed_mps,
        throttle,
        brake,
        clutch,
        position,
        completed_laps,
        in_pit,
        pit_stop_count,
        penalty_count,
        time_behind_leader,
        laps_behind_leader,
        time_behind_next,
        laps_behind_next,
        fuel,
        delta_best: delta_best_seconds,
        world_position,
        local_velocity,
        orientation,
        damage,
        tyre_wear,
    }
}

impl Default for Pipeline {
    fn default() -> Self {
        Self::new(super::mapper::DEFAULT_SLOT_GRACE_FRAMES)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lmu::{
        admit_v13,
        fusion::{fuse_session, fuse_weather},
        rest::RestCache,
    };

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    fn fixture_weather(grid: &AdmittedGrid) -> FusedWeather {
        fuse_weather(grid, 100, &RestCache::default(), 100, None)
    }

    #[test]
    fn admitted_grid_commits_atomically_and_rejects_bad_retry() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        let candidate = pipeline
            .prepare(grid, &fused, &weather, ClockChange::Continuous)
            .unwrap();
        assert_eq!(candidate.batch().state.vehicles.len(), 44);
        assert_eq!(candidate.batch().state.track_name, fused.track_name.field);
        assert_eq!(
            candidate.batch().state.session_type,
            fused.session_type.field
        );
        assert_eq!(
            candidate.batch().state.vehicle_count,
            fused.vehicle_count.field
        );
        assert_eq!(candidate.batch().state.rain_fraction, weather.rain_fraction);
        assert!(matches!(
            candidate.batch().state.session_flag,
            Field::Missing
        ));
        assert_eq!(candidate.batch().cursor.sequence, 1);
        let expected_remaining = candidate.session_remaining().clone();
        assert!(pipeline.current().is_none());
        assert!(pipeline.session_remaining().is_none());
        pipeline.commit(candidate).unwrap();
        assert_eq!(pipeline.session_remaining(), Some(&expected_remaining));

        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let mut invalid = fuse_session(&grid, 100, &rest, 100);
        invalid.vehicle_count.field = Field::observed(43);
        let weather = fixture_weather(&grid);
        assert!(matches!(
            pipeline.prepare(grid, &invalid, &weather, ClockChange::Continuous),
            Err(PipelineError::Mapping(MapError::InvalidGrid))
        ));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
        assert_eq!(pipeline.session_remaining(), Some(&expected_remaining));

        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        let candidate = pipeline
            .prepare(grid, &fused, &weather, ClockChange::Continuous)
            .unwrap();
        assert_eq!(candidate.batch().cursor.sequence, 2);
        pipeline.commit(candidate).unwrap();
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 2);
    }

    #[test]
    fn foreign_candidate_does_not_advance_mapper() {
        let rest = RestCache::default();
        let first = Pipeline::default();
        let mut other = Pipeline::default();
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        let candidate = first
            .prepare(grid, &fused, &weather, ClockChange::Continuous)
            .unwrap();
        assert!(matches!(
            other.commit(candidate),
            Err(core::Reject::WrongReducer)
        ));
        assert!(other.current().is_none());
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        let candidate = other
            .prepare(grid, &fused, &weather, ClockChange::Continuous)
            .unwrap();
        assert_eq!(candidate.batch().cursor.sequence, 1);
    }

    #[test]
    fn stale_commit_does_not_publish_a_new_derived_value() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let first_grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let first_fused = fuse_session(&first_grid, 100, &rest, 100);
        let first_weather = fixture_weather(&first_grid);
        let first = pipeline
            .prepare(
                first_grid,
                &first_fused,
                &first_weather,
                ClockChange::Continuous,
            )
            .unwrap();
        let mut stale_grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        stale_grid.session.end_time_seconds = Field::observed(999.0);
        let stale_fused = fuse_session(&stale_grid, 100, &rest, 100);
        let stale_weather = fixture_weather(&stale_grid);
        let stale = pipeline
            .prepare(
                stale_grid,
                &stale_fused,
                &stale_weather,
                ClockChange::Continuous,
            )
            .unwrap();
        let expected = first.session_remaining().clone();
        pipeline.commit(first).unwrap();
        assert!(matches!(pipeline.commit(stale), Err(core::Reject::Stale)));
        assert_eq!(pipeline.session_remaining(), Some(&expected));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
    }

    #[test]
    fn positive_global_yellow_is_the_only_published_flag() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &RestCache::default(), 100);
        let mut weather = fixture_weather(&grid);
        weather.global_yellow = Field::observed(true);
        let pipeline = Pipeline::default();
        let candidate = pipeline
            .prepare(grid, &fused, &weather, ClockChange::Continuous)
            .unwrap();
        assert_eq!(
            candidate.batch().state.session_flag.value(),
            Some(&core::SessionFlag::Yellow)
        );
    }

    #[test]
    fn real_grid_preserves_player_fast_fields_and_rival_absence() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let player_index = grid.player_index.unwrap();
        let expected_player = &grid.vehicles[player_index];
        let expected_speed = expected_player.fast.as_ref().unwrap().speed_mps.clone();
        let expected_damage = expected_player.fast.as_ref().unwrap().damage.clone();
        let expected_position = expected_player.position.clone();
        let expected_rival_name = grid.vehicles[0].driver_name.clone();
        let fused = fuse_session(&grid, 100, &RestCache::default(), 100);
        let weather = fixture_weather(&grid);
        let candidate = Pipeline::default()
            .prepare(grid, &fused, &weather, ClockChange::Continuous)
            .unwrap();
        let vehicles = &candidate.batch().state.vehicles;
        assert_eq!(vehicles[player_index].value.speed_mps, expected_speed);
        assert_eq!(vehicles[player_index].value.damage, expected_damage);
        assert_eq!(vehicles[player_index].value.position, expected_position);
        assert_eq!(vehicles[0].value.driver_name, expected_rival_name);
        if player_index != 0 {
            assert!(matches!(vehicles[0].value.speed_mps, Field::Missing));
            assert!(matches!(vehicles[0].value.fuel, Field::Missing));
        }
    }
}
