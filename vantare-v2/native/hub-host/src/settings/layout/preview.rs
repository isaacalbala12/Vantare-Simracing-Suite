//! Projects the existing bounded layout document without exposing settings.
use super::Document;
use crate::home::layout::{
    CANVAS_MIN, COORDINATE_LIMIT, HomeLayoutView, HomePreviewState, HomePreviewWidget,
    HomeWidgetKind, OPACITY_MAX, WIDGET_LIMIT,
};
use serde::Deserialize;
use std::path::Path;
#[derive(Deserialize)]
struct Size {
    width: f64,
    height: f64,
}
#[derive(Default, Deserialize)]
struct Geometry {
    size: Option<Size>,
}
#[derive(Deserialize)]
struct Settings {
    kind: HomeWidgetKind,
}
fn visible() -> bool {
    true
}
fn opaque() -> f64 {
    1.0
}
#[derive(Deserialize)]
struct Instance {
    x: f64,
    y: f64,
    #[serde(default = "visible")]
    visible: bool,
    #[serde(default = "opaque")]
    opacity: f64,
    #[serde(default)]
    geometry: Geometry,
    settings: Settings,
}
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)] // All casts follow finite/range checks.
fn project(document: &Document) -> Option<HomeLayoutView> {
    let mut view = HomeLayoutView::empty(HomePreviewState::Ready);
    if let Some(canvas) = document.fields.0.get("canvasResolution") {
        let size: Size = serde_json::from_str(canvas.get()).ok()?;
        if ![size.width, size.height].into_iter().all(|v| {
            v.is_finite() && (f64::from(CANVAS_MIN)..=f64::from(COORDINATE_LIMIT)).contains(&v)
        }) {
            return None;
        }
        view.width = size.width.round() as u32;
        view.height = size.height.round() as u32;
    }
    let instances: Vec<Box<serde_json::value::RawValue>> =
        serde_json::from_str(document.fields.0.get("instances")?.get()).ok()?;
    if instances.len() > WIDGET_LIMIT {
        return None;
    }
    for raw in instances {
        let Ok(item) = serde_json::from_str::<Instance>(raw.get()) else {
            continue;
        };
        let limit = f64::from(COORDINATE_LIMIT);
        if ![item.x, item.y]
            .into_iter()
            .all(|v| v.is_finite() && (-limit..=limit).contains(&v))
            || !item.opacity.is_finite()
            || !(0.0..=1.0).contains(&item.opacity)
        {
            continue;
        }
        let Some(natural) = crate::widget_defaults::get(&item.settings.kind.key()) else {
            continue;
        };
        let size = item.geometry.size.unwrap_or(Size {
            width: f64::from(natural.size.width),
            height: f64::from(natural.size.height),
        });
        if ![size.width, size.height]
            .into_iter()
            .all(|v| v.is_finite() && (1.0..=f64::from(COORDINATE_LIMIT)).contains(&v))
        {
            continue;
        }
        if item.visible {
            view.widgets.push(HomePreviewWidget {
                kind: item.settings.kind,
                x: item.x.round() as i32,
                y: item.y.round() as i32,
                w: size.width.round() as u32,
                h: size.height.round() as u32,
                opacity: (item.opacity * f64::from(OPACITY_MAX)).round() as u8,
            });
        }
    }
    Some(view)
}
pub fn read(path: &Path) -> HomeLayoutView {
    let protected = || HomeLayoutView::empty(HomePreviewState::Protected);
    match Document::open(path) {
        Ok(document) if document.observed.is_none() => {
            HomeLayoutView::empty(HomePreviewState::Missing)
        }
        Ok(document) => project(&document).unwrap_or_else(protected),
        Err(()) => protected(),
    }
}
