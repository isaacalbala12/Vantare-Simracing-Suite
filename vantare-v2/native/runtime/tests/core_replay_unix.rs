//! Replay de una captura real por el transporte Unix usado por los overlays.
#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use vantare_domain::{SourceKind, SourceState};
use vantare_ipc::Subscriber;

mod support;

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
            "--velocidad",
            "0.2",
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

    // Registrar demanda puede hidratar otra foto fresca. Latest-wins no promete
    // que la siguiente revisión sea ya la transición por silencio.
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut stale = Arc::clone(&first);
    while stale.state.source_state != SourceState::Stale {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .expect("caducidad dentro del plazo");
        stale = subscriber
            .next(remaining)
            .expect("foto caducada después de detenerse la captura");
    }
    assert_eq!(stale.state.cars.len(), 44);
    assert_eq!(stale.origin.source.kind, SourceKind::Replay);
    assert_eq!(stale.state.source_state, SourceState::Stale);
    assert!(stale.sequence > first.sequence);

    drop(core.0.stdin.take());
    support::wait_for_success(&mut core.0);
}

#[test]
fn late_demand_and_same_mask_reconnect_hydrate_after_replay_stalls() {
    use vantare_ipc::{Demand, Signal, SignalState};
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("reloj")
        .as_nanos();
    let pipe = format!("vantare-late-demand-{}-{nonce}", std::process::id());
    let child = Command::new(env!("CARGO_BIN_EXE_vantare-core"))
        .args([
            "--replay",
            testdata("lmu-fixture.bin").to_str().expect("ruta"),
            "--build",
            "1.3.0.0",
            "--pipe",
            &pipe,
        ])
        .stdin(Stdio::piped())
        .spawn()
        .expect("núcleo");
    let mut core = CoreProcess(child);
    let mut observer = Subscriber::connect(&pipe, |_| true).expect("observador");
    let mut stale = observer.next(Duration::from_secs(10)).expect("foto");
    while stale.state.source_state != SourceState::Stale {
        stale = observer.next(Duration::from_secs(3)).expect("caducidad");
    }
    let mut wanted = Demand::default();
    wanted.request(Signal::Pedals, 16);
    let mut late = Subscriber::connect_requested(&pipe, wanted.clone(), |_| true).expect("tardío");
    let first = late
        .next_photo(Duration::from_secs(3))
        .expect("hidratación tardía");
    assert_eq!(first.snapshot.state.source_state, SourceState::Stale);
    assert!(first.snapshot.sequence > stale.sequence);
    assert_eq!(first.signal_state(Signal::Pedals), SignalState::Requested);
    assert_eq!(
        first.signal_state(Signal::Weather),
        SignalState::NotRequested
    );
    // Un segundo consumidor mantiene idéntica la unión de máscaras.
    let mut same =
        Subscriber::connect_requested(&pipe, wanted.clone(), |_| true).expect("misma máscara");
    let second = same
        .next_photo(Duration::from_secs(3))
        .expect("hidratar unión idéntica");
    assert!(second.snapshot.sequence > first.snapshot.sequence);
    wanted.request(Signal::Weather, 500);
    late.set_demand(wanted).expect("nuevo widget");
    let changed = late
        .next_photo(Duration::from_secs(3))
        .expect("hidratar cambio");
    assert_eq!(
        changed.signal_state(Signal::Weather),
        SignalState::Requested
    );
    assert_eq!(changed.snapshot.state.source_state, SourceState::Stale);
    drop(core.0.stdin.take());
    support::wait_for_success(&mut core.0);
}
