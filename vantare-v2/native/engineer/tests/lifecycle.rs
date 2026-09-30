//! Procesos y named pipe reales, publicador sintético no autorizado como Core.
#![cfg(windows)]
#![allow(clippy::unwrap_used)]
use std::io::{self, BufRead, BufReader, Read};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use vantare_runtime::flows::host::{EventHost, pipe_name};

struct Process {
    child: Child,
    input: Option<ChildStdin>,
    lines: mpsc::Receiver<io::Result<Option<serde_json::Value>>>,
    reader: Option<JoinHandle<()>>,
    checkpoint: std::path::PathBuf,
}
impl Process {
    fn settings(&self) -> std::path::PathBuf {
        self.checkpoint
            .with_extension("settings")
            .join("engineer.json")
    }
    fn status(
        &self,
        step: &str,
        predicate: impl Fn(&vantare_engineer::control::Status) -> bool,
    ) -> vantare_engineer::control::Status {
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut last = None;
        loop {
            let path = vantare_engineer::control::status_path(&self.settings());
            if let Ok(Some(bytes)) = vantare_engineer::control::read(&path)
                && let Ok(status) = vantare_engineer::control::Status::parse(&bytes)
            {
                if predicate(&status) {
                    return status;
                }
                last = Some(status);
            }
            assert!(
                std::time::Instant::now() < deadline,
                "plazo de estado local: {step}; último estado: {last:?}"
            );
            // Sondeo de un proceso real: esperar la confirmación, no fingir aplicación.
            thread::sleep(Duration::from_millis(10));
        }
    }
    fn start(name: &str) -> Self {
        Self::start_as(name, None)
    }
    fn start_as(name: &str, core: Option<&std::path::Path>) -> Self {
        let checkpoint = std::env::temp_dir().join(format!("{name}-cursor.json"));
        let mut command = Command::new(env!("CARGO_BIN_EXE_vantare-engineer"));
        command
            .args(["--pipe", "--pipe-name", name, "--cursor"])
            .arg(&checkpoint)
            .arg("--settings")
            .arg(checkpoint.with_extension("settings").join("engineer.json"));
        if let Some(core) = core {
            command.arg("--core-image").arg(core);
        }
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let output = child.stdout.take().unwrap();
        let (sender, lines) = mpsc::channel();
        let reader = thread::spawn(move || {
            let mut output = BufReader::new(output);
            loop {
                let mut line = String::new();
                // También acotar el lector del test si el proceso se equivoca.
                let result = match output.by_ref().take(8192).read_line(&mut line) {
                    Ok(0) => Ok(None),
                    Ok(_) if line.ends_with('\n') => serde_json::from_str(&line)
                        .map(Some)
                        .map_err(io::Error::other),
                    Ok(_) => Err(io::Error::from(io::ErrorKind::InvalidData)),
                    Err(error) => Err(error),
                };
                let end = !matches!(result, Ok(Some(_)));
                if sender.send(result).is_err() || end {
                    return;
                }
            }
        });
        Self {
            input: child.stdin.take(),
            child,
            lines,
            reader: Some(reader),
            checkpoint,
        }
    }
    fn next(&self) -> Option<serde_json::Value> {
        self.lines
            .recv_timeout(Duration::from_secs(10))
            .unwrap()
            .unwrap()
    }
    fn eof(&mut self) {
        drop(self.input.take());
        assert!(self.next().is_none());
        assert!(self.child.wait().unwrap().success());
    }
}
impl Drop for Process {
    fn drop(&mut self) {
        drop(self.input.take());
        if self.child.try_wait().unwrap().is_none() {
            self.child.kill().unwrap();
        }
        self.child.wait().unwrap();
        if let Some(reader) = self.reader.take() {
            reader.join().unwrap();
        }
        let directory = self.checkpoint.with_extension("settings");
        if directory.exists() {
            for name in [
                "engineer-status.json",
                "engineer-status.json.lock",
                "engineer.json",
                "engineer.json.lock",
            ] {
                let path = directory.join(name);
                if path.exists() {
                    std::fs::remove_file(path).unwrap();
                }
            }
            std::fs::remove_dir(directory).unwrap();
        }
        if self.checkpoint.exists() {
            std::fs::remove_file(&self.checkpoint).unwrap();
        }
    }
}

