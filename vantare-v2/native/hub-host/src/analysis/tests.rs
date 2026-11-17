#![allow(clippy::unwrap_used)]
use super::*;
use std::sync::atomic::AtomicU64;
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let p = fs::canonicalize(std::env::temp_dir())
            .unwrap()
            .join(format!(
                "host-analysis-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
        fs::create_dir(&p).unwrap();
        Self(p)
    }
    fn db(&self) -> PathBuf {
        self.0.join("recording.duckdb")
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn cancel() -> Cancel {
    Arc::new(AtomicBool::new(false))
}

fn timing_lap() -> Lap {
    let signal = json!({"reliable":2,"estimated":0,"stale":0,"unavailable":0,
        "mean":null,"min":null,"max":null});
    serde_json::from_value(json!({
        "epoch":1,"session":3,"car":7,"lap":5,"first_chunk":1,"next_chunk":null,
        "sealed":true,"gap":false,"samples":2,"observed_span_s":89.75,
        "first_elapsed_s":0.25,"last_elapsed_s":90.0,
        "speed":signal,"throttle":signal,"brake":signal
    }))
    .unwrap()
}

#[test]
fn approximate_time_requires_a_complete_lap_starting_near_the_line() {
    let mut lap = timing_lap();
    assert_eq!(lap.lap_time_approx_s(), Some(90.0));
    lap.first_elapsed_s = Some(0.0);
    assert_eq!(lap.lap_time_approx_s(), Some(90.0));
    lap.sealed = false;
    assert_eq!(lap.lap_time_approx_s(), None);
    lap.sealed = true;
    lap.gap = true;
    assert_eq!(lap.lap_time_approx_s(), None);
    lap.gap = false;
    lap.first_elapsed_s = Some(0.251);
    assert_eq!(lap.lap_time_approx_s(), None);
    lap.first_elapsed_s = None;
    assert_eq!(lap.lap_time_approx_s(), None);
    lap.first_elapsed_s = Some(0.0);
    lap.last_elapsed_s = None;
    assert_eq!(lap.lap_time_approx_s(), None);
}

#[test]
fn old_helper_summaries_default_to_unknown_elapsed_times() {
    let signal = json!({"reliable":0,"estimated":0,"stale":0,"unavailable":0,
        "mean":null,"min":null,"max":null});
    let lap: Lap = serde_json::from_value(json!({
        "epoch":1,"session":3,"car":7,"lap":5,"first_chunk":1,"next_chunk":null,
        "sealed":true,"gap":false,"samples":0,"observed_span_s":null,
        "speed":signal,"throttle":signal,"brake":signal
    }))
    .unwrap();
    assert_eq!(lap.first_elapsed_s, None);
    assert_eq!(lap.last_elapsed_s, None);
    assert_eq!(lap.lap_time_approx_s(), None);
}
#[test]
fn catalog_boundaries_and_absent_directory() {
    let dir = Directory::new();
    let absent = dir.0.join("absent");
    assert_eq!(recordings(&absent).unwrap(), Vec::<PathBuf>::new());
    assert!(!absent.exists());
    fs::create_dir(dir.0.join("sub.duckdb")).unwrap();
    for i in 0..257 {
        if i == 255 || i == 256 {
            let paths = recordings(&dir.0).unwrap();
            assert_eq!(paths.len(), i);
            assert!(paths.windows(2).all(|p| p[0] < p[1]));
        }
        fs::write(dir.0.join(format!("{i:03}.duckdb")), []).unwrap();
    }
    assert_eq!(recordings(&dir.0).unwrap_err().code, ErrorCode::Limit);
}
#[cfg(windows)]
mod real {
    use super::*;
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_WRITE_ATTRIBUTES;
    pub(super) fn exe() -> PathBuf {
        let path = std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join(format!("vantare-storage{}", std::env::consts::EXE_SUFFIX));
        assert!(
            path.is_file(),
            "gates.ps1 construye el helper en el mismo target"
        );
        path
    }
    fn writer(db: &Path) -> Child {
        Command::new(exe())
            .arg(db)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap()
    }
    fn fixture(db: &Path, car: u32, chunks: u64, gap: bool) {
        fixture_ids(
            db,
            &vec![(1, 3, car); usize::try_from(chunks).unwrap()],
            gap,
        );
    }
    fn fixture_ids(db: &Path, ids: &[(u64, u64, u32)], gap: bool) {
        let chunks = u64::try_from(ids.len()).unwrap();
        let mut previous = None;
        let mut offset = 0;
        let mut child = writer(db);
        let mut out = BufReader::new(child.stdout.take().unwrap());
        let mut line = String::new();
        out.read_line(&mut line).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
        for index in 1..=chunks {
            let (epoch, session, car) = ids[usize::try_from(index - 1).unwrap()];
            if previous != Some((epoch, session, car)) {
                offset = 0;
            }
            previous = Some((epoch, session, car));
            let sample = json!([
                index,
                [1, f64::from(u32::try_from(index - 1).unwrap())],
                [1, f64::from(u32::try_from(index - 1).unwrap())],
                [1, 50.0],
                [2, 0.5],
                [0, null]
            ]);
            let chunk = json!([
                "vantare.series-chunk.v1",
                index,
                0,
                offset,
                [
                    "vantare.player-lap.v1",
                    epoch,
                    session,
                    car,
                    5,
                    null,
                    gap,
                    [sample]
                ]
            ]);
            writeln!(
                child.stdin.as_mut().unwrap(),
                "{}",
                json!(["append", chunk])
            )
            .unwrap();
            offset += 1;
            line.clear();
            out.read_line(&mut line).unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&line).unwrap()[0],
                "ack",
                "{line}"
            );
        }
        writeln!(
            child.stdin.as_mut().unwrap(),
            "{}",
            json!(["finish", chunks])
        )
        .unwrap();
        line.clear();
        out.read_line(&mut line).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "finished");
        drop(child.stdin.take());
        assert!(child.wait().unwrap().success());
    }
    #[test]
    fn opens_summarizes_and_reads_bounded_pages_with_null_quality() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 33, false);
        let original = fs::read(dir.db()).unwrap();
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let summary = reader.summaries().unwrap();
        assert_eq!(
            (
                summary.watermark,
                summary.total,
                summary.finished,
                summary.attempted
            ),
            (33, 1, true, 33)
        );
        assert_eq!(summary.laps[0].speed.mean, Some(50.0));
        assert_eq!(summary.laps[0].first_elapsed_s, Some(0.0));
        assert_eq!(summary.laps[0].last_elapsed_s, Some(32.0));
        assert_eq!(summary.laps[0].lap_time_approx_s(), None); // Sin seal.
        let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
        let mut counts = vec![];
        while !cursor.done() {
            let page = reader.page(&mut cursor, 16).unwrap();
            counts.push(page.chunks);
            for sample in page.samples {
                let sample = sample.unwrap();
                assert_eq!(sample.speed, Some(50.0));
                assert_eq!(sample.throttle, None);
                assert_eq!(sample.brake, None);
            }
        }
        assert_eq!(counts, vec![16, 16, 1]);
        drop(reader);
        assert_eq!(fs::read(dir.db()).unwrap(), original);
    }
    #[test]
    fn different_sessions_and_cars_are_valid_in_distinct_laps() {
        let dir = Directory::new();
        fixture_ids(&dir.db(), &[(1, 3, 7), (1, 4, 8)], false);
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let summary = reader.summaries().unwrap();
        assert_eq!(summary.laps.len(), 2);
        assert_eq!((summary.laps[0].session, summary.laps[0].car), (3, 7));
        assert_eq!((summary.laps[1].session, summary.laps[1].car), (4, 8));
        for lap in &summary.laps {
            let mut cursor = reader.cursor(lap).unwrap();
            assert_eq!(reader.page(&mut cursor, 16).unwrap().chunks, 1);
            assert!(cursor.done());
        }
    }
    #[test]
    fn gaps_are_explicit_and_cancel_reaps_helper_releasing_writer_lock() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 2, true);
        let token = cancel();
        let mut reader = Reader::open(&exe(), &dir.db(), token.clone()).unwrap();
        let summary = reader.summaries().unwrap();
        assert!(summary.laps[0].gap);
        let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
        let page = reader.page(&mut cursor, 16).unwrap();
        assert_eq!(page.samples.iter().filter(|p| p.is_none()).count(), 4);
        token.store(true, Ordering::Release);
        assert_eq!(reader.summaries().unwrap_err().code, ErrorCode::Cancelled);
        assert!(reader.child.try_wait().unwrap().is_some());
        assert!(reader.pump.is_none());
        let mut writer = writer(&dir.db());
        let mut line = String::new();
        BufReader::new(writer.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
        drop(writer.stdin.take());
        assert!(writer.wait().unwrap().success());
    }
    #[test]
    fn actual_windows_writer_lock_has_typed_code() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 1, false);
        let mut child = writer(&dir.db());
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
        let failure = Reader::open(&exe(), &dir.db(), cancel()).err().unwrap();
        drop(child.stdin.take());
        assert!(child.wait().unwrap().success());
        assert_eq!(failure.code, ErrorCode::Locked, "{}", failure.diagnostic);
    }
    #[test]
    fn absent_and_unreadable_are_distinct() {
        let dir = Directory::new();
        assert_eq!(
            Reader::open(&exe(), &dir.db(), cancel())
                .err()
                .unwrap()
                .code,
            ErrorCode::Missing
        );
        fs::write(dir.db(), b"broken database").unwrap();
        assert_eq!(
            Reader::open(&exe(), &dir.db(), cancel())
                .err()
                .unwrap()
                .code,
            ErrorCode::Unreadable
        );
    }
    #[test]
    fn replacement_and_changed_identity_reject_old_cursor() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 1, false);
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let summary = reader.summaries().unwrap();
        let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
        drop(reader);
        fs::remove_file(dir.db()).unwrap();
        fixture(&dir.db(), 8, 2, false);
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        reader.summaries().unwrap();
        assert_eq!(
            reader.page(&mut cursor, 16).err().unwrap().code,
            ErrorCode::Changed
        );
    }
    #[test]
    fn watermark_mismatch_is_rejected_before_samples() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 1, false);
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let summary = reader.summaries().unwrap();
        let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
        reader.summary.watermark += 1;
        assert_eq!(
            reader.page(&mut cursor, 16).err().unwrap().code,
            ErrorCode::Changed
        );
        assert!(reader.child.try_wait().unwrap().is_some());
    }
    #[test]
    fn helper_codes_override_diagnostic_text() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 0, false);
        for (code, expected) in [
            ("locked", ErrorCode::Locked),
            ("incompatible", ErrorCode::Incompatible),
            ("missing", ErrorCode::Missing),
            ("unreadable", ErrorCode::Unreadable),
            ("unknown", ErrorCode::Unreadable),
        ] {
            let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
            let (sender, receiver) = mpsc::sync_channel(1);
            reader.output = receiver;
            sender
                .send(Ok(json!(["error", code, "being used by another process"])))
                .unwrap();
            assert_eq!(
                reader
                    .receive(Instant::now() + reader.timeout)
                    .unwrap_err()
                    .code,
                expected
            );
        }
    }
    pub(super) fn status(reader: &Reader) -> Value {
        json!([
            "status",
            reader.summary.watermark,
            reader.summary.finished,
            reader.summary.attempted
        ])
    }
    fn plot_chunk(index: u64, offset: usize) -> Value {
        json!({"index":index,"offset":offset,"epoch":1,"session":3,"car":7,"lap":5,"gap":false,"samples":[{"speed":50.0}]})
    }
    pub(super) fn inject(reader: &mut Reader, frames: Vec<Result<Value>>) {
        inject_with_delay(reader, frames, Duration::ZERO);
    }
    pub(super) fn inject_with_delay(
        reader: &mut Reader,
        frames: Vec<Result<Value>>,
        delay: Duration,
    ) {
        let (sender, receiver) = mpsc::channel();
        let original = std::mem::replace(&mut reader.output, receiver);
        let pump = reader.pump.take().unwrap();
        // Consumir también las respuestas reales: cerrar su pipe provocaría
        // BrokenPipe en el helper antes de poder comprobar el deadline inyectado.
        reader.pump = Some(std::thread::spawn(move || {
            for frame in frames {
                if original.recv().is_err() {
                    break;
                }
                std::thread::sleep(delay);
                if sender.send(frame).is_err() {
                    break;
                }
            }
            while original.recv().is_ok() {}
            pump.join().unwrap();
        }));
    }
    #[test]
    fn summaries_and_pages_share_one_deadline_and_reap_the_helper() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 1, false);
        for page in [false, true] {
            let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
            let summary = reader.summaries().unwrap();
            let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
            let timeout = Duration::from_secs(2);
            reader.timeout = timeout;
            let reply = if page {
                json!(["plot-page", "series-plot.v1", [plot_chunk(1, 0)]])
            } else {
                reader
                    .request(&json!(["summaries"]), Instant::now() + reader.timeout)
                    .unwrap()
            };
            let frames = [status(&reader), reply, status(&reader)];
            // Esperas deliberadas: tres respuestas válidas lentas tras el ready real.
            // Cada una cabe en el plazo, pero juntas exceden el presupuesto único.
            inject_with_delay(
                &mut reader,
                frames.into_iter().map(Ok).collect(),
                timeout * 2 / 5,
            );
            let start = Instant::now();
            let failure = if page {
                reader.page(&mut cursor, 16).err().unwrap()
            } else {
                reader.summaries().err().unwrap()
            };
            let elapsed = start.elapsed();
            assert_eq!(failure.code, ErrorCode::Deadline);
            // Solo cota inferior: fallar por plazo no puede ocurrir antes de agotarlo.
            // Una cota superior de reloj mediría además matar y recoger el helper y
            // unir el hilo, cuyo coste depende de la CPU; bajo carga lo hacía frágil.
            assert!(elapsed >= timeout, "{elapsed:?}");
            assert!(reader.child.try_wait().unwrap().is_some());
            assert!(reader.pump.is_none());
        }
    }
    #[test]
    fn oversized_frame_is_rejected_and_reaps_the_helper() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 1, false);
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let bytes = format!("[\"{}\"]\n", "x".repeat(MAX_FRAME));
        let frame = read_response(&mut BufReader::new(bytes.as_bytes()));
        inject(&mut reader, vec![frame]);
        assert_eq!(reader.summaries().unwrap_err().code, ErrorCode::Unreadable);
        assert!(reader.child.try_wait().unwrap().is_some());
    }
    #[test]
    fn invalid_limits_and_chunk_order_are_rejected() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 2, false);
        for limit in [0, 17] {
            let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
            let summary = reader.summaries().unwrap();
            let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
            assert_eq!(
                reader.page(&mut cursor, limit).err().unwrap().code,
                ErrorCode::Limit
            );
            assert!(reader.child.try_wait().unwrap().is_some());
        }
        for chunks in [
            vec![plot_chunk(2, 1), plot_chunk(1, 0)],
            vec![plot_chunk(1, 0), plot_chunk(1, 1)],
            vec![plot_chunk(1, usize::MAX)],
        ] {
            let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
            let summary = reader.summaries().unwrap();
            let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
            let frames = vec![
                Ok(status(&reader)),
                Ok(json!(["plot-page", "series-plot.v1", chunks])),
            ];
            inject(&mut reader, frames);
            assert_eq!(
                reader.page(&mut cursor, 16).err().unwrap().code,
                ErrorCode::Unreadable
            );
            assert!(reader.child.try_wait().unwrap().is_some());
        }
    }
    #[test]
    fn offset_jump_is_an_explicit_gap_and_zero_first_chunk_is_invalid() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 2, false);
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let summary = reader.summaries().unwrap();
        let mut lap = summary.laps[0].clone();
        lap.first_chunk = 0;
        assert_eq!(
            reader.cursor(&lap).err().unwrap().code,
            ErrorCode::Unreadable
        );
        let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
        let frames = vec![
            Ok(status(&reader)),
            Ok(json!([
                "plot-page",
                "series-plot.v1",
                [plot_chunk(1, 4), plot_chunk(2, 5)]
            ])),
            Ok(status(&reader)),
        ];
        inject(&mut reader, frames);
        let page = reader.page(&mut cursor, 16).unwrap();
        assert_eq!(page.samples.len(), 3);
        assert!(page.samples[0].is_none());
        assert_eq!(page.samples[1].unwrap().speed, Some(50.0));
        assert_eq!(page.samples[2].unwrap().speed, Some(50.0));
    }
    #[test]
    fn changed_file_stamp_with_open_reader_rejects_samples_and_reaps_helper() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 1, false);
        let mut reader = Reader::open(&exe(), &dir.db(), cancel()).unwrap();
        let summary = reader.summaries().unwrap();
        let mut cursor = reader.cursor(&summary.laps[0]).unwrap();
        // Cambia metadata real sin escribir datos ni interferir con el lock DuckDB.
        fs::OpenOptions::new()
            .access_mode(FILE_WRITE_ATTRIBUTES)
            .open(dir.db())
            .unwrap()
            .set_times(
                fs::FileTimes::new().set_modified(reader.stamp.modified + Duration::from_secs(1)),
            )
            .unwrap();
        assert_ne!(stamp(&dir.db()).unwrap(), reader.stamp);
        assert_eq!(
            reader.page(&mut cursor, 16).err().unwrap().code,
            ErrorCode::Changed
        );
        assert!(reader.child.try_wait().unwrap().is_some());
    }
    #[test]
    fn deadline_on_real_helper_cleans_up_open() {
        let dir = Directory::new();
        fixture(&dir.db(), 7, 0, false);
        assert_eq!(
            Reader::open_with_timeout(&exe(), &dir.db(), cancel(), Duration::ZERO)
                .err()
                .unwrap()
                .code,
            ErrorCode::Deadline
        );
        let mut child = writer(&dir.db());
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
        drop(child.stdin.take());
        assert!(child.wait().unwrap().success());
    }

    #[test]
    fn bridge_worker_uses_real_helper_and_replaces_sessions() {
        use crate::analysis::catalog::{AnalysisState, State};
        use crate::protocol::{HostError, Reply, Request};
        fn complete(state: &mut State, request: &Request) -> std::result::Result<Reply, HostError> {
            let now = Instant::now();
            if let Some(reply) = state.start(3, request, now)? {
                return Ok(reply);
            }
            // Explicit completion synchronization; the production poll itself never waits.
            state.wait_for_test();
            state.poll(now, true, false).unwrap().1
        }
        let dir = Directory::new();
        fixture(&dir.db(), 7, 2, false);
        let mut state = State::new(dir.0.clone());
        state.helper_for_test(exe());
        let id = state.catalog().unwrap()[0].id.clone();
        assert!(matches!(
            complete(&mut state, &Request::AnalysisInspect { id: id.clone() }).unwrap(),
            Reply::AnalysisInspect {
                state: AnalysisState::Complete,
                laps: 1,
                ..
            }
        ));
        let first = complete(&mut state, &Request::AnalysisOpen { id: id.clone() }).unwrap();
        let Reply::AnalysisOpen {
            session: old,
            watermark,
            attempted,
            total,
            laps,
            ..
        } = first
        else {
            panic!("open");
        };
        assert_eq!(
            (watermark.as_str(), attempted.as_str(), total.as_str()),
            ("2", "2", "1")
        );
        assert_eq!(
            sessions,
            Vec::<crate::analysis::catalog::AnalysisSessionSummary>::new()
        );
        assert_eq!(
            (laps[0].session, laps[0].lap_time_ms, &laps[0].sectors_ms),
            (None, None, &None)
        );
        assert_eq!(
            (laps[0].index, laps[0].car, laps[0].lap_time_approx_ms),
            (0, 7, None)
        );
        let Reply::AnalysisOpen { session, .. } =
            complete(&mut state, &Request::AnalysisOpen { id }).unwrap()
        else {
            panic!("open");
        };
        assert_ne!(session, old);
        assert_eq!(
            complete(&mut state, &Request::AnalysisClose { session: old }),
            Err(HostError::AnalysisNotFound)
        );
        assert_eq!(
            complete(&mut state, &Request::AnalysisClose { session }),
            Ok(Reply::AnalysisClose {})
        );
        drop(state);
        let mut child = writer(&dir.db());
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
        drop(child.stdin.take());
        assert!(child.wait().unwrap().success());
    }
    #[test]
    fn bridge_inspect_reports_unconfirmed_locked_and_unreadable_as_states() {
        use crate::analysis::catalog::{AnalysisState, State};
        use crate::protocol::{Reply, Request};
        let dir = Directory::new();
        let mut child = writer(&dir.db());
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
        let mut state = State::new(dir.0.clone());
        state.helper_for_test(exe());
        let id = state.catalog().unwrap()[0].id.clone();
        state
            .start(
                1,
                &Request::AnalysisInspect { id: id.clone() },
                Instant::now(),
            )
            .unwrap();
        state.wait_for_test();
        assert!(matches!(
            state.poll(Instant::now(), true, false).unwrap().1,
            Ok(Reply::AnalysisInspect {
                state: AnalysisState::Locked,
                ..
            })
        ));
        drop(child.stdin.take());
        assert!(child.wait().unwrap().success());
        state
            .start(2, &Request::AnalysisInspect { id }, Instant::now())
            .unwrap();
        state.wait_for_test();
        assert!(matches!(
            state.poll(Instant::now(), true, false).unwrap().1,
            Ok(Reply::AnalysisInspect {
                state: AnalysisState::Unconfirmed,
                ..
            })
        ));
        fs::write(dir.0.join("bad.duckdb"), b"bad database").unwrap();
        let rows = state.catalog().unwrap();
        let id = rows
            .iter()
            .find(|row| row.size_bytes == 12)
            .unwrap()
            .id
            .clone();
        state
            .start(3, &Request::AnalysisInspect { id }, Instant::now())
            .unwrap();
        state.wait_for_test();
        assert!(matches!(
            state.poll(Instant::now(), true, false).unwrap().1,
            Ok(Reply::AnalysisInspect {
                state: AnalysisState::Unreadable,
                ..
            })
        ));
    }
    #[test]
    fn bridge_inspect_recognizes_a_real_duckdb_without_the_series_schema() {
        use crate::analysis::catalog::{AnalysisState, State};
        use crate::protocol::{Reply, Request};
        let dir = Directory::new();
        // Empty DB generated using the official DuckDB 1.5.5 duckdb_open/close API.
        fs::write(dir.db(), include_bytes!("fixtures/no-series.duckdb")).unwrap();
        let mut state = State::new(dir.0.clone());
        state.helper_for_test(exe());
        let id = state.catalog().unwrap()[0].id.clone();
        state
            .start(1, &Request::AnalysisInspect { id }, Instant::now())
            .unwrap();
        state.wait_for_test();
        assert!(matches!(
            state.poll(Instant::now(), true, false).unwrap().1,
            Ok(Reply::AnalysisInspect {
                state: AnalysisState::Incompatible,
                ..
            })
        ));
    }
    #[test]
    fn bridge_cancel_reaps_an_opening_helper_and_frees_the_writer_lock() {
        use crate::analysis::catalog::State;
        use crate::protocol::{HostError, Request};
        let dir = Directory::new();
        fixture(&dir.db(), 7, 2, false);
        let mut state = State::new(dir.0.clone());
        state.helper_for_test(exe());
        let id = state.catalog().unwrap()[0].id.clone();
        let now = Instant::now();
        let (opened, resume) = state.pause_next_read_for_test();
        state.start(1, &Request::AnalysisOpen { id }, now).unwrap();
        let process =
            crate::test_support::process(opened.recv_timeout(Duration::from_secs(10)).unwrap())
                .unwrap();
        assert!(crate::test_support::running(&process));
        assert!(state.cancel());
        resume.send(()).unwrap();
        assert_eq!(
            state.poll(now, true, false),
            Some((1, Err(HostError::AnalysisCancelled)))
        );
        state.wait_for_test();
        assert!(state.poll(now, true, false).is_none());
        crate::test_support::terminated(&process);
        drop(state);
        let mut child = writer(&dir.db());
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
        drop(child.stdin.take());
        assert!(child.wait().unwrap().success());
    }
    #[test]
    fn dropping_worker_with_an_open_helper_and_pending_work_reaps_it() {
        use crate::analysis::catalog::State;
        use crate::protocol::Request;
        let dir = Directory::new();
        fixture(&dir.db(), 7, 2, false);
        let mut state = State::new(dir.0.clone());
        state.helper_for_test(exe());
        let id = state.catalog().unwrap()[0].id.clone();
        let (opened, resume) = state.pause_next_read_for_test();
        state
            .start(1, &Request::AnalysisOpen { id }, Instant::now())
            .unwrap();
        let process =
            crate::test_support::process(opened.recv_timeout(Duration::from_secs(10)).unwrap())
                .unwrap();
        assert!(crate::test_support::running(&process));
        drop(resume); // Releases the test barrier; Drop cancels the real Reader.
        drop(state);
        crate::test_support::terminated(&process);
        let mut child = writer(&dir.db());
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()[0], "ready");
        drop(child.stdin.take());
        assert!(child.wait().unwrap().success());
    }
    #[test]
    fn inspect_cancel_and_timeout_keep_the_previous_reader_alive() {
        use crate::analysis::catalog::State;
        use crate::protocol::{HostError, Reply, Request};
        for mode in ["idle", "cancel", "timeout"] {
            let dir = Directory::new();
            fixture(&dir.db(), 7, 2, false);
            let mut state = State::new(dir.0.clone());
            state.helper_for_test(exe());
            let id = state.catalog().unwrap()[0].id.clone();
            let now = Instant::now();
            let (opened, resume) = state.pause_next_read_for_test();
            state
                .start(1, &Request::AnalysisOpen { id: id.clone() }, now)
                .unwrap();
            let process =
                crate::test_support::process(opened.recv_timeout(Duration::from_secs(10)).unwrap())
                    .unwrap();
            resume.send(()).unwrap();
            state.wait_for_test();
            let Ok(Reply::AnalysisOpen { session, .. }) = state.poll(now, true, false).unwrap().1
            else {
                panic!("open");
            };
            if mode == "idle" {
                assert!(!state.cancel());
            } else {
                let (opened, resume) = state.pause_next_read_for_test();
                state
                    .start(2, &Request::AnalysisInspect { id }, now)
                    .unwrap();
                opened.recv_timeout(Duration::from_secs(10)).unwrap();
                if mode == "cancel" {
                    assert!(state.cancel());
                }
                let clock = now
                    + if mode == "timeout" {
                        Duration::from_secs(40)
                    } else {
                        Duration::ZERO
                    };
                assert_eq!(
                    state.poll(clock, true, false),
                    Some((
                        2,
                        Err(if mode == "timeout" {
                            HostError::AnalysisTimeout
                        } else {
                            HostError::AnalysisCancelled
                        })
                    ))
                );
                resume.send(()).unwrap();
                state.wait_for_test();
                assert!(state.poll(now, true, false).is_none());
            }
            assert!(crate::test_support::running(&process));
            state
                .start(3, &Request::AnalysisClose { session }, now)
                .unwrap();
            state.wait_for_test();
            assert_eq!(
                state.poll(now, true, false).unwrap().1,
                Ok(Reply::AnalysisClose {})
            );
            crate::test_support::terminated(&process);
        }
    }
}

#[cfg(windows)]
#[path = "session_tests.rs"]
mod session_tests;
