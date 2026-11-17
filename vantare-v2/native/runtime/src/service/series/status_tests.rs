use super::*;

#[test]
fn atomic_status_replacement_keeps_schema_limits_and_decimal_counters() {
    let dir = std::env::temp_dir().join(format!("series-status-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    validate_volume(&dir).unwrap();
    let mut status = Status::new(&dir, 42, PruneReport::default());
    status.file = Some("series-42.duckdb".into());
    status.write();
    let path = dir.join("recording-status.json");
    let value: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(value["schema"], "vantare.recording-status.v1");
    assert_eq!(value["state"], "recording");
    assert_eq!(value["startedAtMs"], 42);
    assert_eq!(value["limits"]["maxRecordings"], 200);
    assert_eq!(value["limits"]["maxBytes"], 5_u64 * 1024 * 1024 * 1024);
    status.state = "stopped";
    status.durable_watermark = Some(u64::MAX.to_string());
    status.attempted = Some(u64::MAX.to_string());
    status.write();
    let value: serde_json::Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    assert_eq!(value["state"], "stopped");
    assert_eq!(value["durableWatermark"], u64::MAX.to_string());
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn cancelled_degradation_cannot_overwrite_finish_even_when_delayed() {
    let dir = std::env::temp_dir().join(format!("series-delayed-status-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let status = Status::new(&dir, 1, PruneReport::default());
    let gate = Arc::new(Mutex::new(false));
    let (started, start) = std::sync::mpsc::channel();
    let (release, released) = std::sync::mpsc::channel();
    let mut degraded = status.clone();
    degraded.state = "degraded";
    let worker_gate = gate.clone();
    let task = std::thread::spawn(move || {
        started.send(()).unwrap();
        released.recv().unwrap();
        degraded.persist(Some(&worker_gate)).unwrap();
    });
    start.recv_timeout(Duration::from_secs(5)).unwrap();
    *gate.lock().unwrap() = true;
    let mut stopped = status;
    stopped.state = "stopped";
    stopped.write();
    release.send(()).unwrap();
    task.join().unwrap();
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(dir.join("recording-status.json")).unwrap()).unwrap();
    assert_eq!(value["state"], "stopped");
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn finish_abandons_delayed_one_shot_and_stopped_wins_after_release() {
    let dir = std::env::temp_dir().join(format!("series-status-timeout-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let mut status = Status::new(&dir, 1, PruneReport::default());
    status.state = "degraded";
    let (release, released) = std::sync::mpsc::channel();
    let task = PendingStatus::delayed(status.clone(), released).unwrap();
    // La escritura no puede acabar hasta recibir release: finish debe abandonar.
    let gate = task.finish();
    status.state = "stopped";
    status.write_with_gate(Some(&gate));
    release.send(()).unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while Arc::strong_count(&gate) != 1 {
        assert!(
            std::time::Instant::now() < deadline,
            "hilo abandonado no termina"
        );
        std::thread::yield_now();
    }
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(dir.join("recording-status.json")).unwrap()).unwrap();
    assert_eq!(value["state"], "stopped");
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    fs::remove_dir_all(dir).unwrap();
}

#[cfg(windows)]
#[test]
fn failed_atomic_replace_keeps_previous_document_and_cleans_temporary() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = std::env::temp_dir().join(format!("series-atomic-failure-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let mut status = Status::new(&dir, 1, PruneReport::default());
    status.write();
    let path = dir.join("recording-status.json");
    let old = fs::read(&path).unwrap();
    let held = OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&path)
        .unwrap();
    status.state = "stopped";
    assert!(status.persist(None).is_err());
    drop(held);
    assert_eq!(fs::read(path).unwrap(), old);
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    fs::remove_dir_all(dir).unwrap();
}
