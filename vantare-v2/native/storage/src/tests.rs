#![allow(clippy::unwrap_used)]

use super::*;

#[test]
fn actual_metadata_faults_expose_current_open_error_codes_without_matching_text() {
    for (sql, code) in [
        ("UPDATE series_meta SET watermark=1", "unreadable"),
        (
            "UPDATE series_meta SET schema_version='unknown-v2'",
            "incompatible",
        ),
    ] {
        let db = Database::new();
        drop(Store::open(&db.0, false).unwrap());
        let connection = Connection::open(&db.0).unwrap();
        connection.execute_batch(sql).unwrap();
        drop(connection);
        let original = std::fs::read(&db.0).unwrap();
        let mut output = Vec::new();
        assert!(serve(&db.0, true, &b""[..], &mut output).is_err());
        let frame: Value = serde_json::from_slice(output.trim_ascii()).unwrap();
        assert_eq!(frame[0], "error");
        assert_eq!(frame[1], code);
        assert_eq!(std::fs::read(&db.0).unwrap(), original);
    }
}

#[test]
fn paged_history_is_read_only_and_matches_live_analysis_with_quality_intact() {
    let db = Database::new();
    let mut live = SeriesAnalysis::new(4).unwrap();
    {
        let mut store = Store::open(&db.0, false).unwrap();
        for index in 1..=40_u64 {
            let mut value = chunk(index, usize::try_from((index - 1) % 10).unwrap());
            value.block.lap = u32::try_from((index - 1) / 10).unwrap();
            if index % 10 == 0 {
                value.block.sealed_at = Some(index + 1);
            }
            value.block.samples[0].speed_mps = match index % 4 {
                0 => vantare_domain::Quality::Reliable(104.055_343_627_929_69),
                1 => vantare_domain::Quality::Estimated(50.0),
                2 => vantare_domain::Quality::Stale(50.0),
                _ => vantare_domain::Quality::Unavailable,
            };
            live.consume(&value).unwrap();
            store.append(&value).unwrap();
        }
    }
    let original = std::fs::read(&db.0).unwrap();
    {
        let mut store = Store::open(&db.0, true).unwrap();
        assert!(store.page(0, 0).is_err());
        assert!(store.page(0, MAX_PAGE_CHUNKS + 1).is_err());
        assert!(store.append(&chunk(41, 0)).is_err());
        let mut replay = SeriesAnalysis::new(4).unwrap();
        let mut after = 0;
        let mut count = 0;
        loop {
            let page = store.page(after, 7).unwrap();
            assert!(page.len() <= 7);
            if page.is_empty() {
                break;
            }
            for value in page {
                after = value.index;
                count += 1;
                replay.consume(&value).unwrap();
            }
        }
        assert_eq!(count, 40);
        assert_eq!(replay.recent(), live.recent());
        assert_eq!(replay.active(), live.active());
        assert_eq!(
            store.page(u64::MAX, 1).unwrap(),
            [] as [vantare_runtime::flows::SeriesChunk; 0]
        );
    }
    assert_eq!(std::fs::read(&db.0).unwrap(), original);
}

#[test]
fn historical_replay_preserves_loss_and_rejects_unknown_database_versions() {
    let db = Database::new();
    {
        let mut store = Store::open(&db.0, false).unwrap();
        store.append(&chunk(1, 0)).unwrap();
        let mut value = chunk(4, 3);
        value.lost_before = 2;
        value.block.sealed_at = Some(5);
        store.append(&value).unwrap();
    }
    {
        let store = Store::open(&db.0, true).unwrap();
        let mut replay = SeriesAnalysis::new(1).unwrap();
        for value in store.page(0, 2).unwrap() {
            replay.consume(&value).unwrap();
        }
        assert_eq!(replay.recent()[0].samples, 2);
        assert!(replay.recent()[0].gap);
        assert_eq!(replay.recent()[0].continuous_span_s(), None);
    }
    let connection = Connection::open(&db.0).unwrap();
    connection
        .execute_batch("UPDATE series_meta SET schema_version='unknown-v2'")
        .unwrap();
    drop(connection);
    let original = std::fs::read(&db.0).unwrap();
    assert!(Store::open(&db.0, true).is_err());
    assert_eq!(std::fs::read(&db.0).unwrap(), original);
}

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);

