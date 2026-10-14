//! Oráculo fijado al corpus REAL. Ninguna captura ausente se omite.
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::Duration;

use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use vantare_domain::{
    Adapter, Capability, CarId, Flag, FlagKind, FlagScope, Observation, Quality, SessionId,
    SessionKind, SourceKind,
};
use vantare_domain::{format::Preferences, pedals, radar, standings};
use vantare_runtime::adapter::open_acc_replay;
use vantare_runtime::core::Core;

const HASH: &str = "422481dc88b1e7f9cb9ebaf025cc615d08453bea8fded36ca881b996ba386071";

fn path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata/acc/acc-sesion-udp-20260929.tar.gz")
}

fn number(b: &[u8], offset: usize) -> f64 {
    f64::from(f32::from_le_bytes(
        b[offset..offset + 4].try_into().expect("float del corpus"),
    ))
}

// Lector independiente del test para contrastar los últimos mensajes crudos.
fn member(name: &str) -> io::Take<GzDecoder<File>> {
    let mut archive = GzDecoder::new(File::open(path()).expect("corpus obligatorio"));
    loop {
        let mut h = [0; 512];
        archive.read_exact(&mut h).expect("cabecera tar");
        assert!(h.iter().any(|b| *b != 0), "falta {name}");
        let n = std::str::from_utf8(&h[..100])
            .expect("nombre")
            .trim_end_matches('\0');
        let size = u64::from_str_radix(
            std::str::from_utf8(&h[124..136])
                .expect("size")
                .trim_matches(['\0', ' ']),
            8,
        )
        .expect("octal");
        if n == name {
            return archive.take(size);
        }
        io::copy(
            &mut (&mut archive).take(size.next_multiple_of(512)),
            &mut io::sink(),
        )
        .expect("saltar miembro");
    }
}

fn last_udp_cars() -> HashMap<CarId, Vec<u8>> {
    let mut r = member("udp.bin");
    let mut cars: HashMap<CarId, Vec<u8>> = HashMap::new();
    let mut heading_error = 0.0;
    let mut heading_samples = 0_u32;
    while r.limit() > 0 {
        let mut h = [0; 12];
        r.read_exact(&mut h).expect("registro UDP");
        let size = u32::from_le_bytes(h[..4].try_into().expect("len"));
        let mut b = vec![0; usize::try_from(size).expect("longitud acotada")];
        r.read_exact(&mut b).expect("datagrama");
        if b[0] == 3 {
            let index = u16::from_le_bytes([b[1], b[2]]);
            let id = CarId(u32::from(index));
            if let Some(old) = cars.get(&id) {
                let dx = number(&b, 7) - number(old, 7);
                let dy = number(&b, 11) - number(old, 11);
                let speed = u16::from_le_bytes([b[20], b[21]]);
                if speed > 60 && dx.hypot(dy) > 0.2 {
                    let error = dy.atan2(dx) - number(&b, 15) - std::f64::consts::FRAC_PI_2;
                    heading_error += error.sin().atan2(error.cos()).abs();
                    heading_samples += 1;
                }
            }
            cars.insert(id, b);
        }
    }
    assert!(heading_samples > 10_000, "orientación con movimiento real");
    let mean = heading_error / f64::from(heading_samples);
    assert!(
        mean < 0.03,
        "yaw debe seguir el movimiento: error {mean} rad"
    );
    eprintln!("Yaw ACC: {heading_samples} muestras en movimiento, error medio {mean:.6} rad");
    cars
}

