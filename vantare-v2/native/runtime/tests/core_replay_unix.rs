//! Replay de una captura real por el transporte Unix usado por los overlays.
#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use vantare_domain::{SourceKind, SourceState};
use vantare_ipc::Subscriber;

fn testdata(file: &str) -> PathBuf {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata")
        .join(file);
    assert!(path.exists(), "falta la captura {}", path.display());
    path
}

struct CoreProcess(Child);

impl Drop for CoreProcess {
    fn drop(&mut self) {
        if self.0.try_wait().expect("estado del núcleo").is_none() {
            self.0.kill().expect("terminar núcleo de test");
        }
        self.0.wait().expect("recoger núcleo de test");
    }
}

#[test]
fn replay_process_publishes_real_photos_and_stops_on_stdin_eof() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("reloj del sistema")
        .as_nanos();
    let pipe = format!("vantare-runtime-test-{}-{nonce}", std::process::id());
    let mut subscriber = Subscriber::connect(&pipe, |_| true).expect("suscriptor IPC");
    let child = Command::new(env!("CARGO_BIN_EXE_vantare-core"))
        .args([
            "--replay",
            testdata("lmu-fixture.bin").to_str().expect("ruta UTF-8"),
            "--build",
            "1.3.0.0",
            "--pipe",
            &pipe,
        ])
        .stdin(Stdio::piped())
        .spawn()
        .expect("arrancar vantare-core");
    let mut core = CoreProcess(child);

    let first = subscriber
        .next(Duration::from_secs(10))
        .expect("foto inicial dentro del plazo");
    assert_eq!(first.state.cars.len(), 44);
    assert_eq!(first.origin.source.kind, SourceKind::Replay);
    assert_eq!(first.state.source_state, SourceState::Live);

    let stale = subscriber
        .next(Duration::from_secs(3))
        .expect("foto caducada después de detenerse la captura");
    assert_eq!(stale.state.cars.len(), 44);
    assert_eq!(stale.origin.source.kind, SourceKind::Replay);
    assert_eq!(stale.state.source_state, SourceState::Stale);
    assert!(stale.sequence > first.sequence);

    drop(core.0.stdin.take());
    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Some(status) = core.0.try_wait().expect("estado del núcleo") {
            break status;
        }
        assert!(Instant::now() < deadline, "EOF no cerró el núcleo");
        thread::sleep(Duration::from_millis(10));
    };
    assert!(status.success(), "salida del núcleo: {status}");
}
