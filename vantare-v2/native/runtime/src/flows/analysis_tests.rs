#![allow(clippy::unwrap_used)]

use std::time::Duration;

use serde_json::Value;
use vantare_domain::{CarId, Quality, SessionId};

use super::*;
use crate::core::Core;

const GOLDEN: &str = concat!(
    "[\"vantare.series-chunk.v1\",1,0,0,",
    "[\"vantare.player-lap.v1\",7,0,7,0,null,false,",
    "[[1,[1,0.0],[1,0.0],[1,50.0],[1,0.75],[1,0.0]]]]]"
);

fn chunk(index: u64, offset: usize) -> SeriesChunk {
    SeriesChunk {
        index,
        lost_before: 0,
        offset,
        block: LapBlock {
            epoch: 7,
            session: SessionId(0),
            car: CarId(7),
            lap: 0,
            sealed_at: None,
            gap: false,
            samples: vec![LapSample {
                sequence: index,
                distance_m: Quality::Reliable(f64::from(u32::try_from(offset).unwrap())),
                elapsed_s: Quality::Reliable(f64::from(u32::try_from(offset).unwrap())),
                speed_mps: Quality::Reliable(50.0),
                throttle: Quality::Reliable(0.75),
                brake: Quality::Reliable(0.0),
            }],
        },
    }
}

#[test]
fn incremental_wire_matches_a_handwritten_golden_and_keeps_every_quality_tag() {
    let first = chunk(1, 0);
    assert_eq!(first.to_bytes().unwrap(), GOLDEN.as_bytes());
    assert_eq!(SeriesChunk::from_bytes(GOLDEN.as_bytes()).unwrap(), first);
    let mut tagged = chunk(1, 0);
    tagged.block.samples[0].speed_mps = Quality::Unavailable;
    tagged.block.samples[0].throttle = Quality::Estimated(0.5);
    tagged.block.samples[0].brake = Quality::Stale(0.25);
    assert_eq!(
        SeriesChunk::from_bytes(&tagged.to_bytes().unwrap()).unwrap(),
        tagged
    );
}

#[test]
fn live_and_replayed_chunks_have_identical_bounded_analysis() {
    let mut core = Core::new(7);
    let receiver = core.series_mut().subscribe(8).unwrap();
    let mut live = SeriesAnalysis::new(2).unwrap();
    let mut bytes = Vec::new();
    for index in 0..129 {
        let mut photo = super::series_feed_tests::photo(index, index / 128);
        // Calidades distintas deliberadas; no son captura física.
        photo.state.player.as_mut().unwrap().telemetry.speed_mps = match index % 4 {
            0 => Quality::Reliable(f64::from(index)),
            1 => Quality::Estimated(50.0),
            2 => Quality::Stale(50.0),
            _ => Quality::Unavailable,
        };
        core.observe(photo).unwrap();
        while let Ok(chunk) = receiver.try_recv() {
            live.consume(&chunk).unwrap();
            bytes.push(chunk.to_bytes().unwrap());
        }
    }
    core.series_mut().flush();
    while let Ok(chunk) = receiver.try_recv() {
        live.consume(&chunk).unwrap();
        bytes.push(chunk.to_bytes().unwrap());
    }
    assert_eq!(bytes.len(), 4, "no pasa en vacío");
    let summary = &live.recent()[0];
    assert_eq!(
        (summary.samples, summary.sealed_at, summary.gap),
        (128, Some(129), false)
    );
    assert_eq!(summary.continuous_span_s(), Some(12.7));
    assert_eq!(summary.speed_mps.reliable, 32);
    assert_eq!(summary.speed_mps.estimated, 32);
    assert_eq!(summary.speed_mps.stale, 32);
    assert_eq!(summary.speed_mps.unavailable, 32);
    assert_eq!(summary.speed_mps.mean, Some(62.0));
    assert_eq!(summary.speed_mps.min, Some(0.0));
    assert_eq!(summary.speed_mps.max, Some(124.0));
    let mut historical = SeriesAnalysis::new(2).unwrap();
    for bytes in bytes {
        historical
            .consume(&SeriesChunk::from_bytes(&bytes).unwrap())
            .unwrap();
    }
    assert_eq!(historical.recent(), live.recent());
    assert_eq!(historical.active(), live.active());
}

