//! Procesos y named pipe reales, publicador sintético no autorizado como Core.
#![cfg(windows)]
#![allow(clippy::unwrap_used)]
use std::io::{self, BufRead, BufReader, Read};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use vantare_domain::{CarId, Player, Quality, Snapshot};

struct Process {
    child: Child,
    input: Option<ChildStdin>,
    lines: mpsc::Receiver<io::Result<Option<serde_json::Value>>>,
    reader: Option<JoinHandle<()>>,
}
impl Process {
    fn start(name: &str) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_vantare-engineer"))
            .args(["--pipe", "--pipe-name", name])
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
    }
}

#[test]
fn pipe_worker_closes_on_eof_while_core_is_absent() {
    let name = format!("vantare-engineer-absent-{}", std::process::id());
    let mut worker = Process::start(&name);
    let status = worker.next().unwrap();
    assert_eq!(status["events"], "unavailable");
    assert_eq!(status["spotter"], "unavailable_opponent_velocity");
    worker.eof();
}

#[test]
fn pipe_worker_rejects_the_wrong_server_image_and_still_closes() {
    let name = format!("vantare-engineer-impostor-{}", std::process::id());
    let (sender, receiver) = mpsc::sync_channel(1);
    let mut publisher = vantare_ipc::Publisher::new(&name, move |peer| {
        let _ = sender.try_send(peer.pid); // Notificación acotada, no frena IPC.
        true
    })
    .unwrap();
    let mut snapshot = Snapshot {
        epoch: 1,
        sequence: 1,
        ..Snapshot::default()
    };
    snapshot.state.player = Some(Player {
        car: CarId(7),
        ..Player::default()
    });
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(1.0);
    publisher.publish(Arc::new(snapshot)).unwrap();
    let mut worker = Process::start(&name);
    assert_eq!(worker.next().unwrap()["events"], "unavailable");
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
