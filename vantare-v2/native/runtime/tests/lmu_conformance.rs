//! Conformidad del adaptador LMU con capturas reales, solo por su API pública:
//! fixtures `.bin` de `testdata/` y el corpus temporal de 47 coches. Si falta
//! un fixture o el corpus, el test falla: nunca se omite en silencio.

// Ayudantes de test: un `unwrap` que falla es un fallo de conformidad.
#![allow(clippy::unwrap_used)]

use std::collections::HashSet;
use std::fmt::Write as _;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use flate2::read::GzDecoder;
use serde_json::Value;
use sha2::{Digest, Sha256};
use vantare_domain::{
    Adapter, Capability, Observation, Quality, SessionId, SessionKind, SourceKind,
};
use vantare_runtime::adapter::{Replay, ReplayEvent};

const CORPUS_SHA256: &str = "c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c";

fn testdata() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata")
}

/// Una sola lectura de un fixture, como haría el núcleo con `poll`.
fn observe_fixture(file: &str, build: &str) -> Observation {
    let path = testdata().join(file);
    let frame = fs::read(&path).unwrap_or_else(|error| panic!("falta {}: {error}", path.display()));
    let mut replay = Replay::new(
        build,
        [ReplayEvent::Shm {
            at: Duration::ZERO,
            frame,
        }],
    );
    replay
        .poll(Duration::ZERO)
        .unwrap_or_else(|error| panic!("{file}: {error}"))
        .unwrap_or_else(|| panic!("{file}: sin observación"))
}

fn reliable<T: Copy>(quality: Quality<T>) -> T {
    match quality {
        Quality::Reliable(value) => value,
        other => panic!("se esperaba un valor fiable, hay {}", describe(&other)),
    }
}

fn describe<T>(quality: &Quality<T>) -> &'static str {
    match quality {
        Quality::Reliable(_) => "fiable",
        Quality::Estimated(_) => "estimado",
        Quality::Stale(_) => "caducado",
        Quality::Unavailable => "no disponible",
    }
}

fn positions(observation: &Observation) -> Vec<u32> {
    let mut all: Vec<u32> = observation
        .state
        .cars
        .iter()
        .map(|car| reliable(car.position))
        .collect();
    all.sort_unstable();
    all
}

#[test]
fn the_44_car_practice_fixture_becomes_the_expected_observation() {
    let observation = observe_fixture("lmu-fixture.bin", "1.3.0.0");
    let state = &observation.state;
    assert_eq!(observation.origin.source.simulator, "lmu");
    assert_eq!(observation.origin.source.kind, SourceKind::Replay);
    assert_eq!(
        observation.origin.source_time,
        Some(Duration::from_secs_f64(112.6))
    );
    assert_eq!(observation.origin.received_at, Duration::ZERO);

    // Sesión (sidecar del fixture: Barcelona, práctica, 112,6 s de 3605).
    assert_eq!(state.session.id, SessionId(1));
    assert!(
        matches!(&state.session.track_name, Quality::Reliable(name) if name == "Circuit de Barcelona")
    );
    assert!(matches!(
        state.session.kind,
        Quality::Reliable(SessionKind::Practice)
    ));
    assert!(matches!(state.session.state, Quality::Unavailable));
    assert!((reliable(state.session.elapsed_s) - 112.6).abs() < 1e-9);
    assert!((reliable(state.session.remaining_s) - 3492.4).abs() < 1e-9);
    assert!(matches!(state.session.laps_remaining, Quality::Unavailable));

    // Parrilla: 44 coches distintos, posiciones 1..=44 sin huecos ni repetidos.
    assert_eq!(state.cars.len(), 44);
    let ids: HashSet<_> = state.cars.iter().map(|car| car.id).collect();
    assert_eq!(ids.len(), 44);
    assert_eq!(positions(&observation), (1..=44).collect::<Vec<_>>());
    let first = &state.cars[0];
    assert_eq!(reliable(first.position), 23);
    assert!(reliable(first.in_pits));
    assert_eq!(
        first.class.as_ref().map(|class| class.name.as_str()),
        Some("LMP2_ELMS")
    );
    assert!(matches!(first.best_lap_s, Quality::Unavailable));
    assert!(matches!(
        first.gap_leader,
        Quality::Reliable(vantare_domain::Gap::Time { seconds }) if (seconds - 82.575_340_27).abs() < 1e-6
    ));
    assert!(first.number.is_empty(), "sin REST no hay número de carrera");
    assert!(state.cars.iter().all(|car| car.pose.current().is_some()));

    // Jugador: el coche 44 del frame, con su telemetría (sidecar: 15,59 m/s, marcha 1, 3396 rpm).
    let player = state.player.expect("el fixture tiene jugador");
    assert_eq!(player.car, state.cars[43].id);
    assert_eq!(state.player_car().map(|car| car.id), Some(player.car));
    let telemetry = player.telemetry;
    assert_eq!(reliable(telemetry.gear), 1);
    assert!((reliable(telemetry.speed_mps) - 15.592_212_87).abs() < 1e-6);
    assert!(
        (reliable(telemetry.engine_speed_rad_s)
            - 3_395.991_911_935_684 * std::f64::consts::TAU / 60.0)
            .abs()
            < 1e-6
    );
    for pedal in [telemetry.throttle, telemetry.brake, telemetry.clutch] {
        assert!((0.0..=1.0).contains(&reliable(pedal)));
    }

    // Capacidades que declara el adaptador.
    let caps = state.capabilities;
    for fresh in [
        caps.session_clock,
        caps.positions,
        caps.lap_times,
        caps.gaps,
        caps.pit_status,
        caps.spatial,
        caps.driver_inputs,
        caps.powertrain,
    ] {
        assert_eq!(fresh, Capability::Fresh);
    }
    assert_eq!(
        caps.flags,
        Capability::Supported,
        "sin REST no hay evidencia de bandera"
    );
    assert!(matches!(state.flags, Quality::Unavailable));
}

