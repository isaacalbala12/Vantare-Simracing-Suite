#![allow(clippy::unwrap_used)]

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use vantare_domain::{Car, CarId, Observation, Player, Quality, SessionId, State};

use super::*;
use crate::core::Core;

pub(super) fn photo(sequence: u64, in_pits: bool) -> Observation {
    let mut observation = Observation {
        state: State {
            cars: vec![Car {
                id: CarId(7),
                in_pits: Quality::Reliable(in_pits),
                ..Car::default()
            }],
            player: Some(Player {
                car: CarId(7),
                ..Player::default()
            }),
            ..State::default()
        },
        ..Observation::default()
    };
    observation.origin.received_at = Duration::from_millis(sequence * 10);
    observation.origin.source_time = Some(observation.origin.received_at);
    observation
}

pub(super) struct TestFile(pub(super) PathBuf);

impl TestFile {
    pub(super) fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        Self(std::env::temp_dir().join(format!(
            "vantare-journal-{}-{}.jsonl",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        )))
    }
}

impl Drop for TestFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn event(consumer: &mut Consumer, core: &Core) -> PitEvent {
    let Some(Delivery::Event(event)) = consumer.poll(core.events()).unwrap() else {
        panic!("se esperaba un evento real observado");
    };
    event
}

#[test]
fn consumer_restart_recovers_from_acked_cursor_and_redelivers_without_ack() {
    let mut core = Core::new(11);
    let mut consumer = Consumer::new(core.events().tail());
    core.observe(photo(1, false)).unwrap();
    core.observe(photo(2, true)).unwrap();
    core.observe(photo(3, false)).unwrap();
    let first = event(&mut consumer, &core);
    assert_eq!(
        (first.cursor.epoch, first.sequence, first.car),
        (11, 2, CarId(7))
    );
    assert!(!first.was_in_pits && first.in_pits);
    assert_eq!(event(&mut consumer, &core), first, "sin ACK se repite");
    consumer.ack();
    let saved = consumer.cursor();
    let mut restarted = Consumer::new(saved);
    let second = event(&mut restarted, &core);
    assert_eq!((second.sequence, second.cursor.index), (3, 2));
    assert!(second.was_in_pits && !second.in_pits);
    restarted.ack();
    assert_eq!(restarted.poll(core.events()).unwrap(), None);
    let mut independent = Consumer::new(Cursor {
        epoch: 11,
        index: 0,
    });
    assert_eq!(
        event(&mut independent, &core),
        first,
        "ACK es por consumidor"
    );
}

#[test]
fn volatile_core_restart_declares_gap_and_does_not_invent_a_pit_change() {
    let mut core = Core::new(11);
    core.observe(photo(1, false)).unwrap();
    core.observe(photo(2, true)).unwrap();
    let saved = Cursor {
        epoch: 11,
        index: 0,
    };
    assert_eq!(core.events_mut().persist().unwrap(), None);
    drop(core);
    let mut core = Core::new(12);
    core.observe(photo(3, false)).unwrap();
    let mut consumer = Consumer::new(saved);
    assert_eq!(
        consumer.poll(core.events()).unwrap(),
        Some(Delivery::Gap {
            reason: GapReason::CoreRestart,
            resume_at: core.events().tail(),
        })
    );
    consumer.ack(); // En producción, reconstruir antes desde core.snapshot().
    assert_eq!(consumer.poll(core.events()).unwrap(), None);
    core.observe(photo(4, true)).unwrap();
    assert_eq!(event(&mut consumer, &core).sequence, 2);
}

#[test]
fn exhausted_retention_declares_gap_then_resumes_from_the_snapshot_base() {
    let mut core = Core::with_flows(1, 2, None).unwrap();
    let mut consumer = Consumer::new(core.events().tail());
    for index in 1..=6 {
        core.observe(photo(index, index % 2 == 0)).unwrap();
    }
    assert_eq!(
        consumer.poll(core.events()).unwrap(),
        Some(Delivery::Gap {
            reason: GapReason::Retention,
            resume_at: Cursor { epoch: 1, index: 5 },
        })
    );
    consumer.ack();
    assert_eq!(consumer.poll(core.events()).unwrap(), None);
    core.observe(photo(7, false)).unwrap();
    assert_eq!(event(&mut consumer, &core).sequence, 7);
}

