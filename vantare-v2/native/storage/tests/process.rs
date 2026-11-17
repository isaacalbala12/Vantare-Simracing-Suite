#![allow(clippy::unwrap_used)]

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{Value, json};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use vantare_domain::{Car, CarId, Observation, Player, Quality, State};
use vantare_runtime::core::Core;
use vantare_runtime::flows::{MAX_QUEUED_CHUNKS, SeriesChunk, SeriesReader, SeriesWorker};

static NEXT: AtomicU64 = AtomicU64::new(0);

struct Database(PathBuf);

impl Database {
    fn new() -> Self {
        let directory = std::env::temp_dir().join(format!(
            "vantare-storage-process-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).unwrap();
        Self(directory.join("recording.duckdb"))
    }
}

impl Drop for Database {
    fn drop(&mut self) {
        std::fs::remove_dir_all(self.0.parent().unwrap()).unwrap();
    }
}

struct Process {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}

impl Process {
    fn start(path: &Path) -> Self {
        Self::start_mode(path, None)
    }

    fn start_mode(path: &Path, mode: Option<&str>) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_vantare-storage"));
        command.arg(path);
        if let Some(mode) = mode {
            command.arg(mode);
        }
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let input = child.stdin.take().unwrap();
        let output = BufReader::new(child.stdout.take().unwrap());
        Self {
            child,
            input,
            output,
        }
    }

    fn response(&mut self) -> Value {
        let mut line = String::new();
        assert!(self.output.read_line(&mut line).unwrap() > 0);
        serde_json::from_str(&line).unwrap()
    }

    fn send(&mut self, command: &Value) {
        serde_json::to_writer(&mut self.input, command).unwrap();
        self.input.write_all(b"\n").unwrap();
        self.input.flush().unwrap();
    }
}

impl Drop for Process {
    fn drop(&mut self) {
        if self.child.try_wait().unwrap().is_none() {
            self.child.kill().unwrap();
            self.child.wait().unwrap();
        }
    }
}

fn payload() -> Value {
    json!([
        "vantare.series-chunk.v1",
        1,
        0,
        0,
        [
            "vantare.player-lap.v1",
            1,
            3,
            7,
            0,
            null,
            false,
            [[1, [1, 0.0], [1, 0.0], [1, 50.0], [2, 0.5], [0, null]]]
        ]
    ])
}

#[test]
fn another_process_cannot_take_the_live_writer_database() {
    let db = Database::new();
    let mut owner = Process::start(&db.0);
    assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
    let second = Command::new(env!("CARGO_BIN_EXE_vantare-storage"))
        .arg(&db.0)
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert!(!second.status.success());
    assert!(
        second.stdout.is_empty(),
        "sin ready/ACK de segundo propietario"
    );
    owner.send(&json!(["append", payload()]));
    assert_eq!(owner.response(), json!(["ack", 1]));
    owner.send(&json!(["stop"]));
    assert!(owner.child.wait().unwrap().success());
}

#[test]
fn summaries_emit_elapsed_endpoints_and_null_without_reliable_elapsed() {
    let db = Database::new();
    let mut owner = Process::start(&db.0);
    assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
    let mut sealed = payload();
    sealed[4][5] = 3.into();
    sealed[4][7][0][2][1] = 0.1.into();
    let mut last = sealed[4][7][0].clone();
    last[0] = 2.into();
    last[1][1] = 100.0.into();
    last[2][1] = 90.0.into();
    sealed[4][7].as_array_mut().unwrap().push(last);
    owner.send(&json!(["append", sealed]));
    assert_eq!(owner.response(), json!(["ack", 1]));
    let mut unknown = payload();
    unknown[1] = 2.into();
    unknown[4][4] = 1.into();
    unknown[4][7][0][0] = 3.into();
    unknown[4][7][0][2] = json!([2, 0.1]); // Estimated, no fiable.
    owner.send(&json!(["append", unknown]));
    assert_eq!(owner.response(), json!(["ack", 2]));
    owner.send(&json!(["stop"]));
    assert!(owner.child.wait().unwrap().success());

    let mut child = Command::new(env!("CARGO_BIN_EXE_vantare-storage"))
        .arg(&db.0)
        .arg("--read-only")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut reader = Process {
        input: child.stdin.take().unwrap(),
        output: BufReader::new(child.stdout.take().unwrap()),
        child,
    };
    assert_eq!(reader.response(), json!(["ready", 2, false, 0]));
    reader.send(&json!(["summaries"]));
    let frame = reader.response();
    assert_eq!(frame[0], "summaries");
    assert_eq!(frame[1], "series-summary.v1");
    assert_eq!(frame[2], 2);
    let laps = frame[3].as_array().unwrap();
    assert_eq!(laps.len(), 2);
    assert_eq!(laps[0]["sealed"], true);
    assert_eq!(laps[0]["gap"], false);
    assert_eq!(laps[0]["first_elapsed_s"], 0.1);
    assert_eq!(laps[0]["last_elapsed_s"], 90.0);
    assert_eq!(laps[0]["observed_span_s"], 89.9);
    for field in ["first_elapsed_s", "last_elapsed_s"] {
        assert_eq!(laps[1].get(field), Some(&Value::Null));
    }
}

#[test]
fn killed_after_ack_recovers_the_wal_and_retry_never_duplicates_samples() {
    let db = Database::new();
    {
        let mut owner = Process::start(&db.0);
        assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
        owner.send(&json!(["append", payload()]));
        assert_eq!(owner.response(), json!(["ack", 1]));
        assert!(
            db.0.with_extension("duckdb.wal").exists(),
            "probar WAL, no solo checkpoint normal"
        );
        owner.child.kill().unwrap();
        owner.child.wait().unwrap();
    }
    let (sender, receiver) = mpsc::sync_channel(2);
    sender
        .send(SeriesChunk::from_bytes(&serde_json::to_vec(&payload()).unwrap()).unwrap())
        .unwrap();
    let mut second = payload();
    second[1] = 2.into();
    second[3] = 1.into();
    second[4][7][0][0] = 2.into();
    second[4][7][0][1][1] = 1.0.into();
    second[4][7][0][2][1] = 1.0.into();
    sender
        .send(SeriesChunk::from_bytes(&serde_json::to_vec(&second).unwrap()).unwrap())
        .unwrap();
    let worker = SeriesWorker::start(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    let (state, live) = worker.finish(2, Duration::from_mins(1)).unwrap();
    assert_eq!(
        (state.watermark, state.finished, state.tail_lost()),
        (2, true, Some(0))
    );
    assert_eq!(live.active.as_ref().unwrap().samples, 2);
    let mut reader =
        SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &db.0).unwrap();
    assert_eq!(reader.state(), state);
    let replay = reader.analyze(256).unwrap();
    assert_eq!(replay.active(), live.active.as_ref());
    assert!(replay.recent().is_empty());
}

#[test]
fn read_only_after_kill_with_pending_wal_preserves_the_original_files() {
    let db = Database::new();
    {
        let mut owner = Process::start(&db.0);
        assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
        owner.send(&json!(["append", payload()]));
        assert_eq!(owner.response(), json!(["ack", 1]));
        owner.child.kill().unwrap();
        owner.child.wait().unwrap();
    }
    let wal = db.0.with_extension("duckdb.wal");
    let original = std::fs::read(&db.0).unwrap();
    let pending = std::fs::read(&wal).unwrap();
    assert_ne!(pending, [] as [u8; 0]);
    {
        let mut reader =
            SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &db.0).unwrap();
        assert_eq!(reader.state().watermark, 1);
        assert!(!reader.state().finished);
        let page = reader.page(0, 16).unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(
            page[0].to_bytes().unwrap(),
            serde_json::to_vec(&payload()).unwrap()
        );
    }
    assert_eq!(std::fs::read(&db.0).unwrap(), original);
    assert_eq!(std::fs::read(wal).unwrap(), pending);
}