#[test]
fn real_corpus_conformance_and_neutral_projections() {
    verify_frozen_package();

    let mut replay = open_acc_replay(&path()).expect("hashes internos y formato");
    let mut last = None;
    let mut names = HashMap::new();
    let mut count = 0_u32;
    let mut projected = 0_u32;
    let mut radar_seen = false;
    let mut max_cars = 0;
    let mut previous_at = Duration::ZERO;
    // poll no avanza la muestra al tiempo del llamador: conserva el grabado.
    for _ in 0..190_471 {
        if let Some(o) = replay
            .poll(Duration::from_secs(121))
            .expect("ningún evento corrupto")
        {
            count += 1;
            assert!(o.origin.received_at >= previous_at);
            previous_at = o.origin.received_at;
            assert_eq!(o.origin.source.simulator, "acc");
            assert_eq!(o.origin.source.kind, SourceKind::Replay);
            assert_eq!(o.origin.source_time, None);
            assert_eq!(o.state.session.id, SessionId(1));
            let ids: HashSet<_> = o.state.cars.iter().map(|c| c.id).collect();
            assert_eq!(ids.len(), o.state.cars.len());
            max_cars = max_cars.max(o.state.cars.len());
            for c in &o.state.cars {
                assert!(c.id.0 < 32);
                if let Some(&p) = c.position.current() {
                    assert!((1..=32).contains(&p));
                }
                if !c.driver.name.is_empty() && !c.number.is_empty() {
                    let identity = (
                        c.driver.id,
                        c.driver.name.clone(),
                        c.number.clone(),
                        c.class.clone(),
                    );
                    if let Some(old) = names.insert(c.id, identity.clone()) {
                        assert_eq!(old, identity, "identidad estable");
                    }
                }
            }
            check_player(&o);
            if count.is_multiple_of(1000) && names.len() == 32 {
                projected += 1;
                let mut core = Core::new(42);
                core.observe(o.clone()).expect("núcleo neutral acepta ACC");
                let snapshot = core.snapshot();
                let vm = standings::project(&snapshot, Preferences::default());
                assert_eq!(vm.rows().len(), 32);
                assert_eq!(vm.rows().iter().filter(|r| r.is_player).count(), 1);
                assert_eq!(vm.flag, Some(FlagKind::Green));
                let pedals = pedals::project(&snapshot, Preferences::default());
                assert_eq!(pedals.throttle, Some(0.0));
                assert_eq!(pedals.gear, "N");
                assert_eq!(pedals.rpm, "1982");
                let radar = radar::project(&snapshot);
                assert_eq!(radar.capability, Capability::Fresh);
                radar_seen |= !radar.cars.is_empty();
                // Cambiar SOLO la etiqueta de diagnóstico no altera ningún VM.
                let mut relabelled = (*snapshot).clone();
                relabelled.origin.source.simulator = "lmu";
                assert_eq!(vm, standings::project(&relabelled, Preferences::default()));
                assert_eq!(pedals, pedals::project(&relabelled, Preferences::default()));
                assert_eq!(radar, radar::project(&relabelled));
                check_extended_neutral_projections(&snapshot, &relabelled);
            }
            last = Some(o);
        }
    }
    assert_eq!(
        count, 190_308,
        "corpus completo con muestras rasgadas descartadas"
    );
    assert!(
        projected > 50 && radar_seen,
        "proyecciones con parrilla identificada y rivales cercanos"
    );
    assert_eq!(max_cars, 32);
    assert_eq!(names.len(), 32);
    assert_eq!(replay.poll(Duration::from_secs(121)).expect("EOF"), None);
    assert_eq!(
        replay.discarded_frames(),
        3,
        "tres physics rasgados en el corpus intacto"
    );
    check_final(&last.expect("observaciones"));
    eprintln!(
        "ACC real: {count} observaciones, {max_cars} coches, {} identidades, {projected} muestras neutrales, radar cercano={radar_seen}",
        names.len()
    );
}

fn check_extended_neutral_projections(a: &vantare_domain::Snapshot, b: &vantare_domain::Snapshot) {
    macro_rules! neutral {
        ($($module:ident),+) => { $(assert_eq!(
            vantare_domain::$module::project(a, Preferences::default()),
            vantare_domain::$module::project(b, Preferences::default())
        );)+ };
    }
    neutral!(
        racing_flags,
        fuel_strategy,
        track_weather,
        input_telemetry,
        broadcast_tower
    );
}

