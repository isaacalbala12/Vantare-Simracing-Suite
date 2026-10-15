//! La captura completa recorre el mismo traductor que las capturas reales previas.
use serde_json::json;
use std::{
    fs::{self, File},
    time::Duration,
};
use vantare_domain::Adapter;
use vantare_runtime::{
    adapter::{Replay, ReplayEvent, open_replay},
    lmu_recording::{Record, SCHEMA, Writer},
};

const FRAME: &[u8] = include_bytes!("../testdata/lmu-rest-2026-10-14/frame.bin");
const REST: &[u8] = include_bytes!("../testdata/lmu-rest-2026-10-14/standings.json");
const SESSION: &[u8] = include_bytes!("../testdata/lmu-rest-2026-10-14/sessionInfo.json");

fn expected_replay() -> Replay {
    let at = |ms| Duration::from_millis(ms);
    Replay::new(
        "1.4.2.0",
        [
            ReplayEvent::Shm {
                at: at(0),
                frame: FRAME.to_vec(),
            },
            ReplayEvent::Endpoint {
                at: at(100),
                started: at(10),
                path: "/rest/watch/standings".into(),
                body: Some(REST.to_vec()),
            },
            ReplayEvent::Endpoint {
                at: at(200),
                started: at(110),
                path: "/rest/watch/sessionInfo".into(),
                body: Some(SESSION.to_vec()),
            },
            ReplayEvent::Endpoint {
                at: at(2200),
                started: at(2100),
                path: "/rest/watch/standings".into(),
                body: None,
            },
            ReplayEvent::Shm {
                at: at(2300),
                frame: FRAME.to_vec(),
            },
        ],
    )
}

#[test]
fn full_capture_keeps_unused_bytes_and_replays_real_shm_and_independent_rest_identically() {
    let folder = std::env::temp_dir().join(format!("vantare-full-lmu-test-{}", std::process::id()));
    fs::create_dir(&folder).unwrap();
    let path = folder.join("test.lmu.gz");
    let mut writer = Writer::new(File::create(&path).unwrap());
    writer
        .record(Record {
            kind: "header".into(),
            details: json!({"schema":SCHEMA,"build":"1.4.2.0"}),
            ..Record::default()
        })
        .unwrap();
    let mut padded = FRAME.to_vec();
    padded.resize(327_680, 0x59);
    let at = |ms| Duration::from_millis(ms);
    let mut original = expected_replay();
    for (kind, key, ms, started, status, body) in [
        ("shm", "LMU_Data", 0, 0, None, padded.clone()),
        (
            "rest",
            "/rest/watch/standings",
            100,
            10,
            Some(200),
            REST.to_vec(),
        ),
        (
            "rest",
            "/rest/watch/sessionInfo",
            200,
            110,
            Some(200),
            SESSION.to_vec(),
        ),
        (
            "rest",
            "/rest/watch/standings",
            2200,
            2100,
            Some(500),
            b"bad json".to_vec(),
        ),
        ("shm", "LMU_Data", 2300, 2300, None, padded),
    ] {
        writer
            .record(Record {
                kind: kind.into(),
                key: key.into(),
                at_ns: ms * 1_000_000,
                started_ns: started * 1_000_000,
                status,
                body,
                details: json!({"stable":true}),
                ..Record::default()
            })
            .unwrap();
    }
    writer
        .record(Record {
            kind: "footer".into(),
            at_ns: 2_400_000_000,
            ..Record::default()
        })
        .unwrap();
    writer.finish().unwrap();
    let mut capture = open_replay(&path, None).unwrap();
    for ms in [0, 100, 200, 2200, 2300] {
        assert_eq!(capture.next_recorded_at(), Some(at(ms)));
        assert_eq!(
            capture.poll(at(ms)),
            original.poll(at(ms)),
            "cambia la foto a {ms}ms"
        );
    }
    assert_eq!(capture.poll(at(2400)), Ok(None));
    assert_eq!(capture.next_recorded_at(), None);
    drop(capture);
    fs::remove_dir_all(&folder).unwrap();
}
