#![allow(clippy::unwrap_used)]
use super::*;
use std::cell::Cell;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
fn fixture(
    ids: &[(u64, u64, u32)],
    chunks: u32,
    count: u32,
    gap: bool,
) -> (PathBuf, Option<(Reader, Cancel)>) {
    let helper = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("vantare-storage.exe");
    let root = std::env::temp_dir().join(vantare_services::random_id().unwrap());
    std::fs::create_dir(&root).unwrap();
    let db = root.join("recording.duckdb");
    let mut writer = Command::new(&helper)
        .arg(&db)
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
    for (lap, &(epoch, session, car)) in ids.iter().enumerate() {
        let lap = u32::try_from(lap).unwrap();
        for i in 0..chunks {
            let samples: Vec<_> = (0..count)
                .map(|j| {
                    let offset = i * count + j;
                    let seq = lap * chunks * count + offset + 1;
                    serde_json::json!([
                        seq,
                        [1, f64::from(offset) * 0.123456789],
                        [1, f64::from(offset) * 0.01],
                        [1, 50.0],
                        [1, 0.5],
                        [1, 0.25]
                    ])
                })
                .collect();
            let seal = (i + 1 == chunks).then_some((lap + 1) * chunks * count + 1);
            let chunk = serde_json::json!([
                "vantare.series-chunk.v1",
                lap * chunks + i + 1,
                0,
                i * count,
                [
                    "vantare.player-lap.v1",
                    epoch,
                    session,
                    car,
                    lap,
                    seal,
                    gap,
                    samples
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
        serde_json::json!(["finish", ids.len() * usize::try_from(chunks).unwrap()])
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
    let cancel = Arc::new(AtomicBool::new(false));
    let mut reader = Reader::open(&helper, &db, cancel.clone()).unwrap();
    reader.summaries().unwrap();
    (root, Some((reader, cancel)))
}
fn job(a: u32, b: u32) -> Job {
    Job {
        id: 1,
        operation: Operation::Compare { a, b },
        cancel: Arc::new(AtomicBool::new(false)),
        deadline: Instant::now() + Duration::from_secs(40),
        pause: None,
    }
}
#[test]
fn worker_rejects_epoch_session_and_car_mismatches_from_real_summaries() {
    let (root, mut reader) = fixture(&[(1, 3, 7), (2, 3, 7), (2, 4, 7), (2, 4, 8)], 1, 2, false);
    for (a, b) in [(0, 1), (1, 2), (2, 3)] {
        assert_eq!(
            compare(&mut reader, &job(a, b), a, b, &Instant::now),
            Err(HostError::AnalysisIncomparable)
        );
    }
    drop(reader);
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn worker_limit_counts_gap_entries_and_dense_gap_comparison_fits() {
    for (chunks, too_large) in [(700, false), (782, true)] {
        let (root, mut reader) = fixture(&[(1, 3, 7)], chunks, 64, true);
        let request = job(0, 0);
        if too_large {
            let opened = &mut reader.as_mut().unwrap().0;
            let lap = opened.summary.laps[0].clone();
            assert!(lap.samples < 100_000);
            assert_eq!(
                samples(opened, &lap, &request, &Instant::now).unwrap_err(),
                HostError::AnalysisTooLarge
            );
        } else {
            let reply = compare(&mut reader, &request, 0, 0, &Instant::now).unwrap();
            let Reply::AnalysisCompare { gaps, .. } = &reply else {
                panic!("compare")
            };
            assert_eq!(gaps.a.len(), 1);
            assert_eq!(gaps.b.len(), 1);
            assert!(
                serde_json::to_vec(&crate::protocol::HostToUi::Response {
                    id: 1,
                    result: reply
                })
                .unwrap()
                .len()
                    < crate::frame::LIMIT
            );
        }
        drop(reader);
        std::fs::remove_dir_all(root).unwrap();
    }
}
#[test]
fn compare_absolute_deadline_uses_injected_clock_between_pages_and_drops_session_reader() {
    let (root, mut reader) = fixture(&[(1, 3, 7)], 17, 2, false);
    let request = job(0, 0);
    let calls = Cell::new(0);
    let clock = || {
        let n = calls.get();
        calls.set(n + 1);
        if n < 2 {
            request.deadline - Duration::from_secs(40)
        } else {
            request.deadline
        }
    };
    assert_eq!(
        compare(&mut reader, &request, 0, 0, &clock),
        Err(HostError::AnalysisTimeout)
    );
    assert!(calls.get() >= 3);
    assert!(reader.is_none());
    std::fs::remove_dir_all(root).unwrap();
}