fn photo(index: u32, lap_samples: u32) -> Observation {
    let car = Car {
        id: CarId(7),
        in_pits: Quality::Reliable(false),
        laps: Quality::Reliable(index / lap_samples),
        lap_distance_m: Quality::Reliable(f64::from(index % lap_samples) * 0.5),
        lap_elapsed_s: Quality::Reliable(f64::from(index % lap_samples) / 100.0),
        ..Car::default()
    };
    let mut player = Player {
        car: CarId(7),
        ..Player::default()
    };
    player.telemetry.speed_mps = Quality::Reliable(50.0);
    player.telemetry.throttle = Quality::Reliable(0.75);
    player.telemetry.brake = Quality::Reliable(0.0);
    let mut observation = Observation {
        state: State {
            cars: (0..104)
                .map(|id| Car {
                    id: CarId(id),
                    ..car.clone()
                })
                .collect(),
            player: Some(player),
            ..State::default()
        },
        ..Observation::default()
    };
    observation.origin.received_at = Duration::from_millis(u64::from(index) * 10);
    observation.origin.source_time = Some(observation.origin.received_at);
    observation
}

fn acquire(core: &mut Core, frames: u32) -> Duration {
    let start = Instant::now();
    for index in 0..=frames {
        core.observe(photo(index, frames)).unwrap();
    }
    core.series_mut().flush();
    start.elapsed()
}

#[test]
fn actual_writer_preserves_acquisition_and_live_matches_durable_replay() {
    const FRAMES: u32 = 6_000;
    let baseline = acquire(&mut Core::new(1), FRAMES);
    let db = Database::new();
    let mut core = Core::new(1);
    let receiver = core.series_mut().subscribe(MAX_QUEUED_CHUNKS).unwrap();
    let start = Instant::now();
    let worker = SeriesWorker::start(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    let acquisition = acquire(&mut core, FRAMES);
    assert_eq!(core.snapshot().sequence, u64::from(FRAMES) + 1);
    let publication = core.series().publication_status().unwrap();
    assert_eq!(
        publication.dropped, 0,
        "la cola admite la carga entera aun antes de ready"
    );
    let (state, live) = worker
        .finish(publication.attempted, Duration::from_mins(1))
        .unwrap();
    let total = start.elapsed();
    assert_eq!(state.watermark, publication.attempted);
    assert_eq!(state.tail_lost(), Some(0));
    assert_eq!(live.watermark, state.watermark);
    assert_eq!(live.recent[0].samples, FRAMES);
    assert!(!live.recent[0].gap);
    let mut reader =
        SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &db.0).unwrap();
    assert!(reader.page(0, 17).is_err());
    let replay = reader.analyze(256).unwrap();
    assert_eq!(
        replay.recent().iter().cloned().collect::<Vec<_>>(),
        live.recent
    );
    assert_eq!(replay.active(), live.active.as_ref());
    eprintln!(
        "ISA-1429 writer real debug: frames={}, coches=104, hz_lógicos=100, baseline_ms={:.3}, adquisición_con_writer_ms={:.3}, total_commit_stop_ms={:.3}, chunks_durables={}, muestras_vuelta={FRAMES}; sintético, sin LMU/OBS, sin gate de ratio",
        FRAMES + 1,
        baseline.as_secs_f64() * 1000.0,
        acquisition.as_secs_f64() * 1000.0,
        total.as_secs_f64() * 1000.0,
        state.watermark
    );
}

#[test]
fn undrained_full_queue_has_durable_tail_loss_even_without_a_following_chunk() {
    let db = Database::new();
    let mut core = Core::new(1);
    let receiver = core.series_mut().subscribe(2).unwrap();
    acquire(&mut core, 6_000);
    let publication = core.series().publication_status().unwrap();
    assert!(publication.dropped > 0);
    let worker = SeriesWorker::start_new(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    let (state, live) = worker
        .finish(publication.attempted, Duration::from_mins(1))
        .unwrap();
    assert_eq!(state.watermark, 2);
    assert_eq!(state.tail_lost(), Some(publication.dropped));
    assert_eq!(live.active.as_ref().unwrap().samples, 128);
    assert!(live.active.as_ref().unwrap().sealed_at.is_none());
    let reader =
        SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &db.0).unwrap();
    assert_eq!(reader.state(), state);
}

