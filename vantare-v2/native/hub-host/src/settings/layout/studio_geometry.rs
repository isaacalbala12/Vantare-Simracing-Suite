//! One closed geometry order, one existing layout CAS and one undo snapshot.
use super::{
    CatalogAccess, Fields, HostError, Open, canvas as project_canvas, coordinate, instance,
    optional, put, read,
};
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
        } => {
            let requested = (f64::from(width), f64::from(height));
            if requested.0 <= 0.0 || requested.1 <= 0.0 {
                return Err(HostError::Rejected);
            }
            let next = crate::studio::geometry::bounded_size(
                (item.size.width.into(), item.size.height.into()),
                requested,
                item.aspect_locked,
                false,
            )
            .ok_or(HostError::Rejected)?;
            let at = (
                f64::from(x) + monitor.origin.0,
                f64::from(y) + monitor.origin.1,
            );
            coordinate(at.0)?;
            coordinate(at.1)?;
            let mut stored: Fields = optional(fields, "geometry", Fields::default())?;
            let old: Option<Fields> = optional(&stored, "size", None)?;
            let changed_size = old.as_ref().is_none_or(|old| {
                read::<f64>(old, "width") != Ok(next.0) || read::<f64>(old, "height") != Ok(next.1)
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
    }
}
fn position(fields: &mut Fields, at: (f64, f64)) -> Result<bool, HostError> {
    coordinate(at.0)?;
    coordinate(at.1)?;
    if coordinate(read::<f64>(fields, "x")?)? == coordinate(at.0)?
        && coordinate(read::<f64>(fields, "y")?)? == coordinate(at.1)?
    {
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