#[test]
fn windows_sharing_violation_is_locked_and_preserves_diagnostic() {
    let detail = "IO Error: Cannot open file \"recording.duckdb\": The process cannot access the file because it is being used by another process.";
    let error = duckdb::Error::DuckDBFailure(
        duckdb::ffi::Error::new(duckdb::ffi::DuckDBError),
        Some(detail.to_owned()),
    );
    assert_eq!(
        inspection::open_error(&error),
        json!(["error", "locked", detail])
    );
}

#[test]
fn hub_inspection_uses_canonical_summary_and_read_only_pages() {
    let not_a_lock = inspection::open_error(&io::Error::other("DB corrupta: clock.duckdb"));
    assert_eq!(not_a_lock[1], "unreadable");
    let windows_lock = inspection::open_error(&io::Error::other(
        "IO Error: Cannot open file. File is already open in vantare-storage.exe",
    ));
    assert_eq!(windows_lock[1], "locked");
    let db = Database::new();
    let mut first = chunk(1, 0);
    first.block.sealed_at = Some(2);
    {
        let mut store = Store::open(&db.0, false).unwrap();
        store.append(&first).unwrap();
        store.finish(1).unwrap();
    }
    let original = std::fs::read(&db.0).unwrap();
    let mut output = Vec::new();
    serve(
        &db.0,
        true,
        &b"[\"summaries\"]\n[\"plot-page\",0,1]\n"[..],
        &mut output,
    )
    .unwrap();
    let frames: Vec<Value> = output
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice(line).unwrap())
        .collect();
    assert_eq!(frames[1][0], "summaries");
    assert_eq!(frames[1][2], 1);
    assert_eq!(frames[1][3][0]["speed"]["mean"], 50.0);
    assert_eq!(frames[1][3][0]["throttle"]["estimated"], 1);
    assert_eq!(frames[1][3][0]["sealed"], true);
    assert_eq!(frames[2][2][0]["samples"][0]["speed"], 50.0);
    assert!(frames[2][2][0]["samples"][0]["throttle"].is_null());
    assert_eq!(std::fs::read(&db.0).unwrap(), original);
    let connection = Connection::open(&db.0).unwrap();
    connection
        .execute_batch("UPDATE series_meta SET schema_version='future'")
        .unwrap();
    drop(connection);
    let mut output = Vec::new();
    assert!(serve(&db.0, true, &b""[..], &mut output).is_err());
    let error: Value = serde_json::from_slice(output.trim_ascii()).unwrap();
    assert_eq!(error[1], "incompatible");
}

#[test]
fn finish_records_the_lost_tail_and_refuses_new_data_or_invented_totals() {
    let db = Database::new();
    {
        let mut store = Store::open(&db.0, false).unwrap();
        store.append(&chunk(1, 0)).unwrap();
        assert!(store.finish(0).is_err());
        assert!(!store.finished);
        store.finish(4).unwrap();
        assert_eq!(
            (store.watermark, store.finished, store.attempted),
            (1, true, 4)
        );
        assert_eq!(store.append(&chunk(1, 0)).unwrap(), 1);
        assert!(store.append(&chunk(2, 1)).is_err());
        assert!(store.finish(5).is_err());
    }
    let recovered = Store::open(&db.0, true).unwrap();
    assert_eq!(recovered.state("status"), json!(["status", 1, true, 4]));
}

