#![allow(clippy::unwrap_used)]

use std::collections::VecDeque;
use std::time::Duration;

use vantare_domain::{Adapter, AdapterError, Observation, Quality, SessionId};

use super::*;
use crate::core::Core;

fn lap_photo(index: u64, lap: u32, distance: f64, elapsed: f64) -> Observation {
    let mut observation = super::tests::photo(index, false);
    let car = &mut observation.state.cars[0];
    car.laps = Quality::Reliable(lap);
    car.lap_distance_m = Quality::Reliable(distance);
    car.lap_elapsed_s = Quality::Reliable(elapsed);
    let telemetry = &mut observation.state.player.as_mut().unwrap().telemetry;
    telemetry.speed_mps = Quality::Reliable(50.0);
    telemetry.throttle = Quality::Reliable(0.75);
    telemetry.brake = Quality::Reliable(0.25);
    observation
}

/// Replay sintético declarado: el corpus real de 3600 frames deja al jugador
/// con 0 vueltas completadas. No se modifica ni convierte una captura LMU.
struct LapReplay(VecDeque<Observation>);

impl Adapter for LapReplay {
    fn poll(&mut self, _now: Duration) -> Result<Option<Observation>, AdapterError> {
        Ok(self.0.pop_front())
    }
}

#[test]
fn a_real_lmu_fixture_contributes_a_sample_without_inventing_a_closed_lap() {
    use crate::adapter::{Replay, ReplayEvent};

    let mut adapter = Replay::new(
        "1.4.2.0",
        [ReplayEvent::Shm {
            at: Duration::ZERO,
            frame: include_bytes!("../../../../testdata/lmu-1.4.2.0-track-fixture.bin").to_vec(),
        }],
    );
    let mut core = Core::new(8);
    core.step(&mut adapter, Duration::ZERO).unwrap();
    let block = core.series().active().unwrap();
    assert_eq!(block.samples.len(), 1, "no pasa en vacío");
    let sample = block.samples[0];
    assert_eq!(sample.sequence, 1);
    assert_eq!(sample.distance_m, Quality::Reliable(104.055_343_627_929_69));
    assert_eq!(sample.elapsed_s, Quality::Reliable(1.721_370_100_975_036_6));
    assert_eq!(block.sealed_at, None);
    assert!(
        core.series().sealed().is_none(),
        "un frame no cierra una vuelta"
    );
}

#[test]
fn the_same_replay_seals_identical_bytes_with_a_frozen_v1_schema() {
    let replay = || {
        LapReplay(VecDeque::from([
            lap_photo(1, 0, 0.0, 0.0),
            lap_photo(2, 0, 100.0, 2.0),
            lap_photo(3, 0, 200.0, 4.0),
            lap_photo(4, 1, 0.0, 0.0),
        ]))
    };
    let run = || {
        let mut core = Core::new(7);
        let mut adapter = replay();
        for index in 1..=3 {
            core.step(&mut adapter, Duration::from_millis(index * 10))
                .unwrap();
        }
        let active = core.series().active().unwrap();
        assert_eq!(active.samples.len(), 3);
        assert_eq!(active.sealed_at, None);
        assert!(core.series().sealed().is_none());
        core.step(&mut adapter, Duration::from_millis(40)).unwrap();
        let block = core.series().sealed().unwrap();
        assert_eq!((block.epoch, block.lap, block.sealed_at), (7, 0, Some(4)));
        assert!(!block.gap);
        assert_eq!(
            block.samples.len(),
            3,
            "la foto de cierre es de la vuelta nueva"
        );
        assert_eq!(core.series().active().unwrap().samples[0].sequence, 4);
        block.to_bytes().unwrap()
    };
    let first = run();
    assert_eq!(first, run(), "replay completo, dos núcleos nuevos");
    let golden = concat!(
        "[\"vantare.player-lap.v1\",7,0,7,0,4,false,[",
        "[1,[1,0.0],[1,0.0],[1,50.0],[1,0.75],[1,0.25]],",
        "[2,[1,100.0],[1,2.0],[1,50.0],[1,0.75],[1,0.25]],",
        "[3,[1,200.0],[1,4.0],[1,50.0],[1,0.75],[1,0.25]]]]"
    );
    assert_eq!(
        first,
        golden.as_bytes(),
        "contrato v1 independiente del encoder"
    );
}

#[test]
fn sealed_block_keeps_its_bytes_while_the_next_lap_grows() {
    let mut core = Core::new(1);
    core.observe(lap_photo(1, 0, 0.0, 0.0)).unwrap();
    core.observe(lap_photo(2, 1, 0.0, 0.0)).unwrap();
    let sealed = core.series().sealed().unwrap().to_bytes().unwrap();
    core.observe(lap_photo(3, 1, 100.0, 2.0)).unwrap();
    assert_eq!(core.series().sealed().unwrap().to_bytes().unwrap(), sealed);
    assert_eq!(core.series().active().unwrap().samples.len(), 2);
}

#[test]
fn quality_is_preserved_without_fabricating_zero_for_missing_signals() {
    let mut core = Core::new(1);
    let mut observation = lap_photo(1, 0, 0.0, 0.0);
    let telemetry = &mut observation.state.player.as_mut().unwrap().telemetry;
    telemetry.speed_mps = Quality::Unavailable;
    telemetry.throttle = Quality::Estimated(0.5);
    telemetry.brake = Quality::Stale(0.25);
    core.observe(observation).unwrap();
    let bytes = core.series().active().unwrap().to_bytes().unwrap();
    assert_eq!(
        bytes,
        br#"["vantare.player-lap.v1",1,0,7,0,null,false,[[1,[1,0.0],[1,0.0],[0,null],[2,0.5],[3,0.25]]]]"#
    );
}

