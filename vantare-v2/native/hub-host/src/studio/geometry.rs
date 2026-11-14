//! Shared, window-free Studio gestures (ADR 0109). Electron consumes the Rust vectors.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

pub const MIN_SIZE: (f64, f64) = (64.0, 32.0);
pub const MAX_SIZE: (f64, f64) = (3840.0, 2160.0);
pub const NUDGE_LIMIT: f64 = 100_000.0;
pub type Pair = (f64, f64);
pub type Rect = (f64, f64, f64, f64);

// Like WidgetGap, a validated finite value preserves Eq on the closed transport.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
#[serde(try_from = "f64", into = "f64")]
pub struct Coordinate(f64);
impl Eq for Coordinate {}
impl TryFrom<f64> for Coordinate {
    type Error = &'static str;
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        if value.is_finite() && value.abs() <= f64::from(f32::MAX) {
            Ok(Self(value))
        } else {
            Err("invalid coordinate")
        }
    }
}
impl From<Coordinate> for f64 {
    fn from(value: Coordinate) -> Self {
        value.0
    }
}
impl From<u32> for Coordinate {
    fn from(value: u32) -> Self {
        Self(f64::from(value))
    }
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: Coordinate,
    pub y: Coordinate,
}
impl Point {
    pub fn pair(self) -> Pair {
        (self.x.into(), self.y.into())
    }
}
pub(crate) fn optional_point<'de, D: serde::Deserializer<'de>>(
    input: D,
) -> Result<Option<Point>, D::Error> {
    Point::deserialize(input).map(Some)
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum GeometryChange {
    Move {
        x: Coordinate,
        y: Coordinate,
    },
    Resize {
        x: Coordinate,
        y: Coordinate,
        width: Coordinate,
        height: Coordinate,
    },
    Anchor {
        column: u8,
        row: u8,
    },
    AutoSize,
    AspectLocked {
        value: bool,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum CanvasChoice {
    Monitor,
    Custom {
        width: Coordinate,
        height: Coordinate,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum SizeMode {
    Auto,
    Explicit,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum CanvasSource {
    Monitor,
    Custom,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum CanvasPlacement {
    Inside,
    Outside,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanvasView {
    pub width: Coordinate,
    pub height: Coordinate,
    pub source: CanvasSource,
}
impl CanvasView {
    pub fn size(self) -> Pair {
        (self.width.into(), self.height.into())
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Snap {
    pub position: Pair,
    pub guides: (Option<f64>, Option<f64>),
}
fn positive(pair: Pair) -> bool {
    pair.0.is_finite() && pair.1.is_finite() && pair.0 > 0.0 && pair.1 > 0.0
}
fn finite(pair: Pair) -> bool {
    pair.0.is_finite() && pair.1.is_finite()
}

/// Frozen GPUI snap order and strict threshold: canvas center, margins, other edges/centers.
pub fn snap(
    center: Pair,
    size: Pair,
    canvas: Pair,
    others: &[Rect],
    threshold: f64,
) -> Option<Snap> {
    if !finite(center)
        || !positive(size)
        || !positive(canvas)
        || !threshold.is_finite()
        || threshold < 0.0
        || others
            .iter()
            .any(|r| !finite((r.0, r.1)) || !positive((r.2, r.3)))
    {
        return None;
    }
    let margin = canvas.0 * 0.02;
    let axis = |pointer: f64, length: f64, total: f64, targets: Vec<f64>| {
        let start = (pointer - length / 2.0).clamp(0.0, (total - length).max(0.0));
        let mut best: Option<(f64, f64)> = None;
        for target in targets {
            for offset in [0.0, length / 2.0, length] {
                let delta = target - (start + offset);
                if delta.abs() < threshold && best.is_none_or(|(d, _)| delta.abs() < d.abs()) {
                    best = Some((delta, target));
                }
            }
        }
        best.map_or((start, None), |(delta, target)| {
            (start + delta, Some(target))
        })
    };
    let mut xs = vec![canvas.0 / 2.0, margin, canvas.0 - margin];
    let mut ys = vec![canvas.1 / 2.0, margin, canvas.1 - margin];
    for r in others {
        xs.extend([r.0, r.0 + r.2, r.0 + r.2 / 2.0]);
        ys.extend([r.1, r.1 + r.3, r.1 + r.3 / 2.0]);
    }
    let (x, gx) = axis(center.0, size.0, canvas.0, xs);
    let (y, gy) = axis(center.1, size.1, canvas.1, ys);
    Some(Snap {
        position: (x, y),
        guides: (gx, gy),
    })
}
/// Native resize rule: keep the opposite edges fixed, including at size limits.
pub fn resize(
    start: Pair,
    size: Pair,
    handle: (i8, i8),
    delta: Pair,
    locked: bool,
) -> Option<(Pair, Pair)> {
    if !finite(start)
        || !positive(size)
        || !finite(delta)
        || !(-1..=1).contains(&handle.0)
        || !(-1..=1).contains(&handle.1)
        || handle == (0, 0)
    {
        return None;
    }
    let requested = (
        size.0 + delta.0 * f64::from(handle.0),
        size.1 + delta.1 * f64::from(handle.1),
    );
    let next = bounded_size(size, requested, locked, handle.1 == 0)?;
    let position = (
        start.0 + if handle.0 < 0 { size.0 - next.0 } else { 0.0 },
        start.1 + if handle.1 < 0 { size.1 - next.1 } else { 0.0 },
    );
    finite(position).then_some((position, next))
}
pub fn bounded_size(
    previous: Pair,
    requested: Pair,
    locked: bool,
    horizontal: bool,
) -> Option<Pair> {
    if !positive(previous) || !finite(requested) {
        return None;
    }
    if !locked {
        return Some((
            requested.0.clamp(MIN_SIZE.0, MAX_SIZE.0),
            requested.1.clamp(MIN_SIZE.1, MAX_SIZE.1),
        ));
    }
    let aspect = previous.0 / previous.1;
    let by_width = horizontal
        || ((requested.0 - previous.0) / previous.0).abs()
            >= ((requested.1 - previous.1) / previous.1).abs();
    let minimum = MIN_SIZE.0.max(MIN_SIZE.1 * aspect);
    let maximum = MAX_SIZE.0.min(MAX_SIZE.1 * aspect);
    if !aspect.is_finite() || minimum > maximum {
        return None;
    }
    let width = (if by_width {
        requested.0
    } else {
        requested.1 * aspect
    })
    .clamp(minimum, maximum);
    Some((width, width / aspect))
}
pub fn anchor(size: Pair, canvas: Pair, column: u8, row: u8) -> Option<Pair> {
    if column > 2 || row > 2 || !positive(size) || !positive(canvas) {
        return None;
    }
    Some((
        (canvas.0 - size.0) * f64::from(column) / 2.0,
        (canvas.1 - size.1) * f64::from(row) / 2.0,
    ))
}
pub fn nudge(position: Pair, direction: (i8, i8), shift: bool) -> Option<Pair> {
    if !finite(position) || !(-1..=1).contains(&direction.0) || !(-1..=1).contains(&direction.1) {
        return None;
    }
    let step = if shift { 8.0 } else { 1.0 };
    Some((
        (position.0 + f64::from(direction.0) * step).clamp(-NUDGE_LIMIT, NUDGE_LIMIT),
        (position.1 + f64::from(direction.1) * step).clamp(-NUDGE_LIMIT, NUDGE_LIMIT),
    ))
}
pub fn held_nudge_distance(elapsed_ms: u32, shift: bool) -> f64 {
    let ticks = elapsed_ms.saturating_sub(300) / 30;
    let pixels =
        1 + ticks.min(20) + ticks.saturating_sub(20).min(30) * 4 + ticks.saturating_sub(50) * 8;
    f64::from(pixels.min(100_000)) * if shift { 8.0 } else { 1.0 }
}
pub fn fit(viewport: Pair, canvas: Pair) -> Option<f64> {
    if !positive(viewport) || !positive(canvas) {
        return None;
    }
    let scale = (viewport.0 / canvas.0).min(viewport.1 / canvas.1);
    (scale.is_finite() && scale > 0.0).then_some(scale)
}
pub fn preview_origin(viewport: Pair, canvas: Pair, scale: f64) -> Option<Pair> {
    if !positive(viewport) || !positive(canvas) || !scale.is_finite() || scale <= 0.0 {
        return None;
    }
    if !finite((canvas.0 * scale, canvas.1 * scale)) {
        return None;
    }
    Some((
        ((viewport.0 - canvas.0 * scale) / 2.0).max(0.0),
        ((viewport.1 - canvas.1 * scale) / 2.0).max(0.0),
    ))
}
pub fn free_spot(canvas: Pair, size: Pair, taken: &[Rect]) -> Option<Pair> {
    if !positive(canvas)
        || !positive(size)
        || !(64.0..=32768.0).contains(&canvas.0)
        || !(64.0..=32768.0).contains(&canvas.1)
        || taken
            .iter()
            .any(|r| !finite((r.0, r.1)) || !positive((r.2, r.3)))
    {
        return None;
    }
    let margin = canvas.0 * 0.02;
    let step = canvas.0 * 0.01;
    let gap = 12.0;
    let mut y = margin;
    while y + size.1 <= canvas.1 - margin {
        let mut x = margin;
        while x + size.0 <= canvas.0 - margin {
            if !taken.iter().any(|r| {
                x < r.0 + r.2 + gap
                    && x + size.0 + gap > r.0
                    && y < r.1 + r.3 + gap
                    && y + size.1 + gap > r.1
            }) {
                return Some((x, y));
            }
            x += step;
        }
        y += step;
    }
    Some((
        (canvas.0 - size.0).max(0.0) / 2.0,
        (canvas.1 - size.1).max(0.0) / 2.0,
    ))
}

#[cfg(any(test, feature = "bindings"))]
#[path = "geometry_cases.rs"]
pub mod cases;
#[cfg(test)]
#[path = "geometry_tests.rs"]
mod tests;
