use super::*;
use std::collections::VecDeque;
use std::sync::atomic::AtomicBool;
use vantare_domain::{Adapter, AdapterError, SessionId, SessionKind};
use vantare_runtime::flows::{SessionEvent, SessionTracker};

fn observation(session: u64, car: u32, laps: u32, time_ms: u64, last: f64) -> Observation {
    let mut frame = photo(0, 100);
    frame.origin.source_time = Some(Duration::from_millis(time_ms));
    frame.origin.received_at = Duration::from_millis(time_ms);
    frame.state.session.id = SessionId(session);
    frame.state.session.kind = Quality::Reliable(SessionKind::Race);
    frame.state.session.track_name = Quality::Reliable("Spa".into());
    frame.state.session.elapsed_s =
        Quality::Reliable(Duration::from_millis(time_ms % 2000).as_secs_f64());
    frame.state.cars = vec![Car {
        id: CarId(car),
        vehicle: format!("Car {car}"),
        laps: Quality::Reliable(laps),
        position: Quality::Reliable(2),
        last_lap_s: Quality::Reliable(last),
        best_lap_s: Quality::Reliable(last),
        last_sectors_s: vec![Quality::Reliable(last / 3.0); 3],
        lap_distance_m: Quality::Reliable(0.0),
        lap_elapsed_s: Quality::Reliable(0.0),
        ..Car::default()
    }];
    frame.state.player.as_mut().unwrap().car = CarId(car);
    frame
}
fn frames() -> Vec<Observation> {
    vec![
        observation(10, 7, 0, 0, 90.0),
        observation(10, 7, 1, 1000, 91.0),
        observation(20, 9, 3, 2000, 88.0),
        observation(20, 9, 4, 3000, 89.0),
    ]
}
fn send(worker: &SeriesWorker, events: Vec<SessionEvent>) {
    for event in events {
        assert!(worker.try_session_event(event));
    }
}
fn await_watermark(worker: &SeriesWorker, index: u64) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while worker.watermark() < index {
        assert!(!worker.failed());
        assert!(Instant::now() < deadline, "ACK del helper real");
        std::thread::yield_now();
    }
}
fn rows(db: &Path, command: &Value) -> Value {
    let mut reader = Process::start_mode(db, Some("--read-only"));
    assert_eq!(reader.response()[0], "ready");
    reader.send(command);
    reader.response()
}