#[test]
fn sql_failure_after_insert_rolls_back_both_chunk_and_watermark() {
    let db = Database::new();
    {
        let mut store = Store::open(&db.0, false).unwrap();
        store.append(&chunk(1, 0)).unwrap();
        // Error real del engine entre INSERT y COMMIT; no simula disco lleno.
        store.connection.execute_batch("CREATE TABLE guarded_meta AS SELECT * FROM series_meta; DROP TABLE series_meta; CREATE TABLE series_meta (singleton BOOLEAN PRIMARY KEY, schema_version VARCHAR, watermark UBIGINT CHECK(watermark <= 1), finished BOOLEAN, attempted UBIGINT); INSERT INTO series_meta SELECT * FROM guarded_meta; DROP TABLE guarded_meta;").unwrap();
        assert!(store.append(&chunk(2, 1)).is_err());
        assert!(store.failed);
        assert_eq!(store.watermark, 1);
        assert!(store.append(&chunk(3, 1)).is_err());
        let count: u64 = store
            .connection
            .query_row("SELECT count(*)::UBIGINT FROM series_chunks", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1, "el INSERT no sobrevive al rollback");
    }
    let recovered = Store::open(&db.0, false).unwrap();
    assert_eq!(recovered.watermark, 1);
    assert_eq!(recovered.analysis.active().unwrap().samples, 1);
}

#[test]
fn inconsistent_watermark_and_corrupt_payload_fail_without_repairing_originals() {
    let db = Database::new();
    {
        let mut store = Store::open(&db.0, false).unwrap();
        store.append(&chunk(1, 0)).unwrap();
        store
            .connection
            .execute_batch("UPDATE series_meta SET watermark=99")
            .unwrap();
    }
    let original = std::fs::read(&db.0).unwrap();
    assert!(Store::open(&db.0, true).is_err());
    assert_eq!(std::fs::read(&db.0).unwrap(), original);
    {
        let connection = Connection::open(&db.0).unwrap();
        connection
            .execute_batch(
                "UPDATE series_meta SET watermark=1; UPDATE series_chunks SET payload='[]'::BLOB",
            )
            .unwrap();
    }
    let store = Store::open(&db.0, true).unwrap();
    assert!(store.page(0, 1).is_err());
    drop(store);
    assert!(Store::open(&db.0, false).is_err());
}

struct FailAck {
    lines: usize,
    bytes: Vec<u8>,
}

impl Write for FailAck {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.lines > 0 {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "ACK no entregado",
            ));
        }
        self.lines += usize::from(bytes.contains(&b'\n'));
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[test]
fn lost_ack_is_uncertain_for_the_client_but_identical_retry_is_safe() {
    let db = Database::new();
    let input = format!(
        "[\"append\",{}]\n",
        String::from_utf8(chunk(1, 0).to_bytes().unwrap()).unwrap()
    );
    let mut output = FailAck {
        lines: 0,
        bytes: Vec::new(),
    };
    assert!(serve(&db.0, false, input.as_bytes(), &mut output).is_err());
    assert_eq!(output.bytes, b"[\"ready\",0,false,0]\n");
    let mut recovered = Store::open(&db.0, false).unwrap();
    assert_eq!(recovered.watermark, 1, "COMMIT anterior al fallo del ACK");
    assert_eq!(recovered.append(&chunk(1, 0)).unwrap(), 1);
}

struct Database(PathBuf);