#[test]
fn missing_progress_and_stale_photos_mark_a_gap_without_sampling() {
    let mut core = Core::new(1);
    core.observe(lap_photo(1, 0, 0.0, 0.0)).unwrap();
    let mut missing = lap_photo(2, 0, 100.0, 2.0);
    missing.state.cars[0].lap_distance_m = Quality::Unavailable;
    core.observe(missing).unwrap();
    core.tick(Duration::from_secs(1));
    let active = core.series().active().unwrap();
    assert!(active.gap);
    assert_eq!(active.samples.len(), 1);
    core.observe(lap_photo(110, 1, 0.0, 0.0)).unwrap();
    let sealed = core.series().sealed().unwrap();
    assert!(sealed.gap);
    assert_eq!(sealed.sealed_at, Some(core.snapshot().sequence));
}

#[test]
fn counter_jumps_session_changes_and_rejections_never_invent_a_closed_lap() {
    let mut core = Core::new(1);
    core.observe(lap_photo(1, 0, 0.0, 0.0)).unwrap();
    core.observe(lap_photo(2, 2, 0.0, 0.0)).unwrap();
    assert!(core.series().sealed().is_none(), "salto de contador");
    let mut session = lap_photo(3, 3, 0.0, 0.0);
    session.state.session.id = SessionId(8);
    core.observe(session).unwrap();
    assert!(core.series().sealed().is_none(), "cambio de sesión");
    let active = core.series().active().unwrap().to_bytes().unwrap();
    let mut rejected = lap_photo(4, 4, 0.0, 0.0);
    rejected.state.cars.push(rejected.state.cars[0].clone());
    assert!(core.observe(rejected).is_err());
    assert_eq!(core.series().active().unwrap().to_bytes().unwrap(), active);
    assert!(core.series().sealed().is_none(), "foto rechazada");
}

#[test]
fn delayed_lap_counter_never_assigns_next_lap_samples_to_the_previous_one() {
    let mut core = Core::new(1);
    core.observe(lap_photo(1, 0, 100.0, 2.0)).unwrap();
    core.observe(lap_photo(2, 0, 0.0, 0.0)).unwrap();
    core.observe(lap_photo(3, 0, 150.0, 3.0)).unwrap();
    assert_eq!(core.series().active().unwrap().samples.len(), 1);
    core.observe(lap_photo(4, 1, 200.0, 4.0)).unwrap();
    let sealed = core.series().sealed().unwrap();
    assert!(sealed.gap);
    assert_eq!(sealed.samples.len(), 1);
    assert_eq!(core.series().active().unwrap().samples[0].sequence, 4);
}

#[test]
fn diagnostic_windows_are_bounded_and_report_the_discarded_prefix() {
    let mut series = Series::default();
    let mut snapshot = vantare_domain::Snapshot {
        epoch: 1,
        state: lap_photo(1, 0, 0.0, 0.0).state,
        ..vantare_domain::Snapshot::default()
    };
    for _ in 0..=MAX_LAP_SAMPLES {
        snapshot.sequence += 1;
        series.observe(&snapshot);
    }
    assert_eq!(series.active().unwrap().samples.len(), 1);
    assert_eq!(series.active_offset(), MAX_LAP_SAMPLES);
    assert!(!series.active().unwrap().gap);
    snapshot.sequence += 1;
    snapshot.state.cars[0].laps = Quality::Reliable(1);
    series.observe(&snapshot);
    assert_eq!(series.sealed().unwrap().samples.len(), 1);
    assert_eq!(series.sealed_offset(), MAX_LAP_SAMPLES);
    assert!(!series.sealed().unwrap().gap);
    assert_eq!(series.active_offset(), 0);
    assert_eq!(series.active().unwrap().samples.len(), 1);
}

#[test]
fn a_ten_minute_lap_streams_every_sample_without_a_retention_gap() {
    let mut series = Series::default();
    let receiver = series.subscribe(2).unwrap();
    let mut snapshot = vantare_domain::Snapshot {
        epoch: 1,
        state: lap_photo(1, 0, 0.0, 0.0).state,
        ..vantare_domain::Snapshot::default()
    };
    let mut analysis = SeriesAnalysis::new(1).unwrap();
    let mut count = 0;
    for index in 0..60_000_u32 {
        snapshot.sequence += 1;
        snapshot.state.cars[0].lap_distance_m = Quality::Reliable(f64::from(index));
        snapshot.state.cars[0].lap_elapsed_s = Quality::Reliable(f64::from(index) / 100.0);
        series.observe(&snapshot);
        assert!(series.active().unwrap().samples.len() <= MAX_LAP_SAMPLES);
        while let Ok(chunk) = receiver.try_recv() {
            assert_eq!(chunk.offset, count);
            assert!(!chunk.block.gap);
            count += chunk.block.samples.len();
            analysis
                .consume(&SeriesChunk::from_bytes(&chunk.to_bytes().unwrap()).unwrap())
                .unwrap();
        }
    }
    snapshot.sequence += 1;
    snapshot.state.cars[0].laps = Quality::Reliable(1);
    snapshot.state.cars[0].lap_distance_m = Quality::Reliable(0.0);
    snapshot.state.cars[0].lap_elapsed_s = Quality::Reliable(0.0);
    series.observe(&snapshot);
    let seal = receiver.try_recv().unwrap();
    assert_eq!(seal.offset, count);
    count += seal.block.samples.len();
    assert_eq!(count, 60_000);
    analysis.consume(&seal).unwrap();
    assert!(!analysis.recent()[0].gap);
    assert_eq!(analysis.recent()[0].samples, 60_000);
    assert_eq!(series.publication_status().unwrap().dropped, 0);
}