#[test]
fn recording_recovers_every_confirmed_event_across_restart_and_memory_eviction() {
    let file = TestFile::new();
    let mut core = Core::with_flows(20, 1, Some(&file.0)).unwrap();
    let saved = core.events().tail();
    core.observe(photo(1, false)).unwrap();
    for index in 2..=5 {
        core.observe(photo(index, index % 2 == 0)).unwrap();
        let before = core.events().durable_cursor();
        assert_ne!(
            before,
            Some(core.events().tail()),
            "observar no confirma disco"
        );
        assert_eq!(
            core.events_mut().persist().unwrap(),
            Some(core.events().tail())
        );
    }
    let prefix = fs::read(&file.0).unwrap();
    core.events_mut().persist().unwrap();
    assert_eq!(
        fs::read(&file.0).unwrap(),
        prefix,
        "persistir dos veces deduplica"
    );
    drop(core);
    let mut core = Core::with_flows(21, 1, Some(&file.0)).unwrap();
    let new_base = core.events().tail();
    // Primera foto del nuevo núcleo no deduce salida de boxes.
    core.observe(photo(6, true)).unwrap();
    core.observe(photo(7, false)).unwrap();
    core.events_mut().persist().unwrap();
    assert!(
        fs::read(&file.0).unwrap().starts_with(&prefix),
        "append-only"
    );
    let mut consumer = Consumer::new(saved);
    let mut recovered = Vec::new();
    for _ in 0..4 {
        let event = event(&mut consumer, &core);
        recovered.push((event.cursor.epoch, event.sequence));
        consumer.ack();
    }
    assert_eq!(
        consumer.poll(core.events()).unwrap(),
        Some(Delivery::Gap {
            reason: GapReason::CoreRestart,
            resume_at: new_base,
        })
    );
    consumer.ack();
    let next = event(&mut consumer, &core);
    recovered.push((next.cursor.epoch, next.sequence));
    consumer.ack();
    assert_eq!(recovered, [(20, 2), (20, 3), (20, 4), (20, 5), (21, 2)]);
    assert_eq!(consumer.poll(core.events()).unwrap(), None);
    let mut new_consumer = Consumer::new(new_base);
    assert_eq!(event(&mut new_consumer, &core).cursor.epoch, 21);
}

#[test]
fn recording_declares_the_uncertain_restart_boundary_before_new_events() {
    let file = TestFile::new();
    let mut core = Core::with_flows(1, 4, Some(&file.0)).unwrap();
    let saved = core.events().tail();
    core.observe(photo(1, false)).unwrap();
    core.observe(photo(2, true)).unwrap();
    core.events_mut().persist().unwrap();
    core.observe(photo(3, false)).unwrap(); // No confirmado: se pierde.
    drop(core);
    let mut core = Core::with_flows(2, 4, Some(&file.0)).unwrap();
    let base = core.events().tail();
    core.observe(photo(1, false)).unwrap();
    core.observe(photo(2, true)).unwrap();
    core.events_mut().persist().unwrap();
    let mut consumer = Consumer::new(saved);
    assert_eq!(event(&mut consumer, &core).cursor.epoch, 1);
    consumer.ack();
    assert_eq!(
        consumer.poll(core.events()).unwrap(),
        Some(Delivery::Gap {
            reason: GapReason::CoreRestart,
            resume_at: base,
        })
    );
    consumer.ack();
    assert_eq!(event(&mut consumer, &core).cursor.epoch, 2);
}

