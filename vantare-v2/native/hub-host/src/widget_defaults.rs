//! Build-time snapshot of native UI defaults. No GPUI or filesystem access.
use serde::Deserialize;
use serde_json::value::RawValue;
use std::{collections::BTreeMap, sync::OnceLock};
const SOURCE: &str = include_str!("../data/widget-defaults.json");
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WidgetDefault {
    pub settings: Box<RawValue>,
    pub size: Size,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Document {
    version: u8,
    widgets: BTreeMap<String, WidgetDefault>,
}
pub fn get(kind: &str) -> Option<WidgetDefault> {
    static DOCUMENT: OnceLock<Option<Document>> = OnceLock::new();
    let document = DOCUMENT
        .get_or_init(|| {
            let document: Document = serde_json::from_str(SOURCE).ok()?;
            (document.version == 1).then_some(document)
        })
        .as_ref()?;
    let widget = document.widgets.get(kind)?.clone();
    (widget.size.width.is_finite()
        && widget.size.height.is_finite()
        && widget.size.width > 0.0
        && widget.size.height > 0.0)
        .then_some(widget)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn known_defaults_have_the_matching_kind_and_unknown_ids_are_absent() {
        let document: Document = serde_json::from_str(SOURCE).unwrap();
        for (kind, default) in document.widgets {
            let projected = get(&kind).expect("versioned native kind");
            assert_eq!(projected.settings.get(), default.settings.get());
            let settings: serde_json::Value = serde_json::from_str(default.settings.get()).unwrap();
            assert_eq!(settings["kind"], kind);
        }
        assert!(get("unknown").is_none());
    }
}