#[test]
fn the_real_lmu_fixture_roundtrips_into_analysis_without_inventing_a_full_lap() {
    use crate::adapter::{Replay, ReplayEvent};

    let mut replay = Replay::new(
        "1.4.2.0",
        [ReplayEvent::Shm {
            at: Duration::ZERO,
            frame: include_bytes!("../../../../testdata/lmu-1.4.2.0-track-fixture.bin").to_vec(),
        }],
    );
    let mut core = Core::new(7);
    let receiver = core.series_mut().subscribe(1).unwrap();
    core.step(&mut replay, Duration::ZERO).unwrap();
    core.series_mut().flush();
    let live_chunk = receiver.try_recv().unwrap();
    assert_eq!(
        live_chunk.block.samples.len(),
        1,
        "fixture obligatorio no vacío"
    );
    let replay_chunk = SeriesChunk::from_bytes(&live_chunk.to_bytes().unwrap()).unwrap();
    assert_eq!(live_chunk, replay_chunk);
    let mut live = SeriesAnalysis::new(1).unwrap();
    let mut historical = SeriesAnalysis::new(1).unwrap();
    live.consume(&live_chunk).unwrap();
    historical.consume(&replay_chunk).unwrap();
    assert_eq!(live.active(), historical.active());
    assert_eq!(live.active().unwrap().sealed_at, None);
    assert_eq!(
        live.active().unwrap().first_elapsed_s,
        Some(1.721_370_100_975_036_6)
    );
    assert!(live.recent().is_empty());
}

#[test]
fn zero_is_observed_and_missing_estimated_and_stale_values_never_enter_the_mean() {
    let mut analysis = SeriesAnalysis::new(1).unwrap();
    let mut first = chunk(1, 0);
    first.block.samples[0].speed_mps = Quality::Unavailable;
    first.block.samples[0].throttle = Quality::Estimated(0.5);
    first.block.samples[0].brake = Quality::Stale(0.25);
    analysis.consume(&first).unwrap();
    assert_eq!(analysis.active().unwrap().speed_mps.mean, None);
    assert_eq!(analysis.active().unwrap().throttle.mean, None);
    assert_eq!(analysis.active().unwrap().brake.mean, None);
    let mut second = chunk(2, 1);
    second.block.samples[0].speed_mps = Quality::Reliable(0.0);
    analysis.consume(&second).unwrap();
    assert_eq!(analysis.active().unwrap().speed_mps.mean, Some(0.0));
    assert_eq!(analysis.active().unwrap().speed_mps.unavailable, 1);
    assert_eq!(analysis.active().unwrap().speed_mps.reliable, 1);
}

#[test]
fn losses_and_abandoned_laps_are_visible_without_deriving_across_the_gap() {
    let mut analysis = SeriesAnalysis::new(2).unwrap();
    analysis.consume(&chunk(1, 0)).unwrap();
    let mut after_loss = chunk(3, 2);
    after_loss.lost_before = 1;
    analysis.consume(&after_loss).unwrap();
    assert!(analysis.active().unwrap().gap);
    assert_eq!(analysis.active().unwrap().samples, 2);
    assert_eq!(analysis.active().unwrap().continuous_span_s(), None);
    let mut next_epoch = chunk(4, 0);
    next_epoch.block.epoch = 8;
    next_epoch.block.samples[0].sequence = 1;
    analysis.consume(&next_epoch).unwrap();
    assert!(analysis.recent()[0].gap);
    assert_eq!(analysis.recent()[0].sealed_at, None);
    assert_eq!(analysis.active().unwrap().id.epoch, 8);
    assert!(!analysis.active().unwrap().gap);
}

#[test]
fn offsets_and_missing_indices_alone_also_disclose_incomplete_coverage() {
    let mut analysis = SeriesAnalysis::new(1).unwrap();
    analysis.consume(&chunk(1, 0)).unwrap();
    analysis.consume(&chunk(2, 2)).unwrap();
    assert!(analysis.active().unwrap().gap);
    let mut analysis = SeriesAnalysis::new(1).unwrap();
    analysis.consume(&chunk(3, 0)).unwrap();
    assert!(
        analysis.active().unwrap().gap,
        "inicio del stream no observado"
    );
}

