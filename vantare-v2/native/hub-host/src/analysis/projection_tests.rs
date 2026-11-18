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
/// Copia literal del cursor heredado del modelo GPUI congelado
/// (`native/hub/src/analysis/model.rs`): sobre B solo avanza hacia delante.
/// Es el oráculo de caracterización de las entradas monótonas.
fn legacy_delta(a: &[Option<Sample>], b: &[Option<Sample>]) -> Vec<Point> {
    let mut result = Vec::new();
    let elapsed_b = channel(b, |s| s.elapsed);
    let mut cursor = 0;
    for point in channel(a, |s| s.elapsed) {
        while cursor + 2 < elapsed_b.len() && elapsed_b[cursor + 1].distance <= point.distance {
            cursor += 1;
        }
        let Some(left) = elapsed_b.get(cursor) else {
            break;
        };
        let Some(right) = elapsed_b.get(cursor + 1) else {
            break;
        };
        if left.segment == right.segment
            && right.distance > left.distance
            && (left.distance..=right.distance).contains(&point.distance)
        {
            let fraction = (point.distance - left.distance) / (right.distance - left.distance);
            let reference = left.value + fraction * (right.value - left.value);
            result.push(Point {
                value: point.value - reference,
                segment: point.segment * (b.len() as u64 + 1) + left.segment,
                ..point
            });
        }
    }
    result
}
fn summary(points: &[Point]) -> Vec<(u64, f64, f64)> {
    points
        .iter()
        .map(|p| (p.segment, p.distance, p.value))
        .collect()
}
fn values(points: &[Point]) -> Vec<(f64, f64)> {
    points.iter().map(|p| (p.distance, p.value)).collect()
}
/// A y B monótonas (la distancia nunca baja) con densidades y rangos distintos.
fn monotone_lap(steps: i32, step: f64, rate: f64) -> Vec<Option<Sample>> {
    (0..steps)
        .map(|i| sample(f64::from(i) * step, f64::from(i) * rate))
        .collect()
}
#[test]
fn delta_matches_the_legacy_cursor_on_monotone_series() {
    // Sin retrocesos de distancia la salida debe ser IDÉNTICA a la del cursor
    // heredado: el cambio no toca ningún caso válido.
    let mut checked = 0;
    for steps_b in [2, 5, 17, 60] {
        for (steps_a, start, span) in [(3, 0.0, 1.0), (11, 0.2, 0.6), (40, 0.0, 1.3)] {
            let b = monotone_lap(steps_b, 7.5, 0.9);
            let max = 7.5 * f64::from(steps_b - 1);
            let a: Vec<_> = (0..steps_a)
                .map(|i| {
                    let fraction = f64::from(i) / f64::from(steps_a - 1);
                    let distance = max * (start + span * fraction);
                    sample(distance, distance * 1.4)
                })
                .collect();
            assert_eq!(
                summary(&delta(&a, &b)),
                summary(&legacy_delta(&a, &b)),
                "B de {steps_b} puntos, A de {steps_a} entre {start} y {}",
                start + span
            );
            checked += 1;
        }
    }
    // Distancias repetidas en A y en B: mismas omisiones que el cursor heredado.
    let b = [
        sample(0.0, 0.0),
        sample(0.0, 0.0),
        sample(4.0, 0.4),
        sample(9.0, 0.9),
        sample(9.0, 1.1),
        sample(14.0, 1.4),
    ];
    let a = [
        sample(0.0, 0.0),
        sample(2.0, 0.2),
        sample(9.0, 0.9),
        sample(9.0, 1.0),
        sample(14.0, 1.4),
    ];
    assert_eq!(summary(&delta(&a, &b)), summary(&legacy_delta(&a, &b)));
    assert!(checked >= 12);
}
#[test]
fn retreating_distance_in_a_keeps_every_later_delta() {
    // La distancia de A baja de 40 a 15 sin hueco y luego sigue subiendo. El
    // cursor heredado dejaba sin delta los puntos que quedaban por detrás.
    let b = [
        sample(0.0, 0.0),
        sample(10.0, 1.0),
        sample(20.0, 2.0),
        sample(30.0, 3.0),
        sample(40.0, 4.0),
    ];
    let a = [
        sample(0.0, 0.0),
        sample(10.0, 20.0),
        sample(20.0, 40.0),
        sample(30.0, 60.0),
        sample(40.0, 80.0),
        sample(15.0, 30.0),
        sample(25.0, 50.0),
        sample(35.0, 70.0),
    ];
    assert_eq!(
        values(&delta(&a, &b)),
        [
            (0.0, 0.0),
            (10.0, 19.0),
            (20.0, 38.0),
            (30.0, 57.0),
            (40.0, 76.0),
            (15.0, 28.5),
            (25.0, 47.5),
            (35.0, 66.5),
        ]
    );
    // El cursor heredado descartaba los puntos de 15 m y 25 m.
    assert_eq!(legacy_delta(&a, &b).len(), 6);
}
#[test]
fn restarting_distance_in_b_uses_the_first_pass_that_covers_it() {
    // B reinicia la distancia a mitad de serie: la primera pasada cubre 0..40 y
    // la segunda solo 0..10 con otro reloj. Semántica elegida: cada distancia se
    // interpola en el primer tramo que la cubre, así que un reinicio no descarta
    // los puntos posteriores ni mezcla dos pasadas en el mismo intervalo.
    let b = [
        sample(0.0, 0.0),
        sample(10.0, 1.0),
        sample(20.0, 2.0),
        sample(30.0, 3.0),
        sample(40.0, 4.0),
        sample(0.0, 10.0),
        sample(10.0, 11.0),
    ];
    let a = [
        sample(0.0, 0.0),
        sample(10.0, 20.0),
        sample(20.0, 40.0),
        sample(30.0, 60.0),
        sample(40.0, 80.0),
    ];
    assert_eq!(
        values(&delta(&a, &b)),
        [
            (0.0, 0.0),
            (10.0, 19.0),
            (20.0, 38.0),
            (30.0, 57.0),
            (40.0, 76.0),
        ]
    );
    // El cursor heredado se quedaba en la segunda pasada y perdía el último punto.
    assert_eq!(legacy_delta(&a, &b).len(), 4);
    // Fuera del alcance de la primera pasada no se inventa nada.
    assert!(delta(&[sample(45.0, 90.0)], &b).is_empty());
}
#[test]
fn delta_edge_cases_keep_the_contract() {
    // Series de cero o un punto: sin intervalo en B no hay delta; con él, sí.
    assert!(delta(&[], &[]).is_empty());
    assert!(delta(&[sample(0.0, 0.0)], &[sample(0.0, 0.0)]).is_empty());
    assert!(delta(&[sample(0.0, 0.0), sample(10.0, 1.0)], &[sample(0.0, 0.0)]).is_empty());
    assert_eq!(
        values(&delta(&[sample(0.0, 0.0)], &[sample(0.0, 0.0), sample(10.0, 1.0)])),
        [(0.0, 0.0)]
    );
    // Sin extrapolación: fuera del rango de B no hay delta; el extremo exacto sí.
    let b = [sample(0.0, 0.0), sample(100.0, 10.0)];
    let a = [
        sample(-5.0, -0.5),
        sample(50.0, 6.0),
        sample(100.0, 11.0),
        sample(105.0, 12.0),
    ];
    assert_eq!(values(&delta(&a, &b)), [(50.0, 1.0), (100.0, 1.0)]);
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

#[test]
fn contiguous_gap_ranges_merge_and_missing_distance_is_not_a_recording_gap() {
    let s = [
        sample(0.0, 0.0),
        None,
        sample(10.0, 1.0),
        None,
        sample(20.0, 2.0),
        None,
    ];
    let ranges = gaps(&s).unwrap();
    assert_eq!(ranges.len(), 1);
    assert_eq!(ranges[0].from.as_f64(), Some(0.0));
    assert_eq!(ranges[0].to.as_f64(), Some(20.0));
    for distance in [None, Some(f64::NAN), Some(f64::INFINITY)] {
        let mut a = [sample(0.0, 0.0), sample(50.0, 5.0), sample(100.0, 10.0)];
        a[1].as_mut().unwrap().distance = distance;
        let b = [sample(0.0, 0.0), sample(50.0, 5.0), sample(100.0, 10.0)];
        let c = project(&lap(), &lap(), &a, &b).unwrap();
        assert_eq!(c.gaps.a, [] as [AnalysisRange; 0]);
        assert_eq!(c.delta_unavailable, None);
        assert!(c.delta.is_some());
        assert_ne!(c.speed.a[0].segment, c.speed.a[1].segment);
    }
}

#[test]
fn overlapping_ranges_merge_but_disjoint_ranges_stay_separate() {
    let s = [
        sample(0.0, 0.0),
        None,
        sample(20.0, 2.0),
        sample(10.0, 1.0),
        None,
        sample(30.0, 3.0),
        sample(40.0, 4.0),
        None,
        sample(50.0, 5.0),
    ];
    let ranges = gaps(&s).unwrap();
    assert_eq!(
        ranges
            .iter()
            .map(|r| (r.from.as_f64().unwrap(), r.to.as_f64().unwrap()))
            .collect::<Vec<_>>(),
        [(0.0, 30.0), (40.0, 50.0)]
    );
}