#[test]
fn timeout_and_drop_cancel_idle_workers_without_leaking_the_database_owner() {
    let db = Database::new();
    let (sender, receiver) = mpsc::sync_channel(1);
    let worker = SeriesWorker::start(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    let error = worker.finish(0, Duration::ZERO).unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
    drop(sender);
    // La muerte antes de inicializar puede dejar una DB incompleta: nunca se
    // sustituye. Usar una DB nueva y probar Drop esperando al productor vivo.
    let next = Database::new();
    let (sender, receiver) = mpsc::sync_channel(1);
    let worker = SeriesWorker::start(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &next.0,
        receiver,
    )
    .unwrap();
    let deadline = Instant::now() + Duration::from_secs(30);
    sender
        .send(SeriesChunk::from_bytes(&serde_json::to_vec(&payload()).unwrap()).unwrap())
        .unwrap();
    while worker.watermark() != 1 {
        assert!(!worker.failed());
        assert!(Instant::now() < deadline);
        std::thread::yield_now(); // Espera acotada de ACK observable, sin sleep.
    }
    assert_eq!(worker.analysis().active.as_ref().unwrap().samples, 1);
    drop(worker);
    drop(sender);
    let reader =
        SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &next.0).unwrap();
    assert_eq!(reader.state().watermark, 1);
    assert!(!reader.state().finished);
    assert_eq!(reader.state().tail_lost(), None);
}

// Estado construido: DB creada y confirmada por el motor, sin esquema de series.
// Matar esta fixture no interrumpe Store::open; fija la reapertura de ese estado.
#[test]
#[ignore = "fixture hija de engine_database_without_series_schema"]
fn engine_database_without_series_schema_fixture() {
    let path = std::env::var_os("VANTARE_PARTIAL_CREATION_DB").unwrap();
    let connection = duckdb::Connection::open(Path::new(&path)).unwrap();
    connection.execute_batch("CHECKPOINT").unwrap();
    println!("engine-without-series-schema");
    std::io::stdout().flush().unwrap();
    let mut line = String::new();
    std::io::stdin().read_line(&mut line).unwrap();
    drop(connection);
}

#[test]
fn engine_database_without_series_schema_is_preserved_and_cannot_resume() {
    let db = Database::new();
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--ignored",
            "--exact",
            "engine_database_without_series_schema_fixture",
            "--nocapture",
        ])
        .env("VANTARE_PARTIAL_CREATION_DB", &db.0)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let input = child.stdin.take().unwrap();
    let output = BufReader::new(child.stdout.take().unwrap());
    let mut fixture = Process {
        child,
        input,
        output,
    };
    loop {
        let mut line = String::new();
        assert!(
            fixture.output.read_line(&mut line).unwrap() > 0,
            "fixture terminó antes de la barrera"
        );
        if line.trim().ends_with("engine-without-series-schema") {
            break;
        }
    }
    fixture.child.kill().unwrap();
    fixture.child.wait().unwrap();
    let original = std::fs::read(&db.0).unwrap();
    for read_only in [true, false] {
        let mut command = Command::new(env!("CARGO_BIN_EXE_vantare-storage"));
        command.arg(&db.0).stdin(Stdio::null());
        if read_only {
            command.arg("--read-only");
        }
        let output = command.output().unwrap();
        assert!(!output.status.success());
        if read_only {
            let frame: Value = serde_json::from_slice(output.stdout.trim_ascii()).unwrap();
            assert_eq!(frame[0], "error");
            // Código accidental: open_error reconoce el texto series_meta del motor.
            assert_eq!(frame[1], "incompatible");
        } else {
            assert!(
                output.stdout.is_empty(),
                "RW falla sin ready ni código tipado"
            );
        }
        assert_eq!(std::fs::read(&db.0).unwrap(), original);
    }
}

#[test]
fn read_only_helper_reports_missing_incompatible_and_unreadable_codes() {
    let db = Database::new();
    let exe = env!("CARGO_BIN_EXE_vantare-storage");
    for expected in ["missing", "incompatible", "unreadable"] {
        if expected == "incompatible" {
            let connection = duckdb::Connection::open(&db.0).unwrap();
            connection.execute_batch("CREATE TABLE series_meta (singleton BOOLEAN, schema_version VARCHAR, watermark UBIGINT, finished BOOLEAN, attempted UBIGINT); INSERT INTO series_meta VALUES (true, 'unknown-v2', 0, false, 0)").unwrap();
        } else if expected == "unreadable" {
            std::fs::remove_file(&db.0).unwrap();
            std::fs::write(&db.0, b"not a database").unwrap();
        }
        let output = Command::new(exe)
            .arg(&db.0)
            .arg("--read-only")
            .output()
            .unwrap();
        assert!(!output.status.success());
        let frame: Value = serde_json::from_slice(output.stdout.trim_ascii()).unwrap();
        assert_eq!(frame[0], "error");
        assert_eq!(frame[1], expected);
        assert_ne!(frame[2].as_str().unwrap(), "");
    }
}

