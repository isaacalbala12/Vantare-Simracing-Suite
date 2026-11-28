//! Real-helper product-path test; the close waits by progress (#2871), not by scheduling.
use super::*;
use serde_json::{Value, json};
use std::collections::VecDeque;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::time::Duration;
use vantare_domain::{AdapterError, Observation};

#[path = "../../../tests/support/session_frames.rs"]
mod fixture;
use fixture::frames;

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "series-capture-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
fn helper() -> PathBuf {
    std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join(format!("vantare-storage{}", std::env::consts::EXE_SUFFIX))
}
fn rows(path: &Path, command: &Value) -> Value {
    let mut child = Command::new(helper())
        .arg(path)
        .arg("--read-only")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    writeln!(input, "{command}").unwrap();
    drop(input); // Query followed by EOF: wait for the real helper, never a blind sleep.
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    let text = String::from_utf8(output.stdout).unwrap();
    let mut lines = text.lines();
    let ready: Value = serde_json::from_str(lines.next().unwrap()).unwrap();
    assert_eq!(ready[0], "ready");
    serde_json::from_str(lines.next().unwrap()).unwrap()
}

#[test]
fn recording_loop_observes_and_seals_both_sessions_through_the_product_path() {
    struct Replay(VecDeque<Observation>);
    impl Adapter for Replay {
        fn poll(&mut self, _: Duration) -> Result<Option<Observation>, AdapterError> {
            Ok(self.0.pop_front())
        }
    }
    let directory = Directory::new();
    let directory = &directory.0;
    let path = directory.join(format!("series-17-{}.duckdb", std::process::id()));
    let mut core = Core::new(17);
    let recording = SeriesRecording::start(&mut core, Some(directory), 17, || Ok(helper()));
    let stop = AtomicBool::new(false);
    super::drive_core_recorded(
        &mut core,
        &mut Replay(frames().into()),
        1000.0,
        &stop,
        None,
        recording,
        |core| {
            if core.snapshot().sequence >= 4 {
                stop.store(true, Ordering::Relaxed);
            }
            Ok(())
        },
    )
    .unwrap();
    let sessions = rows(&path, &json!(["session-summaries"]));
    assert_eq!(sessions[2], 2);
    for session in sessions[3].as_array().unwrap() {
        assert_eq!(session["sealed"], true);
    }
    assert_eq!(
        rows(&path, &json!(["lap-times", 17, 10]))[3][0]["officialMs"],
        91_000
    );
    assert_eq!(
        rows(&path, &json!(["lap-times", 17, 20]))[3][0]["officialMs"],
        89_000
    );
}