#[test]
fn duplicate_out_of_order_and_regressed_inputs_fail_without_mutating_analysis() {
    let mut analysis = SeriesAnalysis::new(1).unwrap();
    let mut first = chunk(1, 0);
    first.block.samples[0].elapsed_s = Quality::Reliable(1.0);
    first.block.samples[0].distance_m = Quality::Reliable(1.0);
    analysis.consume(&first).unwrap();
    let before = analysis.active().unwrap().clone();
    assert!(analysis.consume(&first).is_err());
    let mut second = chunk(2, 0);
    assert!(analysis.consume(&second).is_err(), "offset repetido");
    second.offset = 1;
    assert!(
        analysis.consume(&second).is_err(),
        "progreso regresivo entre bloques"
    );
    second.block.samples[0].elapsed_s = Quality::Reliable(2.0);
    second.block.samples[0].distance_m = Quality::Reliable(2.0);
    second.block.samples[0].sequence = 1;
    assert!(
        analysis.consume(&second).is_err(),
        "secuencia repetida entre bloques"
    );
    assert_eq!(analysis.active().unwrap(), &before);
    second.block.samples[0].sequence = 2;
    analysis.consume(&second).unwrap();
    assert_eq!(analysis.active().unwrap().samples, 2);
}

#[test]
fn boundary_validation_rejects_bad_wire_and_typed_values_before_use() {
    let base: Value = serde_json::from_str(GOLDEN).unwrap();
    let mutations: &[fn(&mut Value)] = &[
        |v| v[0] = "v2".into(),
        |v| v[1] = 0.into(),
        |v| v[2] = 1.into(),
        |v| v[3] = (MAX_LAP_SAMPLES + 1).into(),
        |v| v[4][0] = "v2".into(),
        |v| v[4][1] = 0.into(),
        |v| v[4][3] = (u64::from(u32::MAX) + 1).into(),
        |v| v[4][5] = 1.into(),
        |v| v[4][6] = 0.into(),
        |v| v[4][7][0][0] = (-1).into(),
        |v| v[4][7][0][1] = serde_json::json!([4, 0.0]),
        |v| v[4][7][0][2] = serde_json::json!([0, 0.0]),
        |v| v[4][7][0][3] = serde_json::json!([1, null]),
        |v| v[4][7][0][4] = serde_json::json!([1, 1.1]),
        |v| v[4][7][0][5] = serde_json::json!([1, -0.1]),
        |v| v.as_array_mut().unwrap().push(Value::Null),
        |v| v[4][7] = Value::Array(vec![v[4][7][0].clone(); MAX_CHUNK_SAMPLES + 1]),
    ];
    for mutate in mutations {
        let mut value = base.clone();
        mutate(&mut value);
        assert!(
            SeriesChunk::from_bytes(&serde_json::to_vec(&value).unwrap()).is_err(),
            "{value}"
        );
    }
    for bytes in [b"null".as_slice(), b"[]", b"", b"[", b"{}"] {
        assert!(SeriesChunk::from_bytes(bytes).is_err());
    }
    assert!(SeriesChunk::from_bytes(&vec![b' '; MAX_CHUNK_BYTES + 1]).is_err());
    let mut bad = chunk(1, 0);
    bad.block.samples[0].speed_mps = Quality::Reliable(f64::NAN);
    assert!(bad.to_bytes().is_err());
    bad.block.samples[0].speed_mps = Quality::Stale(f64::INFINITY);
    assert!(bad.to_bytes().is_err());
}

#[test]
fn analysis_retention_and_queries_are_bounded_and_do_not_hide_incomplete_laps() {
    assert!(SeriesAnalysis::new(0).is_err());
    assert!(SeriesAnalysis::new(MAX_ANALYZED_LAPS + 1).is_err());
    let mut analysis = SeriesAnalysis::new(2).unwrap();
    for lap in 0..100 {
        let mut next = chunk(u64::from(lap) + 1, 0);
        next.block.lap = lap;
        next.block.sealed_at = Some(u64::from(lap) + 2);
        analysis.consume(&next).unwrap();
    }
    assert_eq!(analysis.recent().len(), 2);
    assert_eq!(analysis.recent()[0].id.lap, 98);
    let id = analysis.recent()[1].id;
    assert_eq!(analysis.find_lap(id).unwrap().samples, 1);
    assert!(analysis.find_lap(LapId { lap: 0, ..id }).is_none());
    assert!(analysis.active().is_none());
}
