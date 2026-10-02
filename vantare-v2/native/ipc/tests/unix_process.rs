//! Identidad del kernel y recuperación después de matar otro proceso de verdad.
#![cfg(unix)]
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::{Arc, mpsc};
use std::time::Duration;
use vantare_domain::Snapshot;
use vantare_ipc::{Publisher, Subscriber};

// RAII también mata al hijo si falla una aserción.
struct ChildGuard(std::process::Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _killed = self.0.kill();
        let _waited = self.0.wait();
    }
}

#[test]
fn unix_child_server() {
    let Ok(name) = std::env::var("VANTARE_IPC_TEST_SOCKET") else {
        return;
    };
    let mut publisher = Publisher::new(&name, |_| true).expect("publicador hijo");
    publisher
        .publish(Arc::new(Snapshot {
            epoch: 1,
            sequence: 1,
            ..Snapshot::default()
        }))
        .expect("foto hijo");
    println!("IPC_READY");
    std::io::stdout().flush().expect("ready");
    let mut line = String::new();
    std::io::stdin()
        .read_line(&mut line)
        .expect("mantener hijo vivo");
}

#[test]
fn kernel_peer_pid_and_image_and_stale_socket_recovery_across_processes() {
    let image = std::env::current_exe().expect("imagen");
    let name = format!("vantare-process-{}", std::process::id());
    let mut child = Command::new(&image)
        .args(["--exact", "unix_child_server", "--nocapture"])
        .env("VANTARE_IPC_TEST_SOCKET", &name)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("hijo");
    let output = child.stdout.take().expect("stdout");
    let mut child = ChildGuard(child);
    let (ready, received) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(output).lines() {
            if line.expect("stdout hijo") == "IPC_READY" {
                ready.send(()).expect("ready");
                break;
            }
        }
    });
    received
        .recv_timeout(Duration::from_secs(10))
        .expect("hijo preparado");
    reader.join().expect("reader");
    let (observed, peers) = mpsc::channel();
    let mut subscriber = Subscriber::connect(&name, move |peer| {
        observed.send(peer.clone()).expect("identidad");
        peer.is_image(&image)
    })
    .expect("suscriptor");
    let snapshot = subscriber.next(Duration::from_secs(10)).expect("foto hijo");
    assert_eq!((snapshot.epoch, snapshot.sequence), (1, 1));
    let peer = peers.recv_timeout(Duration::from_secs(1)).expect("par");
    assert_eq!(peer.pid, child.0.id());
    assert_ne!(peer.pid, std::process::id());
    child.0.kill().expect("muerte abrupta");
    child.0.wait().expect("espera hijo");
    let mut replacement = Publisher::new(&name, |_| true).expect("recuperar socket huérfano");
    replacement
        .publish(Arc::new(Snapshot {
            epoch: 2,
            sequence: 1,
            ..Snapshot::default()
        }))
        .expect("nueva época");
    let snapshot = subscriber
        .next(Duration::from_secs(10))
        .expect("foto tras reconexión");
    assert_eq!((snapshot.epoch, snapshot.sequence), (2, 1));
    assert_eq!(
        peers
            .recv_timeout(Duration::from_secs(1))
            .expect("nuevo par")
            .pid,
        std::process::id()
    );
}
