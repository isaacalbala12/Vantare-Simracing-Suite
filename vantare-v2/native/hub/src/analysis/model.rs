//! Proyección pura: muestras fiables por distancia, sin inventar cobertura.
use serde::Deserialize;

pub const MAX_POINTS: usize = 1024;
pub const MAX_SAMPLES: usize = 1_000_000;

#[derive(Clone, Debug, Deserialize)]
pub struct Signal {
    pub reliable: u32,
    pub estimated: u32,
    pub stale: u32,
    pub unavailable: u32,
    pub mean: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Lap {
    pub epoch: u64,
    pub session: u64,
    pub car: u32,
    pub lap: u32,
    pub first_chunk: u64,
    pub next_chunk: Option<u64>,
    pub sealed: bool,
    pub gap: bool,
    pub samples: u32,
    pub observed_span_s: Option<f64>,
    pub speed: Signal,
    pub throttle: Signal,
    pub brake: Signal,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
pub struct Sample {
    pub distance: Option<f64>,
    pub elapsed: Option<f64>,
    pub speed: Option<f64>,
    pub throttle: Option<f64>,
    pub brake: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct Chunk {
    pub index: u64,
    pub epoch: u64,
    pub session: u64,
    pub car: u32,
    pub lap: u32,
    pub offset: usize,
    pub gap: bool,
    pub samples: Vec<Sample>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub distance: f64,
    pub value: f64,
    pub segment: usize,
}

#[derive(Clone, Default)]
pub struct Charts {
    pub distance_range: Option<(f64, f64)>,
    pub speed: [Vec<Point>; 2],
    pub throttle: [Vec<Point>; 2],
    pub brake: [Vec<Point>; 2],
    pub delta: Vec<Point>,
}

pub fn project_laps(
    a: &Lap,
    b: &Lap,
    samples_a: &[Option<Sample>],
    samples_b: &[Option<Sample>],
) -> Result<Charts, String> {
    if (a.epoch, a.session, a.car) != (b.epoch, b.session, b.car) {
        return Err("Elige dos vueltas de la misma época, sesión y coche; la serie no identifica el circuito".into());
    }
    Ok(project(samples_a, samples_b, !a.gap && !b.gap))
}

/// Conserva extremos del dominio y no une segmentos separados al submuestrear.
fn thin(points: Vec<Point>) -> Vec<Point> {
    if points.len() <= MAX_POINTS {
        return points;
    }
    (0..MAX_POINTS)
        .map(|index| points[index * (points.len() - 1) / (MAX_POINTS - 1)])
        .collect()
}

fn channel(samples: &[Option<Sample>], value: fn(Sample) -> Option<f64>) -> Vec<Point> {
    let mut points = Vec::new();
    let mut segment = 0;
    let mut previous = None;
    for sample in samples {
        let pair = sample.and_then(|sample| Some((sample.distance?, value(sample)?)));
        if let Some((distance, value)) =
            pair.filter(|(distance, value)| distance.is_finite() && value.is_finite())
        {
            if previous.is_some_and(|last| distance <= last) {
                segment += 1;
            }
            points.push(Point {
                distance,
                value,
                segment,
            });
            previous = Some(distance);
        } else {
            segment += 1;
            previous = None;
        }
    }
    points
}

/// A − B a igual distancia; interpola solo entre tiempos fiables contiguos de B.
/// No extrapola ni convierte ventana observada en duración total de vuelta.
pub fn project_delta(a: &[Option<Sample>], b: &[Option<Sample>], allow_delta: bool) -> Vec<Point> {
    let mut delta = Vec::new();
    if allow_delta {
        let elapsed_a = channel(a, |sample| sample.elapsed);
        let elapsed_b = channel(b, |sample| sample.elapsed);
        let mut cursor = 0;
        for point in elapsed_a {
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
                delta.push(Point {
                    distance: point.distance,
                    value: point.value - reference,
                    segment: point.segment * (b.len() + 1) + left.segment,
                });
            }
        }
    }
    delta
}

pub fn project(a: &[Option<Sample>], b: &[Option<Sample>], allow_delta: bool) -> Charts {
    Charts {
        distance_range: a
            .iter()
            .chain(b)
            .filter_map(|sample| sample.and_then(|s| s.distance))
            .fold(None, |range, distance| {
                Some(
                    range.map_or((distance, distance), |(min, max): (f64, f64)| {
                        (min.min(distance), max.max(distance))
                    }),
                )
            }),
        speed: [
            thin(channel(a, |s| s.speed.map(|v| v * 3.6))),
            thin(channel(b, |s| s.speed.map(|v| v * 3.6))),
        ],
        throttle: [
            thin(channel(a, |s| s.throttle.map(|v| v * 100.0))),
            thin(channel(b, |s| s.throttle.map(|v| v * 100.0))),
        ],
        brake: [
            thin(channel(a, |s| s.brake.map(|v| v * 100.0))),
            thin(channel(b, |s| s.brake.map(|v| v * 100.0))),
        ],
        delta: thin(project_delta(a, b, allow_delta)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample(distance: f64, elapsed: f64) -> Sample {
        Sample {
            distance: Some(distance),
            elapsed: Some(elapsed),
            speed: Some(50.0),
            throttle: Some(0.0),
            brake: None,
        }
    }
    #[test]
    fn session_projection_checks_identity_and_keeps_partial_coverage_honest() {
        let signal = Signal {
            reliable: 2,
            estimated: 0,
            stale: 0,
            unavailable: 0,
            mean: Some(50.0),
            min: Some(50.0),
            max: Some(50.0),
        };
        let a = Lap {
            epoch: 1,
            session: 3,
            car: 7,
            lap: 0,
            first_chunk: 1,
            next_chunk: Some(2),
            sealed: false,
            gap: false,
            samples: 2,
            observed_span_s: Some(10.0),
            speed: signal.clone(),
            throttle: signal.clone(),
            brake: signal,
        };
        let mut b = a.clone();
        b.lap = 1;
        b.first_chunk = 2;
        let samples = [sample(0.0, 0.0), sample(100.0, 10.0)].map(Some);
        assert_eq!(
            project_laps(&a, &b, &samples, &samples)
                .expect("misma sesión")
                .delta
                .len(),
            2
        );
        b.gap = true;
        let partial = project_laps(&a, &b, &samples, &samples).expect("hueco visible");
        assert!(partial.delta.is_empty());
        assert!(!partial.speed[0].is_empty());
        b.session = 4;
        assert!(project_laps(&a, &b, &samples, &samples).is_err());
    }
    #[test]
    fn distance_alignment_interpolates_overlap_and_preserves_zero_and_absence() {
        let a = [
            sample(0.0, 0.0),
            sample(50.0, 6.0),
            sample(100.0, 12.0),
            sample(200.0, 24.0),
        ]
        .map(Some);
        let b = [sample(0.0, 0.0), sample(100.0, 10.0)].map(Some);
        let charts = project(&a, &b, true);
        assert_eq!(
            charts.delta.iter().map(|p| p.value).collect::<Vec<_>>(),
            [0.0, 1.0, 2.0]
        );
        assert_eq!(charts.speed[0][0].value.to_bits(), 180.0_f64.to_bits());
        assert_eq!(charts.throttle[0][0].value.to_bits(), 0.0_f64.to_bits());
        assert!(charts.brake[0].is_empty());
        assert_eq!(charts.distance_range, Some((0.0, 200.0)));
        assert!(project(&a, &b, false).delta.is_empty());
    }
    #[test]
    fn missing_samples_and_distance_resets_break_paths_and_delta() {
        let a = [
            Some(sample(0.0, 0.0)),
            Some(sample(10.0, 1.0)),
            None,
            Some(sample(30.0, 3.0)),
            Some(sample(5.0, 0.5)),
        ];
        let b = [
            Some(sample(0.0, 0.0)),
            None,
            Some(sample(30.0, 3.0)),
            Some(sample(40.0, 4.0)),
        ];
        let charts = project(&a, &b, true);
        assert_ne!(charts.speed[0][1].segment, charts.speed[0][2].segment);
        assert_ne!(charts.speed[0][2].segment, charts.speed[0][3].segment);
        assert_eq!(charts.delta.len(), 1);
        assert_eq!(charts.delta[0].distance.to_bits(), 30.0_f64.to_bits());
    }
    #[test]
    fn long_laps_are_bounded_and_keep_endpoints_and_gap_boundaries() {
        let mut samples: Vec<_> = (0..60_000)
            .map(|i| Some(sample(f64::from(i), f64::from(i) / 100.0)))
            .collect();
        samples[30_000] = None;
        let charts = project(&samples, &[], false);
        assert_eq!(charts.speed[0].len(), MAX_POINTS);
        assert_eq!(
            charts.speed[0].first().expect("inicio").distance.to_bits(),
            0.0_f64.to_bits()
        );
        assert_eq!(
            charts.speed[0].last().expect("fin").distance.to_bits(),
            59_999.0_f64.to_bits()
        );
        assert!(
            charts.speed[0]
                .windows(2)
                .any(|pair| pair[0].segment != pair[1].segment)
        );
    }
}
