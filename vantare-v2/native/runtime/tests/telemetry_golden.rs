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

// #1562: v10 adds situation metadata. Preserve all v9 telemetry bytes and
// hashes without rewriting the frozen oracle. Situation has independent tests.
fn legacy_fixture(text: &str) -> String {
    text.replace("\"version\":10", "\"version\":9")
}
fn legacy_dto(snapshot: &vantare_domain::Snapshot) -> String {
    let dto = vantare_ipc::snapshot_to_json(snapshot).expect("DTO v10");
    let start = dto.find(",\"driving_situation\":").expect("situation v10");
    let end = start + 1 + dto[start + 1..].find(',').expect("metadata siguiente");
    let mut old = dto;
    old.replace_range(start..end, "");
    legacy_fixture(&old)
}

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

/// El golden prueba el emisor; esto prueba el lector: cada DTO real congelado
/// vuelve a los mismos bytes tras `Dto → Snapshot → Dto` (#1537).
#[test]
fn every_golden_dto_survives_the_reader_byte_for_byte() {
    for (name, photos) in [("lmu", 10), ("lmu47", 3839), ("acc", 8)] {
        let path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("tests/golden/{name}.jsonl.gz"));
        let golden = BufReader::new(GzDecoder::new(
            fs::File::open(path).expect("golden obligatorio"),
        ));
        let mut count = 0;
        for line in golden.lines() {
            let line = line.expect("gzip íntegro");
            count += 1;
            let snapshot = vantare_ipc::snapshot_from_saved_json(&line).expect("DTO vigente");
            let again = legacy_dto(&snapshot);
            assert!(again == line, "{name}: foto {count} cambia al releerla");
        }
        assert_eq!(count, photos, "{name}: corpus completo");
    }
}