#[test]
fn menu_fixtures_are_valid_frames_without_a_grid() {
    for (file, build) in [
        ("lmu-menu-fixture.bin", "1.3.0.0"),
        ("lmu-1.4-menu-fixture.bin", "1.4.0.0"),
        ("lmu-1.4.1.3-menu-fixture.bin", "1.4.1.3"),
        ("lmu-1.4.2.0-menu-fixture.bin", "1.4.2.0"),
    ] {
        let state = observe_fixture(file, build).state;
        assert!(state.cars.is_empty() && state.player.is_none(), "{file}");
        assert_eq!(
            state.capabilities.positions,
            Capability::Supported,
            "{file}"
        );
        assert_eq!(
            state.capabilities.driver_inputs,
            Capability::Supported,
            "{file}"
        );
        assert_eq!(state.capabilities.spatial, Capability::Supported, "{file}");
    }
}

#[test]
fn track_fixtures_of_every_supported_build_keep_a_consistent_grid() {
    for (file, build, cars) in [
        ("lmu-1.4-track-fixture.bin", "1.4.0.0", None),
        ("lmu-1.4.1.3-track-fixture.bin", "1.4.1.3", Some(18)),
        ("lmu-1.4.2.0-track-fixture.bin", "1.4.2.0", Some(43)),
    ] {
        let state = observe_fixture(file, build).state;
        assert!(state.player.is_some(), "{file}");
        assert_eq!(state.capabilities.positions, Capability::Fresh, "{file}");
        let count = state.cars.len();
        assert!(
            cars.map_or(count > 0, |expected| expected == count),
            "{file}: {count}"
        );
        let ids: HashSet<_> = state.cars.iter().map(|car| car.id).collect();
        assert_eq!(ids.len(), count, "{file}");
        let observation = Observation {
            state,
            ..Observation::default()
        };
        assert_eq!(
            positions(&observation),
            (1..=u32::try_from(count).unwrap()).collect::<Vec<_>>(),
            "{file}"
        );
    }
}

#[test]
fn an_unverified_build_is_rejected_not_read() {
    let path = testdata().join("lmu-1.4.2.0-track-fixture.bin");
    let frame = fs::read(&path).unwrap();
    let mut replay = Replay::new(
        "1.4.2.1",
        [ReplayEvent::Shm {
            at: Duration::ZERO,
            frame,
        }],
    );
    assert!(matches!(
        replay.poll(Duration::ZERO),
        Err(vantare_domain::AdapterError::Rejected(_))
    ));
    assert_eq!(replay.poll(Duration::ZERO), Ok(None));
}

// ---------------------------------------------------------------------------
// Corpus temporal: 60 s reales, 47 coches, 3600 lecturas SHM y 239 rondas REST.

