//! Goldens congelados en 0ad40522: DTO completos de capturas reales, sin reloj de pared.
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::time::Duration;

use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use vantare_domain::{Adapter, AdapterError, Observation};
use vantare_runtime::adapter::{open_acc_replay, open_replay};
use vantare_runtime::core::Core;

struct Once(Option<Observation>);
impl Adapter for Once {
    fn poll(&mut self, _: Duration) -> Result<Option<Observation>, AdapterError> {
        Ok(self.0.take())
    }
}

fn check(name: &str, bytes: &[u8]) {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("tests/golden/{name}.jsonl.gz"));
    let mut expected = GzDecoder::new(fs::File::open(path).expect("golden obligatorio"));
    let mut block = vec![0; 65_536];
    for (index, chunk) in bytes.chunks(block.len()).enumerate() {
        let block = &mut block[..chunk.len()];
        expected.read_exact(block).expect("golden completo");
        assert!(chunk == block, "DTO byte a byte: {name}, bloque {index}");
    }
    assert_eq!(expected.read(&mut block).expect("gzip íntegro"), 0);
}

// El único campo yaw_rad del DTO es PoseDto::yaw_rad. atan2 usa la libm del
// sistema: el corpus completo macOS arm64 difiere del golden Windows en 1 ULP.
// Conservamos todos los demás bytes, incluido orden, calidad y formato numérico.
fn same_lmu47_dto(actual: &str, expected: &str) -> bool {
    let mut actual = actual.split("\"yaw_rad\":");
    let mut expected = expected.split("\"yaw_rad\":");
    if actual.next() != expected.next() {
        return false;
    }
    loop {
        let (a, b) = match (actual.next(), expected.next()) {
            (None, None) => return true,
            (Some(a), Some(b)) => (a, b),
            _ => return false,
        };
        let number_and_rest = |part: &str| part.find([',', '}']);
        let (Some(a_end), Some(b_end)) = (number_and_rest(a), number_and_rest(b)) else {
            return false;
        };
        let (a_number, a_rest) = a.split_at(a_end);
        let (b_number, b_rest) = b.split_at(b_end);
        if a_rest != b_rest {
            return false;
        }
        if a_number == b_number {
            continue;
        }
        let (Ok(a), Ok(b)) = (a_number.parse::<f64>(), b_number.parse::<f64>()) else {
            return false;
        };
        if !a.is_finite() || !b.is_finite() || a.to_bits().abs_diff(b.to_bits()) > 1 {
            return false;
        }
    }
}

fn check_lmu47(bytes: &[u8]) {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/lmu47.jsonl.gz");
    let mut expected = BufReader::new(GzDecoder::new(
        fs::File::open(path).expect("golden obligatorio"),
    ));
    let mut line = String::new();
    for (index, actual) in std::str::from_utf8(bytes)
        .expect("DTO UTF-8")
        .split_inclusive('\n')
        .enumerate()
    {
        line.clear();
        assert!(expected.read_line(&mut line).expect("golden completo") > 0);
        assert!(
            same_lmu47_dto(actual, &line),
            "DTO LMU47: foto {}",
            index + 1
        );
    }
    assert_eq!(expected.read_line(&mut line).expect("gzip íntegro"), 0);
}