#[test]
fn explicit_creation_collision_and_resume_preserve_the_recorded_prefix() {
    let db = Database::new();
    let exe = env!("CARGO_BIN_EXE_vantare-storage");
    let mut owner = Process::start_mode(&db.0, Some("--create"));
    assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
    owner.send(&json!(["append", payload()]));
    assert_eq!(owner.response(), json!(["ack", 1]));
    owner.send(&json!(["stop"]));
    assert!(owner.child.wait().unwrap().success());
    let original = std::fs::read(&db.0).unwrap();
    let collision = Command::new(exe)
        .arg(&db.0)
        .arg("--create")
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert_eq!(collision.status.code(), Some(3));
    assert_eq!(collision.stdout, [] as [u8; 0]);
    assert_eq!(std::fs::read(&db.0).unwrap(), original);
    let mut resumed = Process::start_mode(&db.0, Some("--resume"));
    assert_eq!(resumed.response(), json!(["ready", 1, false, 0]));
    resumed.send(&json!(["page", 0, 16]));
    assert_eq!(resumed.response(), json!(["page", [payload()]]));
    resumed.send(&json!(["append", payload()]));
    assert_eq!(resumed.response(), json!(["ack", 1]));
    let mut second = payload();
    second[1] = 2.into();
    second[3] = 1.into();
    second[4][7][0][0] = 2.into();
    resumed.send(&json!(["append", second]));
    assert_eq!(resumed.response(), json!(["ack", 2]));
    resumed.send(&json!(["stop"]));
    assert!(resumed.child.wait().unwrap().success());
    let mut legacy = Process::start(&db.0);
    assert_eq!(legacy.response(), json!(["ready", 2, false, 0]));
    legacy.send(&json!(["stop"]));
    assert!(legacy.child.wait().unwrap().success());
    let reader = Command::new(exe)
        .arg(&db.0)
        .arg("--read-only")
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert!(reader.status.success());
    assert_eq!(
        serde_json::from_slice::<Value>(reader.stdout.trim_ascii()).unwrap(),
        json!(["ready", 2, false, 0])
    );
}

#[test]
fn explicit_modes_do_not_create_missing_resume_or_change_an_existing_file() {
    let db = Database::new();
    let exe = env!("CARGO_BIN_EXE_vantare-storage");
    let missing = Command::new(exe)
        .arg(&db.0)
        .arg("--resume")
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert_eq!(missing.status.code(), Some(1));
    assert!(!db.0.exists());
    std::fs::write(&db.0, b"original must survive").unwrap();
    for args in [
        vec!["--create"],
        vec!["--resume"],
        vec!["--create", "--resume"],
        vec!["--invalid"],
    ] {
        let result = Command::new(exe)
            .arg(&db.0)
            .args(args)
            .stdin(Stdio::null())
            .output()
            .unwrap();
        assert!(!result.status.success());
        assert_eq!(result.stdout, [] as [u8; 0]);
        assert_eq!(std::fs::read(&db.0).unwrap(), b"original must survive");
    }
    assert_eq!(
        std::fs::read_dir(db.0.parent().unwrap()).unwrap().count(),
        1,
        "colisión no debe crear temporales"
    );
}

#[test]
fn competing_create_helpers_publish_exactly_one_database() {
    let db = Database::new();
    let spawn = || {
        Command::new(env!("CARGO_BIN_EXE_vantare-storage"))
            .arg(&db.0)
            .arg("--create")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap()
    };
    let first = spawn();
    let second = spawn();
    let a = first.wait_with_output().unwrap();
    let b = second.wait_with_output().unwrap();
    assert_ne!(a.status.success(), b.status.success());
    let (winner, loser) = if a.status.success() { (a, b) } else { (b, a) };
    assert_eq!(
        serde_json::from_slice::<Value>(winner.stdout.trim_ascii()).unwrap(),
        json!(["ready", 0, false, 0])
    );
    assert_eq!(loser.stdout, [] as [u8; 0]);
    assert_eq!(loser.status.code(), Some(3));
    assert_ne!(loser.stderr, [] as [u8; 0]);
    assert_eq!(
        std::fs::read_dir(db.0.parent().unwrap()).unwrap().count(),
        1,
        "el perdedor no deja .creating-*"
    );
    let mut resumed = Process::start_mode(&db.0, Some("--resume"));
    assert_eq!(resumed.response(), json!(["ready", 0, false, 0]));
    resumed.send(&json!(["stop"]));
    assert!(resumed.child.wait().unwrap().success());
}

#[test]
fn create_requires_the_owner_to_create_the_parent_directory() {
    let db = Database::new();
    let parent = db.0.parent().unwrap().join("absent");
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-storage"))
        .arg(parent.join("recording.duckdb"))
        .arg("--create")
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(output.stdout, [] as [u8; 0]);
    assert!(!parent.exists());
}

#[test]
fn new_worker_retries_collision_without_touching_original_and_finishes_feed() {
    let db = Database::new();
    std::fs::write(&db.0, b"foreign database").unwrap();
    let mut core = Core::new(1);
    let receiver = core.series_mut().subscribe(32).unwrap();
    let worker = SeriesWorker::start_new(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    acquire(&mut core, 128);
    let attempted = core.series().publication_status().unwrap().attempted;
    let (state, _) = worker.finish(attempted, Duration::from_secs(10)).unwrap();
    assert!(state.finished);
    assert_eq!(state.attempted, attempted);
    assert_eq!(state.watermark, attempted);
    assert_eq!(std::fs::read(&db.0).unwrap(), b"foreign database");
    let paths: Vec<_> = std::fs::read_dir(db.0.parent().unwrap())
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p != &db.0 && p.extension().is_some_and(|e| e == "duckdb"))
        .collect();
    assert_eq!(paths.len(), 1);
    let reader =
        SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &paths[0]).unwrap();
    assert_eq!(reader.state(), state);
}

#[test]
fn recorded_drive_finishes_even_when_publication_returns_error() {
    use std::sync::atomic::AtomicBool;
    use vantare_domain::{Adapter, AdapterError};
    struct Replay(u32);
    impl Adapter for Replay {
        fn poll(&mut self, _: Duration) -> Result<Option<Observation>, AdapterError> {
            self.0 += 1;
            Ok(Some(photo(self.0, 128)))
        }
    }
    let db = Database::new();
    let dir = db.0.parent().unwrap().join("new-dir");
    let mut core = Core::new(9);
    let recording =
        vantare_runtime::service::SeriesRecording::start(&mut core, Some(&dir), 9, || {
            Ok(PathBuf::from(env!("CARGO_BIN_EXE_vantare-storage")))
        });
    let path = dir.join(format!("series-9-{}.duckdb", std::process::id()));
    let deadline = Instant::now() + Duration::from_secs(10);
    while !path.exists() {
        assert!(Instant::now() < deadline, "helper no publicó la DB nueva");
        std::thread::sleep(Duration::from_millis(10));
    }
    let result = vantare_runtime::service::drive_core_recorded(
        &mut core,
        &mut Replay(0),
        1.0,
        &AtomicBool::new(false),
        None,
        recording,
        |core| {
            if core.snapshot().sequence >= 70 {
                Err(vantare_ipc::Error::TooLarge { len: 123 })
            } else {
                Ok(())
            }
        },
    );
    assert!(matches!(
        result,
        Err(vantare_ipc::Error::TooLarge { len: 123 })
    ));
    let path = dir.join(format!("series-9-{}.duckdb", std::process::id()));
    let reader =
        SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &path).unwrap();
    assert!(reader.state().finished);
    assert_eq!(
        reader.state().attempted,
        core.series().publication_status().unwrap().attempted
    );
    assert_eq!(reader.state().watermark, reader.state().attempted);
}