/// Segundos de un instante RFC 3339 `AAAA-MM-DDThh:mm:ss.fffffffZ` (misma fecha
/// que la primera muestra; el corpus dura 60 s).
fn utc_ns(value: &str) -> i128 {
    let (date, time) = value.split_once('T').expect("fecha y hora");
    assert_eq!(date, "2026-09-29", "el corpus no debe cruzar de día");
    let time = time.strip_suffix('Z').expect("hora UTC");
    let (whole, fraction) = time.split_once('.').expect("fracción de segundo");
    let mut parts = whole.split(':').map(|part| part.parse::<i128>().unwrap());
    let seconds = parts.next().unwrap() * 3600 + parts.next().unwrap() * 60 + parts.next().unwrap();
    let padded = format!("{fraction:0<9}");
    seconds * 1_000_000_000 + padded[..9].parse::<i128>().unwrap()
}

/// Entradas de un `.tar` ustar en streaming: (nombre, contenido).
fn tar_entries(mut reader: impl Read) -> impl Iterator<Item = (String, Vec<u8>)> {
    std::iter::from_fn(move || {
        loop {
            let mut header = [0_u8; 512];
            reader.read_exact(&mut header).expect("cabecera tar");
            if header.iter().all(|byte| *byte == 0) {
                return None;
            }
            let field = |range: std::ops::Range<usize>| {
                let bytes = &header[range];
                let end = bytes
                    .iter()
                    .position(|byte| *byte == 0)
                    .unwrap_or(bytes.len());
                String::from_utf8(bytes[..end].to_vec()).unwrap()
            };
            let name = field(0..100);
            let size = usize::from_str_radix(field(124..136).trim(), 8).expect("tamaño tar");
            let kind = header[156];
            let mut content = vec![0_u8; size.div_ceil(512) * 512];
            reader.read_exact(&mut content).expect("contenido tar");
            content.truncate(size);
            match kind {
                b'0' | 0 => return Some((name, content)),
                b'5' => {}
                other => panic!("tipo de entrada tar inesperado {other:#x} en {name}"),
            }
        }
    })
}

struct Corpus {
    events: Box<dyn Iterator<Item = ReplayEvent> + Send>,
    /// Instante de cada evento y si es una ronda REST (`false`: lectura SHM).
    schedule: Vec<(Duration, bool)>,
    /// Números de carrera de cada ronda REST, para contrastar lo publicado.
    rest_numbers: Vec<Vec<String>>,
}

