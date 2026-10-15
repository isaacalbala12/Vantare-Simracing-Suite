//! Captura real sanitizada del 14-oct. No acredita conducción: reloj detenido.
use std::time::Duration;

use vantare_domain::{Adapter, FlagKind, FlagScope, Quality, Snapshot};
use vantare_runtime::adapter::{Replay, ReplayEvent};

const FRAME: &[u8] = include_bytes!("../testdata/lmu-rest-2026-10-14/frame.bin");
const STANDINGS: &[u8] = include_bytes!("../testdata/lmu-rest-2026-10-14/standings.json");
const SESSION: &[u8] = include_bytes!("../testdata/lmu-rest-2026-10-14/sessionInfo.json");

fn replay() -> Replay {
    Replay::new(
        "1.4.2.0",
        [
            ReplayEvent::Shm {
                at: Duration::ZERO,
                frame: FRAME.to_vec(),
            },
            ReplayEvent::Rest {
                at: Duration::ZERO,
                standings: STANDINGS.to_vec(),
                standings_started: Duration::ZERO,
                session: SESSION.to_vec(),
                session_started: Duration::ZERO,
            },
            ReplayEvent::Shm {
                at: Duration::from_secs(3),
                frame: FRAME.to_vec(),
            },
        ],
    )
}

#[test]
fn real_rest_delivers_sector_flags_energy_and_table_fields_through_the_live_dto() {
    let mut replay = replay();
    replay.poll(Duration::ZERO).expect("SHM");
    let observation = replay.poll(Duration::ZERO).expect("REST").expect("foto");
    assert_eq!(observation.state.cars.len(), 37);
    let snapshot = Snapshot {
        state: observation.state,
        ..Snapshot::default()
    };
    let json = vantare_ipc::snapshot_to_json(&snapshot).expect("DTO");
    let snapshot = vantare_ipc::snapshot_from_json(&json).expect("lector live estricto");
    let Quality::Reliable(flags) = &snapshot.state.flags else {
        panic!("faltan flags reales")
    };
    for sector in 0..3 {
        assert!(
            flags
                .iter()
                .any(|f| f.scope == FlagScope::Sector(sector) && f.kind == FlagKind::Yellow)
        );
    }
    assert!(
        !flags
            .iter()
            .any(|f| f.scope == FlagScope::Session && f.kind == FlagKind::Green)
    );
    let player = snapshot.state.player.as_ref().expect("jugador");
    assert_eq!(
        player.fuel.energy,
        Quality::Reliable(0.999_952_018_260_955_8)
    );
    assert!(snapshot.state.cars.iter().all(|c| !c.vehicle.is_empty()));
    assert!(
        snapshot
            .state
            .cars
            .iter()
            .all(|c| c.pit_stops == Quality::Reliable(0))
    );
}

#[test]
fn stopped_shm_and_expired_rest_cannot_refresh_launch_signals() {
    let mut replay = replay();
    replay.poll(Duration::ZERO).expect("SHM");
    replay.poll(Duration::ZERO).expect("REST");
    let observation = replay
        .poll(Duration::from_secs(3))
        .expect("caducidad")
        .expect("foto");
    assert!(
        observation
            .state
            .player
            .expect("jugador")
            .fuel
            .energy
            .current()
            .is_none()
    );
    assert!(
        observation
            .state
            .cars
            .iter()
            .all(|c| c.pit_stops.current().is_none())
    );
    assert!(observation.state.flags.current().is_none());
}

