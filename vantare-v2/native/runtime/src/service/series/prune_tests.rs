use super::*;
use std::fs::File;

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "series-quota-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("fixture de poda")
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("fixture de poda");
        Self(path)
    }
    fn file(&self, name: &str, size: u64, age: u64) -> PathBuf {
        let path = self.0.join(name);
        let file = File::create(&path).expect("fixture de poda");
        file.set_len(size).expect("fixture de poda");
        file.set_modified(UNIX_EPOCH + Duration::from_secs(age))
            .expect("fixture de poda");
        path
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("fixture de poda");
    }
}

#[test]
fn reserves_new_recording_and_removes_oldest_first() {
    let dir = Directory::new();
    for index in 0..201 {
        dir.file(&format!("series-{index:03}-1.duckdb"), 1, index);
    }
    let report = prune(
        &dir.0,
        UNIX_EPOCH + Duration::from_secs(2000),
        MAX_RECORDINGS,
        MAX_BYTES,
    )
    .unwrap();
    assert_eq!(report.counts.recordings, 199);
    assert_eq!(report.items.len(), 2);
    assert_eq!(report.items[0].name, "series-000-1.duckdb");
    assert_eq!(report.items[1].name, "series-001-1.duckdb");
    assert_eq!(report.items[0].reason, "cuota de nº");
}

#[test]
fn byte_quota_counts_wal_and_orders_equal_dates_by_name() {
    let dir = Directory::new();
    dir.file("series-2-1.duckdb", 10, 1);
    dir.file("series-1-1.duckdb", 10, 1);
    dir.file("series-1-1.duckdb.wal", 25, 2);
    let report = prune(&dir.0, SystemTime::now(), 200, 20).unwrap();
    assert!(!dir.0.join("series-1-1.duckdb").exists());
    assert!(!dir.0.join("series-1-1.duckdb.wal").exists());
    assert!(dir.0.join("series-2-1.duckdb").exists());
    assert_eq!(report.counts.bytes, 10);
    assert_eq!(report.items[0].size_bytes, 35);
    assert_eq!(report.items[0].reason, "cuota de bytes");
}

#[test]
fn only_recording_patterns_and_old_creating_are_removed() {
    let dir = Directory::new();
    for name in [
        "notas.txt",
        "recording-status.json",
        "other.duckdb",
        "series-x.duckdb.bak",
    ] {
        dir.file(name, 50, 1);
    }
    dir.file("series-1-2.duckdb.creating-10-1", 12, 1);
    dir.file("series-2-2.duckdb.creating-10-2", 13, 1900);
    let nested = dir.0.join("series-3-2.duckdb.creating-10-3");
    fs::create_dir(&nested).unwrap();
    fs::write(nested.join("recording.duckdb"), b"orphan").unwrap();
    // Directory mtime is not portable to set with File::open on Windows; injected now ages it.
    let now = SystemTime::now() + Duration::from_secs(601);
    let report = prune(&dir.0, now, 200, MAX_BYTES).unwrap();
    assert!(!nested.exists());
    assert!(!dir.0.join("series-1-2.duckdb.creating-10-1").exists());
    assert!(report.items.iter().all(|item| item.reason == "huérfano"));
    for name in [
        "notas.txt",
        "recording-status.json",
        "other.duckdb",
        "series-x.duckdb.bak",
    ] {
        assert!(dir.0.join(name).exists());
    }
}

#[test]
fn recent_creating_counts_bytes_but_is_never_removed_for_quota() {
    let dir = Directory::new();
    dir.file("series-2-2.duckdb.creating-10-2", 30, 1900);
    let report = prune(&dir.0, UNIX_EPOCH + Duration::from_secs(2000), 200, 20).unwrap();
    assert_eq!(report.counts.bytes, 30);
    assert!(report.quota_unmet);
    assert!(report.items.is_empty());
}

#[test]
fn prune_history_retains_only_the_last_fifty_items() {
    let dir = Directory::new();
    for index in 0..60 {
        dir.file(
            &format!("series-{index:02}-1.duckdb.creating-10-1"),
            1,
            index,
        );
    }
    let report = prune(
        &dir.0,
        UNIX_EPOCH + Duration::from_secs(2000),
        200,
        MAX_BYTES,
    )
    .unwrap();
    assert_eq!(report.items.len(), 50);
    assert_eq!(report.items[0].name, "series-10-1.duckdb.creating-10-1");
    assert_eq!(report.items[49].name, "series-59-1.duckdb.creating-10-1");
    assert_eq!(report.counts.bytes, 0);
}

#[cfg(windows)]
#[test]
fn exclusive_open_skips_in_use_and_delete_errors_do_not_abort_pruning() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = Directory::new();
    let held_path = dir.file("series-1-1.duckdb", 10, 1);
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&held_path)
        .unwrap();
    let readonly = dir.file("series-2-1.duckdb", 10, 2);
    let original_permissions = fs::metadata(&readonly).unwrap().permissions();
    let mut permissions = original_permissions.clone();
    permissions.set_readonly(true);
    fs::set_permissions(&readonly, permissions).unwrap();
    dir.file("series-3-1.duckdb", 10, 3);
    let report = prune(&dir.0, SystemTime::now(), 2, MAX_BYTES).unwrap();
    assert_eq!(report.items[0].result, "omitida en uso");
    assert_eq!(report.items[1].result, "error");
    assert_eq!(report.items[2].result, "borrada");
    assert!(report.quota_unmet);
    fs::set_permissions(readonly, original_permissions).unwrap();
    drop(held);
}