impl Corpus {
    fn open() -> Self {
        let path = testdata().join("rust-port/lmu47-high-rate-60s.tar.gz");
        let archive = fs::read(&path)
            .unwrap_or_else(|error| panic!("falta el corpus {}: {error}", path.display()));
        let digest = Sha256::digest(&archive);
        let hex = digest.iter().fold(String::new(), |mut hex, byte| {
            write!(hex, "{byte:02x}").unwrap();
            hex
        });
        assert_eq!(hex, CORPUS_SHA256, "el corpus no es el capturado");

        let mut entries = tar_entries(GzDecoder::new(std::io::Cursor::new(archive)));
        let mut manifest = None;
        let mut rests = Vec::new();
        let first_shm = loop {
            let (name, content) = entries.next().expect("el corpus no tiene lecturas SHM");
            let file = name.rsplit('/').next().unwrap().to_owned();
            if file == "manifest.json" {
                manifest = Some(serde_json::from_slice::<Value>(&content).unwrap());
            } else if file.starts_with("rest-") {
                rests.push((file, content));
            } else if file.starts_with("shm-") {
                break (file, content);
            }
        };
        let manifest = manifest.expect("manifest.json antes de las lecturas SHM");
        assert_eq!(manifest["schema"], "vantare.lmu-temporal-high-rate.v1");
        assert_eq!(manifest["build"], "1.4.2.0");
        assert_eq!(manifest["vehicles"], 47);
        let shm_ticks = usize::try_from(manifest["shmTicks"].as_u64().unwrap()).unwrap();
        let rest_reports = usize::try_from(manifest["restReports"].as_u64().unwrap()).unwrap();
        let manifest_events = manifest["events"].as_array().unwrap().clone();
        assert_eq!(manifest_events.len(), shm_ticks + rest_reports);
        assert_eq!((shm_ticks, rest_reports), (3600, 239));
        assert_eq!(rests.len(), rest_reports);

        let origin = utc_ns(manifest_events[0]["atUtc"].as_str().unwrap());
        // Un segundo de margen para que ningún instante de consulta sea negativo.
        let elapsed = move |value: &Value| {
            let ns = utc_ns(value.as_str().unwrap()) - origin + 1_000_000_000;
            Duration::from_nanos(u64::try_from(ns).expect("instante anterior al origen"))
        };
        let mut rest_numbers = Vec::new();
        let mut rest_bodies = Vec::new();
        for (file, content) in &rests {
            let body: Value = serde_json::from_slice(content).unwrap();
            assert_eq!(body["schema"], "vantare.lmu-rest-bodies.v1", "{file}");
            rest_numbers.push(
                body["standings"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|row| row["carNumber"].as_str().unwrap().to_owned())
                    .collect(),
            );
            rest_bodies.push((
                serde_json::to_vec(&body["standings"]).unwrap(),
                serde_json::to_vec(&body["sessionInfo"]).unwrap(),
            ));
        }

        let schedule = manifest_events
            .iter()
            .map(|event| (elapsed(&event["atUtc"]), event["kind"] == "rest"))
            .collect();
        let mut pending = Some(first_shm);
        let mut next_shm = 0_usize;
        let mut next_rest = 0_usize;
        let events = manifest_events.into_iter().map(move |event| {
            let at = elapsed(&event["atUtc"]);
            match event["kind"].as_str().unwrap() {
                "shm" => {
                    assert_eq!(event["index"], next_shm);
                    let (name, frame) = pending
                        .take()
                        .or_else(|| entries.next())
                        .expect("faltan lecturas SHM en el corpus");
                    assert_eq!(
                        name.rsplit('/').next().unwrap(),
                        format!("shm-{next_shm:05}.bin")
                    );
                    assert_eq!(event["vehicles"], 47);
                    next_shm += 1;
                    ReplayEvent::Shm { at, frame }
                }
                "rest" => {
                    assert_eq!(event["index"], next_rest);
                    let (standings, session) = rest_bodies[next_rest].clone();
                    next_rest += 1;
                    ReplayEvent::Rest {
                        at,
                        standings,
                        standings_started: elapsed(&event["standingsStartedUtc"]),
                        session,
                        session_started: elapsed(&event["sessionStartedUtc"]),
                    }
                }
                other => panic!("evento de corpus desconocido {other}"),
            }
        });
        Self {
            events: Box::new(events),
            schedule,
            rest_numbers,
        }
    }
}