#[cfg(windows)]
mod core_recording_process {
    use super::*;
    use vantare_ipc::Subscriber;

    fn powershell(script: &str) -> String {
        use std::os::windows::process::CommandExt;
        let output = Command::new("pwsh")
            .args(["-NoProfile", "-Command", script])
            .creation_flags(0x0800_0000)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).unwrap()
    }

    struct Running(Child);
    impl Drop for Running {
        fn drop(&mut self) {
            if self.0.try_wait().unwrap().is_none() {
                self.0.kill().unwrap();
                self.0.wait().unwrap();
            }
        }
    }

    fn spawn(dir: Option<&Path>) -> (Running, Subscriber, u32) {
        use std::os::windows::process::CommandExt;
        let helper = Path::new(env!("CARGO_BIN_EXE_vantare-storage"));
        let core = helper.with_file_name("vantare-core.exe");
        assert!(
            core.exists(),
            "el gate debe preparar runtime y storage juntos"
        );
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../testdata/rust-port/lmu47-high-rate-60s.tar.gz");
        let pipe = format!(
            "series-g3-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let mut command = Command::new(core);
        command.arg("--replay").arg(fixture).args(["--pipe", &pipe]);
        if let Some(dir) = dir {
            command.arg("--series-dir").arg(dir);
        }
        let child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .creation_flags(0x0800_0000)
            .spawn()
            .unwrap();
        let running = Running(child);
        let mut subscriber = Subscriber::connect(&pipe, |_| true).unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        while subscriber.next(Duration::from_millis(100)).is_none() {
            assert!(Instant::now() < deadline, "Core no publica");
            std::thread::sleep(Duration::from_millis(10));
        }
        let pid = if dir.is_some() {
            let script = format!(
                "$p = Get-CimInstance Win32_Process -Filter 'ParentProcessId = {}' | Where-Object Name -eq 'vantare-storage.exe'; if (@($p).Count -ne 1) {{ exit 1 }}; $p.ProcessId",
                running.0.id()
            );
            powershell(&script).trim().parse().unwrap()
        } else {
            0
        };
        if let Some(directory) = dir {
            // Publicación del nombre final = esquema inicial confirmado y cerrado.
            // Esta barrera solo pertenece al test, nunca a adquisición.
            let deadline = Instant::now() + Duration::from_secs(10);
            while !std::fs::read_dir(directory).unwrap().any(|entry| {
                entry
                    .unwrap()
                    .path()
                    .extension()
                    .is_some_and(|ext| ext == "duckdb")
            }) {
                assert!(Instant::now() < deadline, "helper no creó la DB");
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        (running, subscriber, pid)
    }

    fn exited(pid: u32) {
        powershell(&format!(
            "$p = Get-Process -Id {pid} -ErrorAction SilentlyContinue; if ($p) {{ if (-not $p.WaitForExit(10000)) {{ Stop-Process -Id {pid} -Force; exit 1 }} }}; exit 0"
        ));
    }

    #[test]
    fn killing_core_closes_helper_stdin_and_leaves_no_orphan() {
        let db = Database::new();
        let (mut core, _subscriber, helper) = spawn(Some(db.0.parent().unwrap()));
        core.0.kill().unwrap();
        core.0.wait().unwrap();
        exited(helper);
        let path = std::fs::read_dir(db.0.parent().unwrap())
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| p.extension().is_some_and(|e| e == "duckdb"))
            .unwrap();
        let reader =
            SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &path).unwrap();
        assert!(!reader.state().finished);
    }

    #[test]
    fn writer_crash_does_not_stop_core_and_eof_still_stops_core_cleanly() {
        let db = Database::new();
        let (mut core, mut subscriber, helper) = spawn(Some(db.0.parent().unwrap()));
        powershell(&format!("Stop-Process -Id {helper} -Force"));
        exited(helper);
        assert!(core.0.try_wait().unwrap().is_none());
        let before = subscriber.next(Duration::from_secs(5)).unwrap().sequence;
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if subscriber
                .next(Duration::from_millis(100))
                .is_some_and(|photo| photo.sequence > before)
            {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "fotos detenidas tras caída del writer"
            );
        }
        drop(core.0.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            if let Some(status) = core.0.try_wait().unwrap() {
                assert!(status.success());
                break;
            }
            assert!(Instant::now() < deadline, "Core no cerró");
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn replay_recording_finishes_and_without_flag_does_not_create_database() {
        for enabled in [false, true] {
            let db = Database::new();
            let dir = db.0.parent().unwrap();
            let (mut core, _subscriber, helper) = spawn(enabled.then_some(dir));
            drop(core.0.stdin.take());
            let deadline = Instant::now() + Duration::from_secs(3);
            loop {
                if let Some(status) = core.0.try_wait().unwrap() {
                    assert!(status.success());
                    break;
                }
                assert!(Instant::now() < deadline);
                std::thread::sleep(Duration::from_millis(10));
            }
            if enabled {
                exited(helper);
                let path = std::fs::read_dir(dir)
                    .unwrap()
                    .map(|e| e.unwrap().path())
                    .find(|p| p.extension().is_some_and(|e| e == "duckdb"))
                    .unwrap();
                let reader =
                    SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &path)
                        .unwrap();
                assert!(reader.state().finished);
                assert!(reader.state().watermark > 0);
                assert!(reader.state().attempted >= reader.state().watermark);
            } else {
                assert_eq!(std::fs::read_dir(dir).unwrap().count(), 0);
            }
        }
    }
}

