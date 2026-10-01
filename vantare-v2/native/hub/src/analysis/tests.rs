use super::{
    model::project,
    reader::{Reader, recordings},
};
use serde_json::json;
use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
    sync::{Arc, atomic::AtomicBool},
};

#[test]
fn recorded_database_smoke_reads_real_storage_pages_without_changing_original() {
    // Fixture sintética explícita, generada por el writer real como en storage/tests.
    let directory =
        std::env::temp_dir().join(format!("vantare-hub-analysis-{}", std::process::id()));
    std::fs::create_dir(&directory).expect("temporal exclusivo");
    let db = directory.join("recording.duckdb");
    let exe = std::env::current_exe()
        .expect("test exe")
        .parent()
        .expect("deps")
        .parent()
        .expect("perfil cargo")
        .join(format!("vantare-storage{}", std::env::consts::EXE_SUFFIX));
    assert!(
        exe.is_file(),
        "cargo build --offline -p vantare-storage -j 2 antes del smoke; cargo test --workspace construye este binario"
    );
    let mut writer = Command::new(&exe)
        .arg(&db)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("writer real");
    let mut input = writer.stdin.take().expect("stdin");
    for (index, lap, first, elapsed) in [(1, 0, 1, 10.0), (2, 1, 3, 12.0)] {
        let chunk = json!([
            "vantare.series-chunk.v1",
            index,
            0,
            0,
            [
                "vantare.player-lap.v1",
                1,
                3,
                7,
                lap,
                first + 2,
                false,
                [
                    [first, [1, 0.0], [1, 0.0], [1, 50.0], [1, 0.0], [0, null]],
                    [
                        first + 1,
                        [1, 100.0],
                        [1, elapsed],
                        [1, 40.0],
                        [1, 0.5],
                        [1, 0.0]
                    ]
                ]
            ]
        ]);
        writeln!(input, "{}", json!(["append", chunk])).expect("append");
    }
    writeln!(input, "{}", json!(["finish", 2])).expect("finish");
    drop(input);
    let output = writer.wait_with_output().expect("writer cerrado");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let original = std::fs::read(&db).expect("base original");
    assert_eq!(recordings(&directory).expect("catálogo"), vec![db.clone()]);
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut reader = Reader::open(&exe, &db, cancel.clone()).expect("read-only");
        assert!(reader.finished);
        assert_eq!(reader.watermark, 2);
        let (total, laps) = reader.summaries().expect("SeriesAnalysis");
        assert_eq!(total, 2);
        assert_eq!(laps.len(), 2);
        assert_eq!(laps[0].next_chunk, Some(2));
        assert_eq!(laps[0].speed.mean, Some(45.0));
        let mut other = laps[0].clone();
        other.car = 8;
        assert!(
            reader.samples(&other).is_err(),
            "no mezclar identidad de resúmenes y muestras"
        );
        let a = reader.samples(&laps[0]).expect("A paginada");
        let b = reader.samples(&laps[1]).expect("B paginada");
        assert_eq!(a.len(), 2);
        let charts = project(&a, &b, true);
        assert_eq!(
            charts.delta.last().expect("delta").value.to_bits(),
            (-2.0_f64).to_bits()
        );
        assert_eq!(charts.throttle[0][0].value.to_bits(), 0.0_f64.to_bits());
        assert_eq!(charts.brake[0].len(), 1);
    }
    assert_eq!(std::fs::read(&db).expect("original intacto"), original);
    // El proceso writer conserva el lock hasta EOF; no se leen datos en paralelo.
    verify_writer_lock(&exe, &db, cancel);
    std::fs::remove_file(db).expect("limpiar fixture propia");
    std::fs::remove_dir(directory).expect("limpiar temporal propio");
}

fn verify_writer_lock(exe: &std::path::Path, db: &std::path::Path, cancel: super::reader::Cancel) {
    let mut writer = Command::new(exe)
        .arg(db)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("writer con lock");
    let mut ready = String::new();
    BufReader::new(writer.stdout.take().expect("stdout"))
        .read_line(&mut ready)
        .expect("ready");
    assert!(ready.contains("ready"));
    match Reader::open(exe, db, cancel) {
        Ok(_) => panic!("read-only no debe coexistir con writer en otro proceso"),
        Err(error) => assert!(error.contains("bloqueada"), "{error}"),
    }
    drop(writer.stdin.take());
    assert!(writer.wait().expect("EOF").success());
}

#[test]
fn no_recordings_does_not_create_a_directory() {
    let directory =
        std::env::temp_dir().join(format!("vantare-hub-no-recordings-{}", std::process::id()));
    assert!(!directory.exists());
    assert!(recordings(&directory).expect("vacío honesto").is_empty());
    assert!(!directory.exists());
}
