use crate::analysis::catalog::{
    AnalysisLap, AnalysisRow, AnalysisSessionEndReason, AnalysisSessionKind,
    AnalysisSessionSummary, AnalysisSignal, AnalysisState,
};
use crate::analysis::projection::{
    AnalysisGaps, AnalysisPoint, AnalysisRange, AnalysisSeries, DeltaUnavailable,
};
use crate::analysis::status::{
    AnalysisLastPrune, AnalysisPruneItem, AnalysisPruneReason, AnalysisPruneResult,
    AnalysisRecordingCause, AnalysisRecordingLimits, AnalysisRecordingState,
    AnalysisRecordingStatus, PRUNE_MAX,
};
use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<AnalysisRecordingStatus>(&mut text);
    declare::<AnalysisRecordingState>(&mut text);
    declare::<AnalysisRecordingCause>(&mut text);
    declare::<AnalysisRecordingLimits>(&mut text);
    declare::<AnalysisLastPrune>(&mut text);
    declare::<AnalysisPruneItem>(&mut text);
    declare::<AnalysisPruneReason>(&mut text);
    declare::<AnalysisPruneResult>(&mut text);

    declare::<AnalysisRow>(&mut text);
    declare::<AnalysisState>(&mut text);
    declare::<AnalysisSignal>(&mut text);
    declare::<AnalysisLap>(&mut text);
    declare::<AnalysisSessionKind>(&mut text);
    declare::<AnalysisSessionEndReason>(&mut text);
    declare::<AnalysisSessionSummary>(&mut text);
    session_constants(&mut text);
    declare::<AnalysisPoint>(&mut text);
    declare::<AnalysisSeries>(&mut text);
    declare::<AnalysisRange>(&mut text);
    declare::<AnalysisGaps>(&mut text);
    declare::<DeltaUnavailable>(&mut text);
    constants!(
        &mut text,
        "analysisPointsMax",
        crate::analysis::projection::MAX_POINTS
    );
    constants!(
        &mut text,
        "analysisDeltaUnavailable",
        [
            DeltaUnavailable::GapInA,
            DeltaUnavailable::GapInB,
            DeltaUnavailable::NoCommonRange
        ]
    );
    constants!(
        &mut text,
        "analysisErrors",
        [
            HostError::AnalysisIncomparable,
            HostError::AnalysisNotFound,
            HostError::AnalysisLocked,
            HostError::AnalysisIncompatible,
            HostError::AnalysisUnreadable,
            HostError::AnalysisChanged,
            HostError::AnalysisTooMany,
            HostError::AnalysisTooLarge,
            HostError::AnalysisCancelled,
            HostError::AnalysisTimeout
        ]
    );
    constants!(
        &mut text,
        "analysisMax",
        crate::analysis::catalog::CATALOG_MAX
    );
    constants!(
        &mut text,
        "analysisStates",
        [
            AnalysisState::Complete,
            AnalysisState::Unconfirmed,
            AnalysisState::Locked,
            AnalysisState::Incompatible,
            AnalysisState::Unreadable
        ]
    );
    status_constants(&mut text);
    text
}
fn session_constants(text: &mut String) {
    constants!(
        text,
        "analysisSessionKinds",
        [
            AnalysisSessionKind::Practice,
            AnalysisSessionKind::Qualifying,
            AnalysisSessionKind::Race,
            AnalysisSessionKind::Other,
            AnalysisSessionKind::Unknown,
        ]
    );
    constants!(
        text,
        "analysisSessionEndReasons",
        [
            AnalysisSessionEndReason::SessionChanged,
            AnalysisSessionEndReason::CoreStopped,
        ]
    );
    let corpus = corpus();
    let reply = |method| {
        corpus["host"]
            .as_array()
            .expect("analysis corpus replies")
            .iter()
            .map(|frame| &frame["result"])
            .find(|reply| reply["method"] == method)
            .expect("analysis reply sample")
    };
    let open = reply("analysis.open");
    let inspect = reply("analysis.inspect");
    constants!(text, "analysisOpenKeys", keys(open));
    constants!(text, "analysisInspectKeys", keys(inspect));
    constants!(text, "analysisSessionKeys", keys(&open["sessions"][0]));
    constants!(text, "analysisLapKeys", keys(&open["laps"][0]));
}