impl Database {
    fn new() -> Self {
        let directory = std::env::temp_dir().join(format!(
            "vantare-series-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).unwrap();
        Self(directory.join("recording.duckdb"))
    }
}

impl Drop for Database {
    fn drop(&mut self) {
        // Solo la carpeta única creada por esta prueba, nunca DB del usuario.
        std::fs::remove_dir_all(self.0.parent().unwrap()).unwrap();
    }
}

fn chunk(index: u64, offset: usize) -> SeriesChunk {
    SeriesChunk::from_bytes(format!(r#"["vantare.series-chunk.v1",{index},0,{offset},["vantare.player-lap.v1",1,3,7,0,null,false,[[{index},[1,{offset}],[1,{offset}],[1,50.0],[2,0.5],[0,null]]]]]"#).as_bytes()).unwrap()
}

#[test]
fn oversized_and_torn_frames_are_rejected_without_parsing() {
    assert!(read_frame(&mut &b"[\"status\"]"[..]).is_err());
    assert!(read_frame(&mut vec![b' '; MAX_REQUEST_BYTES + 1].as_slice()).is_err());
    assert_eq!(read_frame(&mut &b""[..]).unwrap(), None);
}

#[test]
fn commit_reopen_and_identical_retry_preserve_exact_original_bytes() {
    let db = Database::new();
    let first = chunk(1, 0);
    let second = chunk(2, 1);
    {
        let mut store = Store::open(&db.0, false).unwrap();
        assert_eq!(store.watermark, 0);
        assert_eq!(store.append(&first).unwrap(), 1);
        assert_eq!(store.append(&second).unwrap(), 2);
        assert_eq!(store.append(&first).unwrap(), 2);
        let mut conflict = chunk(1, 0);
        conflict.block.gap = true;
        assert!(store.append(&conflict).is_err());
        assert_eq!(store.watermark, 2);
    }
    let mut recovered = Store::open(&db.0, false).unwrap();
    assert_eq!(recovered.watermark, 2);
    assert_eq!(recovered.append(&second).unwrap(), 2);
    let bytes: Vec<u8> = recovered
        .connection
        .query_row("SELECT payload FROM series_chunks WHERE idx=1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(bytes, first.to_bytes().unwrap());
    assert_eq!(recovered.analysis.active().unwrap().samples, 2);
}

#[test]
fn bad_progress_and_invalid_chunks_do_not_change_the_confirmed_prefix() {
    let db = Database::new();
    let mut store = Store::open(&db.0, false).unwrap();
    store.append(&chunk(1, 0)).unwrap();
    assert!(store.append(&chunk(2, 0)).is_err());
    let mut invalid = chunk(2, 1);
    invalid.block.samples[0].sequence = 0;
    assert!(store.append(&invalid).is_err());
    assert_eq!(store.watermark, 1);
    assert_eq!(store.append(&chunk(2, 1)).unwrap(), 2);
}

#[test]
fn an_unrelated_database_is_never_initialized_or_migrated() {
    let db = Database::new();
    let connection = Connection::open(&db.0).unwrap();
    connection
        .execute_batch("CREATE TABLE original(x INTEGER); INSERT INTO original VALUES (42)")
        .unwrap();
    drop(connection);
    let original = std::fs::read(&db.0).unwrap();
    assert!(Store::open(&db.0, false).is_err());
    assert_eq!(std::fs::read(&db.0).unwrap(), original);
}

#[test]
fn protocol_confirms_only_effective_commits_and_rejects_unknown_commands() {
    let db = Database::new();
    let input = format!(
        "[\"append\",{}]\n[\"status\"]\n",
        String::from_utf8(chunk(1, 0).to_bytes().unwrap()).unwrap()
    );
    let mut output = Vec::new();
    serve(&db.0, false, input.as_bytes(), &mut output).unwrap();
    assert_eq!(
        output,
        b"[\"ready\",0,false,0]\n[\"ack\",1]\n[\"status\",1,false,0]\n"
    );
    let mut output = Vec::new();
    assert!(
        serve(
            &db.0,
            false,
            &b"[\"sql\",\"DROP TABLE series_chunks\"]\n"[..],
            &mut output
        )
        .is_err()
    );
    assert_eq!(output, b"[\"ready\",1,false,0]\n");
}

#[test]
fn duckdb_is_not_in_any_live_package_dependency_tree() {
    let roots = std::process::Command::new(env!("CARGO"))
        .args([
            "tree",
            "--offline",
            "--workspace",
            "--depth",
            "0",
            "--prefix",
            "none",
        ])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("workspace dependency roots");
    assert!(
        roots.status.success(),
        "{}",
        String::from_utf8_lossy(&roots.stderr)
    );
    let roots = String::from_utf8_lossy(&roots.stdout);
    let packages = roots
        .lines()
        .filter_map(|line| line.split_whitespace().next())
        .collect::<Vec<_>>();
    assert!(
        packages.contains(&"vantare-storage"),
        "workspace storage root"
    );
    for package in packages
        .into_iter()
        .filter(|package| *package != "vantare-storage")
    {
        let output = std::process::Command::new(env!("CARGO"))
            .args([
                "tree",
                "--offline",
                "--package",
                package,
                "--edges",
                "all",
                "--prefix",
                "none",
            ])
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            assert!(
                !matches!(
                    line.split_whitespace().next(),
                    Some("duckdb" | "libduckdb-sys" | "vantare-storage")
                ),
                "{package}: {line}"
            );
        }
    }
}

#[test]
fn missing_open_has_a_typed_code_and_unknown_diagnostic_stays_unreadable() {
    let db = Database::new();
    let mut output = Vec::new();
    assert!(serve(&db.0, true, &b""[..], &mut output).is_err());
    let frame: Value = serde_json::from_slice(output.trim_ascii()).unwrap();
    assert_eq!(frame[1], "missing");
    assert!(!db.0.exists());
    let unknown = io::Error::other("unknown disk failure");
    assert_eq!(inspection::open_error(&unknown)[1], "unreadable");
}

// Estas barreras solo existen en el ejecutable de tests, nunca en el helper.
pub(super) fn creation_step(stage: &str) {
    if std::env::var("VANTARE_STORAGE_TEST_CUT").as_deref() == Ok(stage) {
        println!("creation-cut:{stage}");
        std::io::stdout().flush().unwrap();
        let mut line = String::new();
        std::io::stdin().read_line(&mut line).unwrap();
    }
}

#[test]
#[ignore = "fixture de creación: la invoca el test padre con barrera y kill"]
fn creation_cut_fixture() {
    let path = PathBuf::from(std::env::var_os("VANTARE_STORAGE_TEST_DB").unwrap());
    serve_mode(
        &path,
        OpenMode::Create,
        &b"[\"status\"]\n"[..],
        std::io::stdout().lock(),
    )
    .unwrap();
}

fn creation_fixture(path: &Path, stage: &str) -> std::process::Child {
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "--ignored",
            "--exact",
            "tests::creation_cut_fixture",
            "--nocapture",
        ])
        .env("VANTARE_STORAGE_TEST_DB", path)
        .env("VANTARE_STORAGE_TEST_CUT", stage)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as _;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: fixture sin consola.
    }
    let mut child = command.spawn().unwrap();
    let output = child.stdout.take().unwrap();
    let (sender, receiver) = mpsc::channel();
    let pump = std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(output);
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap() == 0 {
                break;
            }
            if let Some(start) = line.find("creation-cut:") {
                let _sent = sender.send(line[start..].trim().to_owned());
                break;
            }
        }
        reader.into_inner()
    });
    let result = receiver.recv_timeout(std::time::Duration::from_secs(30));
    if result.is_err() {
        child.kill().unwrap();
        child.wait().unwrap();
    }
    child.stdout = Some(pump.join().unwrap());
    assert_eq!(result.unwrap(), format!("creation-cut:{stage}"));
    child
}

