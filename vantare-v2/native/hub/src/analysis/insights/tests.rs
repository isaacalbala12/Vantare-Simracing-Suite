use super::*;
use crate::analysis::model::Signal;

#[allow(clippy::unnecessary_wraps)] // Fixtures permiten insertar None inline para probar huecos.
fn sample(distance: f64, elapsed: f64) -> Option<Sample> {
    Some(Sample {
        distance: Some(distance),
        elapsed: Some(elapsed),
        speed: Some(50.0),
        throttle: Some(0.0),
        brake: None,
    })
}
fn lap(number: u32) -> Lap {
    let signal = Signal {
        reliable: 4,
        estimated: 0,
        stale: 0,
        unavailable: 0,
        mean: Some(50.0),
        min: Some(50.0),
        max: Some(50.0),
    };
    Lap {
        epoch: 1,
        session: 2,
        car: 3,
        lap: number,
        first_chunk: 0,
        next_chunk: Some(1),
        sealed: true,
        gap: false,
        samples: 4,
        observed_span_s: Some(30.0),
        speed: signal.clone(),
        throttle: signal.clone(),
        brake: signal,
    }
}

#[test]
fn frontend_cursor_clamps_units_zero_and_absence_on_native_samples() {
    let samples = [sample(0.0, 0.0), sample(50.0, 5.0), sample(100.0, 10.0)];
    for (cursor, distance) in [
        (-1.0, 0.0_f64),
        (0.0, 0.0),
        (0.25, 25.0),
        (0.5, 50.0),
        (0.75, 75.0),
        (1.0, 100.0),
        (2.0, 100.0),
    ] {
        let row = readout_at(&samples, cursor).expect("cursor");
        assert_eq!(
            row.distance_m.expect("metros").to_bits(),
            distance.to_bits()
        );
        assert_eq!(row.speed_kmh.expect("speed").to_bits(), 180.0_f64.to_bits());
        assert_eq!(
            row.throttle_percent.expect("zero").to_bits(),
            0.0_f64.to_bits()
        );
        assert!(row.brake_percent.is_none());
    }
    assert!(readout_at(&samples, f64::NAN).is_err());
    assert_eq!(readout_at(&[], 0.5).expect("vacío"), Readout::default());
    let gap = [sample(0.0, 0.0), None, sample(100.0, 10.0)];
    assert!(readout_at(&gap, 0.5).expect("hueco").speed_kmh.is_none());
    let invalid = [Some(Sample {
        distance: Some(0.0),
        speed: Some(f64::NAN),
        throttle: Some(2.0),
        ..Sample::default()
    })];
    let row = readout_at(&invalid, 0.0).expect("invalid");
    assert!(row.speed_kmh.is_none());
    assert!(row.throttle_percent.is_none());
}

#[test]
fn frontend_sector_sum_ranking_and_tones_use_actual_boundaries() {
    let a = [
        sample(0.0, 0.0),
        sample(100.0, 10.2),
        sample(200.0, 20.1),
        sample(300.0, 30.4),
    ];
    let b = [
        sample(0.0, 0.0),
        sample(100.0, 10.0),
        sample(200.0, 20.0),
        sample(300.0, 30.0),
    ];
    let sectors: Vec<_> = (0..3)
        .map(|i| Sector {
            id: format!("S{}", i + 1),
            from_m: f64::from(i) * 100.0,
            to_m: f64::from(i + 1) * 100.0,
        })
        .collect();
    let view = compare(&lap(1), &lap(2), &a, &b, &sectors).expect("comparación");
    assert_eq!(
        view.insights
            .iter()
            .map(|i| i.sector_id.as_str())
            .collect::<Vec<_>>(),
        ["S3", "S1", "S2"]
    );
    assert_eq!(view.insights[2].tone, Tone::Gain);
    let total: f64 = view.sectors.iter().map(|s| s.delta_s.expect("delta")).sum();
    assert!((total - 0.4).abs() < 1e-9);
    for (delta, expected) in [
        (0.05, Tone::Loss),
        (0.04, Tone::Flat),
        (-0.02, Tone::Flat),
        (-0.03, Tone::Gain),
    ] {
        assert_eq!(tone(delta), expected);
    }
    let sessions = session_readouts(&[lap(1), lap(2)]);
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].laps, 2);
    assert_eq!(sessions[0].samples, 8);
    assert_eq!(lap_readout(&lap(1)).observed_span_s, Some(30.0));
    let absent = compare(&lap(1), &lap(2), &a, &b, &[]).expect("sin límites");
    assert!(absent.sectors.is_empty());
    assert!(absent.insights.is_empty());
}

#[test]
fn identity_gaps_coverage_and_invalid_sectors_never_create_insights() {
    let a = [
        sample(0.0, 0.0),
        sample(50.0, 6.0),
        None,
        sample(100.0, 12.0),
    ];
    let b = [sample(0.0, 0.0), sample(100.0, 10.0)];
    let sectors = [Sector {
        id: "S1".into(),
        from_m: 0.0,
        to_m: 100.0,
    }];
    for gap in [false, true] {
        let mut selected = lap(1);
        selected.gap = gap;
        let view = compare(&selected, &lap(2), &a, &b, &sectors).expect("hueco");
        assert!(view.sectors[0].delta_s.is_none());
        assert!(view.insights.is_empty());
    }
    let mut other = lap(2);
    other.session += 1;
    assert!(compare(&lap(1), &other, &a, &b, &sectors).is_err());
    for (from_m, to_m) in [(f64::NAN, 1.0), (0.0, f64::INFINITY), (5.0, 2.0)] {
        assert!(
            compare(
                &lap(1),
                &lap(2),
                &a,
                &b,
                &[Sector {
                    id: "S1".into(),
                    from_m,
                    to_m
                }]
            )
            .is_err()
        );
    }
    let outside = [Sector {
        id: "S2".into(),
        from_m: 0.0,
        to_m: 150.0,
    }];
    assert!(
        compare(&lap(1), &lap(2), &a, &b, &outside)
            .expect("cobertura parcial")
            .sectors[0]
            .delta_s
            .is_none()
    );
}

#[test]
fn sector_evaluation_keeps_gaps_even_when_charts_are_thinned() {
    let mut samples: Vec<_> = (0..4000)
        .map(|i| sample(f64::from(i), f64::from(i)))
        .collect();
    samples[2000] = None;
    let reference: Vec<_> = (0..4000)
        .map(|i| sample(f64::from(i), f64::from(i)))
        .collect();
    let sectors = [Sector {
        id: "all".into(),
        from_m: 0.0,
        to_m: 3999.0,
    }];
    let view = compare(&lap(1), &lap(2), &samples, &reference, &sectors).expect("comparar");
    assert!(view.sectors[0].delta_s.is_none());
    assert!(view.insights.is_empty());
    assert_eq!(view.charts.delta.len(), crate::analysis::model::MAX_POINTS);
}