fn keys(value: &serde_json::Value) -> Vec<&str> {
    let mut keys: Vec<_> = value
        .as_object()
        .expect("analysis reply object")
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    keys
}

fn session_sample() -> AnalysisSessionSummary {
    AnalysisSessionSummary {
        index: 0,
        kind: AnalysisSessionKind::Race,
        kind_text: None,
        track_name: Some("Spa".into()),
        vehicle: Some("Porsche".into()),
        class_name: Some("GT3".into()),
        started_at_ms: 1_700_000_000_000,
        ended_at_ms: Some(1_700_000_120_000),
        sealed: true,
        end_reason: Some(AnalysisSessionEndReason::SessionChanged),
        position_at_close: Some(3),
        class_position_at_close: Some(2),
        laps_completed: Some(1),
        best_lap_ms: Some(111_625),
    }
}

pub(crate) fn corpus() -> serde_json::Value {
    let signal = AnalysisSignal {
        reliable: 7,
        estimated: 1,
        stale: 2,
        unavailable: 3,
        min: Some(1.into()),
        mean: serde_json::Number::from_f64(1.5),
        max: Some(2.into()),
    };
    let mut host: Vec<_> = vec![
        Reply::AnalysisCatalog {
            recordings: vec![AnalysisRow {
                id: "a".repeat(64),
                recording: false,
                started_at_ms: 1_700_000_000_000,
                size_bytes: 9_007_199_254_740_991,
            }],
            max: 256,
        },
        Reply::AnalysisOpen {
            session: "b".repeat(64),
            watermark: u64::MAX.to_string(),
            finished: true,
            attempted: u64::MAX.to_string(),
            total: u64::MAX.to_string(),
            laps: vec![AnalysisLap {
                index: 0,
                lap: 1,
                car: 7,
                sealed: true,
                gap: false,
                samples: 13,
                lap_time_approx_ms: Some(111_600),
                session: Some(0),
                lap_time_ms: Some(111_625),
                sectors_ms: Some(vec![35_000, 40_000, 36_625]),
                speed: signal.clone(),
                throttle: signal.clone(),
                brake: signal,
            }],
            sessions: vec![session_sample()],
        },
        Reply::AnalysisClose {},
        Reply::AnalysisCancel { cancelled: false },
    ]
    .into_iter()
    .map(sample_response)
    .collect();
    host.push(sample_response(Reply::AnalysisOpen {
        session: "c".repeat(64),
        watermark: "0".into(),
        finished: false,
        attempted: "0".into(),
        total: "0".into(),
        laps: vec![],
        sessions: vec![],
    }));
    inspect_corpus(&mut host);
    for error in [
        HostError::AnalysisIncomparable,
        HostError::AnalysisNotFound,
        HostError::AnalysisLocked,
        HostError::AnalysisIncompatible,
        HostError::AnalysisUnreadable,
        HostError::AnalysisChanged,
        HostError::AnalysisTooMany,
        HostError::AnalysisTooLarge,
        HostError::AnalysisCancelled,
        HostError::AnalysisTimeout,
    ] {
        host.push(HostToUi::Failure { id: 1, error });
    }
    compare_corpus(&mut host);
    host.push(sample_response(Reply::AnalysisStatus { status: None }));
    host.push(sample_response(Reply::AnalysisStatus {
        status: Some(status_sample()),
    }));
    serde_json::json!({"host": host, "ui": requests()})
}

fn inspect_corpus(host: &mut Vec<HostToUi>) {
    for state in [
        AnalysisState::Complete,
        AnalysisState::Unconfirmed,
        AnalysisState::Locked,
        AnalysisState::Incompatible,
        AnalysisState::Unreadable,
    ] {
        host.push(sample_response(Reply::AnalysisInspect {
            state: state.clone(),
            laps: 1,
            best_lap_approx_ms: Some(111_600),
            sessions: if state == AnalysisState::Complete {
                vec![session_sample()]
            } else {
                vec![]
            },
        }));
    }
    host.push(sample_response(Reply::AnalysisInspect {
        state: AnalysisState::Complete,
        laps: 0,
        best_lap_approx_ms: None,
        sessions: vec![],
    }));
}

