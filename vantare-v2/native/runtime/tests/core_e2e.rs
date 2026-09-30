//! Extremo a extremo: el binario `vantare-core` reproduce una captura real y un
//! `Subscriber` de `ipc` (el mismo que usan los overlays) recibe las fotos por
//! el pipe. Falta la captura = fallo, nunca se omite en silencio.
#![cfg(windows)]
// Ayudantes de test: un `unwrap` que falla es un fallo del test.
#![allow(clippy::unwrap_used)]

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use vantare_domain::{Quality, Snapshot, SourceKind};
use vantare_ipc::Subscriber;
use vantare_runtime::adapter::open_replay;
use vantare_runtime::service;

fn testdata(file: &str) -> PathBuf {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata")
        .join(file);
    assert!(path.exists(), "falta la captura {}", path.display());
    path
}

/// El proceso del núcleo; se mata al soltarlo, también si el test falla.
struct CoreProcess(Child);

impl CoreProcess {
    fn spawn(pipe: &str, replay: &Path, extra: &[&str]) -> Self {
        let child = Command::new(env!("CARGO_BIN_EXE_vantare-core"))
            .arg("--replay")
            .arg(replay)
            .args(extra)
            .args(["--pipe", pipe])
            // Como lo lanza el launcher: cerrar este stdin pide el cierre.
            .stdin(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        Self(child)
    }
}

impl Drop for CoreProcess {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn pipe_name(tag: &str) -> String {
    format!("vantare-e2e-{}-{tag}", std::process::id())
}

/// Lo que llegue por el pipe hasta que `done` lo dé por bastante (o `limit`).
fn collect(
    subscriber: &mut Subscriber,
    limit: Duration,
    done: impl Fn(&[Arc<Snapshot>]) -> bool,
) -> Vec<Arc<Snapshot>> {
    let deadline = Instant::now() + limit;
    let mut got = Vec::new();
    while Instant::now() < deadline && !done(&got) {
        if let Some(snapshot) = subscriber.next(Duration::from_millis(100)) {
            got.push(snapshot);
        }
    }
    got
}

fn assert_one_growing_revision(got: &[Arc<Snapshot>]) {
    let first = &got[0];
    assert_ne!(first.epoch, 0, "la época sale del reloj de pared");
    for pair in got.windows(2) {
        assert_eq!(pair[0].epoch, pair[1].epoch, "una sola época por arranque");
        assert!(pair[0].sequence < pair[1].sequence, "revisión creciente");
    }
}

#[test]
fn the_core_process_emits_and_persists_source_fact_outside_acquisition() {
    use vantare_domain::SourceState;
    use vantare_runtime::flows::{Delivery, FactKind, RecordingStatus, client::EventClient, host};
    struct Recording(PathBuf);
    impl Drop for Recording {
        fn drop(&mut self) {
            if self.0.exists() {
                std::fs::remove_file(&self.0).unwrap();
            }
        }
    }
    let recording = Recording(
        std::env::temp_dir().join(format!("vantare-e2e-events-{}.jsonl", std::process::id())),
    );
    let pipe = pipe_name("events");
    let expected = PathBuf::from(env!("CARGO_BIN_EXE_vantare-core"));
    let client = EventClient::connect(&host::pipe_name(&pipe), None, move |peer| {
        peer.is_image(&expected)
    })
    .unwrap();
    let image = std::env::current_exe().unwrap();
    let mut core = CoreProcess::spawn(
        &pipe,
        &testdata("lmu-fixture.bin"),
        &[
            "--build",
            "1.3.0.0",
            "--velocidad",
            "0.2",
            "--engineer-image",
            image.to_str().unwrap(),
            "--recording",
            recording.0.to_str().unwrap(),
        ],
    );
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut received = false;
    while Instant::now() < deadline {
        let Some(frame) = client.next(Duration::from_millis(100)).unwrap() else {
            continue;
        };
        assert_eq!(frame.recording, RecordingStatus::Active);
        let cursor = match frame.delivery {
            Some(Delivery::Fact(fact)) => {
                assert_eq!(
                    fact.kind,
                    FactKind::SourceChanged {
                        before: SourceState::Live,
                        after: SourceState::Stale
                    }
                );
                assert_eq!(fact.sequence, frame.snapshot.sequence);
                assert_eq!(frame.durable, Some(fact.cursor));
                assert_eq!(frame.snapshot.state.source_state, SourceState::Stale);
                assert_eq!(frame.snapshot.state.cars.len(), 44);
                received = true;
                fact.cursor
            }
            None => frame.tail,
            other => panic!("entrega inesperada: {other:?}"),
        };
        client.ack(cursor).unwrap();
        if received {
            break;
        }
    }
    assert!(received, "hecho productivo de fuente desde captura real");
    drop(client);
    drop(core.0.stdin.take());
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if let Some(status) = core.0.try_wait().unwrap() {
            assert!(status.success());
            break;
        }
        assert!(Instant::now() < deadline, "EOF no cerró dueño I/O");
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(
        std::fs::read(&recording.0).unwrap().starts_with(b"[3,"),
        "hecho v3 realmente confirmado"
    );
}

#[test]
fn the_44_car_fixture_reaches_a_subscriber_fresh_then_stale() {
    let pipe = pipe_name("fixture");
    // El suscriptor va primero: reintenta solo hasta que el núcleo abre el pipe.
    let mut subscriber = Subscriber::connect(&pipe, |_| true).unwrap();
    // A 0,2× el reloj del núcleo va cinco veces más despacio: el límite de silencio
    // de 500 ms de la fuente tarda 2,5 s reales, de sobra para ver la foto fresca.
    let _core = CoreProcess::spawn(
        &pipe,
        &testdata("lmu-fixture.bin"),
        &["--build", "1.3.0.0", "--velocidad", "0.2"],
    );

    let stale =
        |snapshot: &Arc<Snapshot>| matches!(snapshot.state.cars[0].position, Quality::Stale(_));
    let got = collect(&mut subscriber, Duration::from_secs(20), |got| {
        got.last().is_some_and(stale)
    });

    assert!(got.len() >= 2, "llegaron {} fotos", got.len());
    assert_one_growing_revision(&got);
    for snapshot in &got {
        assert_eq!(snapshot.state.cars.len(), 44);
        assert_eq!(snapshot.origin.source.simulator, "lmu");
        assert_eq!(snapshot.origin.source.kind, SourceKind::Replay);
    }
    assert!(
        matches!(got[0].state.cars[0].position, Quality::Reliable(_)),
        "la primera foto es fresca"
    );
    assert!(
        stale(got.last().unwrap()),
        "y la fuente parada acaba obsoleta"
    );
}

#[test]
fn the_47_car_corpus_streams_growing_revisions_in_real_time() {
    let pipe = pipe_name("corpus");
    let mut subscriber = Subscriber::connect(&pipe, |_| true).unwrap();
    let _core = CoreProcess::spawn(
        &pipe,
        &testdata("rust-port/lmu47-high-rate-60s.tar.gz"),
        &["--velocidad", "4"],
    );

    let got = collect(&mut subscriber, Duration::from_secs(30), |got| {
        got.len() >= 30
    });

    assert!(got.len() >= 30, "llegaron {} fotos", got.len());
    assert_one_growing_revision(&got);
    for snapshot in &got {
        assert_eq!(snapshot.state.cars.len(), 47);
    }
    let elapsed = got
        .last()
        .unwrap()
        .origin
        .received_at
        .saturating_sub(got[0].origin.received_at);
    assert!(
        elapsed > Duration::from_millis(100),
        "las marcas del corpus avanzan: {elapsed:?}"
    );
}

#[test]
fn the_core_process_exits_in_order_when_its_stdin_reaches_eof() {
    let pipe = pipe_name("stdin");
    let mut subscriber = Subscriber::connect(&pipe, |_| true).unwrap();
    let mut core = CoreProcess::spawn(&pipe, &testdata("lmu-fixture.bin"), &["--build", "1.3.0.0"]);
    let got = collect(&mut subscriber, Duration::from_secs(10), |got| {
        !got.is_empty()
    });
    assert_eq!(got[0].state.cars.len(), 44);
    assert!(
        core.0.try_wait().unwrap().is_none(),
        "sigue vivo mientras stdin está abierto"
    );

    let asked = Instant::now();
    drop(core.0.stdin.take());
    let status = loop {
        if let Some(status) = core.0.try_wait().unwrap() {
            break status;
        }
        assert!(
            asked.elapsed() < Duration::from_secs(3),
            "no terminó tras el EOF"
        );
        std::thread::sleep(Duration::from_millis(10));
    };
    // Código 0: salida ordenada, no el corte por plazo (que sale con 1).
    assert!(status.success(), "{status}");
}

#[test]
fn the_service_shuts_down_in_order_when_asked() {
    let pipe = pipe_name("shutdown");
    let mut replay = open_replay(&testdata("lmu-fixture.bin"), Some("1.3.0.0")).unwrap();
    let stop = Arc::new(AtomicBool::new(false));
    let server = {
        let (pipe, stop) = (pipe.clone(), Arc::clone(&stop));
        std::thread::spawn(move || service::run(&mut replay, &pipe, 1, 1.0, &stop))
    };
    let mut subscriber = Subscriber::connect(&pipe, |_| true).unwrap();
    let got = collect(&mut subscriber, Duration::from_secs(10), |got| {
        !got.is_empty()
    });
    assert_eq!(got[0].state.cars.len(), 44);

    let asked = Instant::now();
    stop.store(true, Ordering::SeqCst);
    server.join().unwrap().unwrap();
    assert!(
        asked.elapsed() < Duration::from_secs(3),
        "{:?}",
        asked.elapsed()
    );

    // Cerrado del todo: el nombre del pipe vuelve a estar libre.
    let mut replay = open_replay(&testdata("lmu-fixture.bin"), Some("1.3.0.0")).unwrap();
    stop.store(true, Ordering::SeqCst);
    service::run(&mut replay, &pipe, 2, 1.0, &stop).unwrap();
}
