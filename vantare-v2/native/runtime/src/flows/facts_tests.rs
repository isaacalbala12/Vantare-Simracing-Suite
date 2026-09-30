//! Datos sintéticos explícitos; generación productiva, archivo y codec reales.
use std::time::Duration;

use vantare_domain::{
    Car, CarId, Flag, FlagKind, FlagScope, Observation, Player, Quality, SessionId, SessionState,
    SourceState, State,
};

use super::{
    Consumer, Cursor, Delivery, Event, FactKind, FlagSignal, GapReason, Journal, RecordingStatus,
    tests::TestFile,
    wire::{self, Frame},
};
use crate::core::Core;

fn photo(tick: u64, lap: u32, in_pits: bool) -> Observation {
    let mut observation = Observation {
        state: State {
            cars: vec![Car {
                id: CarId(7),
                laps: Quality::Reliable(lap),
                in_pits: Quality::Reliable(in_pits),
                ..Car::default()
            }],
            player: Some(Player {
                car: CarId(7),
                ..Player::default()
            }),
            flags: Quality::Reliable(Vec::new()),
            ..State::default()
        },
        ..Observation::default()
    };
    observation.state.session.id = SessionId(10);
    observation.state.session.state = Quality::Reliable(SessionState::Preparing);
    observation.origin.received_at = Duration::from_millis(tick);
    observation
}
#[test]
fn one_core_cut_generates_scoped_flags_lap_pit_and_session_phase_in_one_cursor() {
    let mut core = Core::new(1);
    core.observe(photo(1, 0, false)).unwrap();
    assert_eq!(core.events().tail().index, 0, "primera foto es base");
    let mut next = photo(2, 1, true);
    next.state.flags = Quality::Reliable(vec![Flag {
        kind: FlagKind::Yellow,
        scope: FlagScope::Sector(2),
    }]);
    next.state.session.state = Quality::Reliable(SessionState::Running);
    core.observe(next).unwrap();
    let events = core.events().retained();
    assert_eq!(events.len(), 4);
    for (index, event) in events.iter().enumerate() {
        assert_eq!(
            event.cursor(),
            Cursor {
                epoch: 1,
                index: u64::try_from(index).unwrap() + 1
            }
        );
        assert_eq!(event.sequence(), core.snapshot().sequence);
        assert_eq!(Event::decode(&event.record()).unwrap(), *event);
    }
    assert!(
        matches!(events[0], Event::Fact(f) if f.kind == FactKind::SessionStateChanged { before: SessionState::Preparing, after: SessionState::Running })
    );
    assert!(
        matches!(events[1], Event::Fact(f) if f.kind == FactKind::FlagChanged { kind: FlagSignal::Yellow, scope: FlagScope::Sector(2), active: true })
    );
    assert!(
        matches!(events[2], Event::Fact(f) if f.kind == FactKind::LapCompleted { car: CarId(7), completed: 1 })
    );
    assert!(matches!(events[3], Event::Pit(e) if e.in_pits));
    let mut next = photo(3, 1, true);
    next.state.session.state = Quality::Reliable(SessionState::Running);
    core.observe(next).unwrap();
    assert!(
        matches!(core.events().retained().last(), Some(Event::Fact(f)) if f.kind == FactKind::FlagChanged { kind: FlagSignal::Yellow, scope: FlagScope::Sector(2), active: false })
    );
}
#[test]
fn quality_gaps_counter_jumps_and_source_stall_never_invent_transitions() {
    let mut core = Core::new(1);
    let mut first = photo(1, 0, false);
    first.state.flags = Quality::Reliable(vec![Flag {
        kind: FlagKind::Blue,
        scope: FlagScope::Car(CarId(7)),
    }]);
    core.observe(first).unwrap();
    let mut missing = photo(2, 1, true);
    missing.state.cars[0].laps = Quality::Estimated(1);
    missing.state.cars[0].in_pits = Quality::Unavailable;
    missing.state.flags = Quality::Unavailable;
    core.observe(missing).unwrap();
    core.observe(photo(3, 4, true)).unwrap();
    core.observe(photo(4, 7, true)).unwrap();
    assert!(core.events().retained().is_empty());
    core.tick(Duration::from_secs(1));
    let events = core.events().retained();
    assert_eq!(events.len(), 1);
    assert!(
        matches!(events[0], Event::Fact(f) if f.kind == FactKind::SourceChanged { before: SourceState::Live, after: SourceState::Stale })
    );
    core.observe(photo(1001, 8, false)).unwrap();
    let events = core.events().retained();
    assert_eq!(
        events.len(),
        2,
        "recuperar calidad no deduce una vuelta ni salida de boxes"
    );
    assert!(
        matches!(events[1], Event::Fact(f) if f.kind == FactKind::SourceChanged { before: SourceState::Stale, after: SourceState::Live })
    );
    let mut session = photo(1002, 100, true);
    session.state.session.id = SessionId(20);
    core.observe(session).unwrap();
    assert!(
        matches!(core.events().retained().last(), Some(Event::Fact(f)) if f.session == SessionId(20) && f.kind == FactKind::SessionChanged { previous: SessionId(10) })
    );
}
#[test]
fn mixed_durable_history_recovers_all_facts_and_boxes_through_the_wire() {
    let file = TestFile::new();
    let mut core = Core::with_flows(1, 2, Some(&file.0)).unwrap();
    let base = core.events().tail();
    core.observe(photo(1, 0, false)).unwrap();
    // Persistir cada corte: la retención 2 no puede contener el histórico 12.
    for tick in 2..=7 {
        core.observe(photo(tick, u32::try_from(tick - 1).unwrap(), tick % 2 == 0))
            .unwrap();
        assert_eq!(
            core.events_mut().persist().unwrap(),
            Some(core.events().tail())
        );
    }
    let saved = core.events().durable_cursor().unwrap();
    assert_eq!(saved.index, 12);
    drop(core);
    let mut core = Core::with_flows(2, 2, Some(&file.0)).unwrap();
    core.observe(photo(1, 10, true)).unwrap();
    let mut consumer = Consumer::new(base);
    for index in 1..=saved.index {
        let frame = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
        let mut bytes = Vec::new();
        wire::write_frame(&mut bytes, &frame).unwrap();
        assert_eq!(
            wire::read_frame(&mut bytes.as_slice()).unwrap(),
            Some(frame.clone())
        );
        let cursor = match frame.delivery.unwrap() {
            Delivery::Event(e) => e.cursor,
            Delivery::Fact(f) => f.cursor,
            Delivery::Gap { .. } => panic!("hueco antes de confirmados"),
        };
        assert_eq!(cursor.index, index);
        consumer.ack();
    }
    assert!(matches!(
        consumer.poll(core.events()).unwrap(),
        Some(Delivery::Gap {
            reason: GapReason::CoreRestart,
            ..
        })
    ));
}
#[test]
fn slow_io_replica_declares_retention_and_recording_degradation_without_faking_ids() {
    let file = TestFile::new();
    let mut owner = Journal::open(1, 2, Some(&file.0)).unwrap();
    // Dueño parado: adquisición genera 20 hechos y solo retiene 256 por defecto.
    // Usar retención 2 del banco para forzar pérdida sin cientos de iteraciones.
    let mut core_small = Core::with_flows(1, 2, None).unwrap();
    core_small.observe(photo(1, 0, false)).unwrap();
    for tick in 2..=20 {
        core_small
            .observe(photo(tick, u32::try_from(tick).unwrap() - 1, false))
            .unwrap();
    }
    owner
        .replicate(core_small.events().tail(), &core_small.events().retained())
        .unwrap();
    assert_eq!(
        owner.recording_status(),
        RecordingStatus::Degraded(std::io::ErrorKind::InvalidData)
    );
    assert_eq!(owner.durable_cursor(), None);
    assert!(owner.persist().is_err());
    let mut consumer = Consumer::new(Cursor { epoch: 1, index: 0 });
    assert!(
        matches!(consumer.poll(&owner).unwrap(), Some(Delivery::Gap { reason: GapReason::Retention, resume_at }) if resume_at == owner.tail())
    );
    consumer.ack();
    core_small.observe(photo(21, 20, false)).unwrap();
    owner
        .replicate(core_small.events().tail(), &core_small.events().retained())
        .unwrap();
    assert!(
        matches!(consumer.poll(&owner).unwrap(), Some(Delivery::Fact(f)) if f.cursor == core_small.events().tail())
    );
    owner.set_recording(Some(&file.0)).unwrap();
    assert_eq!(owner.recording_status(), RecordingStatus::Active);
    assert_eq!(
        owner.durable_cursor(),
        None,
        "base no confirma el prefijo perdido"
    );
}
