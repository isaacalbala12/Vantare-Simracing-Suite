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
    let mut cars = HashMap::new();
    while r.limit() > 0 {
        let mut h = [0; 12];
        r.read_exact(&mut h).expect("registro UDP");
        let size = u32::from_le_bytes(h[..4].try_into().expect("len"));
        let mut b = vec![0; usize::try_from(size).expect("longitud acotada")];
        r.read_exact(&mut b).expect("datagrama");
        if b[0] == 3 {
            let index = u16::from_le_bytes([b[1], b[2]]);
            cars.insert(CarId(u32::from(index)), b);
        }
    }
    cars
}

#[test]
fn real_corpus_conformance_and_neutral_projections() {
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
                assert_eq!(vm.rows.len(), 32);
                assert_eq!(vm.rows.iter().filter(|r| r.is_player).count(), 1);
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
            }
            last = Some(o);
        }
    }
    assert!(count > 180_000, "corpus completo, {count} observaciones");
    assert!(
        projected > 50 && radar_seen,
        "proyecciones con parrilla identificada y rivales cercanos"
    );
    assert_eq!(max_cars, 32);
    assert_eq!(names.len(), 32);
    assert_eq!(replay.poll(Duration::from_secs(121)).expect("EOF"), None);
    check_final(&last.expect("observaciones"));
    eprintln!(
        "ACC real: {count} observaciones, {max_cars} coches, {} identidades, {projected} muestras neutrales, radar cercano={radar_seen}",
        names.len()
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
    let mut due = Duration::ZERO;
    for _ in 0..2000 {
        let a: Option<Observation> = fast.poll(Duration::from_secs(121)).expect("fast");
        // Primeras physics/graphics preceden a static: no observación hasta versión.
        if let Some(o) = &a {
            due = o.origin.received_at;
        } else {
            due = due.max(Duration::from_millis(11));
        }
        let b = paced.poll(due).expect("paced");
        assert_eq!(a, b, "mismo evento y tiempo grabado con dos ritmos de poll");
    }
}

fn check_player(o: &Observation) {
    let player = o.state.player.expect("jugador por playerCarID");
    assert_eq!(player.car, CarId(0));
    assert_eq!(player.telemetry.throttle, Quality::Reliable(0.0));
    assert_eq!(player.telemetry.brake, Quality::Reliable(0.0));
    assert_eq!(player.telemetry.gear, Quality::Reliable(0));
    assert_eq!(player.fuel.level_l, Quality::Reliable(62.0));
    assert_eq!(player.fuel.capacity_l, Quality::Reliable(120.0));
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
}
