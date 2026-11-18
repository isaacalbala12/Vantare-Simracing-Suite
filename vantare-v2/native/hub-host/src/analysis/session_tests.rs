#![allow(clippy::unwrap_used)]
use super::real::{exe, inject, inject_with_delay, status};
use super::*;
use std::os::windows::process::CommandExt;

struct Writer {
    child: Child,
    output: BufReader<std::process::ChildStdout>,
}
impl Writer {
    fn open(path: &Path, mode: &str) -> Self {
        let mut command = Command::new(exe());
        command
            .arg(path)
            .arg(mode)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped());
        command.creation_flags(0x0800_0000);
        let mut child = command.spawn().unwrap();
        let output = BufReader::new(child.stdout.take().unwrap());
        let mut result = Self { child, output };
        assert_eq!(result.response()[0], "ready");
        result
    }
    fn response(&mut self) -> Value {
        let mut line = String::new();
        self.output.read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }
    fn request(&mut self, value: &Value) -> Value {
        writeln!(self.child.stdin.as_mut().unwrap(), "{value}").unwrap();
        self.response()
    }
    fn stop(mut self, finish: bool) {
        if finish {
            assert_eq!(self.request(&json!(["finish", 0]))[0], "finished");
        }
        drop(self.child.stdin.take());
        assert!(self.child.wait().unwrap().success());
    }
}
impl Drop for Writer {
    fn drop(&mut self) {
        if self.child.try_wait().unwrap().is_none() {
            self.child.kill().unwrap();
            self.child.wait().unwrap();
        }
    }
}
fn open_event(session: u64) -> Value {
    json!(["session-open",{"epoch":u64::MAX,"session":session,"kind":"race","kindText":"",
        "trackName":"Spa","vehicle":"Porsche","className":"GTE","startedAtMs":1000}])
}
fn close_event(session: u64) -> Value {
    json!(["session-close",{"epoch":u64::MAX,"session":session,"endedAtMs":2000,
        "simElapsedS":90.125,"finalPosition":3,"finalClassPosition":2,"lapsCompleted":1,
        "bestLapMs":90125,"endReason":"sessionChanged"}])
}
fn session_row() -> Value {
    let mut row = open_event(1)[1].clone();
    for (key, value) in close_event(1)[1].as_object().unwrap() {
        row[key] = value.clone();
    }
    row["sealed"] = true.into();
    row
}
fn lap_row(lap: u32) -> Value {
    json!({"epoch":u64::MAX,"session":1,"car":7,"lap":lap,"officialMs":90125,"sectorMs":[31000,30000,29125]})
}
fn metadata_fixture(path: &Path) {
    let mut writer = Writer::open(path, "--create");
    assert_eq!(writer.request(&open_event(1))[0], "ack-session");
    assert_eq!(writer.request(&close_event(1))[0], "ack-session");
    assert_eq!(writer.request(&open_event(2))[0], "ack-session");
    assert_eq!(
        writer.request(&json!(["lap",{"epoch":u64::MAX,"session":2,"car":7,"lap":0,
        "officialMs":null,"sectorMs":null}]))[0],
        "ack-lap"
    );
    writer.stop(true);
}
fn reaped(reader: &mut Reader) {
    assert!(reader.closed);
    assert!(reader.child.try_wait().unwrap().is_some());
    assert!(reader.pump.is_none());
}
#[test]
fn real_v2_sessions_keep_unsigned_keys_nulls_and_unsealed_laps() {
    let dir = Directory::new();
    metadata_fixture(&dir.db());
    let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
    let sessions = reader.sessions().unwrap();
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions[0].epoch, u64::MAX);
    assert_eq!(sessions[0].session, 2);
    assert!(!sessions[0].sealed);
    assert_eq!(sessions[0].ended_at_ms, None);
    assert_eq!(sessions[0].best_lap_ms, None);
    assert_eq!(sessions[0].end_reason, None);
    assert_eq!(sessions[0].track_name, "Spa");
    assert!(sessions[1].sealed);
    assert_eq!(sessions[1].final_position, Some(3));
    assert_eq!(sessions[1].kind, SessionKind::Race);
    assert_eq!(
        sessions[1].end_reason,
        Some(SessionEndReason::SessionChanged)
    );
    let laps = reader.lap_times(u64::MAX, 2).unwrap();
    assert_eq!(laps.len(), 1);
    assert_eq!(laps[0].official_ms, None);
    assert_eq!(laps[0].sector_ms, None);
    assert_eq!(
        reader.lap_times(u64::MAX, 99).unwrap(),
        Vec::<LapTime>::new()
    );
    assert!(!reader.closed);
}
#[test]
fn real_v1_is_supported_without_summaries_or_lap_times() {
    let dir = Directory::new();
    fs::write(dir.db(), include_bytes!("fixtures/session-v1.duckdb")).unwrap();
    let mut probe = Writer::open(&dir.db(), "--resume");
    assert_eq!(
        probe.request(&json!(["session-summaries"])),
        json!(["unsupported", "meta"])
    );
    probe.stop(false);
    let original = fs::read(dir.db()).unwrap();
    let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
    assert_eq!(reader.sessions().unwrap(), Vec::<SessionSummary>::new());
    assert_eq!(reader.lap_times(1, 1).unwrap(), Vec::<LapTime>::new());
    assert!(!reader.closed);
    drop(reader);
    assert_eq!(original, fs::read(dir.db()).unwrap());
}
#[test]
fn six_hundred_real_laps_cross_pages_and_cars_without_loss_or_duplicates() {
    let dir = Directory::new();
    let mut writer = Writer::open(&dir.db(), "--create");
    writer.request(&open_event(1));
    for index in 0..600 {
        let mut row = lap_row(index % 350);
        row["car"] = (7 + index / 350).into();
        assert_eq!(writer.request(&json!(["lap", row]))[0], "ack-lap");
    }
    writer.stop(true);
    let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
    let laps = reader.lap_times(u64::MAX, 1).unwrap();
    assert_eq!(laps.len(), 600);
    for (index, lap) in laps.iter().enumerate() {
        let index = u32::try_from(index).unwrap();
        assert_eq!((lap.car, lap.lap), (7 + index / 350, index % 350));
        assert_eq!(lap.official_ms, Some(90125));
        assert_eq!(lap.sector_ms, Some(vec![31000, 30000, 29125]));
    }
    assert!(
        laps.windows(2)
            .all(|rows| (rows[0].car, rows[0].lap) < (rows[1].car, rows[1].lap))
    );
}
#[test]
fn malformed_session_rows_envelopes_and_versions_are_unreadable_and_reaped() {
    let dir = Directory::new();
    metadata_fixture(&dir.db());
    let row = session_row();
    let mut frames = vec![
        json!(["session-summaries", "series-session.v2", 1, [row.clone()]]),
        json!(["session-summaries", "series-session.v1", 0, [row.clone()]]),
        json!([
            "session-summaries",
            "series-session.v1",
            1,
            [row.clone()],
            "extra"
        ]),
        json!(["session-summaries", "series-session.v1", -1, []]),
        json!(["session-summaries", "series-session.v1", 1.0, []]),
        json!([
            "session-summaries",
            "series-session.v1",
            257,
            vec![row.clone(); 257]
        ]),
    ];
    for (field, value) in [
        ("kind", json!("warmup")),
        ("endReason", json!("disconnect")),
        ("epoch", json!(1.0)),
        ("session", json!("1")),
        ("startedAtMs", json!(-1)),
        ("sealed", json!(1)),
        ("endedAtMs", json!(1.5)),
        ("simElapsedS", json!(-1.0)),
        ("finalPosition", json!(u64::MAX)),
        ("lapsCompleted", json!("1")),
        ("extra", json!(true)),
    ] {
        let mut bad = row.clone();
        bad[field] = value;
        frames.push(json!(["session-summaries", "series-session.v1", 1, [bad]]));
    }
    for field in row.as_object().unwrap().keys() {
        let mut bad = row.clone();
        bad.as_object_mut().unwrap().remove(field);
        frames.push(json!(["session-summaries", "series-session.v1", 1, [bad]]));
    }
    for field in ["kindText", "trackName", "vehicle", "className"] {
        let mut bad = row.clone();
        bad[field] = "é".repeat(129).into();
        frames.push(json!(["session-summaries", "series-session.v1", 1, [bad]]));
    }
    for frame in frames {
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let before = status(&reader);
        inject(&mut reader, vec![Ok(before), Ok(frame)]);
        assert_eq!(reader.sessions().unwrap_err().code, ErrorCode::Unreadable);
        reaped(&mut reader);
    }
}
#[test]
fn required_nullable_fields_and_utf8_limits_are_exact_even_outside_reader() {
    let mut row = session_row();
    row["kind"] = "other".into();
    row["kindText"] = "é".repeat(128).into();
    let summary: SessionSummary = serde_json::from_value(row.clone()).unwrap();
    assert_eq!(summary.kind, SessionKind::Other);
    assert_eq!(summary.kind_text.len(), 256);
    row["kindText"] = "é".repeat(129).into();
    assert!(serde_json::from_value::<SessionSummary>(row).is_err());
    let mut row = lap_row(0);
    row.as_object_mut().unwrap().remove("sectorMs");
    assert!(serde_json::from_value::<LapTime>(row).is_err());
}
#[test]
fn malformed_lap_pages_identity_order_totals_and_limit_fail_closed() {
    let dir = Directory::new();
    metadata_fixture(&dir.db());
    let row = lap_row(0);
    let mut frames = vec![
        json!(["lap-times", "series-laps.v2", 1, [row.clone()]]),
        json!(["lap-times", "series-laps.v1", 0, [row.clone()]]),
        json!(["lap-times", "series-laps.v1", 2, [row.clone()]]),
        json!(["lap-times", "series-laps.v1", 2, [row.clone(), row.clone()]]),
    ];
    for (field, value) in [
        ("epoch", json!(1)),
        ("session", json!(2)),
        ("car", json!(-1)),
        ("lap", json!(0.0)),
        ("officialMs", json!("90")),
        ("sectorMs", json!([1.0])),
        ("sectorMs", json!(vec![1; 17])),
        ("extra", json!(0)),
    ] {
        let mut bad = row.clone();
        bad[field] = value;
        frames.push(json!(["lap-times", "series-laps.v1", 1, [bad]]));
    }
    for frame in frames {
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let before = status(&reader);
        inject(&mut reader, vec![Ok(before), Ok(frame)]);
        assert_eq!(
            reader.lap_times(u64::MAX, 1).unwrap_err().code,
            ErrorCode::Unreadable
        );
        reaped(&mut reader);
    }
    let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
    let before = status(&reader);
    inject(
        &mut reader,
        vec![
            Ok(before),
            Ok(json!(["lap-times", "series-laps.v1", 4097, []])),
        ],
    );
    assert_eq!(
        reader.lap_times(u64::MAX, 1).unwrap_err().code,
        ErrorCode::Limit
    );
    reaped(&mut reader);
}
#[test]
fn total_cannot_change_between_pages_or_hide_the_tail() {
    let dir = Directory::new();
    metadata_fixture(&dir.db());
    for total in [256, 258] {
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let before = status(&reader);
        let first: Vec<_> = (0..256).map(lap_row).collect();
        inject(
            &mut reader,
            vec![
                Ok(before),
                Ok(json!(["lap-times", "series-laps.v1", 257, first])),
                Ok(json!([
                    "lap-times",
                    "series-laps.v1",
                    total,
                    [lap_row(256)]
                ])),
            ],
        );
        assert_eq!(
            reader.lap_times(u64::MAX, 1).unwrap_err().code,
            ErrorCode::Unreadable
        );
        reaped(&mut reader);
    }
}
#[test]
fn sessions_and_paginated_laps_share_a_deadline_and_cancel_reaps_the_real_helper() {
    let dir = Directory::new();
    metadata_fixture(&dir.db());
    for laps in [false, true] {
        let token = cancel();
        let mut reader = Reader::open(&exe(), &dir.db(), token.clone()).unwrap();
        token.store(true, Ordering::Release);
        let code = if laps {
            reader.lap_times(u64::MAX, 1).unwrap_err().code
        } else {
            reader.sessions().unwrap_err().code
        };
        assert_eq!(code, ErrorCode::Cancelled);
        reaped(&mut reader);
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        reader.timeout = Duration::from_secs(2);
        let mut frames = vec![Ok(status(&reader))];
        if laps {
            let first: Vec<_> = (0..256).map(lap_row).collect();
            frames.extend([
                Ok(json!(["lap-times", "series-laps.v1", 257, first])),
                Ok(json!(["lap-times", "series-laps.v1", 257, [lap_row(256)]])),
            ]);
        } else {
            frames.push(Ok(json!([
                "session-summaries",
                "series-session.v1",
                1,
                [session_row()]
            ])));
        }
        frames.push(Ok(status(&reader)));
        let delay = reader.timeout * 2 / 5;
        inject_with_delay(&mut reader, frames, delay);
        // Each response fits, but the operation (including all pages/status) does not.
        let code = if laps {
            reader.lap_times(u64::MAX, 1).unwrap_err().code
        } else {
            reader.sessions().unwrap_err().code
        };
        assert_eq!(code, ErrorCode::Deadline);
        reaped(&mut reader);
    }
}
#[test]
fn index_reuses_cache_invalidates_file_changes_and_exposes_only_file_names() {
    let dir = Directory::new();
    metadata_fixture(&dir.db());
    let mut index = SessionIndex::default();
    let first = index.refresh(&exe(), &dir.0, cancel()).unwrap();
    assert_eq!(first.len(), 1);
    let row = &first[0];
    assert_eq!(row.file_name, "recording.duckdb");
    assert!(!row.file_name.contains(['/', '\\', ':']));
    assert!(row.readable);
    assert!(!row.locked);
    assert_eq!(row.sessions.len(), 2);
    assert_eq!(row.size, fs::metadata(dir.db()).unwrap().len());
    let missing = dir.0.join("missing-helper.exe");
    assert_eq!(index.refresh(&missing, &dir.0, cancel()).unwrap(), first);
    let original = fs::metadata(dir.db()).unwrap().modified().unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(dir.db())
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(original + Duration::from_secs(1)))
        .unwrap();
    let stale = index.refresh(&missing, &dir.0, cancel()).unwrap();
    assert!(!stale[0].readable);
    assert!(!stale[0].locked);
    let refreshed = index.refresh(&exe(), &dir.0, cancel()).unwrap();
    assert_ne!(refreshed[0].modified, row.modified);
    let mut writer = Writer::open(&dir.db(), "--resume");
    writer.request(&open_event(3));
    writer.stop(false);
    let refreshed = index.refresh(&exe(), &dir.0, cancel()).unwrap();
    assert_eq!(refreshed[0].sessions.len(), 3);
}
#[test]
fn index_marks_live_writers_locked_even_after_cache_and_does_not_cache_failures() {
    let dir = Directory::new();
    metadata_fixture(&dir.db());
    let mut index = SessionIndex::default();
    index.refresh(&exe(), &dir.0, cancel()).unwrap();
    let writer = Writer::open(&dir.db(), "--resume");
    let rows = index.refresh(&exe(), &dir.0, cancel()).unwrap();
    assert!(rows[0].locked);
    assert!(!rows[0].readable);
    assert_eq!(rows[0].sessions, Vec::<SessionSummary>::new());
    writer.stop(false);
    let rows = index.refresh(&exe(), &dir.0, cancel()).unwrap();
    assert!(rows[0].readable);
    assert!(!rows[0].locked);
    let broken = dir.0.join("broken.duckdb");
    fs::write(&broken, b"bad database").unwrap();
    let rows = index.refresh(&exe(), &dir.0, cancel()).unwrap();
    assert_eq!(rows.len(), 2);
    assert!(
        !rows
            .iter()
            .find(|row| row.file_name == "broken.duckdb")
            .unwrap()
            .readable
    );
}
#[test]
fn unfinished_recordings_are_not_cached_and_cancelled_index_does_not_start_work() {
    let dir = Directory::new();
    let mut writer = Writer::open(&dir.db(), "--create");
    writer.request(&open_event(1));
    writer.stop(false);
    let mut index = SessionIndex::default();
    let rows = index.refresh(&exe(), &dir.0, cancel()).unwrap();
    assert!(rows[0].readable);
    assert!(!rows[0].sessions[0].sealed);
    let ready = dir.0.join("z-finished.duckdb");
    metadata_fixture(&ready);
    index.refresh(&exe(), &dir.0, cancel()).unwrap();
    let refreshed = index
        .refresh(&dir.0.join("missing.exe"), &dir.0, cancel())
        .unwrap();
    assert!(!refreshed[0].readable);
    assert!(!refreshed[0].locked);
    assert!(refreshed[1].readable);
    let token = cancel();
    token.store(true, Ordering::Release);
    assert_eq!(
        index.refresh(&exe(), &dir.0, token).unwrap_err().code,
        ErrorCode::Cancelled
    );
    let empty = dir.0.join("absent");
    assert_eq!(
        index.refresh(&exe(), &empty, cancel()).unwrap(),
        Vec::<RecordingSessions>::new()
    );
    assert!(!empty.exists());
}

#[test]
fn sessions_accept_a_retained_window_smaller_than_the_total() {
    let dir = Directory::new();
    metadata_fixture(&dir.db());
    let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
    let before = status(&reader);
    inject(
        &mut reader,
        vec![
            Ok(before.clone()),
            Ok(json!([
                "session-summaries",
                "series-session.v1",
                257,
                [session_row()]
            ])),
            Ok(before),
        ],
    );
    let sessions = reader.sessions().unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(
        sessions[0].session,
        session_row()["session"].as_u64().unwrap()
    );
    assert!(!reader.closed);
}