fn database_files(root: &Path) -> std::collections::BTreeMap<PathBuf, Vec<u8>> {
    let mut files = std::collections::BTreeMap::new();
    for entry in std::fs::read_dir(root).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if entry.file_type().unwrap().is_dir() {
            for (name, bytes) in database_files(&path) {
                files.insert(PathBuf::from(entry.file_name()).join(name), bytes);
            }
        } else {
            files.insert(
                PathBuf::from(entry.file_name()),
                std::fs::read(path).unwrap(),
            );
        }
    }
    files
}

#[test]
fn interrupted_creation_preserves_its_artifacts_without_automatic_repair() {
    for stage in [
        "before-meta",
        "after-meta",
        "before-publish",
        "after-publish",
    ] {
        let db = Database::new();
        let mut child = creation_fixture(&db.0, stage);
        assert_eq!(db.0.exists(), stage == "after-publish");
        child.kill().unwrap();
        child.wait().unwrap();
        let root = db.0.parent().unwrap();
        let original = database_files(root);
        assert!(!original.is_empty(), "el corte debe dejar un temporal real");
        let mut output = Vec::new();
        let result = serve_mode(&db.0, OpenMode::Create, &b""[..], &mut output);
        assert_eq!(
            result.is_ok(),
            stage != "after-publish",
            "{stage}: {result:?}"
        );
        let after = database_files(root);
        for (name, bytes) in original {
            assert_eq!(
                after.get(&name),
                Some(&bytes),
                "preservar {stage}: {name:?}"
            );
        }
        if stage == "before-publish" || stage == "after-publish" {
            for name in after.keys() {
                assert_ne!(name.extension().and_then(|v| v.to_str()), Some("wal"));
            }
        }
    }
}