#[test]
fn replay_clock_is_deterministic_and_no_event_arrives_early() {
    let mut fast = open_acc_replay(&path()).expect("corpus");
    let mut paced = open_acc_replay(&path()).expect("corpus");
    assert_eq!(
        paced.poll(Duration::ZERO).expect("antes del primer evento"),
        None
    );
    let mut previous = Duration::ZERO;
    for due in captured_times().into_iter().take(80_000) {
        if due > previous {
            assert_eq!(
                paced
                    .poll(due.saturating_sub(Duration::from_nanos(1)))
                    .expect("aún no llega"),
                None
            );
        }
        let a: Option<Observation> = fast.poll(Duration::from_secs(121)).expect("fast");
        let b = paced.poll(due).expect("paced");
        if let Some(o) = &b {
            assert_eq!(o.origin.received_at, due);
        }
        assert_eq!(a, b, "mismo evento y tiempo grabado con dos ritmos de poll");
        previous = due;
    }
}

/// Solo en el oráculo: instantes de cabecera, sin cargar blobs ni datagramas.
fn captured_times() -> Vec<Duration> {
    let mut times = Vec::new();
    for (name, shm) in [("shm.bin", true), ("udp.bin", false)] {
        let mut r = member(name);
        while r.limit() > 0 {
            let (at, size) = if shm {
                let mut h = [0; 13];
                r.read_exact(&mut h).expect("header SHM");
                let at = u64::from_le_bytes(h[5..13].try_into().expect("timestamp"));
                (at, [800, 1588, 820][usize::from(h[0])])
            } else {
                let mut h = [0; 12];
                r.read_exact(&mut h).expect("header UDP");
                (
                    u64::from_le_bytes(h[4..12].try_into().expect("timestamp")),
                    u32::from_le_bytes(h[..4].try_into().expect("size")),
                )
            };
            let n =
                io::copy(&mut (&mut r).take(u64::from(size)), &mut io::sink()).expect("contenido");
            assert_eq!(n, u64::from(size));
            times.push(Duration::from_nanos(at));
        }
    }
    // Orden estable; SHM se añadió primero y gana empates, como el contrato.
    times.sort();
    assert_eq!(times.len(), 190_470);
    times
}

fn check_player(o: &Observation) {
    let player = o.state.player.expect("jugador por playerCarID");
    assert_eq!(player.car, CarId(0));
    assert_eq!(player.telemetry.throttle, Quality::Reliable(0.0));
    assert_eq!(player.telemetry.brake, Quality::Reliable(0.0));
    assert_eq!(player.telemetry.gear, Quality::Reliable(0));
    assert_eq!(player.fuel.level_l, Quality::Unavailable);
    assert_eq!(player.fuel.capacity_l, Quality::Unavailable);
    assert!(
        (player.telemetry.engine_speed_rad_s.current().expect("rpm")
            - 1982.0 * std::f64::consts::TAU / 60.0)
            .abs()
            < 1e-9
    );
    assert!(player.telemetry.speed_mps.current().expect("speed") < &0.001);
    assert_eq!(
        o.state.flags,
        Quality::Reliable(vec![Flag {
            kind: FlagKind::Green,
            scope: FlagScope::Session
        }])
    );
}