#[test]
fn core_tracker_and_real_helper_capture_two_sessions_and_complete_laps() {
    let db = Database::new();
    let mut core = Core::new(17);
    let receiver = core.series_mut().subscribe(32).unwrap();
    let worker = SeriesWorker::start_new(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    let mut tracker = SessionTracker::default();
    for (index, frame) in frames().into_iter().enumerate() {
        core.observe(frame).unwrap();
        send(
            &worker,
            tracker.observe(core.snapshot(), u64::try_from(index).unwrap() * 100 + 100),
        );
    }
    send(&worker, tracker.finish(500));
    core.series_mut().flush();
    let attempted = core.series().publication_status().unwrap().attempted;
    worker.finish(attempted, Duration::from_secs(10)).unwrap();
    let sessions = rows(&db.0, &json!(["session-summaries"]));
    assert_eq!(sessions[1], "series-session.v1");
    assert_eq!(sessions[2], 2);
    assert_eq!(sessions[3][0]["sealed"], true);
    assert_eq!(sessions[3][0]["endReason"], "coreStopped");
    assert_eq!(sessions[3][1]["endReason"], "sessionChanged");
    assert_eq!(sessions[3][1]["endedAtMs"], 200);
    assert_eq!(
        rows(&db.0, &json!(["lap-times", 17, 10]))[3][0]["officialMs"],
        91_000
    );
    let lap = rows(&db.0, &json!(["lap-times", 17, 20]));
    assert_eq!(lap[3][0]["lap"], 3);
    assert_eq!(lap[3][0]["car"], 9);
    assert_eq!(lap[3][0]["officialMs"], 89_000);
}

#[test]
fn recording_loop_observes_and_seals_both_sessions_through_the_product_path() {
    struct Replay(VecDeque<Observation>);
    impl Adapter for Replay {
        fn poll(&mut self, _: Duration) -> Result<Option<Observation>, AdapterError> {
            Ok(self.0.pop_front())
        }
    }
    let db = Database::new();
    let directory = db.0.parent().unwrap();
    let path = directory.join(format!("series-17-{}.duckdb", std::process::id()));
    let mut core = Core::new(17);
    let recording =
        vantare_runtime::service::SeriesRecording::start(&mut core, Some(directory), 17, || {
            Ok(PathBuf::from(env!("CARGO_BIN_EXE_vantare-storage")))
        });
    let deadline = Instant::now() + Duration::from_secs(10);
    while !path.exists() {
        assert!(Instant::now() < deadline);
        std::thread::yield_now();
    }
    let stop = AtomicBool::new(false);
    vantare_runtime::service::drive_core_recorded(
        &mut core,
        &mut Replay(frames().into()),
        1000.0,
        &stop,
        None,
        recording,
        |core| {
            if core.snapshot().sequence >= 4 {
                stop.store(true, Ordering::Relaxed);
            }
            Ok(())
        },
    )
    .unwrap();
    let sessions = rows(&path, &json!(["session-summaries"]));
    assert_eq!(sessions[2], 2);
    for session in sessions[3].as_array().unwrap() {
        assert_eq!(session["sealed"], true);
    }
    assert_eq!(
        rows(&path, &json!(["lap-times", 17, 10]))[3][0]["officialMs"],
        91_000
    );
    assert_eq!(
        rows(&path, &json!(["lap-times", 17, 20]))[3][0]["officialMs"],
        89_000
    );
}

#[test]
fn a_v1_database_disables_metadata_without_failing_chunks_or_finish() {
    let db = Database::new();
    {
        let connection = duckdb::Connection::open(&db.0).unwrap();
        connection.execute_batch("CREATE TABLE series_meta(singleton BOOLEAN,schema_version VARCHAR,watermark UBIGINT,finished BOOLEAN,attempted UBIGINT); INSERT INTO series_meta VALUES(true,'vantare.series-db.v1',0,false,0); CREATE TABLE series_chunks(idx UBIGINT PRIMARY KEY,payload BLOB);").unwrap();
    }
    let mut core = Core::new(17);
    let receiver = core.series_mut().subscribe(32).unwrap();
    let worker = SeriesWorker::start(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    core.observe(observation(10, 7, 0, 0, 90.0)).unwrap();
    send(
        &worker,
        SessionTracker::default().observe(core.snapshot(), 100),
    );
    core.series_mut().flush();
    let attempted = core.series().publication_status().unwrap().attempted;
    await_watermark(&worker, attempted);
    assert!(!worker.session_events_enabled());
    assert!(!worker.failed());
    let (state, _) = worker.finish(attempted, Duration::from_secs(10)).unwrap();
    assert!(state.finished);
    assert_eq!(state.watermark, attempted);
}

#[test]
fn a_rejected_metadata_event_is_nonfatal_and_the_next_valid_event_is_persisted() {
    let db = Database::new();
    let (_sender, receiver) = mpsc::sync_channel(1);
    let worker = SeriesWorker::start_new(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    let mut tracker = SessionTracker::default();
    let mut core = Core::new(17);
    core.observe(observation(10, 7, 0, 0, 90.0)).unwrap();
    let opened = tracker.observe(core.snapshot(), 100);
    // Closing before opening gives rejected/missing; the pump must keep running.
    let close = tracker.finish(200);
    send(&worker, close.clone());
    send(&worker, opened);
    send(&worker, close);
    worker.finish(0, Duration::from_secs(10)).unwrap();
    assert_eq!(
        rows(&db.0, &json!(["session-summaries"]))[3][0]["sealed"],
        true
    );
}

#[cfg(windows)]
#[test]
#[ignore = "fixture hija con Core real y helper SQL; el padre la mata tras el ACK"]
fn session_core_cut_fixture() {
    let db = PathBuf::from(std::env::var_os("VANTARE_SESSION_CUT_DB").unwrap());
    let mut core = Core::new(17);
    let receiver = core.series_mut().subscribe(32).unwrap();
    let worker = SeriesWorker::start_new(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db,
        receiver,
    )
    .unwrap();
    let mut tracker = SessionTracker::default();
    for frame in frames().into_iter().take(2) {
        core.observe(frame).unwrap();
        send(&worker, tracker.observe(core.snapshot(), 100));
    }
    core.series_mut().flush();
    await_watermark(
        &worker,
        core.series().publication_status().unwrap().attempted,
    );
    println!("session-captured");
    std::io::stdout().flush().unwrap();
    let mut line = String::new();
    std::io::stdin().read_line(&mut line).unwrap();
}

#[cfg(windows)]
#[test]
fn killing_the_core_owner_preserves_an_unsealed_session_and_the_acked_lap() {
    use std::os::windows::process::CommandExt;
    let db = Database::new();
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--ignored",
            "--exact",
            "session_capture::session_core_cut_fixture",
            "--nocapture",
        ])
        .env("VANTARE_SESSION_CUT_DB", &db.0)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .creation_flags(0x0800_0000)
        .spawn()
        .unwrap();
    let output = child.stdout.take().unwrap();
    let (ready, seen) = mpsc::channel();
    let pump = std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap() == 0 {
                break;
            }
            if line.contains("session-captured") {
                let _sent = ready.send(());
                break;
            }
        }
    });
    let result = seen.recv_timeout(Duration::from_secs(15));
    let helper = if result.is_ok() {
        core_recording_process::powershell(&format!("$p = Get-CimInstance Win32_Process -Filter 'ParentProcessId = {}' | Where-Object Name -eq 'vantare-storage.exe'; if (@($p).Count -ne 1) {{ exit 1 }}; $p.ProcessId",child.id())).trim().parse::<u32>().unwrap()
    } else {
        0
    };
    child.kill().unwrap();
    child.wait().unwrap();
    pump.join().unwrap();
    assert!(result.is_ok(), "barrera ACK antes del corte");
    core_recording_process::exited(helper);
    let sessions = rows(&db.0, &json!(["session-summaries"]));
    assert_eq!(sessions[3][0]["sealed"], false);
    assert_eq!(sessions[3][0]["endReason"], Value::Null);
    assert_eq!(
        rows(&db.0, &json!(["lap-times", 17, 10]))[3][0]["officialMs"],
        91_000
    );
}