fn requests() -> Vec<UiToHost> {
    [
        Request::AnalysisStatus {},
        Request::AnalysisCatalog {},
        Request::AnalysisInspect { id: "a".repeat(64) },
        Request::AnalysisOpen { id: "a".repeat(64) },
        Request::AnalysisClose {
            session: "b".repeat(64),
        },
        Request::AnalysisCompare {
            session: "b".repeat(64),
            a: 0,
            b: 1,
        },
        Request::AnalysisCancel {},
    ]
    .into_iter()
    .map(|request| UiToHost::Request { id: 1, request })
    .collect()
}

fn compare_corpus(host: &mut Vec<HostToUi>) {
    let series = AnalysisSeries {
        a: vec![AnalysisPoint {
            distance: 0.into(),
            elapsed: Some(0.into()),
            value: 180.into(),
            segment: 0,
        }],
        b: vec![],
    };
    for reason in [
        None,
        Some(DeltaUnavailable::GapInA),
        Some(DeltaUnavailable::GapInB),
        Some(DeltaUnavailable::NoCommonRange),
    ] {
        host.push(sample_response(Reply::AnalysisCompare {
            distance_range: [0.into(), 100.into()],
            speed: series.clone(),
            throttle: series.clone(),
            brake: series.clone(),
            delta: reason.is_none().then(|| series.a.clone()),
            delta_unavailable: reason,
            gaps: AnalysisGaps {
                a: vec![],
                b: vec![],
            },
        }));
    }
}

pub(crate) fn status_sample() -> AnalysisRecordingStatus {
    AnalysisRecordingStatus {
        state: AnalysisRecordingState::Recording,
        cause: None,
        row_id: Some("b".repeat(64)),
        started_at_ms: 1_700_000_120_000,
        durable_watermark: Some(u64::MAX.to_string()),
        attempted: Some(u64::MAX.to_string()),
        limits: AnalysisRecordingLimits {
            max_recordings: 200,
            max_bytes: 5_368_709_120,
        },
        last_prune: AnalysisLastPrune {
            at_ms: 1_700_000_100_000,
            items: [
                (
                    "series-1-2.duckdb",
                    AnalysisPruneReason::Count,
                    AnalysisPruneResult::Deleted,
                ),
                (
                    "series-3-4.duckdb",
                    AnalysisPruneReason::Bytes,
                    AnalysisPruneResult::SkippedInUse,
                ),
                (
                    "series-5-6.duckdb.creating-7-8",
                    AnalysisPruneReason::Orphan,
                    AnalysisPruneResult::Error,
                ),
            ]
            .into_iter()
            .map(|(name, reason, result)| AnalysisPruneItem {
                name: name.into(),
                size_bytes: 4096,
                modified_at_ms: 1_700_000_000_000,
                reason,
                result,
            })
            .collect(),
        },
    }
}

fn status_constants(text: &mut String) {
    constants!(
        text,
        "analysisRecordingStates",
        [
            AnalysisRecordingState::Recording,
            AnalysisRecordingState::Degraded,
            AnalysisRecordingState::Stopped
        ]
    );
    constants!(
        text,
        "analysisRecordingCauses",
        [
            AnalysisRecordingCause::InvalidDirectory,
            AnalysisRecordingCause::HelperMissing,
            AnalysisRecordingCause::VolumeWithoutHardLinks,
            AnalysisRecordingCause::WriterDown,
            AnalysisRecordingCause::FinishTimeout,
            AnalysisRecordingCause::QuotaUnmet,
            AnalysisRecordingCause::PruneIncomplete,
            AnalysisRecordingCause::Unknown
        ]
    );
    constants!(
        text,
        "analysisPruneReasons",
        [
            AnalysisPruneReason::Count,
            AnalysisPruneReason::Bytes,
            AnalysisPruneReason::Orphan
        ]
    );
    constants!(
        text,
        "analysisPruneResults",
        [
            AnalysisPruneResult::Deleted,
            AnalysisPruneResult::SkippedInUse,
            AnalysisPruneResult::Error
        ]
    );
    constants!(text, "analysisPruneMax", PRUNE_MAX);
}
