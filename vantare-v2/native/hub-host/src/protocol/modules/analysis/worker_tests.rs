#![allow(clippy::unwrap_used)]
use super::*;
use std::cell::Cell;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
fn fixture(
    ids: &[(u64, u64, u32)],
    chunks: u32,
    count: u32,
    gap: bool,
) -> (PathBuf, Option<(Reader, Cancel)>) {
    fixture_with_metadata(ids, chunks, count, gap, &[], false)
}

fn fixture_with_metadata(
    ids: &[(u64, u64, u32)],
    chunks: u32,
    count: u32,
    gap: bool,
    commands: &[serde_json::Value],
    legacy: bool,
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
    let mode = if legacy {
        std::fs::write(
            &db,
            include_bytes!("../../../analysis/fixtures/session-v1.duckdb"),
        )
        .unwrap();
        "--resume"
    } else {
        "--create"
    };
    let mut writer = Command::new(&helper)
        .arg(&db)
        .arg(mode)
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
                        [1, f64::from(offset) * 0.123_456_789],
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
    write_metadata(writer.stdin.as_mut().unwrap(), &mut output, commands);
    finish_writer(
        &mut writer,
        &mut output,
        ids.len() * usize::try_from(chunks).unwrap(),
    );
    let cancel = Arc::new(AtomicBool::new(false));
    let mut reader = Reader::open(&helper, &db, cancel.clone()).unwrap();
    reader.summaries().unwrap();
    (root, Some((reader, cancel)))
}

fn finish_writer(writer: &mut Child, output: &mut impl BufRead, attempted: usize) {
    writeln!(
        writer.stdin.as_mut().unwrap(),
        "{}",
        serde_json::json!(["finish", attempted])
    )
    .unwrap();
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&line).unwrap()[0],
        "finished"
    );
    drop(writer.stdin.take());
    assert!(writer.wait().unwrap().success());
}