#[test]
fn recording_recovers_new_epochs_after_ack_of_a_lost_volatile_event() {
    let file = TestFile::new();
    let mut core = Core::with_flows(1, 4, Some(&file.0)).unwrap();
    core.observe(photo(1, false)).unwrap();
    core.observe(photo(2, true)).unwrap();
    core.events_mut().persist().unwrap();
    core.observe(photo(3, false)).unwrap();
    let acked_volatile = core.events().tail();
    drop(core);
    let mut core = Core::with_flows(2, 4, Some(&file.0)).unwrap();
    core.observe(photo(1, false)).unwrap();
    core.observe(photo(2, true)).unwrap();
    core.events_mut().persist().unwrap();
    drop(core);
    let mut core = Core::with_flows(3, 4, Some(&file.0)).unwrap();
    core.observe(photo(1, false)).unwrap();
    core.observe(photo(2, true)).unwrap();
    core.events_mut().persist().unwrap();
    let mut consumer = Consumer::new(acked_volatile);
    for (epoch, index) in [(2, 1), (3, 2)] {
        assert_eq!(
            consumer.poll(core.events()).unwrap(),
            Some(Delivery::Gap {
                reason: GapReason::CoreRestart,
                resume_at: Cursor { epoch, index },
            })
        );
        consumer.ack();
        assert_eq!(event(&mut consumer, &core).cursor.epoch, epoch);
        consumer.ack();
    }
    assert_eq!(consumer.poll(core.events()).unwrap(), None);
}

#[test]
fn torn_unconfirmed_tail_preserves_the_durable_prefix_without_truncating() {
    let file = TestFile::new();
    let mut core = Core::with_flows(1, 2, Some(&file.0)).unwrap();
    let saved = core.events().tail();
    core.observe(photo(1, false)).unwrap();
    core.observe(photo(2, true)).unwrap();
    core.events_mut().persist().unwrap();
    drop(core);
    OpenOptions::new()
        .append(true)
        .open(&file.0)
        .unwrap()
        .write_all(b"[1,2,")
        .unwrap();
    let prefix = fs::read(&file.0).unwrap();
    let core = Core::with_flows(2, 2, Some(&file.0)).unwrap();
    assert!(fs::read(&file.0).unwrap().starts_with(&prefix));
    let mut consumer = Consumer::new(saved);
    assert_eq!(event(&mut consumer, &core).sequence, 2);
    drop(core);
    assert!(
        Core::with_flows(3, 2, Some(&file.0)).is_ok(),
        "cola abortada sigue legible"
    );
}

#[test]
fn lost_unconfirmed_retention_cannot_be_reported_as_durable() {
    let file = TestFile::new();
    let mut core = Core::with_flows(1, 1, Some(&file.0)).unwrap();
    for index in 1..=4 {
        core.observe(photo(index, index % 2 == 0)).unwrap();
    }
    assert!(core.events_mut().persist().is_err());
    assert_eq!(core.events().durable_cursor(), None);
    assert!(fs::read(&file.0).unwrap().is_empty());
}

#[test]
fn missing_stale_estimated_or_changed_identity_never_invents_an_event() {
    let mut core = Core::new(1);
    let mut consumer = Consumer::new(core.events().tail());
    core.observe(photo(1, false)).unwrap();
    let mut missing = photo(2, true);
    missing.state.cars[0].in_pits = Quality::Unavailable;
    core.observe(missing).unwrap();
    core.observe(photo(3, true)).unwrap();
    core.tick(Duration::from_secs(1));
    core.observe(photo(110, false)).unwrap();
    let mut estimated = photo(111, true);
    estimated.state.cars[0].in_pits = Quality::Estimated(true);
    core.observe(estimated).unwrap();
    let mut session = photo(112, true);
    session.state.session.id = SessionId(2);
    core.observe(session).unwrap();
    let mut player = photo(113, false);
    player.state.session.id = SessionId(2);
    player.state.cars[0].id = CarId(8);
    player.state.player.as_mut().unwrap().car = CarId(8);
    core.observe(player).unwrap();
    assert_eq!(consumer.poll(core.events()).unwrap(), None);
}

#[test]
fn invalid_configuration_and_malformed_complete_records_fail_explicitly() {
    assert!(Core::with_flows(1, 0, None).is_err());
    let file = TestFile::new();
    fs::write(&file.0, b"[99,1,1,2,0,7,false,true]\n").unwrap();
    assert!(Core::with_flows(2, 1, Some(&file.0)).is_err());
    fs::write(&file.0, b"[1,1,1,2,0,7,false,true]\n").unwrap();
    assert!(
        Core::with_flows(1, 1, Some(&file.0)).is_err(),
        "época creciente"
    );
}
