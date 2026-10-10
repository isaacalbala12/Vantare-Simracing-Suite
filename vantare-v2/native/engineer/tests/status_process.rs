//! Proceso stream real: heartbeat aun sin fotos, cierre y muerte sin cleanup.
#![cfg(windows)] // La autoridad firmada de la fixture requiere DPAPI.
use std::{
    fs, io,
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use vantare_engineer::control::{
    self,
    runtime::{Connection, HEARTBEAT_TIMEOUT_MS, Report},
};
mod rights;

struct Process {
    _rights: rights::Fixture,
    child: Child,
    root: PathBuf,
}
impl Process {
    fn start(suffix: &str) -> Self {
        let name = format!("engineer-status-{}-{suffix}", std::process::id());
        let rights = rights::Fixture::new(&name);
        let root = std::env::temp_dir().join(format!(
            "engineer-status-process-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("temporal");
        let clips = root.join("clips");
        fs::create_dir(&clips).expect("clips sintéticos vacíos");
        fs::write(
            root.join("engineer.json"),
            serde_json::to_vec(&control::Settings::default().json()).expect("ajustes"),
        )
        .expect("escribir ajustes");
        let child = Command::new(env!("CARGO_BIN_EXE_vantare-engineer"))
            .args(["--stream", "--cursor"])
            .arg(root.join("cursor.json"))
            .args(["--pipe-name", &name, "--core-image"])
            .arg(std::env::current_exe().expect("imagen test"))
            .arg("--settings")
            .arg(root.join("engineer.json"))
            .arg("--clips")
            .arg(clips)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("Engineer");
        Self {
            _rights: rights,
            child,
            root,
        }
    }
    fn report(&self, predicate: impl Fn(&Report) -> bool) -> Report {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Ok(Some(bytes)) = control::read(&self.root.join("engineer-status.json"))
                && let Ok(report) = Report::parse(&bytes)
                && predicate(&report)
            {
                return report;
            }
            assert!(Instant::now() < deadline, "estado no publicado a tiempo");
            std::thread::yield_now(); // Poll acotado de proceso real, sin time.Sleep.
        }
    }
}
impl Drop for Process {
    fn drop(&mut self) {
        drop(self.child.stdin.take());
        if self.child.try_wait().expect("wait").is_none() {
            self.child.kill().expect("kill");
        }
        self.child.wait().expect("reap");
        fs::remove_dir_all(&self.root).expect("limpiar raíz temporal exclusiva");
    }
}
#[test]
fn heartbeat_advances_without_photos_and_crashed_engineer_expires() {
    let mut process = Process::start("crash");
    let first = process.report(|report| report.status.active);
    let first_runtime = first.runtime.expect("v2");
    assert_eq!(first_runtime.connection, Connection::Waiting);
    let next = process.report(|report| {
        report
            .runtime
            .as_ref()
            .is_some_and(|runtime| runtime.heartbeat_ms > first_runtime.heartbeat_ms)
    });
    process.child.kill().expect("crash");
    process.child.wait().expect("reap");
    let after_crash = process.report(|_| true);
    assert!(after_crash.status.active, "kill no publica un cierre falso");
    assert_eq!(after_crash, next, "archivo conserva última evidencia");
    let runtime = after_crash.runtime.expect("v2");
    assert!(!runtime.fresh(runtime.heartbeat_ms + HEARTBEAT_TIMEOUT_MS));
}
#[test]
fn eof_publishes_stopped_and_disconnected() -> io::Result<()> {
    let mut process = Process::start("eof");
    process.report(|report| report.status.active);
    drop(process.child.stdin.take());
    let report = process.report(|report| !report.status.active);
    assert_eq!(
        report.runtime.expect("v2").connection,
        Connection::Disconnected
    );
    assert!(process.child.wait()?.success());
    Ok(())
}