#[test]
fn new_writer_timeout_after_ack_reaps_child_and_keeps_unfinished_prefix() {
    let db = Database::new();
    let (sender, receiver) = mpsc::sync_channel(1);
    let worker = SeriesWorker::start_new(
        Path::new(env!("CARGO_BIN_EXE_vantare-storage")),
        &db.0,
        receiver,
    )
    .unwrap();
    sender
        .send(SeriesChunk::from_bytes(&serde_json::to_vec(&payload()).unwrap()).unwrap())
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while worker.watermark() != 1 {
        assert!(!worker.failed());
        assert!(Instant::now() < deadline);
        std::thread::yield_now();
    }
    assert_eq!(
        worker.finish(1, Duration::ZERO).unwrap_err().kind(),
        std::io::ErrorKind::TimedOut
    );
    drop(sender);
    let reader =
        SeriesReader::open(Path::new(env!("CARGO_BIN_EXE_vantare-storage")), &db.0).unwrap();
    assert_eq!(reader.state().watermark, 1);
    assert!(!reader.state().finished);
}

#[test]
fn missing_helper_or_invalid_directory_degrades_without_stopping_photos() {
    use std::sync::atomic::AtomicBool;
    let db = Database::new();
    for directory in [
        db.0.parent().unwrap().join("missing-helper"),
        db.0.clone(),
        db.0.join("child"),
    ] {
        std::fs::write(&db.0, b"occupied").unwrap();
        let mut core = Core::new(1);
        let recording = vantare_runtime::service::SeriesRecording::start(
            &mut core,
            Some(&directory),
            1,
            || Ok(PathBuf::from("nonexistent-storage-helper.exe")),
        );
        assert!(
            vantare_runtime::service::drive_core_recorded(
                &mut core,
                &mut vantare_runtime::adapter::open_replay(
                    &Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata/lmu-fixture.bin"),
                    Some("1.3.0.0")
                )
                .unwrap(),
                1.0,
                &AtomicBool::new(true),
                None,
                recording,
                |_| Ok(())
            )
            .is_ok()
        );
        acquire(&mut core, 128);
        assert_eq!(core.snapshot().sequence, 129);
    }
}

fn session_open() -> Value {
    json!(["session-open", {"epoch":1,"session":3,"kind":"practice","kindText":"",
        "trackName":"Le Mans","vehicle":"Porsche","className":"LMGT3","startedAtMs":1000}])
}

fn session_close() -> Value {
    json!(["session-close", {"epoch":1,"session":3,"endedAtMs":2000,"simElapsedS":null,
        "finalPosition":null,"finalClassPosition":null,"lapsCompleted":1,"bestLapMs":null,
        "endReason":"coreStopped"}])
}

fn lap_time() -> Value {
    json!(["lap", {"epoch":1,"session":3,"car":7,"lap":0,"officialMs":112_000,
        "sectorMs":[31200,47810,32990]}])
}

fn exchange(process: &mut Process, command: &Value, expected: &Value) {
    process.send(command);
    assert_eq!(&process.response(), expected);
}

#[test]
fn session_events_are_idempotent_and_sealing_prevents_every_new_write() {
    let db = Database::new();
    let mut owner = Process::start_mode(&db.0, Some("--create"));
    assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
    exchange(&mut owner, &lap_time(), &json!(["rejected", "missing"]));
    exchange(
        &mut owner,
        &session_close(),
        &json!(["rejected", "missing"]),
    );
    for _ in 0..2 {
        exchange(
            &mut owner,
            &session_open(),
            &json!(["ack-session", "open", 1, 3]),
        );
        exchange(&mut owner, &lap_time(), &json!(["ack-lap", 1, 3, 7, 0]));
    }
    let mut conflict = session_open();
    conflict[1]["vehicle"] = "changed".into();
    exchange(&mut owner, &conflict, &json!(["rejected", "conflict"]));
    let mut lap_conflict = lap_time();
    lap_conflict[1]["officialMs"] = Value::Null;
    exchange(&mut owner, &lap_conflict, &json!(["rejected", "conflict"]));
    let mut sector_conflict = lap_time();
    sector_conflict[1]["sectorMs"] = json!([1, 2, 3]);
    exchange(
        &mut owner,
        &sector_conflict,
        &json!(["rejected", "conflict"]),
    );
    for _ in 0..2 {
        exchange(
            &mut owner,
            &session_close(),
            &json!(["ack-session", "close", 1, 3]),
        );
    }
    exchange(
        &mut owner,
        &session_open(),
        &json!(["ack-session", "open", 1, 3]),
    );
    exchange(&mut owner, &lap_time(), &json!(["ack-lap", 1, 3, 7, 0]));
    exchange(&mut owner, &lap_conflict, &json!(["rejected", "sealed"]));
    let mut next = lap_time();
    next[1]["lap"] = 1.into();
    exchange(&mut owner, &next, &json!(["rejected", "sealed"]));
    let mut changed = session_close();
    changed[1]["bestLapMs"] = 112_000.into();
    exchange(&mut owner, &changed, &json!(["rejected", "sealed"]));
    owner.send(&json!(["stop"]));
    assert!(owner.child.wait().unwrap().success());
    let mut reader = Process::start_mode(&db.0, Some("--read-only"));
    assert_eq!(reader.response(), json!(["ready", 0, false, 0]));
    reader.send(&json!(["session-summaries"]));
    let sessions = reader.response();
    assert_eq!(sessions[0], "session-summaries");
    assert_eq!(sessions[1], "series-session.v1");
    assert_eq!(sessions[2], 1);
    let mut expected = session_open()[1].clone();
    for (key, value) in session_close()[1].as_object().unwrap() {
        expected[key] = value.clone();
    }
    expected["sealed"] = true.into();
    assert_eq!(sessions[3], json!([expected]));
    exchange(
        &mut reader,
        &json!(["lap-times", 1, 3]),
        &json!(["lap-times", "series-laps.v1", 1, [lap_time()[1]]]),
    );
}