#[test]
fn lmu47_comparison_only_allows_one_ulp_in_yaw() {
    let dto = |yaw: &str| {
        format!(r#"{{"pose":{{"reliable":{{"x_m":1.0,"yaw_rad":{yaw}}}}},"quality":"fresh"}}"#)
    };
    let expected = dto("3.0903319694322935");
    assert!(same_lmu47_dto(&expected, &expected));
    assert!(same_lmu47_dto(&dto("3.090331969432293"), &expected));
    assert!(same_lmu47_dto(
        &dto("-3.090331969432293"),
        &dto("-3.0903319694322935")
    ));
    for changed in [
        dto("3.0903319694322926"), // Dos ULP.
        dto("NaN"),
        dto("inf"),
        expected.replace("1.0", "1.0000000000000002"),
        expected.replace("1.0", "1"),
        expected.replace("fresh", "stale"),
        expected.replace("yaw_rad", "heading"),
        format!("{expected}\n"),
        format!("{expected}{expected}"),
    ] {
        assert!(!same_lmu47_dto(&changed, &expected), "{changed}");
    }
    assert!(!same_lmu47_dto(&dto("0.0"), &dto("-0.0")));
}

fn append(core: &mut Core, observation: Observation, output: &mut Vec<u8>) {
    let now = observation.origin.received_at;
    core.step(&mut Once(Some(observation)), now)
        .expect("foto válida");
    output.extend_from_slice(
        vantare_ipc::snapshot_to_json(&core.snapshot())
            .expect("DTO")
            .as_bytes(),
    );
    output.push(b'\n');
}

#[test]
fn lmu_real_fixtures_match_frozen_dtos() {
    let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata");
    let mut output = Vec::new();
    for (name, build) in [
        ("lmu-fixture.bin", "1.3.0.0"),
        ("lmu-menu-fixture.bin", "1.3.0.0"),
        ("lmu-1.4-menu-fixture.bin", "1.4.0.0"),
        ("lmu-1.4.1.3-menu-fixture.bin", "1.4.1.3"),
        ("lmu-1.4.2.0-menu-fixture.bin", "1.4.2.0"),
    ] {
        let mut replay = open_replay(&data.join(name), Some(build)).expect("fixture real");
        let mut core = Core::new(1463);
        append(
            &mut core,
            replay
                .poll(Duration::ZERO)
                .expect("admisión")
                .expect("observación"),
            &mut output,
        );
        if name == "lmu-menu-fixture.bin" {
            assert_eq!(
                vantare_ipc::snapshot_to_json(&core.snapshot())
                    .expect("DTO menú")
                    .as_bytes(),
                include_bytes!("../../ui/fixtures/telemetry-real/lmu-menu.snapshot.json"),
                "escena de menú procedente de la captura real sin campos inventados"
            );
        }
        core.step(&mut Once(None), Duration::from_millis(500))
            .expect("caducidad");
        let dto = vantare_ipc::snapshot_to_json(&core.snapshot()).expect("DTO");
        if name == "lmu-fixture.bin" {
            assert_eq!(
                dto.as_bytes(),
                include_bytes!("../../ui/fixtures/telemetry-real/lmu-stale.snapshot.json"),
                "escena stale: captura real degradada por el núcleo a 500 ms"
            );
        }
        output.extend_from_slice(dto.as_bytes());
        output.push(b'\n');
    }
    check("lmu", &output);
}

#[test]
fn lmu_real_temporal_corpus_matches_frozen_dtos() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/rust-port/lmu47-high-rate-60s.tar.gz");
    let mut replay = open_replay(&path, None).expect("corpus real obligatorio");
    let mut core = Core::new(1463);
    let mut output = Vec::new();
    let mut count = 0;
    for _ in 0..3839 {
        if let Some(observation) = replay.poll(Duration::from_secs(61)).expect("corpus válido") {
            count += 1;
            append(&mut core, observation, &mut output);
            if count == 1 {
                assert_eq!(
                    &output[..output.len() - 1],
                    include_bytes!("../../ui/fixtures/telemetry-real/lmu47.snapshot.json"),
                    "la escena UI debe proceder del corpus real sin editar campos"
                );
            }
        }
    }
    assert_eq!(count, 3839, "corpus completo de 3600 SHM y 239 REST");
    assert!(
        replay
            .poll(Duration::from_secs(61))
            .expect("fin válido")
            .is_none()
    );
    check_lmu47(&output);
}

#[test]
fn acc_real_corpus_matches_frozen_dtos() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/acc/acc-sesion-udp-20260929.tar.gz");
    let mut replay = open_acc_replay(&path).expect("corpus real obligatorio");
    let mut core = Core::new(1463);
    let mut output = Vec::new();
    let mut count = 0;
    let mut hash = Sha256::new();
    for _ in 0..190_471 {
        if let Some(observation) = replay
            .poll(Duration::from_secs(121))
            .expect("corpus válido")
        {
            count += 1;
            let now = observation.origin.received_at;
            core.step(&mut Once(Some(observation)), now)
                .expect("foto válida");
            let dto = vantare_ipc::snapshot_to_json(&core.snapshot()).expect("DTO");
            if count == 190_308 {
                assert_eq!(
                    dto.as_bytes(),
                    include_bytes!("../../ui/fixtures/telemetry-real/acc.snapshot.json"),
                    "la escena UI debe proceder del corpus real sin editar campos"
                );
            }
            hash.update(dto.as_bytes());
            hash.update(b"\n");
            if [1, 1000, 30_000, 60_000, 90_000, 120_000, 150_000, 190_308].contains(&count) {
                output.extend_from_slice(dto.as_bytes());
                output.push(b'\n');
            }
        }
    }
    assert_eq!(count, 190_308, "no pasar con corpus vacío o parcial");
    assert_eq!(replay.discarded_frames(), 3);
    assert!(
        replay
            .poll(Duration::from_secs(121))
            .expect("fin válido")
            .is_none()
    );
    // Los ocho cortes permiten revisar valores; el hash protege los bytes de
    // las 190.308 fotos, sin guardar gigabytes de JSON casi idéntico.
    assert_eq!(
        format!("{:x}", hash.finalize()),
        include_str!("golden/acc-all.sha256").trim(),
        "todos los DTO de ACC, sin saltar fotos"
    );
    check("acc", &output);
}

#[test]
fn input_sequence_matches_real_lmu47_replay_with_observed_clock() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/rust-port/lmu47-high-rate-60s.tar.gz");
    let mut replay = open_replay(&path, None).expect("corpus obligatorio");
    let mut core = Core::new(1463);
    let mut rows = Vec::new();
    for ms in (0..=61_000).step_by(20) {
        let now = Duration::from_millis(ms);
        while let Some(observation) = replay.poll(now).expect("replay valido") {
            core.step(&mut Once(Some(observation)), now)
                .expect("foto valida");
            rows.push(vantare_ipc::snapshot_to_json(&core.snapshot()).expect("DTO"));
            if rows.len() == 12 {
                let actual = format!("[\n{}\n]\n", rows.join(",\n"));
                assert_eq!(
                    actual.as_bytes(),
                    include_bytes!("../../ui/fixtures/telemetry-real/lmu47-input.sequence.json")
                );
                return;
            }
        }
    }
    panic!("el corpus debe aportar doce observaciones");
}
