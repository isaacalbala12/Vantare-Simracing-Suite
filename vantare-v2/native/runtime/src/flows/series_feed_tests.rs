#![allow(clippy::unwrap_used)]

use std::sync::mpsc::TryRecvError;

use vantare_domain::{Observation, Quality, SessionId};

use super::*;
use crate::core::Core;

pub(super) fn photo(index: u32, lap: u32) -> Observation {
    let mut observation = super::tests::photo(u64::from(index), false);
    let car = &mut observation.state.cars[0];
    car.laps = Quality::Reliable(lap);
    car.lap_distance_m = Quality::Reliable(f64::from(index % 128));
    car.lap_elapsed_s = Quality::Reliable(f64::from(index % 128) / 10.0);
    let telemetry = &mut observation.state.player.as_mut().unwrap().telemetry;
    telemetry.speed_mps = Quality::Reliable(50.0);
    telemetry.throttle = Quality::Reliable(0.75);
    telemetry.brake = Quality::Reliable(0.0);
    observation
}

#[test]
fn chunks_arrive_during_the_lap_and_the_seal_keeps_the_coherent_cut() {
    let mut core = Core::new(7);
    let receiver = core.series_mut().subscribe(4).unwrap();
    for index in 0..64 {
        core.observe(photo(index, 0)).unwrap();
    }
    let first = receiver.try_recv().unwrap();
    assert_eq!((first.index, first.offset, first.lost_before), (1, 0, 0));
    assert_eq!(first.block.samples.len(), MAX_CHUNK_SAMPLES);
    assert_eq!(first.block.sealed_at, None);
    core.observe(photo(64, 0)).unwrap();
    core.observe(photo(128, 1)).unwrap();
    let final_chunk = receiver.try_recv().unwrap();
    assert_eq!((final_chunk.index, final_chunk.offset), (2, 64));
    assert_eq!(final_chunk.block.samples.len(), 1);
    assert_eq!(final_chunk.block.sealed_at, Some(66));
    assert_eq!(final_chunk.block.samples[0].sequence, 65);
    core.series_mut().flush();
    let next = receiver.try_recv().unwrap();
    assert_eq!((next.index, next.offset, next.block.lap), (3, 0, 1));
    assert_eq!(next.block.samples[0].sequence, 66);
    core.series_mut().flush();
    assert_eq!(receiver.try_recv().unwrap_err(), TryRecvError::Empty);
}

#[test]
fn a_full_queue_reports_losses_and_acquisition_continues() {
    let mut core = Core::new(1);
    let receiver = core.series_mut().subscribe(1).unwrap();
    for index in 0..128 {
        core.observe(photo(index, 0)).unwrap();
    }
    let status = core.series().publication_status().unwrap();
    assert_eq!(
        (status.attempted, status.delivered, status.dropped),
        (2, 1, 1)
    );
    assert_eq!(core.snapshot().sequence, 128);
    assert_eq!(receiver.try_recv().unwrap().index, 1);
    core.observe(photo(128, 1)).unwrap();
    let seal = receiver.try_recv().unwrap();
    assert_eq!((seal.index, seal.offset, seal.lost_before), (3, 128, 1));
    assert!(seal.block.samples.is_empty());
    assert_eq!(seal.block.sealed_at, Some(129));
}

#[test]
fn disconnection_is_visible_without_stopping_the_core() {
    let mut core = Core::new(1);
    let receiver = core.series_mut().subscribe(1).unwrap();
    drop(receiver);
    core.observe(photo(0, 0)).unwrap();
    core.series_mut().flush();
    assert!(core.series().publication_status().unwrap().disconnected);
    assert_eq!(core.series().publication_status().unwrap().dropped, 1);
    core.observe(photo(1, 0)).unwrap();
    assert_eq!(core.snapshot().sequence, 2);
}

#[test]
fn invalid_configuration_cannot_replace_the_single_owner_or_replay_a_partial_lap() {
    let mut core = Core::new(1);
    assert!(core.series_mut().subscribe(0).is_err());
    assert!(core.series_mut().subscribe(MAX_QUEUED_CHUNKS + 1).is_err());
    let receiver = core.series_mut().subscribe(1).unwrap();
    assert!(core.series_mut().subscribe(1).is_err());
    drop(receiver);
    let mut started = Core::new(1);
    started.observe(photo(0, 0)).unwrap();
    assert!(started.series_mut().subscribe(1).is_err());
    assert!(Core::new(1).series().publication_status().is_none());
}

#[test]
fn identity_changes_and_counter_jumps_discard_without_a_fake_seal() {
    let mut core = Core::new(1);
    let receiver = core.series_mut().subscribe(8).unwrap();
    core.observe(photo(0, 0)).unwrap();
    let mut next = photo(1, 0);
    next.state.session.id = SessionId(8);
    core.observe(next).unwrap();
    let abandoned = receiver.try_recv().unwrap();
    assert!(abandoned.block.gap);
    assert_eq!(abandoned.block.sealed_at, None);
    assert_eq!(abandoned.block.session, SessionId(0));
    let mut jump = photo(2, 4);
    jump.state.session.id = SessionId(8);
    core.observe(jump).unwrap();
    let abandoned = receiver.try_recv().unwrap();
    assert!(abandoned.block.gap);
    assert_eq!(abandoned.block.sealed_at, None);
    assert_eq!(abandoned.block.session, SessionId(8));
    core.series_mut().flush();
    let new = receiver.try_recv().unwrap();
    assert_eq!((new.index, new.offset, new.block.lap), (3, 0, 4));
    assert!(core.series().sealed().is_none());
}

#[test]
fn an_empty_gap_marker_is_published_once_and_an_exact_chunk_still_gets_a_seal() {
    let mut core = Core::new(1);
    let receiver = core.series_mut().subscribe(8).unwrap();
    for index in 0..64 {
        core.observe(photo(index, 0)).unwrap();
    }
    receiver.try_recv().unwrap();
    let mut missing = photo(64, 0);
    missing.state.cars[0].lap_distance_m = Quality::Unavailable;
    core.observe(missing).unwrap();
    core.series_mut().flush();
    let gap = receiver.try_recv().unwrap();
    assert!(gap.block.gap);
    assert!(gap.block.samples.is_empty());
    core.series_mut().flush();
    assert_eq!(receiver.try_recv().unwrap_err(), TryRecvError::Empty);
    core.observe(photo(128, 1)).unwrap();
    let seal = receiver.try_recv().unwrap();
    assert_eq!(seal.block.sealed_at, Some(66));
    assert!(seal.block.samples.is_empty());
    assert!(seal.block.gap);
}