#[test]
fn session_metadata_survives_kill_wal_read_only_and_resume_with_chunks() {
    for sealed in [false, true] {
        let db = Database::new();
        {
            let mut owner = Process::start_mode(&db.0, Some("--create"));
            assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
            exchange(
                &mut owner,
                &session_open(),
                &json!(["ack-session", "open", 1, 3]),
            );
            let mut lap = lap_time();
            lap[1]["officialMs"] = Value::Null;
            lap[1]["sectorMs"] = Value::Null;
            exchange(&mut owner, &lap, &json!(["ack-lap", 1, 3, 7, 0]));
            if sealed {
                exchange(
                    &mut owner,
                    &session_close(),
                    &json!(["ack-session", "close", 1, 3]),
                );
            }
            assert!(db.0.with_extension("duckdb.wal").exists());
            owner.child.kill().unwrap();
            owner.child.wait().unwrap();
        }
        let original = std::fs::read(&db.0).unwrap();
        let wal = std::fs::read(db.0.with_extension("duckdb.wal")).unwrap();
        {
            let mut reader = Process::start_mode(&db.0, Some("--read-only"));
            assert_eq!(reader.response(), json!(["ready", 0, false, 0]));
            reader.send(&json!(["session-summaries"]));
            let summary = reader.response();
            assert_eq!(summary[3][0]["sealed"], sealed);
            assert_eq!(
                summary[3][0]["endedAtMs"],
                if sealed { json!(2000) } else { Value::Null }
            );
            assert_eq!(summary[3][0]["bestLapMs"], Value::Null);
            reader.send(&json!(["lap-times", 1, 3]));
            let laps = reader.response();
            assert_eq!(laps[3][0]["officialMs"], Value::Null);
            assert_eq!(laps[3][0]["sectorMs"], Value::Null);
            reader.send(&json!(["stop"]));
            assert!(reader.child.wait().unwrap().success());
        }
        assert_eq!(std::fs::read(&db.0).unwrap(), original);
        assert_eq!(
            std::fs::read(db.0.with_extension("duckdb.wal")).unwrap(),
            wal
        );
        let mut resumed = Process::start_mode(&db.0, Some("--resume"));
        assert_eq!(resumed.response(), json!(["ready", 0, false, 0]));
        exchange(
            &mut resumed,
            &session_open(),
            &json!(["ack-session", "open", 1, 3]),
        );
        exchange(
            &mut resumed,
            &json!(["append", payload()]),
            &json!(["ack", 1]),
        );
        exchange(
            &mut resumed,
            &json!(["page", 0, 16]),
            &json!(["page", [payload()]]),
        );
    }
}

#[test]
fn v1_metadata_is_unsupported_without_stopping_or_migrating_the_helper() {
    let db = Database::new();
    {
        let connection = duckdb::Connection::open(&db.0).unwrap();
        connection.execute_batch("CREATE TABLE series_meta(singleton BOOLEAN, schema_version VARCHAR, watermark UBIGINT, finished BOOLEAN, attempted UBIGINT); INSERT INTO series_meta VALUES(true,'vantare.series-db.v1',0,false,0); CREATE TABLE series_chunks(idx UBIGINT PRIMARY KEY,payload BLOB);").unwrap();
    }
    for mode in ["--resume", "--read-only"] {
        let mut process = Process::start_mode(&db.0, Some(mode));
        assert_eq!(process.response(), json!(["ready", 0, false, 0]));
        for command in [
            session_open(),
            lap_time(),
            session_close(),
            json!(["session-summaries"]),
            json!(["lap-times", 1, 3]),
            json!(["lap-times", 1, 3, null, 256]),
        ] {
            exchange(&mut process, &command, &json!(["unsupported", "meta"]));
        }
        exchange(
            &mut process,
            &json!(["status"]),
            &json!(["status", 0, false, 0]),
        );
        process.send(&json!(["stop"]));
        assert!(process.child.wait().unwrap().success());
    }
    let connection = duckdb::Connection::open(&db.0).unwrap();
    let tables: u64 = connection.query_row("SELECT count(*) FROM information_schema.tables WHERE table_name IN ('session_summaries','lap_times')",[],|row|row.get(0)).unwrap();
    assert_eq!(tables, 0);
    drop(connection);
    let mut process = Process::start_mode(&db.0, Some("--resume"));
    assert_eq!(process.response(), json!(["ready", 0, false, 0]));
    exchange(
        &mut process,
        &json!(["append", payload()]),
        &json!(["ack", 1]),
    );
    exchange(
        &mut process,
        &json!(["page", 0, 16]),
        &json!(["page", [payload()]]),
    );
    process.send(&json!(["finish", 1]));
    assert_eq!(process.response(), json!(["finished", 1, true, 1]));
    process.send(&json!(["stop"]));
    assert!(process.child.wait().unwrap().success());
    let mut reader = Process::start_mode(&db.0, Some("--read-only"));
    assert_eq!(reader.response(), json!(["ready", 1, true, 1]));
    reader.send(&json!(["summaries"]));
    let summaries = reader.response();
    assert_eq!(summaries[0], "summaries");
    assert_eq!(summaries[1], "series-summary.v1");
    assert_eq!(summaries[2], 1);
    reader.send(&json!(["plot-page", 0, 16]));
    let plotted = reader.response();
    assert_eq!(plotted[0], "plot-page");
    assert_eq!(plotted[1], "series-plot.v1");
    assert_eq!(plotted[2].as_array().unwrap().len(), 1);
    assert_eq!(plotted[2][0]["index"], 1);
}

