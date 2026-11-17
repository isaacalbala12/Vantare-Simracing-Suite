//! Pure port of the frozen Hub model: uniform thinning and contiguous-time interpolation.
use super::{Lap, Sample};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Number;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
pub const MAX_POINTS: usize = 1024;
pub const MAX_SAMPLES: usize = 100_000;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisPoint {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub distance: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub elapsed: Option<Number>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub value: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub segment: u64,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisSeries {
    pub a: Vec<AnalysisPoint>,
    pub b: Vec<AnalysisPoint>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRange {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub from: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub to: Number,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisGaps {
    pub a: Vec<AnalysisRange>,
    pub b: Vec<AnalysisRange>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeltaUnavailable {
    GapInA,
    GapInB,
    NoCommonRange,
}
#[derive(Debug)]
pub struct Projection {
    pub distance_range: [Number; 2],
    pub speed: AnalysisSeries,
    pub throttle: AnalysisSeries,
    pub brake: AnalysisSeries,
    pub delta: Option<Vec<AnalysisPoint>>,
    pub delta_unavailable: Option<DeltaUnavailable>,
    pub gaps: AnalysisGaps,
}
#[derive(Clone, Copy)]
struct Point {
    distance: f64,
    elapsed: Option<f64>,
    value: f64,
    segment: u64,
}
fn channel(samples: &[Option<Sample>], value: fn(Sample) -> Option<f64>) -> Vec<Point> {
    let mut points = Vec::new();
    let mut segment = 0;
    let mut previous = None;
    for sample in samples {
        let pair = sample.and_then(|s| Some((s.distance?, value(s)?)));
        if let Some((distance, value)) = pair.filter(|(d, v)| d.is_finite() && v.is_finite()) {
            if previous.is_some_and(|last| distance <= last) {
                segment += 1;
            }
            points.push(Point {
                distance,
                value,
                segment,
                elapsed: sample.and_then(|s| s.elapsed).filter(|t| t.is_finite()),
            });
            previous = Some(distance);
        } else {
            segment += 1;
            previous = None;
        }
    }
    points
}
fn delta(a: &[Option<Sample>], b: &[Option<Sample>]) -> Vec<Point> {
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
fn number(v: f64) -> Result<Number, HostError> {
    Number::from_f64(v).ok_or(HostError::AnalysisIncomparable)
}
fn thin(points: &[Point]) -> Result<Vec<AnalysisPoint>, HostError> {
    let count = points.len().min(MAX_POINTS);
    (0..count)
        .map(|i| {
            let p = points[if points.len() > MAX_POINTS {
                i * (points.len() - 1) / (MAX_POINTS - 1)
            } else {
                i
            }];
            Ok(AnalysisPoint {
                distance: number(p.distance)?,
                elapsed: p.elapsed.map(number).transpose()?,
                value: number(p.value)?,
                segment: p.segment,
            })
        })
        .collect()
}
// Only None entries describe recording gaps (including isolated gap chunks).
// Some without finite distance breaks channel segments, but is not a recording gap.
// Unknown leading/trailing coverage is bounded to the observed domain.
fn gaps(samples: &[Option<Sample>]) -> Result<Vec<AnalysisRange>, HostError> {
    let mut ranges = Vec::new();
    let mut previous = None;
    let mut broken = false;
    for sample in samples {
        let Some(sample) = sample else {
            broken = true;
            continue;
        };
        let Some(d) = sample.distance.filter(|d| d.is_finite()) else {
            continue;
        };
        if broken {
            let from = previous.unwrap_or(d);
            ranges.push((f64::min(from, d), f64::max(from, d)));
        }
        broken = false;
        previous = Some(d);
    }
    if broken && let Some(d) = previous {
        ranges.push((d, d));
    }
    ranges.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut merged: Vec<(f64, f64)> = Vec::new();
    for (from, to) in ranges {
        if let Some(last) = merged.last_mut()
            && from <= last.1
        {
            last.1 = last.1.max(to);
        } else {
            merged.push((from, to));
        }
    }
    merged
        .into_iter()
        .map(|(from, to)| {
            Ok(AnalysisRange {
                from: number(from)?,
                to: number(to)?,
            })
        })
        .collect()
}

pub fn project(
    a: &Lap,
    b: &Lap,
    sa: &[Option<Sample>],
    sb: &[Option<Sample>],
) -> Result<Projection, HostError> {
    if sa.len() > MAX_SAMPLES || sb.len() > MAX_SAMPLES {
        return Err(HostError::AnalysisTooLarge);
    }
    if (a.epoch, a.session, a.car) != (b.epoch, b.session, b.car)
        || !sa.iter().any(Option::is_some)
        || !sb.iter().any(Option::is_some)
    {
        return Err(HostError::AnalysisIncomparable);
    }
    let range = sa
        .iter()
        .chain(sb)
        .filter_map(|s| s.and_then(|s| s.distance))
        .filter(|d| d.is_finite())
        .fold(None, |range, d| {
            Some(range.map_or((d, d), |(min, max): (f64, f64)| (min.min(d), max.max(d))))
        })
        .ok_or(HostError::AnalysisIncomparable)?;
    let reason = if a.gap || sa.iter().any(Option::is_none) {
        Some(DeltaUnavailable::GapInA)
    } else if b.gap || sb.iter().any(Option::is_none) {
        Some(DeltaUnavailable::GapInB)
    } else {
        None
    };
    let points = if reason.is_none() {
        thin(&delta(sa, sb))?
    } else {
        vec![]
    };
    let reason = reason.or_else(|| points.is_empty().then_some(DeltaUnavailable::NoCommonRange));
    let series = |value: fn(Sample) -> Option<f64>| -> Result<AnalysisSeries, HostError> {
        Ok(AnalysisSeries {
            a: thin(&channel(sa, value))?,
            b: thin(&channel(sb, value))?,
        })
    };
    Ok(Projection {
        distance_range: [number(range.0)?, number(range.1)?],
        speed: series(|s| s.speed.map(|v| v * 3.6))?,
        throttle: series(|s| s.throttle.map(|v| v * 100.0))?,
        brake: series(|s| s.brake.map(|v| v * 100.0))?,
        delta: reason.is_none().then_some(points),
        delta_unavailable: reason,
        gaps: AnalysisGaps {
            a: gaps(sa)?,
            b: gaps(sb)?,
        },
    })
}
#[cfg(test)]
#[path = "projection_tests.rs"]
mod tests;
