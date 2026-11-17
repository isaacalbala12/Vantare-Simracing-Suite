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
