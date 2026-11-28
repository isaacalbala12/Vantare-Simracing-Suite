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
    fixture_with_lost_tail(ids, chunks, count, gap, commands, legacy, 0)
}

/// `tail`: bloques del final que el Core intentó y nunca llegaron (#2883).
fn fixture_with_lost_tail(
    ids: &[(u64, u64, u32)],
    chunks: u32,
    count: u32,
    gap: bool,
    commands: &[serde_json::Value],
    legacy: bool,
    tail: usize,
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
        ids.len() * usize::try_from(chunks).unwrap() + tail,
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

fn open_session(epoch: u64) -> serde_json::Value {
    serde_json::json!(["session-open", {
        "epoch":epoch,"session":3,"kind":"race","kindText":"","trackName":"Spa",
        "vehicle":"Porsche","className":"GT3","startedAtMs":epoch * 1000
    }])
}

fn metadata_commands() -> Vec<serde_json::Value> {
    use serde_json::json;
    let mut commands = vec![open_session(1), open_session(2)];
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
fn inspect_and_open_say_incomplete_when_the_end_was_lost_under_load() {
    // #2883: con `finished` confirmado pero la cola final perdida, ni la lista
    // ni la grabación abierta dicen «Completa».
    for (tail, state) in [
        (0, AnalysisState::Complete),
        (3, AnalysisState::Unconfirmed),
    ] {
        let (root, reader) =
            fixture_with_lost_tail(&[(1, 3, 7)], 2, 4, false, &[], false, tail);
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
        let (mut current, mut cache) = (None, BTreeMap::new());
        let mut request = job(0, 0);
        request.operation = Operation::Inspect {
            id: "id".into(),
            path: path.clone(),
            created,
        };
        let Reply::AnalysisInspect { state: found, .. } =
            execute(&exe, &request, &mut current, &mut cache).unwrap()
        else {
            panic!("inspect")
        };
        assert_eq!(found, state, "cola perdida: {tail}");
        request.operation = Operation::Open {
            path,
            created,
            token: "token".into(),
        };
        let Reply::AnalysisOpen {
            finished,
            lost_blocks,
            lost_tail_blocks,
            ..
        } = execute(&exe, &request, &mut current, &mut cache).unwrap()
        else {
            panic!("open")
        };
        assert!(finished);
        assert_eq!(
            (lost_blocks.as_str(), lost_tail_blocks),
            ("0", tail.to_string())
        );
    }
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
            (Some(opened[1].index), Some(90_125)),
            (Some(opened[0].index), Some(91_250)),
            (Some(opened[0].index), None)
        ]
    );
    assert_eq!(
        laps[0].sectors_ms.as_deref(),
        Some([31_000, 30_000, 29_125].as_slice())
    );
    assert_eq!(laps[2].sectors_ms, None);
    // La vuelta de 91 250 ms trae sectores que suman 90 125: no cuadran y el
    // host manda «sin sectores» (misma regla que `valid_sectors`).
    assert_eq!(laps[1].sectors_ms, None);
    drop(current);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn inspect_and_open_keep_recent_sessions_and_null_laps_outside_the_window() {
    let mut commands = metadata_commands();
    commands.extend((3..=257).map(open_session));
    let (root, reader) =
        fixture_with_metadata(&[(1, 3, 7), (2, 3, 7)], 1, 2, false, &commands, false);
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
    let Reply::AnalysisInspect { sessions, .. } =
        execute(&exe, &request, &mut current, &mut cache).unwrap()
    else {
        panic!("inspect")
    };
    assert_eq!(sessions.len(), 256);
    assert_eq!(sessions[0].started_at_ms, 257_000);
    assert_eq!(sessions[255].started_at_ms, 2_000);

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
    assert_eq!(laps.len(), 2);
    assert_eq!(
        (
            laps[0].session,
            laps[0].lap_time_ms,
            laps[0].sectors_ms.as_ref()
        ),
        (None, None, None)
    );
    assert_eq!(laps[0].lap_time_approx_ms, Some(10));
    assert_eq!(laps[1].session, Some(opened[255].index));
    assert_eq!(laps[1].lap_time_ms, Some(91_250));
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
