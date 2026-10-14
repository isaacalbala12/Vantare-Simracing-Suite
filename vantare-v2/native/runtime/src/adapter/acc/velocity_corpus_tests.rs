//! Corpus real obligatorio; oráculo escalar independiente del vector estimado.
use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;
use std::time::Duration;

use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use vantare_domain::{CarId, Quality, SourceKind};

use super::{protocol, translate::Translator};

fn udp_records() -> io::Take<GzDecoder<File>> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/acc/acc-sesion-udp-20260929.tar.gz");
    let mut file = File::open(&path).expect("corpus ACC obligatorio");
    let mut digest = Sha256::new();
    let mut buf = vec![0; 65536];
    loop {
        let n = file.read(&mut buf).expect("hash");
        if n == 0 {
            break;
        }
        digest.update(&buf[..n]);
    }
    assert_eq!(
        format!("{:x}", digest.finalize()),
        "422481dc88b1e7f9cb9ebaf025cc615d08453bea8fded36ca881b996ba386071"
    );
    let mut archive = GzDecoder::new(File::open(path).expect("corpus"));
    let size = loop {
        let mut h = [0; 512];
        archive.read_exact(&mut h).expect("tar header");
        assert!(h.iter().any(|b| *b != 0), "udp.bin obligatorio");
        let size = u64::from_str_radix(
            std::str::from_utf8(&h[124..136])
                .expect("size")
                .trim_matches(['\0', ' ']),
            8,
        )
        .expect("octal");
        if h[..8] == *b"udp.bin\0" {
            break size;
        }
        io::copy(
            &mut (&mut archive).take(size.next_multiple_of(512)),
            &mut io::sink(),
        )
        .expect("saltar");
    };
    archive.take(size)
}

#[test]
fn real_acc_motion_is_estimated_with_bounded_scalar_error() {
    let mut records = udp_records();
    let mut translator = Translator::new(SourceKind::Replay);
    // Solo UDP: el test de conformidad existente cubre la fusión SHM real.
    let mut static_page = vec![0; 820];
    for (at, text) in [(0, "1.9"), (30, "1.7")] {
        for (i, unit) in text.encode_utf16().enumerate() {
            static_page[at + i * 2..at + i * 2 + 2].copy_from_slice(&unit.to_le_bytes());
        }
    }
    translator
        .shm(2, static_page, Duration::ZERO)
        .expect("versión admitida");
    let mut previous = HashMap::new();
    let mut errors = Vec::new();
    let mut ids = std::collections::HashSet::new();
    let mut datagrams = 0;
    while records.limit() > 0 {
        let mut header = [0; 12];
        records.read_exact(&mut header).expect("registro");
        let size = u32::from_le_bytes(header[..4].try_into().expect("size"));
        assert!((1..=65507).contains(&size));
        let at = Duration::from_nanos(u64::from_le_bytes(header[4..].try_into().expect("at")));
        let mut bytes = vec![0; usize::try_from(size).expect("size")];
        records.read_exact(&mut bytes).expect("datagrama");
        datagrams += 1;
        translator.udp(&bytes, at).expect("protocolo real");
        let protocol::Message::Car(c) = protocol::parse(&bytes).expect("parse") else {
            continue;
        };
        let signature = (c.current.time, c.x, c.y, c.laps, c.driver);
        if previous.insert(c.index, signature) == Some(signature) {
            continue;
        }
        let observation = translator.observe(at).expect("static y datos UDP");
        let Some(car) = observation
            .state
            .cars
            .iter()
            .find(|car| car.id == CarId(u32::from(c.index)))
        else {
            continue;
        };
        if let Quality::Estimated([vx, vy]) = car.velocity_mps {
            assert_eq!(car.in_pits, Quality::Reliable(false));
            assert!(vx.is_finite() && vy.is_finite() && vx.hypot(vy) <= 110.0);
            // SDK Kmh @20: contraste, nunca usado para fabricar el vector.
            let scalar = f64::from(u16::from_le_bytes([bytes[20], bytes[21]])) / 3.6;
            if scalar > 10.0 {
                errors.push((vx.hypot(vy) - scalar).abs());
                ids.insert(car.id);
            }
        }
    }
    assert_eq!(datagrams, 134_901);
    assert!(
        errors.len() > 10000 && ids.len() >= 20,
        "movimiento real no vacío"
    );
    errors.sort_by(f64::total_cmp);
    let mean = errors.iter().sum::<f64>() / f64::from(u32::try_from(errors.len()).expect("count"));
    let p99 = errors[errors.len() * 99 / 100];
    assert!(mean < 2.0 && p99 < 6.0, "error medio {mean}, p99 {p99}");
    eprintln!(
        "ACC: {} vectores estimados en {} coches; error escalar medio {mean:.6} m/s, p99 {p99:.6} m/s",
        errors.len(),
        ids.len()
    );
}