#[test]
fn two_publishers_racing_after_initialization_never_replace_the_winner() {
    let db = Database::new();
    let mut first = creation_fixture(&db.0, "before-publish");
    let mut second = creation_fixture(&db.0, "before-publish");
    // Ambos han cerrado DuckDB sin WAL y han comprobado destino ausente.
    // La carrera se decide al publicar, no por el chequeo previo de exists.
    for child in [&mut first, &mut second] {
        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(b"continue\n")
            .unwrap();
    }
    let a = first.wait().unwrap();
    let b = second.wait().unwrap();
    assert_ne!(
        a.success(),
        b.success(),
        "exactamente un creador debe publicar"
    );
    assert_eq!(
        std::fs::read_dir(db.0.parent().unwrap()).unwrap().count(),
        1,
        "el perdedor debe retirar su temporal propio"
    );
    let bytes = std::fs::read(&db.0).unwrap();
    assert!(create_database(&db.0).is_err());
    assert_eq!(std::fs::read(&db.0).unwrap(), bytes);
    let store = Store::open(&db.0, true).unwrap();
    assert_eq!(store.watermark, 0);
    assert_eq!(store.page(0, 1).unwrap(), [] as [SeriesChunk; 0]);
}

#[test]
fn explicit_resume_requires_an_existing_valid_prefix_and_preserves_bad_originals() {
    let db = Database::new();
    assert!(serve_mode(&db.0, OpenMode::Resume, &b""[..], Vec::new()).is_err());
    assert!(!db.0.exists());
    std::fs::write(&db.0, b"not a database").unwrap();
    for mode in [OpenMode::Create, OpenMode::Resume] {
        assert!(serve_mode(&db.0, mode, &b""[..], Vec::new()).is_err());
        assert_eq!(std::fs::read(&db.0).unwrap(), b"not a database");
    }
}

#[test]
fn create_preserves_an_orphan_wal_without_publishing_a_database() {
    let db = Database::new();
    let wal = wal_path(&db.0);
    std::fs::write(&wal, b"existing WAL").unwrap();
    let result = create_database(&db.0).unwrap_err();
    assert_eq!(
        result.downcast_ref::<io::Error>().unwrap().kind(),
        io::ErrorKind::AlreadyExists
    );
    assert!(!db.0.exists());
    assert_eq!(std::fs::read(wal).unwrap(), b"existing WAL");
    assert_eq!(
        std::fs::read_dir(db.0.parent().unwrap()).unwrap().count(),
        1
    );
}

#[test]
fn explicit_resume_rejects_invalid_metadata_without_rewriting_the_original() {
    for sql in [
        "UPDATE series_meta SET watermark=1",
        "UPDATE series_meta SET schema_version='future'",
        "DROP TABLE series_meta",
    ] {
        let db = Database::new();
        drop(Store::open(&db.0, false).unwrap());
        let connection = Connection::open(&db.0).unwrap();
        connection.execute_batch(sql).unwrap();
        drop(connection);
        let original = std::fs::read(&db.0).unwrap();
        assert!(serve_mode(&db.0, OpenMode::Resume, &b""[..], Vec::new()).is_err());
        assert_eq!(std::fs::read(&db.0).unwrap(), original);
    }
}