#[test]
fn engineer_process_consumes_productive_facts_checkpoint_and_lap_radio_over_real_pipe() {
    use std::sync::Arc;
    use vantare_domain::{Car, CarId, Observation, Player, Quality, State};
    use vantare_runtime::{core::Core, flows::Cursor};
    let name = format!("vantare-engineer-authorized-{}", std::process::id());
    let expected = std::path::PathBuf::from(env!("CARGO_BIN_EXE_vantare-engineer"));
    let mut host = EventHost::start(&pipe_name(&name), 1, None, move |peer| {
        peer.is_image(&expected)
    })
    .unwrap();
    let mut core = Core::with_event_base(host.base()).unwrap();
    let observation = |tick, lap| Observation {
        origin: vantare_domain::Origin {
            received_at: Duration::from_millis(tick),
            ..vantare_domain::Origin::default()
        },
        state: State {
            cars: vec![Car {
                id: CarId(7),
                laps: Quality::Reliable(lap),
                ..Car::default()
            }],
            player: Some(Player {
                car: CarId(7),
                ..Player::default()
            }),
            source_state: vantare_domain::SourceState::Live,
            ..State::default()
        },
    };
    core.observe(observation(1, 0)).unwrap();
    host.publish(Arc::clone(&core.snapshot()), core.events());
    let mut worker = Process::start_as(&name, Some(&std::env::current_exe().unwrap()));
    assert_eq!(worker.next().unwrap()["events"], "connecting");
    assert_eq!(worker.next().unwrap()["clear"], true); // Base inicial, ya checkpointada.
    assert_eq!(
        vantare_engineer::load_cursor(&worker.checkpoint).unwrap(),
        Some(Cursor { epoch: 1, index: 0 })
    );
    core.observe(observation(2, 1)).unwrap();
    host.publish(Arc::clone(&core.snapshot()), core.events());
    let mut lap = false;
    for _ in 0..4 {
        let line = worker.next().unwrap();
        if line["intent"] == "laps.completed" {
            lap = true;
        }
        if line["cursor"] == serde_json::json!([1, 1]) {
            assert!(lap);
            assert_eq!(
                vantare_engineer::load_cursor(&worker.checkpoint).unwrap(),
                Some(core.events().tail())
            );
            break;
        }
    }
    assert!(
        lap,
        "hecho del núcleo llega a presentación sin inferir IPC latest-wins"
    );
    worker.eof();
}

#[test]
fn pipe_worker_closes_on_eof_while_core_is_absent() {
    let name = format!("vantare-engineer-absent-{}", std::process::id());
    let mut worker = Process::start(&name);
    let status = worker.next().unwrap();
    assert_eq!(status["events"], "connecting");
    assert_eq!(status["spotter"], "unavailable_opponent_velocity");
    worker.eof();
}

