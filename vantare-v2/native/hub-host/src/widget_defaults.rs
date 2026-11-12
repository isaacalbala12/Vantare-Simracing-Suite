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

#[cfg(test)]
mod writer_bytes_order {
    use super::*;
    use serde::de::{MapAccess, Visitor};

    struct Object(Vec<(String, Box<RawValue>)>);
    impl<'de> Deserialize<'de> for Object {
        fn deserialize<D: serde::Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
            struct Entries;
            impl<'de> Visitor<'de> for Entries {
                type Value = Object;
                fn expecting(&self, output: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    output.write_str("an object in source order")
                }
                fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Object, M::Error> {
                    let mut entries = Vec::new();
                    while let Some(entry) = map.next_entry()? {
                        entries.push(entry);
                    }
                    Ok(Object(entries))
                }
            }
            input.deserialize_map(Entries)
        }
    }
    fn sorted(raw: &RawValue) -> bool {
        match raw.get().trim_start().as_bytes()[0] {
            b'{' => {
                let object: Object = serde_json::from_str(raw.get()).unwrap();
                object.0.windows(2).all(|pair| pair[0].0 < pair[1].0)
                    && object.0.iter().all(|(_, child)| sorted(child))
            }
            b'[' => {
                let children: Vec<Box<RawValue>> = serde_json::from_str(raw.get()).unwrap();
                children.iter().all(|child| sorted(child))
            }
            _ => true,
        }
    }
    #[test]
    fn writer_bytes_widget_defaults_have_sorted_keys_at_every_depth_for_every_kind() {
        use crate::studio::WidgetKind;
        let document: Document = serde_json::from_str(SOURCE).unwrap();
        let kinds: std::collections::BTreeSet<_> = WidgetKind::CATALOG
            .iter()
            .copied()
            .chain(std::iter::once(WidgetKind::CarDamageNumbers))
            .map(WidgetKind::id)
            .collect();
        assert_eq!(kinds, document.widgets.keys().map(String::as_str).collect());
        for kind in kinds {
            assert!(sorted(&get(kind).unwrap().settings), "{kind}");
        }
        // RawValue/Visitor observes source order even without preserve_order.
        for source in [r#"{"z":1,"a":2}"#, r#"{"a":[{"z":1,"a":2}]}"#] {
            assert!(!sorted(&RawValue::from_string(source.into()).unwrap()));
        }
    }
}