#[test]
fn reused_slots_and_old_sessions_cannot_attach_energy_or_penalty_flags() {
    for new_session in [false, true] {
        let mut frame = FRAME.to_vec();
        if new_session {
            frame[1700..1708].copy_from_slice(&1.0_f64.to_le_bytes());
        } else {
            let offset = 2192 + 36 * 584 + 36;
            frame[offset..offset + 64].fill(0);
            frame[offset..offset + 6].copy_from_slice(b"Other\0");
        }
        // Reuse the public adapter with the same preceding events and changed frame.
        let mut replay = Replay::new(
            "1.4.2.0",
            [
                ReplayEvent::Shm {
                    at: Duration::ZERO,
                    frame: FRAME.to_vec(),
                },
                ReplayEvent::Rest {
                    at: Duration::ZERO,
                    standings: STANDINGS.to_vec(),
                    standings_started: Duration::ZERO,
                    session: SESSION.to_vec(),
                    session_started: Duration::ZERO,
                },
                ReplayEvent::Shm {
                    at: Duration::from_millis(10),
                    frame,
                },
            ],
        );
        replay.poll(Duration::ZERO).expect("SHM");
        replay.poll(Duration::ZERO).expect("REST");
        let photo = replay
            .poll(Duration::from_millis(10))
            .expect("SHM cambiado")
            .expect("foto");
        assert_eq!(
            photo.state.player.expect("jugador").fuel.energy,
            Quality::Unavailable
        );
        assert_eq!(
            photo.state.player_car().expect("coche").pit_stops,
            Quality::Unavailable
        );
    }
}

#[test]
fn every_static_lmu_vehicle_label_matches_the_original_shm() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata");
    for (file, build) in [
        ("lmu-fixture.bin", "1.3.0.0"),
        ("lmu-1.4-outlap-fixture.bin", "1.4.0.0"),
        ("lmu-1.4-pit-fixture.bin", "1.4.0.0"),
        ("lmu-1.4-garage-fixture.bin", "1.4.0.0"),
        ("lmu-1.4.1.3-track-fixture.bin", "1.4.1.3"),
        ("lmu-1.4.2.0-track-fixture.bin", "1.4.2.0"),
    ] {
        let bytes = std::fs::read(root.join(file)).expect("fixture real");
        let mut replay = Replay::new(
            build,
            [ReplayEvent::Shm {
                at: Duration::ZERO,
                frame: bytes.clone(),
            }],
        );
        let photo = replay.poll(Duration::ZERO).expect("SHM").expect("foto");
        for (index, car) in photo.state.cars.iter().enumerate() {
            let start = 2192 + index * 584 + 36;
            let field = &bytes[start..start + 64];
            let end = field.iter().position(|v| *v == 0).expect("NUL");
            let native = std::str::from_utf8(&field[..end]).expect("etiqueta").trim();
            assert_eq!(car.vehicle, native, "{file}, fila {index}");
        }
    }
}

#[cfg(windows)]
#[test]
#[ignore = "solo lectura opt-in con LMU físico; no es gate CI"]
fn live_lmu_launch_probe() {
    let mut adapter = vantare_runtime::adapter::Lmu::new();
    let mut core = vantare_runtime::core::Core::new(1638);
    let clock = std::time::Instant::now();
    let mut previous = None;
    let mut advances = 0;
    while clock.elapsed() < Duration::from_secs(3) {
        // Physical probe: give the 60 Hz source and REST worker time to run.
        core.step(&mut adapter, clock.elapsed())
            .expect("Core físico");
        let source = core.snapshot().origin.source_time;
        if previous.is_some() && source.is_some() && previous != source {
            advances += 1;
        }
        previous = source;
        std::thread::sleep(Duration::from_millis(17));
    }
    let photo = core.snapshot();
    println!(
        "LMU readonly: state={:?}, cars={}, source_advances={advances}, flags_current={}, player={}",
        photo.state.source_state,
        photo.state.cars.len(),
        photo.state.flags.current().is_some(),
        photo.state.player.is_some()
    );
    // Orchestrator correction: a loaded stationary/garage session is valid.
    // Report clock advances separately; a paused smoke is not driving QA.
    assert!(
        matches!(
            photo.state.source_state,
            vantare_domain::SourceState::Live | vantare_domain::SourceState::Paused
        ) && !photo.state.cars.is_empty()
            && photo.state.player.is_some(),
        "LMU no ofrece una sesión usable desde este proceso"
    );
}

