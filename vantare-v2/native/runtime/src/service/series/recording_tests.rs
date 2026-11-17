use super::*;
use crate::flows::SeriesReader;
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Instant, SystemTime};

pub(super) struct Directory(pub(super) PathBuf);
impl Directory {
    pub(super) fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "series-real-quota-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("fixture de grabación")
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("fixture de grabación");
        Self(path)
    }
    pub(super) fn state(&self) -> Value {
        serde_json::from_slice(
            &fs::read(self.0.join("recording-status.json")).expect("fixture de grabación"),
        )
        .expect("fixture de grabación")
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("fixture de grabación");
    }
}
pub(super) fn helper() -> PathBuf {
    let exe = std::env::current_exe().expect("fixture de grabación");
    let path = exe
        .parent()
        .expect("fixture de grabación")
        .parent()
        .expect("fixture de grabación")
        .join("vantare-storage.exe");
    assert!(
        path.is_file(),
        "el gate debe preparar storage: {}",
        path.display()
    );
    path
}
fn ready(path: &Path) {
    // Abrir read-only confirma ready/COMMIT y el cierre del writer anterior.
    let _reader = SeriesReader::open(&helper(), path).expect("fixture de grabación");
}
pub(super) fn wait_for(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !condition() {
        assert!(Instant::now() < deadline, "transición no observada");
        std::thread::sleep(Duration::from_millis(2)); // Solo espera una transición real del proceso.
    }
}

#[test]
fn real_read_only_and_writer_handles_are_skipped_by_prune() {
    use std::os::windows::process::CommandExt;
    let dir = Directory::new();
    let path = dir.0.join("series-90-1.duckdb");
    let mut child = Command::new(helper())
        .arg(&path)
        .arg("--create")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .creation_flags(0x0800_0000)
        .spawn()
        .unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
    let report = prune::prune(&dir.0, SystemTime::now(), 1, prune::MAX_BYTES).unwrap();
    assert!(path.exists());
    assert_eq!(report.items[0].result, "omitida en uso");
    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"[\"stop\"]\n")
        .unwrap();
    assert!(child.wait().unwrap().success());
    ready(&path);
    let reader = SeriesReader::open(&helper(), &path).unwrap();
    let report = prune::prune(&dir.0, SystemTime::now(), 1, prune::MAX_BYTES).unwrap();
    assert!(path.exists());
    assert_eq!(report.items[0].result, "omitida en uso");
    drop(reader);
    let report = prune::prune(&dir.0, SystemTime::now(), 1, prune::MAX_BYTES).unwrap();
    assert!(!path.exists());
    assert_eq!(report.items[0].result, "borrada");
}

#[test]
fn start_and_finish_persist_status_with_real_helper() {
    let dir = Directory::new();
    let mut core = Core::new(42);
    let recording = SeriesRecording::start(&mut core, Some(&dir.0), 42, || Ok(helper()));
    let state = dir.state();
    assert_eq!(state["state"], "recording");
    assert_eq!(state["counts"]["recordings"], 0);
    let name = state["file"].as_str().unwrap();
    assert!(name.starts_with("series-42-"));
    wait_for(|| dir.0.join(name).exists());
    // finish espera ready por la ruta normal del worker; no hay espera en adquisición.
    recording.finish(&mut core);
    let state = dir.state();
    assert_eq!(state["state"], "stopped");
    assert!(state["cause"].is_null());
    assert_eq!(state["durableWatermark"], "0");
    assert_eq!(state["attempted"], "0");
    ready(&dir.0.join(name));
}

#[test]
fn existing_recording_name_is_preserved_and_status_names_the_new_database() {
    let dir = Directory::new();
    let original = dir
        .0
        .join(format!("series-44-{}.duckdb", std::process::id()));
    fs::write(&original, b"grabacion anterior").unwrap();
    let mut core = Core::new(44);
    let recording = SeriesRecording::start(&mut core, Some(&dir.0), 44, || Ok(helper()));
    let path = dir.0.join(dir.state()["file"].as_str().unwrap());
    assert_ne!(path, original);
    wait_for(|| path.exists());
    recording.finish(&mut core);
    assert_eq!(dir.state()["state"], "stopped");
    assert_eq!(fs::read(original).unwrap(), b"grabacion anterior");
    ready(&path);
}

#[test]
fn writer_crash_persists_degraded_once_and_slow_status_does_not_block_core() {
    for delay in [false, true] {
        let dir = Directory::new();
        let mut core = Core::new(43);
        let mut recording = SeriesRecording::start(&mut core, Some(&dir.0), 43, || Ok(helper()));
        let path = dir.0.join(dir.state()["file"].as_str().unwrap());
        wait_for(|| path.exists());
        let worker = recording.worker.as_ref().unwrap();
        worker.kill_for_test();
        wait_for(|| worker.failed());
        let (release, released) = std::sync::mpsc::channel();
        recording.check_with_delay(&core, delay.then_some(released));
        assert!(recording.pending_status.is_some());
        for _ in 0..1000 {
            core.observe(vantare_domain::Observation::default())
                .unwrap();
            recording.check(&core);
        }
        assert_eq!(core.snapshot().sequence, 1000);
        if delay {
            assert_eq!(dir.state()["state"], "recording");
            release.send(()).unwrap();
        } else {
            wait_for(|| dir.state()["state"] == "degraded");
            assert_eq!(dir.state()["cause"], "writer caído");
        }
        recording.finish(&mut core);
        assert_eq!(dir.state()["state"], "stopped");
        assert_eq!(dir.state()["cause"], "writer caído");
    }
}

#[test]
fn orphan_wal_prevents_reusing_the_base_database_name() {
    let dir = Directory::new();
    let name = format!("series-45-{}.duckdb", std::process::id());
    let wal = dir.0.join(format!("{name}.wal"));
    fs::write(&wal, b"WAL reciente").unwrap();
    let mut core = Core::new(45);
    let recording = SeriesRecording::start(&mut core, Some(&dir.0), 45, || Ok(helper()));
    assert_ne!(dir.state()["file"], name);
    let path = dir.0.join(dir.state()["file"].as_str().unwrap());
    wait_for(|| path.exists());
    recording.finish(&mut core);
    assert_eq!(fs::read(wal).unwrap(), b"WAL reciente");
    ready(&path);
}
