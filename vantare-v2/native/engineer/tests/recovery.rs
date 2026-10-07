//! Observaciones sintéticas explícitas; procesos reales y checkpoints reales.
#![allow(clippy::unwrap_used)] // Solo helpers del banco; producción sigue prohibiéndolo.
use std::fs;
use std::io::{self, Read as _};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use vantare_domain::{Car, CarId, Observation, Player, Quality, State};
use vantare_engineer::{Engineer, load_cursor};
use vantare_runtime::core::Core;
use vantare_runtime::flows::{
    Consumer, Cursor, Delivery, GapReason,
    wire::{self, Frame},
};
mod rights;

struct Files(PathBuf);
impl Files {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "vantare-engineer-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn cursor(&self) -> PathBuf {
        self.0.join("cursor.json")
    }
    fn journal(&self) -> PathBuf {
        self.0.join("events.jsonl")
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        assert!(self.0.is_absolute() && self.0.parent() == Some(std::env::temp_dir().as_path()));
        assert!(
            self.0
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("vantare-engineer-")
        );
        fs::remove_dir_all(&self.0).unwrap();
    }
}

fn photo(tick: u64, in_pits: bool) -> Observation {
    Observation {
        origin: vantare_domain::Origin {
            received_at: Duration::from_millis(tick),
            ..vantare_domain::Origin::default()
        },
        state: State {
            cars: vec![Car {
                id: CarId(7),
                in_pits: Quality::Reliable(in_pits),
                ..Car::default()
            }],
            player: Some(Player {
                car: CarId(7),
                ..Player::default()
            }),
            source_state: vantare_domain::SourceState::Live,
            ..State::default()
        },
    }
}

struct Worker {
    rights: rights::Fixture,
    child: Child,
    input: Option<ChildStdin>,
    hello: Option<Cursor>,
    acknowledgements: Receiver<io::Result<Cursor>>,
    reader: Option<JoinHandle<()>>,
}
impl Worker {
    fn start(files: &Files) -> Self {
        let name = format!("engineer-stream-{}", vantare_services::random_id().unwrap());
        let rights = rights::Fixture::new(&name);
        let mut child = Command::new(env!("CARGO_BIN_EXE_vantare-engineer"))
            .args(["--stream", "--cursor"])
            .arg(files.cursor())
            .args(["--pipe-name", &name, "--core-image"])
            .arg(std::env::current_exe().unwrap())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut output = child.stdout.take().unwrap();
        let (hello_sender, hello_receiver) = mpsc::sync_channel(1);
        let (sender, acknowledgements) = mpsc::sync_channel(1);
        let reader = thread::spawn(move || {
            if hello_sender.send(wire::read_hello(&mut output)).is_err() {
                return;
            }
            loop {
                let ack = wire::read_ack(&mut output);
                let end = ack.is_err();
                if sender.send(ack).is_err() || end {
                    return;
                }
            }
        });
        // Drop mata/espera al hijo incluso si falla el saludo o un deadline.
        let mut worker = Self {
            rights,
            input: child.stdin.take(),
            child,
            hello: None,
            acknowledgements,
            reader: Some(reader),
        };
        worker.hello = hello_receiver
            .recv_timeout(Duration::from_secs(10))
            .unwrap()
            .unwrap();
        worker
    }
    fn send(&mut self, frame: &Frame) -> Cursor {
        wire::write_frame(self.input.as_mut().unwrap(), frame).unwrap();
        self.acknowledgements
            .recv_timeout(Duration::from_secs(10))
            .unwrap()
            .unwrap()
    }
    fn eof(&mut self) {
        drop(self.input.take());
        // El lector ve EOF después de que el proceso termine; el plazo evita
        // colgar la suite si se rompe el contrato de cierre.
        assert!(
            self.acknowledgements
                .recv_timeout(Duration::from_secs(10))
                .unwrap()
                .is_err()
        );
        assert!(self.child.wait().unwrap().success());
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        drop(self.input.take());
        if self.child.try_wait().unwrap().is_none() {
            self.child.kill().unwrap();
        }
        self.child.wait().unwrap();
        if let Some(reader) = self.reader.take() {
            reader.join().unwrap();
        }
    }
}

#[test]
fn engineer_process_restart_recovers_exact_checkpoint_and_deduplicates_redelivery() {
    let files = Files::new();
    let mut core = Core::new(10);
    core.observe(photo(1, false)).unwrap();
    let mut worker = Worker::start(&files);
    assert_eq!(worker.hello, None);
    let baseline = Frame::capture(&core.snapshot(), core.events(), None).unwrap();
    let mut consumer = Consumer::new(worker.send(&baseline));
    core.observe(photo(2, true)).unwrap();
    core.observe(photo(3, false)).unwrap();
    let first = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
    let ack = worker.send(&first);
    assert_eq!(worker.send(&first), ack, "redelivery sin doble avance");
    assert_eq!(load_cursor(&files.cursor()).unwrap(), Some(ack));
    drop(worker); // Muerte del proceso; no se envía ACK al consumidor del servidor.
    let mut worker = Worker::start(&files);
    assert_eq!(worker.hello, Some(ack));
    let mut consumer = Consumer::new(worker.hello.unwrap());
    let second = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
    assert!(matches!(second.delivery, Some(Delivery::Event(event)) if event.cursor.index == 2));
    assert_eq!(worker.send(&second), core.events().tail());
    assert_eq!(
        worker.send(&first),
        core.events().tail(),
        "reentrega atrasada tampoco retrocede"
    );
    worker.eof();
}

