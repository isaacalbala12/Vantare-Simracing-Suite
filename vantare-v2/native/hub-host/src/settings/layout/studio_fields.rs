use super::{Fields, HostError, RawValue};
use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{Error as _, MapAccess, Visitor},
    ser::SerializeMap,
};
struct Ordered(Vec<(String, Box<RawValue>)>);
impl<'de> Deserialize<'de> for Ordered {
    fn deserialize<D: Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
        struct Object;
        impl<'de> Visitor<'de> for Object {
            type Value = Ordered;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("an object without duplicate keys")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Ordered, A::Error> {
                let mut fields: Vec<(String, Box<RawValue>)> = vec![];
                let mut seen = std::collections::BTreeSet::new();
                while let Some(key) = map.next_key::<String>()? {
                    if fields.len() >= crate::settings::track::MAX_WIDGET_OVERRIDES {
                        return Err(A::Error::custom("too many members"));
                    }
                    if !seen.insert(key.clone()) {
                        return Err(A::Error::custom("duplicate key"));
                    }
                    fields.push((key, map.next_value()?));
                }
                Ok(Ordered(fields))
            }
        }
        input.deserialize_map(Object)
    }
}
impl Serialize for Ordered {
    fn serialize<S: Serializer>(&self, out: S) -> Result<S::Ok, S::Error> {
        let mut map = out.serialize_map(Some(self.0.len()))?;
        for (key, value) in &self.0 {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}
pub(super) fn remove_rates(root: &mut Fields, ids: &[String]) -> Result<(), HostError> {
    let Some(raw) = root.0.get("performance") else {
        return Ok(());
    };
    let mut performance: Ordered =
        serde_json::from_str(raw.get()).map_err(|_| HostError::Protected)?;
    let Some((_, raw)) = performance.0.iter_mut().find(|(key, _)| key == "widgets") else {
        return Ok(());
    };
    let mut widgets: Ordered = serde_json::from_str(raw.get()).map_err(|_| HostError::Protected)?;
    let before = widgets.0.len();
    widgets.0.retain(|(key, _)| !ids.contains(key));
    if widgets.0.len() == before {
        return Ok(());
    }
    *raw = serde_json::value::to_raw_value(&widgets).map_err(|_| HostError::Io)?;
    root.0.insert(
        "performance".into(),
        serde_json::value::to_raw_value(&performance).map_err(|_| HostError::Io)?,
    );
    Ok(())
}

// Retain native legacy rates when copying; FrequencyChange restricts UI edits.
pub(super) fn set_rate(root: &mut Fields, id: &str, hz: Option<u16>) -> Result<bool, HostError> {
    use crate::settings::track::{MAX_WIDGET_ID_BYTES, MAX_WIDGET_OVERRIDES};
    if id.is_empty()
        || id.len() > MAX_WIDGET_ID_BYTES
        || id.contains('\0')
        || hz.is_some_and(|hz| !crate::settings::track::OVERRIDE_HZ.contains(&hz))
    {
        return Err(HostError::Denied);
    }
    let mut performance: Ordered = root.0.get("performance").map_or_else(
        || Ok(Ordered(vec![])),
        |raw| serde_json::from_str(raw.get()).map_err(|_| HostError::Protected),
    )?;
    let widget_index = performance.0.iter().position(|(key, _)| key == "widgets");
    let mut widgets: Ordered = widget_index.map_or_else(
        || Ok(Ordered(vec![])),
        |index| {
            serde_json::from_str(performance.0[index].1.get()).map_err(|_| HostError::Protected)
        },
    )?;
    let index = widgets.0.iter().position(|(key, _)| key == id);
    match (hz, index) {
        (None, None) => return Ok(false),
        (None, Some(index)) => {
            widgets.0.remove(index);
        }
        (Some(hz), Some(index)) => {
            let old: u16 =
                serde_json::from_str(widgets.0[index].1.get()).map_err(|_| HostError::Protected)?;
            if old == hz {
                return Ok(false);
            }
            widgets.0[index].1 = serde_json::value::to_raw_value(&hz).map_err(|_| HostError::Io)?;
        }
        (Some(hz), None) => {
            if widgets.0.len() >= MAX_WIDGET_OVERRIDES {
                return Err(HostError::Denied);
            }
            widgets.0.push((
                id.into(),
                serde_json::value::to_raw_value(&hz).map_err(|_| HostError::Io)?,
            ));
        }
    }
    let raw = serde_json::value::to_raw_value(&widgets).map_err(|_| HostError::Io)?;
    if let Some(index) = widget_index {
        performance.0[index].1 = raw;
    } else {
        performance.0.push(("widgets".into(), raw));
    }
    root.0.insert(
        "performance".into(),
        serde_json::value::to_raw_value(&performance).map_err(|_| HostError::Io)?,
    );
    Ok(true)
}

// Performance permits 256 ids; the generic small-object Fields reader permits
// only 64 members. Keep duplicate rejection while using the native map limit.
pub(super) fn rates(
    performance: &Fields,
) -> Result<std::collections::BTreeMap<String, u16>, HostError> {
    let Some(raw) = performance.0.get("widgets") else {
        return Ok(std::collections::BTreeMap::new());
    };
    let ordered: Ordered = serde_json::from_str(raw.get()).map_err(|_| HostError::Protected)?;
    ordered
        .0
        .into_iter()
        .map(|(id, raw)| {
            serde_json::from_str(raw.get())
                .map(|hz| (id, hz))
                .map_err(|_| HostError::Protected)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::Ordered;
    #[test]
    fn ordered_reader_rejects_the_257th_key_before_reading_its_value() {
        let members = (0..256)
            .map(|n| format!(r#""id-{n}":20"#))
            .collect::<Vec<_>>()
            .join(",");
        let accepted = format!("{{{members}}}");
        let ordered: Ordered = serde_json::from_str(&accepted).expect("256 entries");
        assert_eq!(ordered.0.len(), 256);
        assert_eq!(
            serde_json::to_string(&ordered).expect("same order"),
            accepted
        );
        // A malformed value distinguishes early rejection from parsing a large tail.
        for key in ["id-256", "id-0"] {
            let rejected = format!("{{{members},\"{key}\":[invalid");
            let error = serde_json::from_str::<Ordered>(&rejected)
                .err()
                .expect("reject before tail");
            assert_eq!(error.classify(), serde_json::error::Category::Data);
        }
        let duplicate = r#"{"id-0":20,"id-0":[invalid"#;
        let error = serde_json::from_str::<Ordered>(duplicate)
            .err()
            .expect("reject duplicate before tail");
        assert_eq!(error.classify(), serde_json::error::Category::Data);
    }
}
