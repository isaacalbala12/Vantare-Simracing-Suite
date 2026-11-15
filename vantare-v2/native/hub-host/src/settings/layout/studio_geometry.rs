//! One closed geometry order, one existing layout CAS and one undo snapshot.
use super::{
    CatalogAccess, Fields, HostError, Open, canvas as project_canvas, coordinate, instance,
    optional, put, read,
};
use crate::studio::geometry::{near, position_valid};
use crate::studio::{CanvasChoice, GeometryChange};

pub(super) fn canvas(opened: &mut Open, choice: CanvasChoice) -> Result<bool, HostError> {
    match choice {
        CanvasChoice::Monitor => {
            let old: Option<Fields> = optional(&opened.document.fields, "canvasResolution", None)?;
            let Some(old) = old else {
                return Ok(false);
            };
            if !only_size_fields(&old) {
                return Err(HostError::Protected);
            }
            opened.document.fields.0.remove("canvasResolution");
        }
        CanvasChoice::Custom { width, height } => {
            let width = f64::from(width);
            let height = f64::from(height);
            if ![width, height]
                .iter()
                .all(|v| (64.0..=f64::from(crate::studio::SIZE_LIMIT)).contains(v))
            {
                return Err(HostError::Rejected);
            }
            if opened.canvas.source == crate::studio::geometry::CanvasSource::Custom
                && opened.canvas.size() == (width, height)
            {
                return Ok(false);
            }
            let old: Option<Fields> = optional(&opened.document.fields, "canvasResolution", None)?;
            let mut fields = old.unwrap_or_default();
            put(&mut fields, "width", &width)?;
            put(&mut fields, "height", &height)?;
            put(&mut opened.document.fields, "canvasResolution", &fields.0)?;
        }
    }
    opened.canvas = project_canvas(&opened.document.fields, opened.monitor)?;
    Ok(true)
}
pub(super) fn apply(
    opened: &mut Open,
    id: &str,
    change: GeometryChange,
    access: Option<CatalogAccess>,
) -> Result<bool, HostError> {
    if let GeometryChange::Move { x, y } | GeometryChange::Resize { x, y, .. } = change
        && !position_valid((x.into(), y.into()))
    {
        return Err(HostError::Rejected);
    }
    let monitor = opened.monitor;
    let canvas = opened.canvas;
    let fields = opened.find(id)?;
    let item = instance(fields, access)?;
    if item.locked {
        return Err(HostError::Denied);
    }
    match change {
        GeometryChange::Move { x, y } => position(
            fields,
            (
                f64::from(x) + monitor.origin.0,
                f64::from(y) + monitor.origin.1,
            ),
        ),
        GeometryChange::Anchor { column, row } => {
            let at = crate::studio::geometry::anchor(
                (item.size.width.into(), item.size.height.into()),
                canvas.size(),
                column,
                row,
            )
            .ok_or(HostError::Rejected)?;
            position(fields, (at.0 + monitor.origin.0, at.1 + monitor.origin.1))
        }
        GeometryChange::AutoSize => {
            let mut stored: Fields = optional(fields, "geometry", Fields::default())?;
            let size: Option<Fields> = optional(&stored, "size", None)?;
            let Some(size) = size else {
                return Ok(false);
            };
            if !only_size_fields(&size) {
                return Err(HostError::Protected);
            }
            stored.0.remove("size");
            put(fields, "geometry", &stored.0)?;
            Ok(true)
        }
        GeometryChange::AspectLocked { value } => {
            if item.aspect_locked == value {
                return Ok(false);
            }
            let mut stored: Fields = optional(fields, "geometry", Fields::default())?;
            put(&mut stored, "aspectLocked", &value)?;
            put(fields, "geometry", &stored.0)?;
            Ok(true)
        }
        GeometryChange::Resize {
            x,
            y,
            width,
            height,
        } => resize(
            fields,
            &item,
            (
                f64::from(x) + monitor.origin.0,
                f64::from(y) + monitor.origin.1,
            ),
            (f64::from(width), f64::from(height)),
        ),
    }
}
fn resize(
    fields: &mut Fields,
    item: &crate::studio::OverlayInstance,
    at: (f64, f64),
    requested: (f64, f64),
) -> Result<bool, HostError> {
    if requested.0 <= 0.0 || requested.1 <= 0.0 {
        return Err(HostError::Rejected);
    }
    let previous = (f64::from(item.size.width), f64::from(item.size.height));
    // Recognize a native-size round-trip before aspect correction can mistake
    // independent f32 rounding for a new ratio. Never relax the size limits.
    let requested = if same_size(previous.0, requested.0)
        && same_size(previous.1, requested.1)
        && (crate::studio::GEOMETRY_MIN.0..=crate::studio::GEOMETRY_MAX.0).contains(&requested.0)
        && (crate::studio::GEOMETRY_MIN.1..=crate::studio::GEOMETRY_MAX.1).contains(&requested.1)
    {
        previous
    } else {
        requested
    };
    let mut next = crate::studio::geometry::bounded_size(
        (item.size.width.into(), item.size.height.into()),
        requested,
        item.aspect_locked,
        false,
    )
    .ok_or(HostError::Rejected)?;
    if !near(next.0, requested.0) || !near(next.1, requested.1) {
        return Err(HostError::Rejected);
    }
    if same_size(previous.0, next.0) && same_size(previous.1, next.1) {
        next = previous;
    }
    coordinate(at.0)?;
    coordinate(at.1)?;
    let mut stored: Fields = optional(fields, "geometry", Fields::default())?;
    let old: Option<Fields> = optional(&stored, "size", None)?;
    let changed_size = old.as_ref().is_none_or(|old| {
        !read::<f64>(old, "width").is_ok_and(|v| near(v, next.0))
            || !read::<f64>(old, "height").is_ok_and(|v| near(v, next.1))
    });
    let mut size = old.unwrap_or_default();
    let changed_position = position(fields, at)?;
    if !changed_size {
        return Ok(changed_position);
    }
    put(&mut size, "width", &next.0)?;
    put(&mut size, "height", &next.1)?;
    put(&mut stored, "size", &size.0)?;
    put(fields, "geometry", &stored.0)?;
    Ok(true)
}
// Native painter sizes can round-trip through f32. Half its relative epsilon
// covers that rounding; larger size changes still produce a write.
fn same_size(a: f64, b: f64) -> bool {
    near(a, b) || (a - b).abs() <= a.abs().max(b.abs()) * f64::from(f32::EPSILON) / 2.0
}
fn position(fields: &mut Fields, at: (f64, f64)) -> Result<bool, HostError> {
    coordinate(at.0)?;
    coordinate(at.1)?;
    if near(read::<f64>(fields, "x")?, at.0) && near(read::<f64>(fields, "y")?, at.1) {
        return Ok(false);
    }
    put(fields, "x", &at.0)?;
    put(fields, "y", &at.1)?;
    Ok(true)
}
fn only_size_fields(fields: &Fields) -> bool {
    fields
        .0
        .keys()
        .all(|key| matches!(key.as_str(), "width" | "height"))
}
