//! The wire requires all fields; legacy disk documents retain GPUI defaults.
use super::CalendarAlerts;
use serde::Deserialize;
use serde_json::Value;
fn exact(value: &Value, keys: &[&str]) -> bool {
    value.as_object().is_some_and(|object| object.len() == keys.len() && keys.iter().all(|key| object.contains_key(*key)))
}
pub(crate) fn deserialize_complete_alerts<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Box<CalendarAlerts>, D::Error> {
    let value = Value::deserialize(deserializer)?;
    let complete = exact(&value, &["leadMin", "bands", "slots", "channels", "autoLaunch", "notifyWeek"])
        && exact(&value["channels"], &["windows", "inTrack", "sound"])
        && value["bands"].as_array().is_some_and(|bands| bands.iter().all(|band| exact(band, &["seriesId", "from", "to", "days", "mode"])))
        && value["slots"].as_array().is_some_and(|slots| slots.iter().all(|slot| exact(slot, &["seriesId", "at"])));
    if !complete { return Err(serde::de::Error::custom("calendar alerts must be complete")); }
    serde_json::from_value(value).map(Box::new).map_err(serde::de::Error::custom)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Request;
    fn request(alerts: Value) -> Value {
        serde_json::json!({"method":"calendar.alertsSave", "alerts": alerts, "expectedRevision":"a".repeat(64)})
    }
    #[test]
    fn wire_requires_complete_fields_even_when_legacy_defaults_exist() {
        let source = serde_json::to_value(CalendarAlerts::default()).unwrap();
        assert!(serde_json::from_value::<Request>(request(source.clone())).is_ok());
        for key in ["leadMin", "bands", "slots", "channels", "autoLaunch", "notifyWeek"] {
            let mut value = source.clone();
            value.as_object_mut().unwrap().remove(key);
            assert!(serde_json::from_value::<Request>(request(value)).is_err());
        }
        let mut value = source;
        value["channels"].as_object_mut().unwrap().remove("sound");
        assert!(serde_json::from_value::<Request>(request(value)).is_err());
        assert!(serde_json::from_value::<CalendarAlerts>(serde_json::json!({})).is_ok());
    }
    #[test]
    fn wire_rejects_an_incomplete_or_extended_band() {
        let mut source = serde_json::to_value(CalendarAlerts::default()).unwrap();
        source["bands"] = serde_json::json!([{"seriesId":"qa","from":1200,"to":1380,"days":"all","mode":"each"}]);
        for key in ["days", "mode"] {
            let mut value = source.clone();
            value["bands"][0].as_object_mut().unwrap().remove(key);
            assert!(serde_json::from_value::<Request>(request(value)).is_err());
        }
        source["bands"][0]["extra"] = Value::Bool(true);
        assert!(serde_json::from_value::<Request>(request(source)).is_err());
    }
}