#[test]
fn process_recovers_all_durable_events_and_declares_volatile_restart_and_slow_consumer_gaps() {
    let files = Files::new();
    let mut core = Core::with_flows(20, 2, Some(&files.journal())).unwrap();
    core.observe(photo(1, false)).unwrap();
    let mut worker = Worker::start(&files);
    let saved = worker.send(&Frame::capture(&core.snapshot(), core.events(), None).unwrap());
    for tick in 2..=12 {
        core.observe(photo(tick, tick % 2 == 0)).unwrap();
        core.events_mut().persist().unwrap();
    }
    drop(core);
    let mut core = Core::with_flows(21, 2, Some(&files.journal())).unwrap();
    core.observe(photo(1, true)).unwrap();
    let mut consumer = Consumer::new(saved);
    for index in 1..=11 {
        let frame = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
        assert!(
            matches!(frame.delivery, Some(Delivery::Event(event)) if event.cursor.index == index)
        );
        assert_eq!(worker.send(&frame).index, index);
        consumer.ack();
    }
    let boundary = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
    assert!(matches!(
        boundary.delivery,
        Some(Delivery::Gap {
            reason: GapReason::CoreRestart,
            ..
        })
    ));
    let saved = worker.send(&boundary);
    drop(core);
    let mut core = Core::with_flows(22, 2, None).unwrap();
    core.observe(photo(1, false)).unwrap();
    let mut consumer = Consumer::new(saved);
    let gap = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
    assert!(matches!(
        gap.delivery,
        Some(Delivery::Gap {
            reason: GapReason::CoreRestart,
            ..
        })
    ));
    worker.send(&gap);
    consumer.ack();
    // El consumidor no lee mientras el núcleo avanza: la memoria sigue acotada.
    for tick in 2..=100 {
        core.observe(photo(tick, tick % 2 == 0)).unwrap();
    }
    let gap = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
    assert!(matches!(
        gap.delivery,
        Some(Delivery::Gap {
            reason: GapReason::Retention,
            ..
        })
    ));
    assert_eq!(worker.send(&gap), core.events().tail());
    worker.eof();
}

#[test]
fn gaps_rebuild_photo_without_pit_facts_and_failed_checkpoint_never_acks() {
    let files = Files::new();
    let mut core = Core::new(1);
    core.observe(photo(1, true)).unwrap();
    let mut engineer = Engineer::default();
    let baseline = Frame::capture(&core.snapshot(), core.events(), None).unwrap();
    assert!(
        engineer.apply(&baseline, &files.0).is_err(),
        "no se reemplaza un directorio"
    );
    assert_eq!(engineer.cursor(), None);
    assert!(
        engineer
            .apply(&baseline, &files.cursor())
            .unwrap()
            .event
            .is_none()
    );
    let mut core = Core::new(2);
    core.observe(photo(1, false)).unwrap();
    let mut consumer = Consumer::new(engineer.cursor().unwrap());
    let frame = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
    let applied = engineer.apply(&frame, &files.cursor()).unwrap();
    assert_eq!(applied.gap, Some(GapReason::CoreRestart));
    assert!(applied.event.is_none(), "no salida de boxes inventada");
    assert_eq!(engineer.snapshot().unwrap(), &frame.snapshot);
    fs::write(files.cursor(), "corrupto").unwrap();
    assert!(
        Engineer::resume(&files.cursor()).is_err(),
        "sin fallback a cero"
    );
}

#[test]
fn stream_without_rights_is_rejected_before_hello_or_checkpoint() {
    let files = Files::new();
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-engineer"))
        .args(["--stream", "--cursor"])
        .arg(files.cursor())
        .args(["--pipe-name", "engineer-stream-no-rights", "--core-image"])
        .arg(std::env::current_exe().unwrap())
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert!(!output.status.success(), "stream arrancó sin licencia");
    assert!(output.stdout.is_empty(), "no debe emitir ni el saludo");
    assert!(!files.cursor().exists(), "no debe consumir el cursor");
    assert!(String::from_utf8_lossy(&output.stderr).contains("licencia"));
}

#[test]
fn stream_with_signed_rights_emits_radio_and_stops_when_authority_is_lost() {
    let files = Files::new();
    let mut core = Core::new(1);
    let lap = |tick, laps| {
        let mut observation = photo(tick, false);
        observation.state.cars[0].laps = Quality::Reliable(laps);
        observation
    };
    core.observe(lap(1, 0)).unwrap();
    let mut worker = Worker::start(&files);
    let baseline = Frame::capture(&core.snapshot(), core.events(), None).unwrap();
    let mut consumer = Consumer::new(worker.send(&baseline));
    core.observe(lap(2, 1)).unwrap();
    let frame = Frame::capture(&core.snapshot(), core.events(), Some(&mut consumer)).unwrap();
    assert_eq!(worker.send(&frame), core.events().tail());
    drop(worker.rights.host.take());
    assert!(
        worker
            .acknowledgements
            .recv_timeout(Duration::from_secs(10))
            .unwrap()
            .is_err(),
        "sin autoridad el stream debe terminar incluso sin más fotos"
    );
    assert!(!worker.child.wait().unwrap().success());
    let mut presentation = String::new();
    worker
        .child
        .stderr
        .take()
        .unwrap()
        .read_to_string(&mut presentation)
        .unwrap();
    assert!(presentation.contains("laps.completed"), "{presentation}");
    assert!(presentation.contains("licencia"), "{presentation}");
}