fn write_metadata(
    input: &mut impl Write,
    output: &mut impl BufRead,
    commands: &[serde_json::Value],
) {
    let mut line = String::new();
    for command in commands {
        writeln!(input, "{command}").unwrap();
        line.clear();
        output.read_line(&mut line).unwrap();
        assert!(
            serde_json::from_str::<serde_json::Value>(&line).unwrap()[0]
                .as_str()
                .unwrap()
                .starts_with("ack-"),
            "{line}"
        );
    }
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
    // 800 gap chunks x (one separator + 2 x 62 samples) = exactly 100,000 entries.
    for (chunks, too_large) in [(800, false), (801, true)] {
        let (root, mut reader) = fixture(&[(1, 3, 7)], chunks, 62, true);
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
            request
                .deadline
                .checked_sub(Duration::from_secs(40))
                .unwrap()
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

fn metadata_commands() -> Vec<serde_json::Value> {
    use serde_json::json;
    let mut commands = Vec::new();
    for (epoch, session) in [(1, 3), (2, 3)] {
        commands.push(json!(["session-open", {
            "epoch":epoch,"session":session,"kind":"race","kindText":"","trackName":"Spa",
            "vehicle":"Porsche","className":"GT3","startedAtMs":epoch * 1000
        }]));
    }
    for (epoch, car, lap, ms) in [
        (1, 7, 0, 90_125),
        (2, 7, 1, 91_250),
        (2, 99, 2, 92_000),
        (1, 8, 2, 92_500),
    ] {
        commands.push(
            json!(["lap", {"epoch":epoch,"session":3,"car":car,"lap":lap,
            "officialMs":ms,"sectorMs":[31_000,30_000,29_125]}]),
        );
    }
    commands.push(
        json!(["session-close", {"epoch":1,"session":3,"endedAtMs":1900,
        "simElapsedS":90.125,"finalPosition":3,"finalClassPosition":2,
        "lapsCompleted":1,"bestLapMs":90_125,"endReason":"sessionChanged"}]),
    );
    commands
}

#[test]
fn inspect_and_open_join_real_metadata_by_full_key() {
    let (root, reader) = fixture_with_metadata(
        &[(1, 3, 7), (2, 3, 7), (2, 3, 8)],
        1,
        2,
        false,
        &metadata_commands(),
        false,
    );
    drop(reader);
    let exe = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("vantare-storage.exe");
    let path = root.join("recording.duckdb");
    let created = stamp(&path).unwrap().created;
    let mut current = None;
    let mut cache = BTreeMap::new();
    let mut request = job(0, 0);
    request.operation = Operation::Inspect {
        id: "id".into(),
        path: path.clone(),
        created,
    };
    let inspect = execute(&exe, &request, &mut current, &mut cache).unwrap();
    assert_eq!(
        execute(&exe, &request, &mut current, &mut cache).unwrap(),
        inspect
    );
    let Reply::AnalysisInspect { sessions, .. } = inspect else {
        panic!("inspect")
    };
    assert_eq!(sessions.len(), 2);
    assert_eq!(
        (
            sessions[0].index,
            sessions[0].sealed,
            sessions[0].kind_text.as_deref()
        ),
        (0, false, None)
    );
    assert_eq!(
        (
            sessions[1].index,
            sessions[1].sealed,
            sessions[1].position_at_close
        ),
        (1, true, Some(3))
    );
    request.operation = Operation::Open {
        path,
        created,
        token: "token".into(),
    };
    let Reply::AnalysisOpen {
        sessions: opened,
        laps,
        ..
    } = execute(&exe, &request, &mut current, &mut cache).unwrap()
    else {
        panic!("open")
    };
    assert_eq!(opened, sessions);
    assert_eq!(
        laps.iter()
            .map(|lap| (lap.session, lap.lap_time_ms))
            .collect::<Vec<_>>(),
        [
            (Some(1), Some(90_125)),
            (Some(0), Some(91_250)),
            (Some(0), None)
        ]
    );
    assert_eq!(
        laps[0].sectors_ms.as_deref(),
        Some([31_000, 30_000, 29_125].as_slice())
    );
    assert_eq!(laps[2].sectors_ms, None);
    drop(current);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn official_lap_failure_reaps_the_helper_and_preserves_comparison() {
    use serde_json::json;
    let (root, mut opened) = fixture_with_metadata(
        &[(1, 3, 7)],
        1,
        2,
        false,
        &[
            json!(["session-open", {"epoch":1,"session":3,"kind":"race","kindText":"",
            "trackName":"Spa","vehicle":"Porsche","className":"GT3","startedAtMs":1000}]),
        ],
        false,
    );
    let (reader, _) = opened.as_mut().unwrap();
    let sessions = reader.sessions().unwrap();
    let laps = reader.summary.laps.clone();
    let old_id = reader.child.id();
    let (send, receive) = mpsc::channel();
    let original = std::mem::replace(&mut reader.output, receive);
    let pump = reader.pump.take().unwrap();
    reader.pump = Some(std::thread::spawn(move || {
        send.send(original.recv().unwrap()).unwrap(); // status
        original.recv().unwrap().unwrap(); // real lap-times response
        send.send(Ok(json!(["lap-times", "series-laps.v1", 4097, []])))
            .unwrap();
        while original.recv().is_ok() {}
        pump.join().unwrap();
    }));
    let exe = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("vantare-storage.exe");
    let clocks = metadata::official_times(&exe, reader, &laps, &sessions, &job(0, 0)).unwrap();
    assert_eq!(clocks, BTreeMap::new());
    assert_ne!(reader.child.id(), old_id);
    assert_eq!(reader.summary.laps, laps);
    assert!(compare(&mut opened, &job(0, 0), 0, 0, &Instant::now).is_ok());
    drop(opened);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn real_v1_bridge_has_empty_sessions_in_inspect_and_open() {
    let (root, reader) = fixture_with_metadata(&[(1, 3, 7)], 1, 2, false, &[], true);
    drop(reader);
    let path = root.join("recording.duckdb");
    let exe = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("vantare-storage.exe");
    let created = stamp(&path).unwrap().created;
    let mut current = None;
    let mut cache = BTreeMap::new();
    let mut request = job(0, 0);
    request.operation = Operation::Inspect {
        id: "id".into(),
        path: path.clone(),
        created,
    };
    assert!(
        matches!(execute(&exe,&request,&mut current,&mut cache).unwrap(),
        Reply::AnalysisInspect {sessions, ..} if sessions.is_empty())
    );
    request.operation = Operation::Open {
        path,
        created,
        token: "token".into(),
    };
    let Reply::AnalysisOpen { sessions, laps, .. } =
        execute(&exe, &request, &mut current, &mut cache).unwrap()
    else {
        panic!("open")
    };
    assert_eq!(sessions.as_slice(), &[]);
    assert_eq!(laps.len(), 1);
    let lap = &laps[0];
    assert_eq!(lap.lap_time_approx_ms, Some(10));
    assert_eq!(
        (lap.session, lap.lap_time_ms, lap.sectors_ms.as_ref()),
        (None, None, None)
    );
    drop(current);
    std::fs::remove_dir_all(root).unwrap();
}
