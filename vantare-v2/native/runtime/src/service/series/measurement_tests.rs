use super::recording_tests::{Directory, helper, wait_for};
use super::*;
use std::fs::{self, File};
use std::time::{Duration, Instant, UNIX_EPOCH};

fn populate(dir: &Directory, count: u64, large: bool) {
    use std::os::windows::process::CommandExt;
    for index in 0..count {
        let path = dir.0.join(format!("series-{index}-1.duckdb"));
        let file = File::create(&path).expect("fixture de medición");
        if large && index == 0 {
            // Tamaño lógico real >5 GiB, sparse NTFS para no reservar disco inútil.
            assert!(
                std::process::Command::new("fsutil")
                    .args(["sparse", "setflag"])
                    .arg(&path)
                    .creation_flags(0x0800_0000)
                    .output()
                    .expect("fixture de medición")
                    .status
                    .success()
            );
            file.set_len(prune::MAX_BYTES + 1)
                .expect("fixture de medición");
        } else {
            file.set_len(16).expect("fixture de medición");
        }
        file.set_modified(UNIX_EPOCH + Duration::from_secs(index))
            .expect("fixture de medición");
    }
}
#[test]
fn measure_core_thread_quota_start_and_finish() {
    for (label, count, large) in [
        ("200_recordings", 200, false),
        ("bytes_over_5_gib", 199, true),
    ] {
        let isolated = Directory::new();
        populate(&isolated, count, large);
        let begin = Instant::now();
        let report = prune::prune(
            &isolated.0,
            std::time::SystemTime::now(),
            prune::MAX_RECORDINGS,
            prune::MAX_BYTES,
        )
        .unwrap();
        let prune_ms = begin.elapsed().as_secs_f64() * 1000.0;
        let mut state = Status::new(&isolated.0, 99, report);
        let begin = Instant::now();
        state.persist(None).unwrap();
        let state_start_ms = begin.elapsed().as_secs_f64() * 1000.0;
        state.state = "stopped";
        let begin = Instant::now();
        state.persist(None).unwrap();
        let state_finish_ms = begin.elapsed().as_secs_f64() * 1000.0;
        let dir = Directory::new();
        populate(&dir, count, large);
        let mut core = Core::new(99);
        let start = Instant::now();
        let recording = SeriesRecording::start(&mut core, Some(&dir.0), 99, || Ok(helper()));
        let start_ms = start.elapsed().as_secs_f64() * 1000.0;
        let path = dir.0.join(dir.state()["file"].as_str().unwrap());
        wait_for(|| path.exists());
        let finish = Instant::now();
        recording.finish(&mut core);
        let finish_ms = finish.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(dir.state()["state"], "stopped");
        // Artefacto de medición externo al repo; Nextest oculta stdout de PASS.
        let output = std::env::var_os("VANTARE_G4A_MEASUREMENTS").map_or_else(
            || std::env::temp_dir().join("vantare-g4a-measurements"),
            std::path::PathBuf::from,
        );
        fs::create_dir_all(&output).unwrap();
        let value = serde_json::json!({"case":label,"startMs":start_ms,"finishMs":finish_ms,
            "pruneMs":prune_ms,"stateStartWriteMs":state_start_ms,"stateFinishWriteMs":state_finish_ms});
        fs::write(
            output.join(format!("{label}.json")),
            serde_json::to_vec(&value).unwrap(),
        )
        .unwrap();
        eprintln!("G4a {value}");
    }
}
