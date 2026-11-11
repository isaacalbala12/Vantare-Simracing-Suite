//! Edits the existing raw-field document with CAS; never seeds a missing layout.
use super::{Document, Fields, LIMIT};
use crate::{onboarding::WidgetKind, protocol::HostError, settings::track::PerformanceLevel};
use serde::Deserialize;
use serde_json::value::RawValue;
use std::{collections::BTreeSet, path::Path};
use vantare_ipc::files;
const INSTANCE_LIMIT: usize = 256;
#[derive(Deserialize)]
struct Kind {
    kind: String,
}
fn parse<T: serde::de::DeserializeOwned>(fields: &Fields, key: &str) -> Result<T, HostError> {
    serde_json::from_str(fields.0.get(key).ok_or(HostError::Protected)?.get())
        .map_err(|_| HostError::Protected)
}
fn raw(value: impl serde::Serialize) -> Box<RawValue> {
    RawValue::from_string(serde_json::to_string(&value).expect("layout value")).expect("JSON")
}
fn open(path: &Path) -> Result<Document, HostError> {
    Document::open(path).map_err(|()| HostError::Protected)
}
pub(crate) fn state(path: &Path) -> Result<(bool, String), HostError> {
    let document = open(path)?;
    Ok((
        document.observed.is_some(),
        vantare_services::content_hash(document.observed.as_deref().unwrap_or_default()),
    ))
}
pub(crate) fn apply(
    path: &Path,
    kit: &[WidgetKind],
    level: PerformanceLevel,
    revision: &str,
) -> Result<bool, HostError> {
    if !crate::onboarding::valid_kit(kit) {
        return Err(HostError::Denied);
    }
    let mut document = open(path)?;
    if vantare_services::content_hash(document.observed.as_deref().unwrap_or_default()) != revision
    {
        return Err(HostError::OnboardingConflict {});
    }
    if document.observed.is_none() {
        return Ok(false);
    }
    let mut items: Vec<Fields> = parse(&document.fields, "instances")?;
    if items.len() > INSTANCE_LIMIT {
        return Err(HostError::Protected);
    }
    let mut ids = BTreeSet::new();
    let mut kinds = BTreeSet::new();
    for item in &mut items {
        let id: String = parse(item, "id")?;
        if id.trim().is_empty() || id.len() > 128 || !ids.insert(id) {
            return Err(HostError::Protected);
        }
        for key in ["x", "y"] {
            let coordinate: f64 = parse(item, key)?;
            if !coordinate.is_finite() {
                return Err(HostError::Protected);
            }
        }
        let kind: Kind = parse(item, "settings")?;
        if crate::widget_defaults::get(&kind.kind).is_none() {
            return Err(HostError::Protected);
        }
        item.0.insert(
            "visible".into(),
            raw(kit.iter().any(|k| k.key() == kind.kind)),
        );
        kinds.insert(kind.kind);
    }
    for kind in kit {
        if kinds.contains(kind.key()) {
            continue;
        }
        if items.len() >= INSTANCE_LIMIT {
            return Err(HostError::Protected);
        }
        let id = (1..=INSTANCE_LIMIT)
            .map(|n| format!("widget-{n}"))
            .find(|id| !ids.contains(id))
            .ok_or(HostError::Protected)?;
        ids.insert(id.clone());
        let defaults = crate::widget_defaults::get(kind.key()).ok_or(HostError::Protected)?;
        let (x, y) = kind.position();
        let item: Fields = serde_json::from_str(&serde_json::json!({"id":id,"x":x,"y":y,"visible":true,"opacity":1.0,"settings":defaults.settings}).to_string()).map_err(|_| HostError::Protected)?;
        items.push(item);
    }
    document.fields.0.insert(
        "instances".into(),
        raw(items.into_iter().map(|item| item.0).collect::<Vec<_>>()),
    );
    let mut performance = document.performance().map_err(|()| HostError::Protected)?;
    performance.0.insert("level".into(), raw(level));
    document
        .fields
        .0
        .insert("performance".into(), raw(performance.0));
    let bytes = serde_json::to_vec(&document.fields.0).map_err(|_| HostError::Io)?;
    files::save(
        path,
        &bytes,
        files::Mode::Observed(document.observed.as_deref()),
        &files::Options {
            limit: LIMIT,
            sibling_base: Some(path.with_extension("json")),
            ..Default::default()
        },
    )
    .map_err(|error| file_error(&error))?;
    Ok(true)
}
fn file_error(error: &files::Error) -> HostError {
    if error.kind().is_conflict() {
        HostError::OnboardingConflict {}
    } else if error.kind() == files::Kind::Busy {
        HostError::Busy
    } else if matches!(
        error,
        files::Error::InvalidInput(_) | files::Error::Unsupported(_)
    ) {
        HostError::Protected
    } else {
        HostError::Io
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::Root;
    #[test]
    fn missing_layout_is_not_seeded_and_stale_absence_conflicts() {
        let root = Root::new();
        let path = root.path.join("layout.json");
        let (_, revision) = state(&path).unwrap();
        assert!(
            !apply(
                &path,
                &[WidgetKind::Delta],
                PerformanceLevel::Economy,
                &revision
            )
            .unwrap()
        );
        assert!(!path.exists());
        std::fs::write(&path, r#"{"version":1,"instances":[]}"#).unwrap();
        assert!(matches!(
            apply(
                &path,
                &[WidgetKind::Delta],
                PerformanceLevel::Economy,
                &revision
            ),
            Err(HostError::OnboardingConflict {})
        ));
    }
    #[test]
    fn kit_keeps_extensions_uses_free_ids_and_native_defaults() {
        let root = Root::new();
        let path = root.path.join("layout.json");
        std::fs::write(&path, r#"{"version":2,"future":{"x":7},"instances":[{"id":"widget-1","x":5,"y":6,"visible":true,"keep":9,"settings":{"kind":"radar"}}]}"#).unwrap();
        let (_, revision) = state(&path).unwrap();
        assert!(
            apply(
                &path,
                &[WidgetKind::Delta],
                PerformanceLevel::Economy,
                &revision
            )
            .unwrap()
        );
        let value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(value["future"]["x"], 7);
        assert_eq!(value["instances"][0]["visible"], false);
        assert_eq!(value["instances"][0]["keep"], 9);
        assert_eq!(value["instances"][1]["id"], "widget-2");
        assert_eq!(value["instances"][1]["x"], 730);
        let defaults: serde_json::Value =
            serde_json::from_str(crate::widget_defaults::get("delta").unwrap().settings.get())
                .unwrap();
        assert_eq!(value["instances"][1]["settings"], defaults);
        assert_eq!(value["performance"]["level"], "economy");
    }
}
