//! Estados observables del worker: reloj inyectado, sin dispositivo de audio.
use std::{collections::BTreeMap, time::Duration};
use vantare_domain::{
    Car, CarId, Flag, FlagKind, FlagScope, Player, Pose, Quality, Snapshot, SourceState,
};
use vantare_engineer::{
    Applied,
    control::{
        Settings,
        runtime::{AudioOutcome, Connection, HISTORY_LIMIT, Spotter, VoiceEngine},
    },
    radio::Locale,
    worker::RadioWorker,
};
fn photo(sequence: u64) -> Snapshot {
    let mut snapshot = Snapshot {
        epoch: 1,
        sequence,
        ..Snapshot::default()
    };
    snapshot.state.source_state = SourceState::Live;
    snapshot.state.player = Some(Player {
        car: CarId(7),
        ..Player::default()
    });
    snapshot.state.cars.push(Car {
        id: CarId(7),
        in_pits: Quality::Reliable(false),
        pose: Quality::Reliable(Pose {
            x_m: 0.0,
            y_m: 0.0,
            yaw_rad: 0.0,
        }),
        velocity_mps: Quality::Estimated([20.0, 0.0]),
        ..Car::default()
    });
    snapshot
        .state
        .player
        .as_mut()
        .expect("player")
        .telemetry
        .speed_mps = Quality::Reliable(20.0);
    snapshot
}
#[test]
fn connection_spotter_disabled_stale_and_recovery_are_observable() {
    let mut worker = RadioWorker::new(Locale::Es, None).expect("worker");
    let assets = BTreeMap::new();
    assert_eq!(
        worker.runtime_status(0, &assets).connection,
        Connection::Waiting
    );
    let mut snapshot = photo(1);
    let mut output = Vec::new();
    worker
        .ingest(&snapshot, &Applied::default(), Duration::ZERO, &mut output)
        .expect("ingest");
    let state = worker.runtime_status(0, &assets);
    assert_eq!(state.connection, Connection::Live);
    assert_eq!(state.spotter, Spotter::Ready);
    assert!(state.player_available);
    assert_eq!(state.epoch, Some(1));
    worker
        .tick(Duration::from_millis(500), &mut output)
        .expect("timeout");
    let state = worker.runtime_status(0, &assets);
    assert_eq!(state.connection, Connection::Stale);
    assert_eq!(state.spotter, Spotter::WaitingSource);
    snapshot.sequence += 1;
    worker
        .ingest(
            &snapshot,
            &Applied::default(),
            Duration::from_millis(501),
            &mut output,
        )
        .expect("recover");
    assert_eq!(
        worker.runtime_status(0, &assets).connection,
        Connection::Live
    );
    worker
        .configure(&Settings {
            enabled: false,
            ..Settings::default()
        })
        .expect("disable");
    snapshot.sequence += 1;
    worker
        .ingest(
            &snapshot,
            &Applied::default(),
            Duration::from_millis(502),
            &mut output,
        )
        .expect("disabled");
    assert_eq!(worker.runtime_status(0, &assets).spotter, Spotter::Disabled);
    worker.clear().expect("disconnect");
    assert_eq!(
        worker.runtime_status(0, &assets).connection,
        Connection::Disconnected
    );
}
#[test]
fn spotter_reports_missing_player_spatial_pits_and_low_speed() {
    use vantare_engineer::spotter::availability;
    let mut snapshot = photo(1);
    assert_eq!(availability(&snapshot), Spotter::Ready);
    snapshot.state.cars[0].in_pits = Quality::Reliable(true);
    assert_eq!(availability(&snapshot), Spotter::WaitingPitLane);
    snapshot.state.cars[0].in_pits = Quality::Reliable(false);
    snapshot
        .state
        .player
        .as_mut()
        .expect("player")
        .telemetry
        .speed_mps = Quality::Reliable(5.0);
    assert_eq!(availability(&snapshot), Spotter::WaitingLowSpeed);
    snapshot.state.cars[0].pose = Quality::Stale(Pose {
        x_m: 0.0,
        y_m: 0.0,
        yaw_rad: 0.0,
    });
    assert_eq!(availability(&snapshot), Spotter::UnavailableSpatial);
    snapshot.state.player = None;
    assert_eq!(availability(&snapshot), Spotter::WaitingPlayer);
    snapshot.state.source_state = SourceState::Lost;
    assert_eq!(availability(&snapshot), Spotter::WaitingSource);
}
#[test]
fn all_same_photo_deliveries_are_retained_and_missing_voice_does_not_hide_text() {
    let mut worker = RadioWorker::new(Locale::Es, None).expect("worker");
    worker
        .configure(&Settings {
            voice: true,
            ..Settings::default()
        })
        .expect("voice requested");
    let mut snapshot = photo(1);
    snapshot.state.player.as_mut().expect("player").fuel.level_l = Quality::Reliable(1.0);
    snapshot.state.flags = Quality::Reliable(vec![Flag {
        kind: FlagKind::Yellow,
        scope: FlagScope::Session,
    }]);
    let mut output = Vec::new();
    worker
        .ingest(&snapshot, &Applied::default(), Duration::ZERO, &mut output)
        .expect("ingest");
    let state = worker.runtime_status(100, &BTreeMap::new());
    assert_eq!(state.delivery.history.len(), 2);
    assert_eq!(
        state.delivery.history[0].message.sequence,
        state.delivery.history[1].message.sequence
    );
    assert_ne!(state.delivery.history[0].id, state.delivery.history[1].id);
    assert!(
        state
            .delivery
            .history
            .iter()
            .all(|delivery| delivery.text_emitted && delivery.audio == AudioOutcome::Missing)
    );
    assert!(!state.delivery.speaking);
    assert_eq!(state.delivery.pending, 0);
    assert_eq!(
        state.delivery.last().expect("last").message,
        *worker.last_message().expect("legacy last")
    );
    assert!(!state.voice.clips_configured);
    assert!(state.voice.error.is_some());
    if !cfg!(windows) {
        assert_eq!(state.voice.engine, VoiceEngine::Unavailable);
    }
    for sequence in 2..=70 {
        snapshot.sequence = sequence;
        snapshot.epoch = sequence; // Nueva sesión reinicia deduplicación de familias.
        worker
            .ingest(
                &snapshot,
                &Applied::default(),
                Duration::from_millis(sequence),
                &mut output,
            )
            .expect("new epoch");
    }
    let state = worker.runtime_status(100, &BTreeMap::new());
    assert_eq!(state.delivery.history.len(), HISTORY_LIMIT);
    assert_eq!(
        state.delivery.evicted,
        140 - u64::try_from(HISTORY_LIMIT).expect("limit")
    );
}
