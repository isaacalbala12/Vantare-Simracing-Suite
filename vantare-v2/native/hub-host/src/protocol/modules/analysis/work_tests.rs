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

#[test]
fn compare_uses_existing_busy_deadline_cancel_and_token_rules() {
    let now = Instant::now();
    for cancel in [false, true] {
        let (mut s, _held, _done) = held();
        s.session = Some("b".repeat(64));
        let old = Request::AnalysisCompare {
            session: "a".repeat(64),
            a: 0,
            b: 0,
        };
        assert_eq!(s.start(1, &old, now), Err(HostError::AnalysisNotFound));
        let req = Request::AnalysisCompare {
            session: "b".repeat(64),
            a: 0,
            b: 0,
        };
        assert_eq!(s.start(1, &req, now), Ok(None));
        assert_eq!(s.start(2, &req, now), Err(HostError::Busy));
        let (at, error) = if cancel {
            assert!(s.cancel());
            (now, HostError::AnalysisCancelled)
        } else {
            (now + Duration::from_secs(40), HostError::AnalysisTimeout)
        };
        assert_eq!(s.poll(at, true, false), Some((1, Err(error))));
        assert!(s.session.is_none());
    }
}

#[cfg(windows)]
mod compare_real {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        process::{Command, Stdio},
    };
    fn helper() -> PathBuf {
        std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("vantare-storage.exe")
    }
    fn fixture(gap: bool) -> (PathBuf, State, String) {
        let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
        std::fs::create_dir(&root).unwrap();
        let mut writer = Command::new(helper())
            .arg(root.join("recording.duckdb"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut output = BufReader::new(writer.stdout.take().unwrap());
        let mut line = String::new();
        output.read_line(&mut line).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&line).unwrap()[0],
            "ready"
        );
        for lap in 0..2 {
            for i in 0..34 {
                let index = lap * 34 + i + 1;
                let d = f64::from(i) * 100.0;
                let elapsed = f64::from(i) * if lap == 0 { 1.2 } else { 1.0 };
                let seq = lap * 34 + i + 1;
                let sealed_at = (i == 33).then_some(seq + 1);
                let chunk = serde_json::json!([
                    "vantare.series-chunk.v1",
                    index,
                    0,
                    i,
                    [
                        "vantare.player-lap.v1",
                        1,
                        3,
                        7,
                        lap,
                        sealed_at,
                        gap && lap == 0 && i == 16,
                        [[seq, [1, d], [1, elapsed], [1, 50.0], [1, 0.5], [1, 0.25]]]
                    ]
                ]);
                writeln!(
                    writer.stdin.as_mut().unwrap(),
                    "{}",
                    serde_json::json!(["append", chunk])
                )
                .unwrap();
                line.clear();
                output.read_line(&mut line).unwrap();
                assert_eq!(
                    serde_json::from_str::<serde_json::Value>(&line).unwrap()[0],
                    "ack",
                    "{line}"
                );
            }
        }
        writeln!(
            writer.stdin.as_mut().unwrap(),
            "{}",
            serde_json::json!(["finish", 68])
        )
        .unwrap();
        line.clear();
        output.read_line(&mut line).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&line).unwrap()[0],
            "finished"
        );
        drop(writer.stdin.take());
        assert!(writer.wait().unwrap().success());
        let mut state = State::new(root.clone());
        state.helper_for_test(helper());
        let id = state.catalog().unwrap()[0].id.clone();
        state
            .start(1, &Request::AnalysisOpen { id }, Instant::now())
            .unwrap();
        state.wait_for_test();
        let Some((1, Ok(Reply::AnalysisOpen { session, laps, .. }))) =
            state.poll(Instant::now(), true, false)
        else {
            panic!("open")
        };
        assert_eq!(laps.len(), 2);
        assert!(laps.iter().all(|lap| lap.sealed));
        assert_eq!(laps[0].gap, gap);
        assert!(!laps[1].gap);
        (root, state, session)
    }
    #[test]
    fn cancelling_real_compare_reaps_reader_and_invalidates_session() {
        let (root, mut state, session) = fixture(false);
        let (ready, resume) = state.pause_next_read_for_test();
        let request = Request::AnalysisCompare {
            session: session.clone(),
            a: 0,
            b: 1,
        };
        let now = Instant::now();
        state.start(9, &request, now).unwrap();
        let _pid = ready.recv_timeout(Duration::from_secs(10)).unwrap();
        assert!(state.cancel());
        assert_eq!(
            state.poll(now, true, false),
            Some((9, Err(HostError::AnalysisCancelled)))
        );
        resume.send(()).unwrap();
        state.wait_for_test();
        assert!(state.poll(now, true, false).is_none());
        assert_eq!(
            state.start(10, &request, now),
            Err(HostError::AnalysisNotFound)
        );
        // A new writer requires that the cancelled read-only helper released its lock.
        let mut writer = Command::new(helper())
            .arg(root.join("recording.duckdb"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut line = String::new();
        BufReader::new(writer.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&line).unwrap()[0],
            "ready"
        );
        drop(writer.stdin.take());
        assert!(writer.wait().unwrap().success());
        drop(state);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn compare_real_pages_cross_boundaries_and_leave_database_intact() {
        for gap in [false, true] {
            let (root, mut state, session) = fixture(gap);
            let original = std::fs::read(root.join("recording.duckdb")).unwrap();
            for (a, b) in [(0, 1), (1, 0), (1, 1)] {
                state
                    .start(
                        2,
                        &Request::AnalysisCompare {
                            session: session.clone(),
                            a,
                            b,
                        },
                        Instant::now(),
                    )
                    .unwrap();
                state.wait_for_test();
                let Some((2, Ok(reply))) = state.poll(Instant::now(), true, false) else {
                    panic!("compare")
                };
                assert_comparison(reply, gap, a, b);
            }
            state
                .start(
                    3,
                    &Request::AnalysisCompare {
                        session: session.clone(),
                        a: 2,
                        b: 0,
                    },
                    Instant::now(),
                )
                .unwrap();
            state.wait_for_test();
            assert_eq!(
                state.poll(Instant::now(), true, false),
                Some((3, Err(HostError::AnalysisNotFound)))
            );
            state
                .start(
                    4,
                    &Request::AnalysisClose {
                        session: session.clone(),
                    },
                    Instant::now(),
                )
                .unwrap();
            state.wait_for_test();
            assert_eq!(
                state.poll(Instant::now(), true, false),
                Some((4, Ok(Reply::AnalysisClose {})))
            );
            assert_eq!(
                state.start(
                    5,
                    &Request::AnalysisCompare {
                        session,
                        a: 0,
                        b: 1
                    },
                    Instant::now()
                ),
                Err(HostError::AnalysisNotFound)
            );
            drop(state);
            assert_eq!(
                std::fs::read(root.join("recording.duckdb")).unwrap(),
                original
            );
            std::fs::remove_dir_all(root).unwrap();
        }
    }

    fn assert_comparison(reply: Reply, gap: bool, a: u32, b: u32) {
        let Reply::AnalysisCompare {
            speed,
            throttle,
            brake,
            delta,
            delta_unavailable,
            gaps,
            ..
        } = reply
        else {
            panic!("compare")
        };
        assert_eq!(speed.a.len(), 34);
        assert_eq!(speed.b.len(), 34);
        assert_eq!(speed.a[0].value.as_f64(), Some(180.0));
        assert_eq!(throttle.a[0].value.as_f64(), Some(50.0));
        assert_eq!(brake.b[0].value.as_f64(), Some(25.0));
        if gap && a != b {
            assert_eq!(
                delta_unavailable,
                Some(if a == 0 {
                    crate::analysis::projection::DeltaUnavailable::GapInA
                } else {
                    crate::analysis::projection::DeltaUnavailable::GapInB
                })
            );
            assert!(delta.is_none());
            assert!(!gaps.a.is_empty() || !gaps.b.is_empty());
            let points = if a == 0 { speed.a } else { speed.b };
            assert_ne!(points[15].segment, points[16].segment);
            assert_ne!(points[16].segment, points[17].segment);
        } else {
            let delta = delta.unwrap();
            assert_eq!(delta.len(), 34);
            let expected = if a == b {
                0.0
            } else if a == 0 {
                6.6
            } else {
                -6.6
            };
            assert!((delta.last().unwrap().value.as_f64().unwrap() - expected).abs() < 1e-10);
        }
    }
}
