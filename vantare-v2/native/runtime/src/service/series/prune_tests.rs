use super::*;
use std::fs::File;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "series-quota-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn file(&self, name: &str, size: u64, age: u64) -> PathBuf {
        let path = self.0.join(name);
        let file = File::create(&path).unwrap();
        file.set_len(size).unwrap();
        file.set_modified(UNIX_EPOCH + Duration::from_secs(age))
            .unwrap();
        path
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn reserves_new_recording_and_removes_oldest_first() {
    let dir = Directory::new();
    for index in 0..201 {
        dir.file(&format!("series-{index:03}.duckdb"), 1, index);
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
    assert_eq!(report.items[0].name, "series-000.duckdb");
    assert_eq!(report.items[1].name, "series-001.duckdb");
    assert_eq!(report.items[0].reason, "cuota de nº");
}

#[test]
fn byte_quota_counts_wal_and_orders_equal_dates_by_name() {
    let dir = Directory::new();
    dir.file("series-b.duckdb", 10, 1);
    dir.file("series-a.duckdb", 10, 1);
    dir.file("series-a.duckdb.wal", 25, 2);
    let report = prune(&dir.0, SystemTime::now(), 200, 20).unwrap();
    assert!(!dir.0.join("series-a.duckdb").exists());
    assert!(!dir.0.join("series-a.duckdb.wal").exists());
    assert!(dir.0.join("series-b.duckdb").exists());
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
    dir.file("series-old.duckdb.creating-1", 12, 1);
    dir.file("series-new.duckdb.creating-2", 13, 1900);
    let nested = dir.0.join("series-dir.duckdb.creating-3");
    fs::create_dir(&nested).unwrap();
    fs::write(nested.join("recording.duckdb"), b"orphan").unwrap();
    // Directory mtime is not portable to set with File::open on Windows; injected now ages it.
    let now = SystemTime::now() + Duration::from_secs(601);
    let report = prune(&dir.0, now, 200, MAX_BYTES).unwrap();
    assert!(!nested.exists());
    assert!(!dir.0.join("series-old.duckdb.creating-1").exists());
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
    dir.file("series-new.duckdb.creating-2", 30, 1900);
    let report = prune(&dir.0, UNIX_EPOCH + Duration::from_secs(2000), 200, 20).unwrap();
    assert_eq!(report.counts.bytes, 30);
    assert!(report.quota_unmet);
    assert!(report.items.is_empty());
}

#[test]
fn prune_history_retains_only_the_last_fifty_items() {
    let dir = Directory::new();
    for index in 0..60 {
        dir.file(&format!("series-{index:02}.duckdb.creating-1"), 1, index);
    }
    let report = prune(
        &dir.0,
        UNIX_EPOCH + Duration::from_secs(2000),
        200,
        MAX_BYTES,
    )
    .unwrap();
    assert_eq!(report.items.len(), 50);
    assert_eq!(report.items[0].name, "series-10.duckdb.creating-1");
    assert_eq!(report.items[49].name, "series-59.duckdb.creating-1");
    assert_eq!(report.counts.bytes, 0);
}

#[cfg(windows)]
#[test]
fn exclusive_open_skips_in_use_and_delete_errors_do_not_abort_pruning() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = Directory::new();
    let held_path = dir.file("series-a.duckdb", 10, 1);
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&held_path)
        .unwrap();
    let readonly = dir.file("series-b.duckdb", 10, 2);
    let mut permissions = fs::metadata(&readonly).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&readonly, permissions).unwrap();
    dir.file("series-c.duckdb", 10, 3);
    let report = prune(&dir.0, SystemTime::now(), 2, MAX_BYTES).unwrap();
    assert_eq!(report.items[0].result, "omitida en uso");
    assert_eq!(report.items[1].result, "error");
    assert_eq!(report.items[2].result, "borrada");
    assert!(report.quota_unmet);
    let mut permissions = fs::metadata(&readonly).unwrap().permissions();
    permissions.set_readonly(false);
    fs::set_permissions(readonly, permissions).unwrap();
    drop(held);
}

#[cfg(windows)]
#[test]
fn locked_wal_keeps_both_database_and_wal() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = Directory::new();
    let db = dir.file("series-held.duckdb", 4, 1);
    let wal = dir.file("series-held.duckdb.wal", 7, 2);
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
