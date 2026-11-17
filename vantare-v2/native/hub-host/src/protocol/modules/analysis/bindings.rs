use crate::analysis::catalog::{AnalysisLap, AnalysisRow, AnalysisSignal, AnalysisState};
use crate::analysis::projection::{
    AnalysisGaps, AnalysisPoint, AnalysisRange, AnalysisSeries, DeltaUnavailable,
};
use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<AnalysisRow>(&mut text);
    declare::<AnalysisState>(&mut text);
    declare::<AnalysisSignal>(&mut text);
    declare::<AnalysisLap>(&mut text);
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
    text
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
                speed: signal.clone(),
                throttle: signal.clone(),
                brake: signal,
            }],
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
    }));
    for state in [
        AnalysisState::Complete,
        AnalysisState::Unconfirmed,
        AnalysisState::Locked,
        AnalysisState::Incompatible,
        AnalysisState::Unreadable,
    ] {
        host.push(sample_response(Reply::AnalysisInspect {
            state,
            laps: 1,
            best_lap_approx_ms: Some(111_600),
        }));
    }
    host.push(sample_response(Reply::AnalysisInspect {
        state: AnalysisState::Complete,
        laps: 0,
        best_lap_approx_ms: None,
    }));
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
    serde_json::json!({"host": host, "ui": requests()})
}

fn requests() -> Vec<UiToHost> {
    [
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