#[test]
fn the_47_car_temporal_corpus_replays_with_stable_identity_and_exact_quality() {
    let corpus = Corpus::open();
    let mut replay = Replay::new("1.4.2.0", corpus.events);
    let mut first_ids = None;
    let mut previous_source = Duration::ZERO;
    let mut rest_index = None;
    let mut not_fresh = 0_usize;
    let mut unnumbered = 0_usize;
    let mut first_obs = Observation::default();
    let mut last_obs = Observation::default();
    for (index, &(now, is_rest)) in corpus.schedule.iter().enumerate() {
        let observation = replay
            .poll(now)
            .unwrap_or_else(|error| panic!("evento {index}: {error}"))
            .unwrap_or_else(|| panic!("evento {index}: sin observación"));
        rest_index = if is_rest {
            Some(rest_index.map_or(0, |k| k + 1))
        } else {
            rest_index
        };
        let state = &observation.state;
        assert_eq!(observation.origin.received_at, now);
        assert_eq!(observation.origin.source.kind, SourceKind::Replay);

        // Identidad: los mismos 47 coches, en el mismo orden, durante los 60 s.
        assert_eq!(state.cars.len(), 47, "evento {index}");
        let ids: Vec<_> = state.cars.iter().map(|car| car.id).collect();
        assert_eq!(
            &ids,
            first_ids.get_or_insert_with(|| ids.clone()),
            "evento {index}"
        );
        assert_eq!(state.session.id, SessionId(1), "evento {index}");
        assert_eq!(
            state
                .player_car()
                .map(|car| reliable_or_stale(car.position)),
            Some(47)
        );
        assert_eq!(
            positions(&observation),
            (1..=47).collect::<Vec<_>>(),
            "evento {index}"
        );

        // El reloj de sesión del simulador nunca retrocede.
        let source = observation.origin.source_time.expect("reloj de sesión");
        assert!(source >= previous_source, "evento {index}");
        previous_source = source;

        // Números de carrera: ninguno antes de la primera ronda REST; después,
        // los del REST más reciente para los 47 coches.
        let mut numbers: Vec<String> = state.cars.iter().map(|car| car.number.clone()).collect();
        match rest_index {
            None => assert!(numbers.iter().all(String::is_empty), "evento {index}"),
            Some(k) => {
                unnumbered += numbers.iter().filter(|number| number.is_empty()).count();
                numbers.retain(|number| !number.is_empty());
                numbers.sort();
                let mut expected = corpus.rest_numbers[k].clone();
                expected.sort();
                assert_eq!(numbers, expected, "evento {index}");
            }
        }
        not_fresh += usize::from(state.capabilities.positions != Capability::Fresh);
        if index == 0 {
            first_obs = observation.clone();
        }
        last_obs = observation.clone();
        // El REST del corpus trae `yellowFlagState: "invalid"`: sin evidencia de bandera.
        assert!(matches!(state.flags, Quality::Unavailable));
        assert_eq!(state.capabilities.flags, Capability::Supported);
    }
    assert_eq!((unnumbered, not_fresh), (0, 0));

    // Sesión (SHM 1.4.2.0): práctica en `Track-01`; el reloj de sesión avanza 60 s.
    // `mEndET` (21605) queda por detrás del reloj (27172): no hay tiempo restante.
    for (observation, elapsed) in [(&first_obs, 27172.2), (&last_obs, 27232.2)] {
        let session = &observation.state.session;
        assert!(matches!(&session.track_name, Quality::Reliable(name) if name == "Track-01"));
        assert!(matches!(
            session.kind,
            Quality::Reliable(SessionKind::Practice)
        ));
        assert!((reliable(session.elapsed_s) - elapsed).abs() < 1e-6);
        assert!(matches!(session.remaining_s, Quality::Unavailable));
        assert!(matches!(session.state, Quality::Unavailable));
    }
    // Los 47 coches estaban parados en boxes; el primero, con su clase y mejor vuelta reales.
    let car = &last_obs.state.cars[0];
    assert!(last_obs.state.cars.iter().all(|car| reliable(car.in_pits)));
    assert_eq!((reliable(car.position), reliable(car.laps)), (21, 79));
    assert!((reliable(car.best_lap_s) - 240.677_734_375).abs() < 1e-9);
    assert_eq!(
        car.class.as_ref().map(|class| class.name.as_str()),
        Some("Class-001")
    );
    let pose = reliable(car.pose);
    assert!((pose.x_m + 133.943_161).abs() < 1e-6 && (pose.y_m - 1_287.463_257).abs() < 1e-6);
    // Jugador (Vehicle-047): parado, freno a fondo, punto muerto.
    let telemetry = last_obs.state.player.expect("jugador").telemetry;
    assert_eq!(reliable(telemetry.gear), 0);
    assert!((reliable(telemetry.brake) - 1.0).abs() < f64::EPSILON);
    assert!(reliable(telemetry.throttle).abs() < f64::EPSILON);
    assert!(reliable(telemetry.speed_mps) < 0.05);
    assert_eq!(rest_index, Some(238));
    assert_eq!(
        replay.poll(Duration::from_hours(1)),
        Ok(None),
        "corpus agotado"
    );
}

fn reliable_or_stale<T: Copy>(quality: Quality<T>) -> T {
    match quality {
        Quality::Reliable(value) | Quality::Stale(value) | Quality::Estimated(value) => value,
        Quality::Unavailable => panic!("valor no disponible"),
    }
}

/// El mismo corpus dos veces da las mismas observaciones: el reloj es el grabado.
#[test]
fn replaying_the_same_events_twice_gives_identical_observations() {
    let run = || {
        let corpus = Corpus::open();
        let schedule: Vec<_> = corpus.schedule.iter().copied().take(600).collect();
        let mut replay = Replay::new("1.4.2.0", corpus.events.take(schedule.len()));
        schedule
            .iter()
            .map(|&(now, _)| replay.poll(now).unwrap().unwrap())
            .collect::<Vec<_>>()
    };
    let (first, second) = (run(), run());
    assert_eq!(first.len(), 600);
    assert!(first == second);
}