#[test]
fn real_pipe_process_applies_local_edits_and_invalid_json_keeps_last_valid() {
    use std::sync::Arc;
    use vantare_domain::{Car, CarId, Observation, Player, Quality, State};
    use vantare_engineer::control::{Document, Settings};
    use vantare_runtime::core::Core;
    let name = format!("vantare-engineer-hot-settings-{}", std::process::id());
    let expected = std::path::PathBuf::from(env!("CARGO_BIN_EXE_vantare-engineer"));
    let mut host = EventHost::start(&pipe_name(&name), 1, None, move |peer| {
        peer.is_image(&expected)
    })
    .unwrap();
    let mut core = Core::with_event_base(host.base()).unwrap();
    let observation = |lap| Observation {
        origin: vantare_domain::Origin {
            received_at: Duration::from_millis(u64::from(lap) + 1),
            ..Default::default()
        },
        state: State {
            cars: vec![Car {
                id: CarId(7),
                laps: Quality::Reliable(lap),
                ..Default::default()
            }],
            player: Some(Player {
                car: CarId(7),
                ..Default::default()
            }),
            source_state: vantare_domain::SourceState::Live,
            ..Default::default()
        },
    };
    core.observe(observation(0)).unwrap();
    host.publish(Arc::clone(&core.snapshot()), core.events());
    let mut process = Process::start_as(&name, Some(&std::env::current_exe().unwrap()));
    process.status("inicio", |status| status.active);
    // Los ajustes deben aplicarse también con la foto congelada: pausa/menú.
    process.status("foto congelada", |status| {
        status
            .error
            .as_ref()
            .is_some_and(|error| error.starts_with("fuente ausente/obsoleta"))
    });
    let mut editor = Document::new(process.settings(), Settings::default());
    editor.poll().unwrap();
    let settings = Settings {
        locale: "en".into(),
        ..Default::default()
    };
    editor.save(settings.clone()).unwrap();
    process.status("locale aplicado", |status| status.settings == settings);
    core.observe(observation(1)).unwrap();
    host.publish(Arc::clone(&core.snapshot()), core.events());
    let message = process.status("radio inglesa", |status| {
        status
            .last_message
            .as_ref()
            .is_some_and(|m| m.locale == "en")
    });
    let last_message = message.last_message.unwrap();
    assert_eq!(last_message.text, "Lap completed");
    std::fs::write(process.settings(), b"{").unwrap();
    let invalid = process.status("JSON inválido", |status| {
        status
            .error
            .as_ref()
            .is_some_and(|error| error.starts_with("ajustes:"))
    });
    assert_eq!(invalid.settings, settings);
    let mut next = settings.clone();
    next.enabled = false;
    let bytes = serde_json::to_vec(&next.json()).unwrap();
    vantare_engineer::control::save(&process.settings(), Some(b"{"), &bytes).unwrap();
    process.status("apagado", |status| status.settings == next);
    core.observe(observation(2)).unwrap();
    host.publish(Arc::clone(&core.snapshot()), core.events());
    // El ACK del hecho confirma que el proceso lo consumió con radio apagada.
    loop {
        let line = process.next().unwrap();
        if line["cursor"] == serde_json::json!([1, 2]) {
            break;
        }
    }
    assert_eq!(
        process
            .status("hecho consumido con radio apagada", |status| status
                .settings
                == next)
            .last_message
            .unwrap(),
        last_message
    );
    drop(process.input.take());
    process.status("cierre", |status| !status.active);
    assert!(process.child.wait().unwrap().success());
}

#[test]
fn pipe_worker_rejects_the_wrong_server_image_and_still_closes() {
    let name = format!("vantare-engineer-impostor-{}", std::process::id());
    let (sender, receiver) = mpsc::sync_channel(1);
    let publisher = EventHost::start(&pipe_name(&name), 1, None, move |peer| {
        let _ = sender.try_send(peer.pid); // Notificación acotada, no frena IPC.
        true
    })
    .unwrap();
    let mut worker = Process::start(&name);
    assert_eq!(worker.next().unwrap()["events"], "connecting");
    assert_eq!(
        receiver.recv_timeout(Duration::from_secs(10)).unwrap(),
        worker.child.id()
    );
    assert_eq!(
        receiver.recv_timeout(Duration::from_secs(10)).unwrap(),
        worker.child.id(),
        "reintentar acredita rechazo, no solo una conexión antes de EOF"
    );
    // El publicador existe y hubo conexión; su exe de test no es el Core hermano.
    worker.eof();
    drop(publisher);
}