#[test]
fn metadata_invalid_fields_and_frame_limits_never_receive_an_ack() {
    for (field, invalid) in [
        ("trackName", json!("x".repeat(257))),
        ("kind", json!("future")),
        ("startedAtMs", json!(-1)),
        ("extra", json!(true)),
    ] {
        let db = Database::new();
        let mut owner = Process::start_mode(&db.0, Some("--create"));
        assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
        let mut event = session_open();
        event[1][field] = invalid;
        exchange(&mut owner, &event, &json!(["rejected", "invalid"]));
        exchange(
            &mut owner,
            &json!(["session-summaries"]),
            &json!(["session-summaries", "series-session.v1", 0, []]),
        );
        exchange(
            &mut owner,
            &session_open(),
            &json!(["ack-session", "open", 1, 3]),
        );
        let mut invalid_lap = lap_time();
        invalid_lap[1]["sectorMs"] = json!([null]);
        exchange(&mut owner, &invalid_lap, &json!(["rejected", "invalid"]));
        exchange(&mut owner, &lap_time(), &json!(["ack-lap", 1, 3, 7, 0]));
        let mut invalid_close = session_close();
        invalid_close[1]["endReason"] = json!("invalid");
        exchange(&mut owner, &invalid_close, &json!(["rejected", "invalid"]));
        exchange(
            &mut owner,
            &session_close(),
            &json!(["ack-session", "close", 1, 3]),
        );
    }
    let db = Database::new();
    let mut owner = Process::start_mode(&db.0, Some("--create"));
    assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
    let mut event = session_open();
    event[1]["trackName"] = "é".repeat(128).into();
    exchange(&mut owner, &event, &json!(["ack-session", "open", 1, 3]));
    // The existing transport cap applies before parsing every command, including metadata.
    let mut oversized = vec![b' '; 32768 + 129];
    oversized.push(b'\n');
    if let Err(error) = owner.input.write_all(&oversized) {
        assert_eq!(error.kind(), std::io::ErrorKind::BrokenPipe);
    }
    let mut line = String::new();
    assert_eq!(owner.output.read_line(&mut line).unwrap(), 0);
    assert!(!owner.child.wait().unwrap().success());
}

#[test]
fn metadata_round_trips_full_unsigned_keys_results_and_distinct_session_car_lap_keys() {
    let db = Database::new();
    let mut owner = Process::start_mode(&db.0, Some("--create"));
    assert_eq!(owner.response(), json!(["ready", 0, false, 0]));
    let mut opened = session_open();
    opened[1]["epoch"] = u64::MAX.into();
    opened[1]["session"] = u64::MAX.into();
    opened[1]["startedAtMs"] = u64::MAX.into();
    exchange(
        &mut owner,
        &opened,
        &json!(["ack-session", "open", u64::MAX, u64::MAX]),
    );
    let mut lap = lap_time();
    lap[1]["epoch"] = u64::MAX.into();
    lap[1]["session"] = u64::MAX.into();
    lap[1]["car"] = u32::MAX.into();
    lap[1]["lap"] = u32::MAX.into();
    lap[1]["officialMs"] = u32::MAX.into();
    lap[1]["sectorMs"] = json!(vec![u32::MAX; 16]);
    exchange(
        &mut owner,
        &lap,
        &json!(["ack-lap", u64::MAX, u64::MAX, u32::MAX, u32::MAX]),
    );
    let mut closed = session_close();
    closed[1]["epoch"] = u64::MAX.into();
    closed[1]["session"] = u64::MAX.into();
    closed[1]["endedAtMs"] = u64::MAX.into();
    closed[1]["simElapsedS"] = json!(0);
    for field in [
        "finalPosition",
        "finalClassPosition",
        "lapsCompleted",
        "bestLapMs",
    ] {
        closed[1][field] = u32::MAX.into();
    }
    closed[1]["endReason"] = "sessionChanged".into();
    for _ in 0..2 {
        exchange(
            &mut owner,
            &closed,
            &json!(["ack-session", "close", u64::MAX, u64::MAX]),
        );
    }
    exchange(
        &mut owner,
        &session_open(),
        &json!(["ack-session", "open", 1, 3]),
    );
    for (car, number) in [(7, 0), (8, 0), (7, 1)] {
        let mut event = lap_time();
        event[1]["car"] = car.into();
        event[1]["lap"] = number.into();
        exchange(&mut owner, &event, &json!(["ack-lap", 1, 3, car, number]));
    }
    owner.send(&json!(["stop"]));
    assert!(owner.child.wait().unwrap().success());
    let mut reader = Process::start_mode(&db.0, Some("--read-only"));
    assert_eq!(reader.response(), json!(["ready", 0, false, 0]));
    reader.send(&json!(["session-summaries"]));
    let sessions = reader.response();
    assert_eq!(sessions[2], 2);
    let result = &sessions[3][0];
    for key in ["epoch", "session", "startedAtMs", "endedAtMs"] {
        assert_eq!(result[key], u64::MAX);
    }
    for key in [
        "finalPosition",
        "finalClassPosition",
        "lapsCompleted",
        "bestLapMs",
    ] {
        assert_eq!(result[key], u32::MAX);
    }
    assert_eq!(result["simElapsedS"], 0.0);
    exchange(
        &mut reader,
        &json!(["lap-times", u64::MAX, u64::MAX]),
        &json!(["lap-times", "series-laps.v1", 1, [lap[1]]]),
    );
    reader.send(&json!(["lap-times", 1, 3]));
    assert_eq!(reader.response()[2], 3);
}

#[test]
fn read_only_metadata_write_is_rejected_without_changing_the_file() {
    let db = Database::new();
    {
        let mut writer = Process::start_mode(&db.0, Some("--create"));
        assert_eq!(writer.response(), json!(["ready", 0, false, 0]));
        exchange(
            &mut writer,
            &session_open(),
            &json!(["ack-session", "open", 1, 3]),
        );
        writer.send(&json!(["stop"]));
        assert!(writer.child.wait().unwrap().success());
    }
    let original = std::fs::read(&db.0).unwrap();
    let mut reader = Process::start_mode(&db.0, Some("--read-only"));
    assert_eq!(reader.response(), json!(["ready", 0, false, 0]));
    reader.send(&session_close());
    let mut line = String::new();
    assert_eq!(reader.output.read_line(&mut line).unwrap(), 0);
    assert!(!reader.child.wait().unwrap().success());
    assert_eq!(std::fs::read(&db.0).unwrap(), original);
}
