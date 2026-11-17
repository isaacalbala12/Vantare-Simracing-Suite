#![allow(clippy::unwrap_used)]
use super::*;
use crate::protocol::{Reply, Request};
use std::time::{Duration, Instant};

// A blocked worker channel gives deterministic scheduling without sleeps or a fake Reader.
fn held() -> (
    State,
    std::sync::mpsc::Receiver<worker::Command>,
    std::sync::mpsc::SyncSender<worker::Completion>,
) {
    let mut state = State::new(PathBuf::from("unused"));
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let (done, results) = std::sync::mpsc::sync_channel(1);
    state.worker = Some(worker::Worker::from_channels(tx, results));
    (state, rx, done)
}
fn pending(state: &mut State, now: Instant) {
    state.submit(9, worker::Operation::Close, now).unwrap();
}
#[test]
fn busy_cancel_and_absolute_deadline_reply_exactly_once() {
    let now = Instant::now();
    let (mut state, _held, _done) = held();
    pending(&mut state, now);
    assert_eq!(
        state.submit(10, worker::Operation::Close, now),
        Err(HostError::Busy)
    );
    assert!(
        state
            .poll(now + Duration::from_secs(39), true, false)
            .is_none()
    );
    assert_eq!(
        state.poll(now + Duration::from_secs(40), true, false),
        Some((9, Err(HostError::AnalysisTimeout)))
    );
    assert!(
        state
            .poll(now + Duration::from_secs(80), true, false)
            .is_none()
    );
    assert_eq!(
        state.submit(10, worker::Operation::Close, now),
        Err(HostError::Busy)
    );
    let (mut state, _held, _done) = held();
    pending(&mut state, now);
    assert!(state.cancel());
    assert_eq!(
        state.poll(now, true, false),
        Some((9, Err(HostError::AnalysisCancelled)))
    );
    assert!(state.poll(now, true, false).is_none());
}
#[test]
fn revocation_feed_loss_and_shutdown_empty_all_tokens_and_answer_pending() {
    for (allowed, closing, error) in [
        (false, false, HostError::Denied),
        (true, true, HostError::AnalysisCancelled),
    ] {
        let (mut state, _held, _done) = held();
        state
            .paths
            .insert("a".repeat(64), PathBuf::from("private.duckdb"));
        state.session = Some("b".repeat(64));
        let now = Instant::now();
        pending(&mut state, now);
        assert_eq!(state.poll(now, allowed, closing), Some((9, Err(error))));
        assert!(state.paths.is_empty());
        assert!(state.session.is_none());
        assert!(state.poll(now, allowed, closing).is_none());
    }
}
#[test]
fn dead_worker_answers_pending_and_invalidates_tokens() {
    let (mut state, held, done) = held();
    let now = Instant::now();
    pending(&mut state, now);
    drop(held);
    drop(done);
    assert_eq!(
        state.poll(now, true, false),
        Some((9, Err(HostError::AnalysisUnreadable)))
    );
    assert!(state.paths.is_empty());
    assert!(state.session.is_none());
}
#[test]
fn recording_status_is_host_only_and_blocks_open_and_inspect() {
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("private.duckdb"), []).unwrap();
    std::fs::write(
        root.join("recording-status.json"),
        br#"{"state":"recording","file":"private.duckdb"}"#,
    )
    .unwrap();
    let mut state = State::new(root.clone());
    let rows = state.catalog().unwrap();
    assert!(rows[0].recording);
    for request in [
        Request::AnalysisOpen {
            id: rows[0].id.clone(),
        },
        Request::AnalysisInspect {
            id: rows[0].id.clone(),
        },
    ] {
        assert_eq!(
            state.start(1, &request, Instant::now()),
            Err(HostError::AnalysisLocked)
        );
    }
    std::fs::write(root.join("recording-status.json"), b"broken").unwrap();
    assert!(!state.catalog().unwrap()[0].recording);
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn largest_catalog_and_open_frames_have_at_least_half_a_mib_to_spare() {
    use crate::protocol::HostToUi;
    let row = AnalysisRow {
        id: "f".repeat(64),
        started_at_ms: (1 << 53) - 1,
        size_bytes: (1 << 53) - 1,
        recording: true,
    };
    let signal = AnalysisSignal {
        reliable: u32::MAX,
        estimated: u32::MAX,
        stale: u32::MAX,
        unavailable: u32::MAX,
        min: Some(serde_json::Number::from_f64(-f64::MAX).unwrap()),
        mean: Some(serde_json::Number::from_f64(f64::MAX).unwrap()),
        max: Some(serde_json::Number::from_f64(f64::MAX).unwrap()),
    };
    let lap = AnalysisLap {
        index: 255,
        lap: u32::MAX,
        car: u32::MAX,
        sealed: true,
        gap: false,
        samples: u32::MAX,
        lap_time_approx_ms: Some(u32::MAX),
        speed: signal.clone(),
        throttle: signal.clone(),
        brake: signal,
    };
    for result in [
        Reply::AnalysisCatalog {
            recordings: vec![row; 256],
            max: 256,
        },
        Reply::AnalysisOpen {
            session: "f".repeat(64),
            watermark: u64::MAX.to_string(),
            attempted: u64::MAX.to_string(),
            total: u64::MAX.to_string(),
            finished: true,
            laps: vec![lap; 256],
        },
    ] {
        assert!(
            serde_json::to_vec(&HostToUi::Response {
                id: u32::MAX,
                result
            })
            .unwrap()
            .len()
                < 512 * 1024
        );
    }
}
#[test]
fn full_channel_is_busy_and_late_results_cannot_resurrect_tokens() {
    let now = Instant::now();
    let (mut state, commands, done) = held();
    state
        .worker
        .as_ref()
        .unwrap()
        .commands
        .try_send(worker::Command::Close)
        .unwrap_or_else(|_| panic!("empty channel"));
    assert_eq!(
        state.submit(9, worker::Operation::Close, now),
        Err(HostError::Busy)
    );
    assert!(state.pending.is_none());
    let _ = commands.recv().unwrap();
    pending(&mut state, now);
    let worker::Command::Job(job) = commands.recv().unwrap() else {
        panic!("job");
    };
    assert_eq!(
        state.poll(now, false, false),
        Some((9, Err(HostError::Denied)))
    );
    assert!(job.cancel.load(std::sync::atomic::Ordering::Acquire));
    done.send(worker::Completion {
        id: 9,
        result: Ok(Reply::AnalysisOpen {
            session: "f".repeat(64),
            watermark: "1".into(),
            attempted: "1".into(),
            total: "0".into(),
            finished: false,
            laps: vec![],
        }),
    })
    .unwrap();
    assert!(state.poll(now, true, false).is_none());
    assert!(state.session.is_none());
    assert!(state.paths.is_empty());
}
#[test]
fn cancelling_inspect_or_nothing_preserves_the_open_session() {
    for timeout in [false, true] {
        let (mut state, commands, _done) = held();
        let session_cancel = Arc::new(AtomicBool::new(false));
        state.session = Some("f".repeat(64));
        state.session_cancel = Some(session_cancel.clone());
        assert!(!state.cancel());
        assert_eq!(state.session.as_deref(), Some("f".repeat(64).as_str()));
        assert!(!session_cancel.load(Ordering::Acquire));
        let now = Instant::now();
        state
            .submit(
                9,
                worker::Operation::Inspect {
                    id: "a".repeat(64),
                    path: PathBuf::from("unused"),
                    created: std::time::SystemTime::now(),
                },
                now,
            )
            .unwrap();
        let worker::Command::Job(job) = commands.recv().unwrap() else {
            panic!("job");
        };
        if !timeout {
            assert!(state.cancel());
        }
        assert_eq!(
            state.poll(
                now + if timeout {
                    Duration::from_secs(40)
                } else {
                    Duration::ZERO
                },
                true,
                false
            ),
            Some((
                9,
                Err(if timeout {
                    HostError::AnalysisTimeout
                } else {
                    HostError::AnalysisCancelled
                })
            ))
        );
        assert!(job.cancel.load(Ordering::Acquire));
        assert!(!session_cancel.load(Ordering::Acquire));
        assert!(state.session.is_some());
    }
}
#[test]
fn recording_stopped_and_different_file_do_not_mark_the_row() {
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("a.duckdb"), []).unwrap();
    std::fs::write(root.join("b.duckdb"), []).unwrap();
    let mut state = State::new(root.clone());
    for (status, file, count) in [
        ("stopped", "a.duckdb", 0),
        ("recording", "missing.duckdb", 0),
        ("recording", "b.duckdb", 1),
    ] {
        std::fs::write(
            root.join("recording-status.json"),
            serde_json::to_vec(&serde_json::json!({"state":status,"file":file})).unwrap(),
        )
        .unwrap();
        let rows = state.catalog().unwrap();
        assert_eq!(rows.iter().filter(|row| row.recording).count(), count);
        for row in rows.iter().filter(|row| row.recording) {
            assert_eq!(state.paths[&row.id].file_name().unwrap(), "b.duckdb");
        }
    }
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn start_reports_too_many_recordings_as_catalog_does() {
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("a.duckdb"), []).unwrap();
    let mut state = State::new(root.clone());
    let id = state.catalog().unwrap()[0].id.clone();
    for n in 0..256 {
        std::fs::write(root.join(format!("extra-{n}.duckdb")), []).unwrap();
    }
    assert_eq!(
        state.start(1, &Request::AnalysisInspect { id }, Instant::now()),
        Err(HostError::AnalysisTooMany)
    );
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}
#[cfg(windows)]
#[test]
fn disconnected_worker_is_recreated_after_submit_or_poll() {
    for during_poll in [false, true] {
        let (mut state, commands, results) = held();
        let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("a.duckdb"),
            include_bytes!("../../../analysis/fixtures/no-series.duckdb"),
        )
        .unwrap();
        state.root = root.clone();
        let exe = std::env::current_exe().unwrap();
        state.helper_for_test(
            exe.parent()
                .unwrap()
                .parent()
                .unwrap()
                .join("vantare-storage.exe"),
        );
        let now = Instant::now();
        if during_poll {
            pending(&mut state, now);
        }
        drop(commands);
        drop(results);
        if during_poll {
            assert_eq!(
                state.poll(now, true, false),
                Some((9, Err(HostError::AnalysisUnreadable)))
            );
        } else {
            assert_eq!(
                state.submit(9, worker::Operation::Close, now),
                Err(HostError::AnalysisUnreadable)
            );
        }
        assert!(state.worker.is_none());
        let id = state.catalog().unwrap()[0].id.clone();
        state
            .start(10, &Request::AnalysisInspect { id }, now)
            .unwrap();
        state.wait_for_test();
        assert!(matches!(
            state.poll(now, true, false).unwrap().1,
            Ok(Reply::AnalysisInspect {
                state: AnalysisState::Incompatible,
                ..
            })
        ));
        drop(state);
        std::fs::remove_dir_all(root).unwrap();
    }
}
#[test]
fn mismatched_result_does_not_leave_cancellation_latched() {
    let (mut state, _commands, done) = held();
    let now = Instant::now();
    pending(&mut state, now);
    done.send(worker::Completion {
        id: 10,
        result: Ok(Reply::AnalysisClose {}),
    })
    .unwrap();
    assert_eq!(
        state.poll(now, true, false),
        Some((9, Err(HostError::AnalysisUnreadable)))
    );
    assert!(!state.cancelled);
}
#[test]
fn worker_reports_too_many_if_catalog_grows_after_dispatch() {
    let (mut state, commands, _results) = held();
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("a.duckdb"), []).unwrap();
    state.root = root.clone();
    let id = state.catalog().unwrap()[0].id.clone();
    let now = Instant::now();
    state
        .start(1, &Request::AnalysisInspect { id }, now)
        .unwrap();
    let job = commands.recv().unwrap();
    for n in 0..256 {
        std::fs::write(root.join(format!("extra-{n}.duckdb")), []).unwrap();
    }
    state.worker = Some(worker::Worker::start(PathBuf::from("helper-must-not-be-opened")).unwrap());
    state
        .worker
        .as_ref()
        .unwrap()
        .commands
        .try_send(job)
        .unwrap_or_else(|_| panic!("empty worker"));
    state.wait_for_test();
    assert_eq!(
        state.poll(now, true, false),
        Some((1, Err(HostError::AnalysisTooMany)))
    );
    drop(state);
    std::fs::remove_dir_all(root).unwrap();
}
