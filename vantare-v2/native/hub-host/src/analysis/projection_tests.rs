#![allow(clippy::unwrap_used)]
use super::*;
#[allow(
    clippy::unnecessary_wraps,
    reason = "vectors include explicit gap entries"
)]
fn sample(distance: f64, elapsed: f64) -> Option<Sample> {
    Some(Sample {
        distance: Some(distance),
        elapsed: Some(elapsed),
        speed: Some(50.0),
        throttle: Some(0.0),
        brake: None,
    })
}
fn lap() -> Lap {
    let signal = serde_json::json!({"reliable":2,"estimated":0,"stale":0,"unavailable":0,"mean":null,"min":null,"max":null});
    serde_json::from_value(serde_json::json!({"epoch":1,"session":3,"car":7,"lap":5,"first_chunk":1,"next_chunk":null,"sealed":true,"gap":false,"samples":2,"observed_span_s":10.0,"speed":signal,"throttle":signal,"brake":signal})).unwrap()
}
#[test]
fn frozen_distance_alignment_vector_and_units() {
    let a = [
        sample(0.0, 0.0),
        sample(50.0, 6.0),
        sample(100.0, 12.0),
        sample(200.0, 24.0),
    ];
    let b = [sample(0.0, 0.0), sample(100.0, 10.0)];
    let c = project(&lap(), &lap(), &a, &b).unwrap();
    assert_eq!(
        c.delta
            .unwrap()
            .iter()
            .map(|p| p.value.as_f64().unwrap())
            .collect::<Vec<_>>(),
        [0.0, 1.0, 2.0]
    );
    assert_eq!(c.speed.a[0].value.as_f64(), Some(180.0));
    assert_eq!(c.throttle.a[0].value.as_f64(), Some(0.0));
    assert_eq!(c.brake.a, [] as [AnalysisPoint; 0]);
    assert_eq!(c.distance_range.map(|n| n.as_f64().unwrap()), [0.0, 200.0]);
    assert_eq!(
        c.speed.a[1].elapsed.as_ref().and_then(Number::as_f64),
        Some(6.0)
    );
}
#[test]
fn frozen_missing_samples_resets_and_interpolation_vector() {
    let a = [
        sample(0.0, 0.0),
        sample(10.0, 1.0),
        None,
        sample(30.0, 3.0),
        sample(5.0, 0.5),
    ];
    let b = [sample(0.0, 0.0), None, sample(30.0, 3.0), sample(40.0, 4.0)];
    let points = delta(&a, &b);
    assert_eq!(points.len(), 1);
    assert_eq!(points[0].distance, 30.0);
    let points = channel(&a, |s| s.speed);
    assert_ne!(points[1].segment, points[2].segment);
    assert_ne!(points[2].segment, points[3].segment);
    let c = project(&lap(), &lap(), &a, &b).unwrap();
    assert_eq!(c.delta_unavailable, Some(DeltaUnavailable::GapInA));
    assert!(c.delta.is_none());
    assert_eq!(c.gaps.a[0].from.as_f64(), Some(10.0));
    assert_eq!(c.gaps.a[0].to.as_f64(), Some(30.0));
}
#[test]
fn reasons_identity_empty_and_no_extrapolation() {
    let a = [sample(0.0, 0.0), sample(100.0, 10.0)];
    for which in 0..3 {
        let mut b = lap();
        match which {
            0 => b.epoch += 1,
            1 => b.session += 1,
            _ => b.car += 1,
        }
        assert_eq!(
            project(&lap(), &b, &a, &a).unwrap_err(),
            HostError::AnalysisIncomparable
        );
    }
    assert_eq!(
        project(&lap(), &lap(), &[], &a).unwrap_err(),
        HostError::AnalysisIncomparable
    );
    let b = [sample(200.0, 20.0), sample(300.0, 30.0)];
    assert_eq!(
        project(&lap(), &lap(), &a, &b).unwrap().delta_unavailable,
        Some(DeltaUnavailable::NoCommonRange)
    );
    let mut b = lap();
    b.gap = true;
    assert_eq!(
        project(&lap(), &b, &a, &a).unwrap().delta_unavailable,
        Some(DeltaUnavailable::GapInB)
    );
    let mut aa = lap();
    aa.gap = true;
    assert_eq!(
        project(&aa, &b, &a, &a).unwrap().delta_unavailable,
        Some(DeltaUnavailable::GapInA)
    );
    assert!(
        project(&lap(), &lap(), &a, &a)
            .unwrap()
            .delta
            .unwrap()
            .iter()
            .all(|p| p.value.as_f64() == Some(0.0))
    );
}
#[test]
fn thin_keeps_literal_domain_endpoints_and_segments() {
    let mut a: Vec<_> = (0..60_000)
        .map(|i| sample(f64::from(i), f64::from(i) / 100.0))
        .collect();
    a[30_000] = None;
    let c = project(&lap(), &lap(), &a, &a).unwrap();
    assert_eq!(c.speed.a.len(), 1024);
    assert_eq!(c.speed.a.first().unwrap().distance.as_f64(), Some(0.0));
    assert_eq!(c.speed.a.last().unwrap().distance.as_f64(), Some(59_999.0));
    assert!(c.speed.a.windows(2).any(|p| p[0].segment != p[1].segment));
}
#[test]
fn buffer_limit_counts_gaps_and_never_truncates() {
    let mut a = vec![sample(0.0, 0.0); 100_000];
    assert!(project(&lap(), &lap(), &a, &a).is_ok());
    a.push(None);
    assert_eq!(
        project(&lap(), &lap(), &a, &a).unwrap_err(),
        HostError::AnalysisTooLarge
    );
}

#[test]
fn unreliable_elapsed_is_null_and_never_interpolated_across() {
    let a = [sample(0.0, 0.0), sample(50.0, 6.0), sample(100.0, 12.0)];
    let mut b = [sample(0.0, 0.0), sample(50.0, 5.0), sample(100.0, 10.0)];
    b[1].as_mut().unwrap().elapsed = None;
    let c = project(&lap(), &lap(), &a, &b).unwrap();
    assert_eq!(c.speed.b[1].elapsed, None);
    assert_eq!(c.delta_unavailable, Some(DeltaUnavailable::NoCommonRange));
    assert!(c.delta.is_none());
}
