#![allow(clippy::unwrap_used)]

use super::*;

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
        assert!(store.page(u64::MAX, 1).unwrap().is_empty());
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
    for package in [
        "vantare-domain",
        "vantare-ipc",
        "vantare-ui",
        "vantare-runtime",
    ] {
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
