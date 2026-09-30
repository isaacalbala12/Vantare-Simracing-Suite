#![allow(clippy::unwrap_used)]

use super::*;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);

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
    assert_eq!(output, b"[\"ready\",0]\n[\"ack\",1]\n[\"status\",1]\n");
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
    assert_eq!(output, b"[\"ready\",1]\n");
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