#[cfg(windows)]
#[test]
fn locked_wal_keeps_both_database_and_wal() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = Directory::new();
    let db = dir.file("series-90-1.duckdb", 4, 1);
    let wal = dir.file("series-90-1.duckdb.wal", 7, 2);
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&wal)
        .unwrap();
    let report = prune(&dir.0, SystemTime::now(), 1, MAX_BYTES).unwrap();
    assert!(db.exists());
    assert!(wal.exists());
    assert_eq!(report.counts.bytes, 11);
    assert_eq!(report.items[0].result, "omitida en uso");
    drop(held);
}

#[test]
fn only_parsed_product_names_are_candidates() {
    let dir = Directory::new();
    for name in [
        "notas.creating-1.txt",
        "series-usuario.duckdb.creating-x",
        "series-usuario.duckdb",
        "series-1.duckdb",
        "series-usuario.duckdb.wal",
        "series-1.duckdb.wal",
    ] {
        dir.file(name, 10, 1);
    }
    let foreign = dir.0.join("carpeta.creating-1");
    fs::create_dir(&foreign).unwrap();
    fs::write(foreign.join("notas.txt"), b"privado").unwrap();
    dir.file("series-12-34.duckdb.creating-56-0", 10, 1);
    let report = prune(&dir.0, SystemTime::now() + Duration::from_mins(11), 0, 0).unwrap();
    assert_eq!(report.items.len(), 1);
    assert_eq!(report.items[0].name, "series-12-34.duckdb.creating-56-0");
    assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 7);
    assert_eq!(fs::read(foreign.join("notas.txt")).unwrap(), b"privado");
}
#[test]
fn wal_without_database_is_an_orphan_but_recent_wal_is_retained() {
    let dir = Directory::new();
    dir.file("series-1-1.duckdb.wal", 20, 1);
    dir.file("series-2-1.duckdb.wal", 30, 1900);
    let report = prune(
        &dir.0,
        UNIX_EPOCH + Duration::from_secs(2000),
        200,
        MAX_BYTES,
    )
    .unwrap();
    assert!(!dir.0.join("series-1-1.duckdb.wal").exists());
    assert!(dir.0.join("series-2-1.duckdb.wal").exists());
    assert_eq!(report.counts.bytes, 30);
    assert_eq!(report.items[0].reason, "huérfano");
}

/// ADR 0111 §7 and the note of #2746: the single folder is pruned exactly as
/// the folder of the generation would have been (a move keeps the dates the
/// order comes from), and no `.wal` ever arrives without its recording, where
/// the pruning would take it for an orphan.
#[test]
fn adopted_recordings_are_pruned_as_they_would_have_been_in_their_generation() {
    use vantare_installer::engine::operations::{Duplicates, adopt_recordings};
    let root = Directory::new();
    let id = "a".repeat(32);
    let state = format!(
        r#"{{"schema":1,"product":"vantare-native","channel":"beta","previous":null,"active":{{"generation":"{id}","manifest_sha256":"{}"}}}}"#,
        "b".repeat(64)
    );
    fs::write(root.0.join("state.json"), state).unwrap();
    fs::write(root.0.join(".vantare-native"), b"offline-candidate-v1").unwrap();
    let source = Directory(root.0.join(format!("generations/{id}/data/hub/recordings")));
    let control = Directory(root.0.join("control"));
    for folder in [&source, &control] {
        fs::create_dir_all(&folder.0).unwrap();
        for (index, age) in [30, 10, 40, 20].into_iter().enumerate() {
            folder.file(&format!("series-{index}-1.duckdb"), 10, age);
        }
    }
    // Never closed, and older than all the others.
    let unclosed = ["series-9-1.duckdb", "series-9-1.duckdb.wal"];
    for name in unclosed {
        source.file(name, 10, 5);
    }
    let adoption = adopt_recordings(&root.0, &id, Duplicates::Keep, &mut |_| Ok(()), &mut |_| {});
    let adoption = adoption.unwrap();
    assert_eq!((adoption.moved, adoption.kept), (4, 2));
    let single = root.0.join("recordings");
    for name in unclosed {
        assert!(source.0.join(name).exists() && !single.join(name).exists());
    }
    // Long after the ten minutes an orphan is given.
    let now = SystemTime::now() + Duration::from_mins(60);
    let chosen = |folder: &Path| {
        let report = prune(folder, now, 3, MAX_BYTES).unwrap();
        let item = |item: &Item| {
            (
                item.name.clone(),
                item.modified_at_ms,
                item.reason,
                item.result,
            )
        };
        report.items.iter().map(item).collect::<Vec<_>>()
    };
    let pruned = chosen(&single);
    assert_eq!(pruned, chosen(&control.0));
    let names: Vec<_> = pruned.iter().map(|item| item.0.as_str()).collect();
    assert_eq!(names, ["series-1-1.duckdb", "series-3-1.duckdb"]);
}
