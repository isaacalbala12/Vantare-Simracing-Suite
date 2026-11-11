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
                while let Some((key, value)) = map.next_entry::<String, Box<RawValue>>()? {
                    if fields.iter().any(|(old, _)| old == &key) {
                        return Err(A::Error::custom("duplicate key"));
                    }
                    fields.push((key, value));
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