#[test]
fn a_destination_or_wal_appearing_at_publication_is_never_overwritten() {
    for sidecar in [false, true] {
        let db = Database::new();
        let mut child = creation_fixture(&db.0, "before-publish");
        let collision = if sidecar {
            wal_path(&db.0)
        } else {
            db.0.clone()
        };
        std::fs::write(&collision, b"another owner arrived").unwrap();
        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(b"continue\n")
            .unwrap();
        assert!(!child.wait().unwrap().success());
        assert_eq!(std::fs::read(collision).unwrap(), b"another owner arrived");
        assert_eq!(db.0.exists(), !sidecar);
        let files = database_files(db.0.parent().unwrap());
        assert_eq!(
            files.len(),
            1,
            "solo queda la colisión, sin temporal propio"
        );
    }
}

#[test]
fn cleanup_failure_after_publication_still_serves_the_published_database() {
    let db = Database::new();
    let mut child = creation_fixture(&db.0, "after-publish");
    let root = db.0.parent().unwrap();
    let temporary = database_files(root)
        .into_keys()
        .find(|path| path.components().count() == 2)
        .unwrap();
    let alias = root.join(temporary);
    // Fuerza un error real de remove_file sin bloquear la conexión de DuckDB:
    // el alias queda retenido con otro nombre y su antigua ruta es un directorio.
    let retained = alias.with_file_name("retained.duckdb");
    std::fs::rename(&alias, &retained).unwrap();
    std::fs::create_dir(&alias).unwrap();
    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"continue\n")
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "publicar es éxito aunque falle limpiar"
    );
    let frames: Vec<Value> = output
        .stdout
        .split(|b| *b == b'\n')
        .filter_map(|line| serde_json::from_slice(line).ok())
        .collect();
    assert_eq!(
        frames,
        [
            json!(["ready", 0, false, 0]),
            json!(["status", 0, false, 0])
        ]
    );
    assert!(retained.is_file());
    assert!(alias.is_dir());
    let store = Store::open(&db.0, true).unwrap();
    assert_eq!(store.watermark, 0);
}

#[test]
fn resume_after_publication_crash_uses_the_final_name_and_serves_data() {
    use std::process::{Command, Stdio};
    let db = Database::new();
    let mut child = creation_fixture(&db.0, "after-publish");
    child.kill().unwrap();
    child.wait().unwrap();
    let files = database_files(db.0.parent().unwrap());
    assert_eq!(
        files.len(),
        2,
        "final y alias cerrado conservados tras kill"
    );
    let exe = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join(format!("vantare-storage{}", std::env::consts::EXE_SUFFIX));
    let mut resumed = Command::new(exe)
        .arg(&db.0)
        .arg("--resume")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let payload: Value = serde_json::from_slice(&chunk(1, 0).to_bytes().unwrap()).unwrap();
    let mut input = resumed.stdin.take().unwrap();
    writeln!(input, "{}", json!(["append", payload])).unwrap();
    writeln!(input, "{}", json!(["page", 0, 16])).unwrap();
    drop(input);
    let output = resumed.wait_with_output().unwrap();
    assert!(output.status.success());
    let frames: Vec<Value> = output
        .stdout
        .split(|b| *b == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice(line).unwrap())
        .collect();
    assert_eq!(
        frames,
        [
            json!(["ready", 0, false, 0]),
            json!(["ack", 1]),
            json!(["page", [payload]])
        ]
    );
    assert_eq!(
        database_files(db.0.parent().unwrap()).len(),
        2,
        "resume no barre alias huérfanos: corresponde a G4a"
    );
}

#[test]
fn non_collision_publication_failure_keeps_the_temporary_database_for_diagnosis() {
    let db = Database::new();
    let mut child = creation_fixture(&db.0, "before-publish");
    let root = db.0.parent().unwrap();
    let temporary = database_files(root)
        .into_keys()
        .find(|path| path.components().count() == 2)
        .unwrap();
    let alias = root.join(temporary);
    let retained = alias.with_file_name("retained.duckdb");
    let original = std::fs::read(&alias).unwrap();
    // Fallo real NotFound de hard_link, distinto de perder el nombre destino.
    std::fs::rename(&alias, &retained).unwrap();
    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"continue\n")
        .unwrap();
    assert!(!child.wait().unwrap().success());
    assert!(!db.0.exists());
    assert_eq!(std::fs::read(retained).unwrap(), original);
}
