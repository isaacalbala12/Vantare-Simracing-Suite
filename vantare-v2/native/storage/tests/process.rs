#![allow(clippy::unwrap_used)]

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{Value, json};

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
    assert_eq!(owner.response(), json!(["ready", 0]));
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