#[test]
fn real_frames_expose_only_demonstrable_session_timing() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata");
    for (file, build) in [
        ("lmu-fixture.bin", "1.3.0.0"),
        ("lmu-1.4-outlap-fixture.bin", "1.4.0.0"),
        ("lmu-1.4.1.3-track-fixture.bin", "1.4.1.3"),
        ("lmu-1.4.2.0-track-fixture.bin", "1.4.2.0"),
    ] {
        let bytes = std::fs::read(root.join(file)).expect("captura real");
        let mut replay = Replay::new(
            build,
            [ReplayEvent::Shm {
                at: Duration::ZERO,
                frame: bytes.clone(),
            }],
        );
        let o = replay.poll(Duration::ZERO).unwrap().unwrap();
        let s = Snapshot {
            state: o.state,
            ..Snapshot::default()
        };
        let s =
            vantare_ipc::snapshot_from_json(&vantare_ipc::snapshot_to_json(&s).unwrap()).unwrap();
        let t = &s.state.session.timing;
        assert_eq!(t.started_at_s, Quality::Unavailable);
        assert_eq!(t.finished_at_s, Quality::Unavailable);
        assert_eq!(t.start_phase, Quality::Unavailable);
        assert_eq!(t.next_kind, Quality::Unavailable);
        assert_eq!(t.next_starts_at_s, Quality::Unavailable);
        let player = s.state.player_car().unwrap();
        if player.in_pits == Quality::Reliable(true) {
            assert_eq!(t.distance_to_start_line_m, Quality::Unavailable);
        } else if let Quality::Estimated(distance) = t.distance_to_start_line_m {
            let index = (0..s.state.cars.len())
                .find(|i| bytes[2192 + i * 584 + 196] == 1)
                .unwrap();
            let offset = 2192 + index * 584 + 104;
            let raw = f64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap());
            let length = *s.state.session.track_length_m.current().unwrap();
            let expected = if raw <= 0.0 { -raw } else { length - raw };
            assert!((distance - expected).abs() < 1e-9);
        } else {
            panic!("distancia ausente en {file}");
        }
    }
}

#[test]
fn same_kind_session_change_is_a_new_identity_and_discards_old_rest() {
    let mut next = FRAME.to_vec();
    let number = i32::from_le_bytes(next[1696..1700].try_into().unwrap());
    assert!((1..4).contains(&number));
    next[1696..1700].copy_from_slice(&(number + 1).to_le_bytes());
    // El reloj sigue creciendo: el cambio debe detectarse por número, no reset.
    next[1700..1708].copy_from_slice(&6000.0_f64.to_le_bytes());
    let mut replay = Replay::new(
        "1.4.2.0",
        [
            ReplayEvent::Shm {
                at: Duration::ZERO,
                frame: FRAME.to_vec(),
            },
            ReplayEvent::Rest {
                at: Duration::ZERO,
                standings: STANDINGS.to_vec(),
                standings_started: Duration::ZERO,
                session: SESSION.to_vec(),
                session_started: Duration::ZERO,
            },
            ReplayEvent::Shm {
                at: Duration::from_millis(10),
                frame: next,
            },
        ],
    );
    let first = replay.poll(Duration::ZERO).unwrap().unwrap();
    replay.poll(Duration::ZERO).unwrap();
    let next = replay.poll(Duration::from_millis(10)).unwrap().unwrap();
    assert_ne!(first.state.session.id, next.state.session.id);
    assert_eq!(first.state.session.kind, next.state.session.kind);
    assert!(
        next.state
            .cars
            .iter()
            .all(|c| c.pit_stops == Quality::Unavailable)
    );
    assert_eq!(next.state.session.timing.started_at_s, Quality::Unavailable);
}