fn append(core: &mut Core, observation: Observation, output: &mut Vec<u8>) {
    let now = observation.origin.received_at;
    core.step(&mut Once(Some(observation)), now)
        .expect("foto válida");
    output.extend_from_slice(legacy_dto(&core.snapshot()).as_bytes());
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
                legacy_fixture(include_str!(
                    "../../ui/fixtures/telemetry-real/lmu-menu.snapshot.json"
                ))
                .as_bytes(),
                "escena de menú procedente de la captura real sin campos inventados"
            );
        }
        core.step(&mut Once(None), Duration::from_millis(500))
            .expect("caducidad");
        let dto = legacy_dto(&core.snapshot());
        if name == "lmu-fixture.bin" {
            assert_eq!(
                dto.as_bytes(),
                legacy_fixture(include_str!(
                    "../../ui/fixtures/telemetry-real/lmu-stale.snapshot.json"
                ))
                .as_bytes(),
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
                    legacy_fixture(include_str!(
                        "../../ui/fixtures/telemetry-real/lmu47.snapshot.json"
                    ))
                    .as_bytes(),
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

fn acc_original_positions() -> std::collections::BTreeMap<usize, String> {
    BufReader::new(GzDecoder::new(
        fs::File::open(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/golden/acc-positions-before.jsonl.gz"),
        )
        .expect("fotos originales del bug"),
    ))
    .lines()
    .map(|line| {
        let value: serde_json::Value =
            serde_json::from_str(&line.expect("gzip íntegro")).expect("registro");
        (
            usize::try_from(value["photo"].as_u64().expect("foto")).expect("índice"),
            value["dto"].as_str().expect("DTO").to_owned(),
        )
    })
    .collect()
}

fn check_acc_corrected_positions(
    snapshot: &vantare_domain::Snapshot,
    previous: &vantare_domain::Snapshot,
    before: &str,
    count: usize,
) {
    let baseline = vantare_ipc::snapshot_from_saved_json(before).expect("DTO original");
    let mut restored = snapshot.clone();
    for ((car, old), previous) in restored
        .state
        .cars
        .iter_mut()
        .zip(&baseline.state.cars)
        .zip(&previous.state.cars)
    {
        assert_eq!((car.id, old.id), (previous.id, previous.id));
        assert_eq!(
            car.position.current(),
            previous.position.current(),
            "orden general estable"
        );
        assert_eq!(
            car.class_position.current(),
            previous.class_position.current(),
            "orden de clase estable"
        );
        if old.position.current() != previous.position.current() {
            assert!(
                matches!(car.position, vantare_domain::Quality::Estimated(_)),
                "rango contradictorio estimado"
            );
        }
        if old.class_position.current() != previous.class_position.current() {
            assert!(
                matches!(car.class_position, vantare_domain::Quality::Estimated(_)),
                "rango de clase contradictorio estimado"
            );
        }
        car.position = old.position;
        car.class_position = old.class_position;
    }
    assert_eq!(
        legacy_dto(&restored),
        before,
        "foto {count}: solo pueden cambiar los rangos"
    );
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
    // Las 27 fotos incoherentes de ec743de8 quedan congeladas como evidencia
    // del bug. Invertir exclusivamente sus rangos debe reproducir ambos hashes
    // originales: ningún otro campo/foto puede cambiar al corregir #1552.
    let mut corrections = acc_original_positions();
    assert_eq!(corrections.len(), 27);
    let mut original_hash = Sha256::new();
    let mut previous_version_hash = Sha256::new();
    let mut previous_coherent = None;
    for _ in 0..190_471 {
        if let Some(observation) = replay
            .poll(Duration::from_secs(121))
            .expect("corpus válido")
        {
            count += 1;
            let now = observation.origin.received_at;
            core.step(&mut Once(Some(observation)), now)
                .expect("foto válida");
            let dto = legacy_dto(&core.snapshot());
            if count == 190_308 {
                assert_eq!(
                    dto.as_bytes(),
                    legacy_fixture(include_str!(
                        "../../ui/fixtures/telemetry-real/acc.snapshot.json"
                    ))
                    .as_bytes(),
                    "la escena UI debe proceder del corpus real sin editar campos"
                );
            }
            let original = if let Some(before) = corrections.remove(&count) {
                check_acc_corrected_positions(
                    &core.snapshot(),
                    previous_coherent
                        .as_ref()
                        .expect("tabla coherente anterior"),
                    &before,
                    count,
                );
                before
            } else {
                previous_coherent = Some(core.snapshot().as_ref().clone());
                dto.clone()
            };
            original_hash.update(original.as_bytes());
            original_hash.update(b"\n");
            let unchanged = original.strip_prefix(r#"{"version":9,"#).expect("DTO v9");
            previous_version_hash.update(br#"{"version":8,"#);
            previous_version_hash.update(unchanged.as_bytes());
            previous_version_hash.update(b"\n");
            hash.update(dto.as_bytes());
            hash.update(b"\n");
            if [1, 1000, 30_000, 60_000, 90_000, 120_000, 150_000, 190_308].contains(&count) {
                output.extend_from_slice(dto.as_bytes());
                output.push(b'\n');
            }
        }
    }
    assert_eq!(count, 190_308, "no pasar con corpus vacío o parcial");
    assert!(corrections.is_empty(), "no saltar ninguna foto del bug");
    assert_eq!(replay.discarded_frames(), 3);
    assert!(
        replay
            .poll(Duration::from_secs(121))
            .expect("fin válido")
            .is_none()
    );
    // Los ocho cortes permiten revisar valores; el hash protege los bytes de
    // las 190.308 fotos, sin guardar gigabytes de JSON casi idéntico.
    check("acc", &output);
    assert_eq!(
        format!("{:x}", original_hash.finalize()),
        include_str!("golden/acc-all-before-1552.sha256").trim(),
        "#1552 cambia exclusivamente los rangos de las 27 fotos incoherentes"
    );
    assert_eq!(
        format!("{:x}", hash.finalize()),
        include_str!("golden/acc-all.sha256").trim(),
        "todos los DTO de ACC, sin saltar fotos"
    );
    assert_eq!(
        format!("{:x}", previous_version_hash.finalize()),
        include_str!("golden/acc-all-v8.sha256").trim(),
        "migración v9: todos los bytes salvo la etiqueta conservan el golden v8"
    );
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
            rows.push(legacy_dto(&core.snapshot()));
            if rows.len() == 12 {
                let actual = format!("[\n{}\n]\n", rows.join(",\n"));
                assert_eq!(
                    actual.as_bytes(),
                    legacy_fixture(include_str!(
                        "../../ui/fixtures/telemetry-real/lmu47-input.sequence.json"
                    ))
                    .as_bytes()
                );
                return;
            }
        }
    }
    panic!("el corpus debe aportar doce observaciones");
}

/// Invariantes en cada foto publicada (#1537). Siempre: revisión creciente,
/// posiciones de clase que deriva el núcleo (`Estimated`) en el orden de la
/// general y gap al líder creciente en carrera. Con `native`, también las
/// posiciones que publica el simulador: únicas y, con la parrilla completa,
/// 1..N; con `gaps`, el gap creciente en cualquier sesión.
fn invariants(
    snapshot: &vantare_domain::Snapshot,
    last: &mut Option<(u64, u64)>,
    native: bool,
    gaps: bool,
) -> Vec<String> {
    use std::collections::{BTreeMap, BTreeSet};
    let mut broken = Vec::new();
    let revision = (snapshot.epoch, snapshot.sequence);
    if last.is_some_and(|last| revision <= last) {
        broken.push(format!("revisión: {revision:?} tras {last:?}"));
    }
    *last = Some(revision);
    let cars = &snapshot.state.cars;
    let positions: Vec<u32> = cars
        .iter()
        .filter_map(|c| c.position.current().copied())
        .collect();
    let unique: BTreeSet<u32> = positions.iter().copied().collect();
    if native && unique.len() != positions.len() {
        broken.push(format!("duplicadas: posiciones {positions:?}"));
    }
    // Parrilla completa: tantas posiciones como coches y la última es N.
    let n = u32::try_from(cars.len()).expect("parrilla acotada");
    let complete = positions.len() == cars.len() && unique.last() == Some(&n);
    if native && complete && unique != (1..=n).collect() {
        broken.push(format!("huecos: posiciones {unique:?}"));
    }
    let mut ordered: Vec<_> = cars
        .iter()
        .filter_map(|c| Some((*c.position.current()?, c)))
        .collect();
    ordered.sort_by_key(|(position, _)| *position);
    let race = snapshot.state.session.kind.current() == Some(&vantare_domain::SessionKind::Race);
    let mut previous: Option<(u32, f64)> = None;
    for (position, car) in &ordered {
        let gap = match car.gap_leader.current() {
            Some(vantare_domain::Gap::Time { seconds }) => Some(*seconds),
            _ => None,
        };
        if let (true, Some((before, gap_before)), Some(gap)) = (gaps || race, previous, gap)
            && gap + 1e-9 < gap_before
        {
            broken.push(format!("gap: P{position} {gap} < P{before} {gap_before}"));
        }
        if let Some(gap) = gap {
            previous = Some((*position, gap));
        }
    }
    let mut classes: BTreeMap<u32, Vec<(u32, bool)>> = BTreeMap::new();
    for (_, car) in &ordered {
        if let (Some(class), Some(rank)) = (&car.class, car.class_position.current()) {
            let derived = matches!(car.class_position, vantare_domain::Quality::Estimated(_));
            classes
                .entry(class.id.0)
                .or_default()
                .push((*rank, derived));
        }
    }
    for (class, ranks) in classes {
        if ranks
            .windows(2)
            .any(|w| w[0].0 >= w[1].0 && (native || w[0].1 || w[1].1))
        {
            broken.push(format!(
                "clase: {class} con posiciones {ranks:?} fuera de la general"
            ));
        }
    }
    broken
}

/// Cuenta las fotos y falla con la primera y la última violación de cada tipo.
fn check_invariants(
    name: &str,
    native: bool,
    gaps: bool,
    snapshots: impl Iterator<Item = std::sync::Arc<vantare_domain::Snapshot>>,
) -> usize {
    let mut last = None;
    let mut count = 0;
    let mut seen = std::collections::BTreeMap::<String, (usize, String, String)>::new();
    for snapshot in snapshots {
        count += 1;
        for broken in invariants(&snapshot, &mut last, native, gaps) {
            let kind = broken.split(':').next().unwrap_or_default().to_owned();
            let entry =
                seen.entry(kind)
                    .or_insert((0, format!("foto {count}: {broken}"), String::new()));
            entry.0 += 1;
            entry.2 = format!("última foto {count}: {broken}");
        }
    }
    assert!(seen.is_empty(), "{name}: {seen:#?}");
    count
}

/// Las 3.839 fotos que publica el núcleo con el replay de lmu47.
fn lmu47_photos() -> impl Iterator<Item = std::sync::Arc<vantare_domain::Snapshot>> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/rust-port/lmu47-high-rate-60s.tar.gz");
    let mut replay = open_replay(&path, None).expect("corpus real obligatorio");
    let mut core = Core::new(1463);
    std::iter::from_fn(move || {
        let observation = replay
            .poll(Duration::from_secs(61))
            .expect("corpus válido")?;
        let now = observation.origin.received_at;
        core.step(&mut Once(Some(observation)), now)
            .expect("foto válida");
        Some(core.snapshot())
    })
}

/// Las 190.308 fotos que publica el núcleo con el replay de ACC.
fn acc_photos() -> impl Iterator<Item = std::sync::Arc<vantare_domain::Snapshot>> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/acc/acc-sesion-udp-20260929.tar.gz");
    let mut replay = open_acc_replay(&path).expect("corpus real obligatorio");
    let mut core = Core::new(1463);
    let mut polls = 0;
    std::iter::from_fn(move || {
        // Mismo recorrido que el golden: 190.471 lecturas, algunas vacías.
        while polls < 190_471 {
            polls += 1;
            if let Some(observation) = replay
                .poll(Duration::from_secs(121))
                .expect("corpus válido")
            {
                let now = observation.origin.received_at;
                core.step(&mut Once(Some(observation)), now)
                    .expect("foto válida");
                return Some(core.snapshot());
            }
        }
        None
    })
}

#[test]
fn core_invariants_hold_on_every_real_photo() {
    assert_eq!(check_invariants("lmu47", true, false, lmu47_photos()), 3839);
    assert_eq!(check_invariants("acc", false, false, acc_photos()), 190_308);
}

/// En la base, práctica LMU publica gaps de progreso como Reliable, incluso
/// P11 a 0 s tras P10 a 0,92 s (7.678 violaciones). P11 sí tiene mejor vuelta:
/// esos gaps no describen la clasificación por mejores vueltas (#1551).
#[test]
fn lmu_practice_gaps_follow_the_position() {
    assert_eq!(check_invariants("lmu47", true, true, lmu47_photos()), 3839);
}

/// ACC: en 27 fotos (de la 94.528 a la 131.593) dos coches comparten posición
/// general Reliable y falta otra (p. ej. dos P5 sin P6), y en 6 se repite la
/// posición de clase: datagramas independientes completan el adelantamiento
/// a medias. El adapter debe publicar un orden coherente (#1552).
#[test]
fn acc_native_positions_stay_unique_during_overtakes() {
    assert_eq!(check_invariants("acc", true, false, acc_photos()), 190_308);
}