// Estas igualdades comparan los mismos floats del cable, sin cálculo intermedio.
#[allow(clippy::float_cmp)]
fn check_final(o: &Observation) {
    let g = last_graphics();
    let positive = |value: f64| (value.is_finite() && value > 0.0).then_some(value);
    let fuel = o.state.player.expect("jugador real").fuel;
    assert_eq!(
        fuel.per_lap_l,
        positive(number(&g, 1284)).map_or(Quality::Unavailable, Quality::Reliable)
    );
    assert_eq!(
        fuel.laps_left,
        positive(number(&g, 1412)).map_or(Quality::Unavailable, Quality::Estimated)
    );
    assert_eq!(
        o.state.session.kind,
        Quality::Reliable(SessionKind::Practice)
    );
    assert_eq!(
        o.state.session.track_name.current().map(String::as_str),
        Some("monza")
    );
    assert_eq!(o.state.session.track_length_m, Quality::Reliable(5793.0));
    assert!(
        o.state
            .session
            .remaining_s
            .current()
            .expect("segundos restantes")
            < &2200.0
    );
    let mut positions: Vec<_> = o
        .state
        .cars
        .iter()
        .map(|c| *c.position.current().expect("posición fresca"))
        .collect();
    positions.sort_unstable();
    assert_eq!(positions, (1..=32).collect::<Vec<_>>());
    let mut cups: HashMap<_, Vec<u32>> = HashMap::new();
    for c in &o.state.cars {
        cups.entry(c.class.as_ref().expect("cupCategory real").id)
            .or_default()
            .push(*c.class_position.current().expect("cupPosition real"));
    }
    for positions in cups.values_mut() {
        positions.sort_unstable();
        assert_eq!(
            *positions,
            (1..=u32::try_from(positions.len()).expect("clase acotada")).collect::<Vec<_>>()
        );
    }
    let ricci = o
        .state
        .cars
        .iter()
        .find(|c| c.id == CarId(15))
        .expect("carIndex15");
    assert_eq!(
        (&ricci.number, ricci.driver.name.as_str()),
        (&"61".to_owned(), "Benjamin Ricci")
    );
    assert_eq!(ricci.class.as_ref().expect("cupCategory").name, "ProAm");
    assert_eq!(ricci.class_position, Quality::Reliable(1));
    let raw = last_udp_cars();
    for c in o.state.cars.iter().filter(|c| c.id != CarId(0)) {
        let b = &raw[&c.id];
        assert_eq!(
            c.position,
            Quality::Reliable(u32::from(u16::from_le_bytes([b[22], b[23]])))
        );
        assert_eq!(
            c.class_position,
            Quality::Reliable(u32::from(u16::from_le_bytes([b[24], b[25]])))
        );
        let p = c.pose.current().expect("pose UDP");
        assert_eq!(p.x_m, number(b, 7));
        assert_eq!(p.y_m, number(b, 11));
        assert!((p.yaw_rad - number(b, 15) - std::f64::consts::FRAC_PI_2).abs() < 1e-12);
        assert_eq!(c.lap_distance_m, Quality::Estimated(number(b, 28) * 5793.0));
    }
    let mut core = Core::new(42);
    core.observe(o.clone()).expect("núcleo común");
    let snapshot = core.snapshot();
    let json = vantare_ipc::snapshot_to_json(&snapshot).expect("DTO común");
    let decoded = vantare_ipc::snapshot_from_json(&json).expect("ACC reconocido en el cable");
    assert_eq!(decoded.origin.source.simulator, "acc");
    assert_eq!(
        standings::project(&decoded, Preferences::default()),
        standings::project(&snapshot, Preferences::default())
    );
    assert_eq!(
        pedals::project(&decoded, Preferences::default()),
        pedals::project(&snapshot, Preferences::default())
    );
}

fn last_graphics() -> Vec<u8> {
    let mut r = member("shm.bin");
    let mut last = None;
    while r.limit() > 0 {
        let mut h = [0; 13];
        r.read_exact(&mut h).expect("cabecera SHM real");
        let size = [800, 1588, 820][usize::from(h[0])];
        let mut b = vec![0; size];
        r.read_exact(&mut b).expect("página real");
        if h[0] == 1 {
            last = Some(b);
        }
    }
    last.expect("graphics obligatoria en corpus")
}

fn verify_frozen_package() {
    let mut file = File::open(path()).expect("corpus real obligatorio");
    let mut hash = Sha256::new();
    let mut buf = vec![0; 64 * 1024];
    loop {
        let n = file.read(&mut buf).expect("leer paquete");
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    assert_eq!(
        format!("{:x}", hash.finalize()),
        HASH,
        "hash congelado del oráculo"
    );
}
