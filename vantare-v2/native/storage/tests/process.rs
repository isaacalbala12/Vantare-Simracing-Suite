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
        let mut child = Command::new(env!("CARGO_BIN_EXE_vantare-storage"))
            .arg(path)
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
    assert!(!pending.is_empty());
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
    let worker = SeriesWorker::start(
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

// Proceso fixture controlado por el test padre: permite cortar exactamente
// después de crear el archivo del motor y antes de crear series_meta.
#[test]
#[ignore = "fixture hija de interrupted_creation_before_series_meta"]
fn partial_creation_fixture() {
    let path = std::env::var_os("VANTARE_PARTIAL_CREATION_DB").unwrap();
    let connection = duckdb::Connection::open(Path::new(&path)).unwrap();
    connection.execute_batch("CHECKPOINT").unwrap();
    println!("creation-before-series-meta");
    std::io::stdout().flush().unwrap();
    let mut line = String::new();
    std::io::stdin().read_line(&mut line).unwrap();
    drop(connection);
}

#[test]
fn interrupted_creation_before_series_meta_is_preserved_and_cannot_resume() {
    let db = Database::new();
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--ignored",
            "--exact",
            "partial_creation_fixture",
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
        if line.trim().ends_with("creation-before-series-meta") {
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
