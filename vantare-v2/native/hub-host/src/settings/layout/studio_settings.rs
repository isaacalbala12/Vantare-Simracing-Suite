//! Sparse settings writes over the existing duplicate-safe RawValue adapter.
use super::{Fields, HostError, WidgetKind, merged_settings, put, read, typed_settings};
use crate::studio::{WidgetSettings, WidgetSettingsPatch};
use serde_json::{Value, value::RawValue};
use vantare_ipc::control::CatalogAccess;

fn encode(value: &impl serde::Serialize) -> Result<Box<RawValue>, HostError> {
    serde_json::value::to_raw_value(value).map_err(|_| HostError::Io)
}
// Only typed, known values are merged. Unrecognized stored object members keep
// their original RawValue bytes, including inside format/style objects.
fn known_object(old: Option<&RawValue>, new: &Value) -> Result<Box<RawValue>, HostError> {
    let Value::Object(object) = new else {
        return encode(new);
    };
    let mut fields: Fields = old.map_or(Ok(Fields::default()), |raw| {
        serde_json::from_str(raw.get()).map_err(|_| HostError::Protected)
    })?;
    for (key, value) in object {
        let changed = known_object(fields.0.get(key).map(Box::as_ref), value)?;
        fields.0.insert(key.clone(), changed);
    }
    encode(&fields.0)
}
fn stored_columns(stored: &Fields, key: &str) -> Result<Vec<Fields>, HostError> {
    let value: Option<Vec<Fields>> = stored.0.get(key).map_or(Ok(None), |raw| {
        serde_json::from_str(raw.get()).map_err(|_| HostError::Protected)
    })?;
    Ok(value.unwrap_or_default())
}
fn column_edits(
    stored: &Fields,
    baseline: &Value,
    key: &str,
    edits: &Value,
) -> Result<Value, HostError> {
    if edits.is_null() {
        return Ok(Value::Null);
    }
    let entries = edits.as_array().ok_or(HostError::Denied)?;
    let old = stored_columns(stored, key)?;
    let mut identities = std::collections::HashSet::new();
    for column in &old {
        let id: String = read(column, "metricId")?;
        if !identities.insert(id) {
            return Err(HostError::Protected);
        }
    }
    let mut result = Vec::new();
    for entry in entries {
        let metric = entry["metric"].as_str().ok_or(HostError::Denied)?;
        let existing = old
            .iter()
            .find(|column| read::<String>(column, "metricId").as_deref() == Ok(metric));
        let mut column = if let Some(existing) = existing {
            Fields(existing.0.clone())
        } else if let Some(default) = baseline
            .get(key)
            .and_then(Value::as_array)
            .and_then(|items| items.iter().find(|item| item["metricId"] == metric))
        {
            serde_json::from_value(default.clone()).map_err(|_| HostError::Io)?
        } else {
            let default = vantare_domain::widget_settings::columns::ColumnSetting {
                id: metric.into(),
                metric_id: metric.into(),
                ..Default::default()
            };
            serde_json::from_str(encode(&default)?.get()).map_err(|_| HostError::Io)?
        };
        for (key, value) in entry.as_object().ok_or(HostError::Denied)? {
            if key == "metric" {
                continue;
            }
            let merged = known_object(column.0.get(key).map(Box::as_ref), value)?;
            column.0.insert(key.clone(), merged);
        }
        result.push(column.0);
    }
    serde_json::to_value(result).map_err(|_| HostError::Io)
}
fn normalized_columns(
    stored: &Fields,
    key: &str,
    value: &Value,
) -> Result<Box<RawValue>, HostError> {
    let Some(items) = value.as_array() else {
        return encode(value);
    };
    let old = stored_columns(stored, key)?;
    let mut used = std::collections::HashSet::new();
    let mut result = Vec::new();
    for item in items {
        let metric = item["metricId"].as_str().ok_or(HostError::Protected)?;
        let matched = old.iter().enumerate().find(|(index, column)| {
            !used.contains(index) && read::<String>(column, "metricId").as_deref() == Ok(metric)
        });
        let original = matched.map(|(index, column)| {
            used.insert(index);
            column
        });
        let merged = known_object(original.map(|c| encode(&c.0)).transpose()?.as_deref(), item)?;
        result.push(merged);
    }
    encode(&result)
}
pub(super) fn apply(
    fields: &mut Fields,
    patch: &WidgetSettingsPatch,
    access: Option<CatalogAccess>,
) -> Result<bool, HostError> {
    let mut stored: Fields = read(fields, "settings")?;
    let kind: WidgetKind = read(&stored, "kind")?;
    if kind != patch.kind() || !kind.info(access).allowed {
        return Err(HostError::Denied);
    }
    patch.validate()?;
    let merged = merged_settings(kind, &stored)?;
    let source = serde_json::to_string(&merged.0).map_err(|_| HostError::Io)?;
    let old_raw = WidgetSettings::unnormalized_json(&source)?;
    let old = serde_json::to_value(typed_settings(kind, &stored)?.ok_or(HostError::Denied)?)
        .map_err(|_| HostError::Io)?;
    let patch = serde_json::to_value(patch).map_err(|_| HostError::Io)?;
    let requested = patch.as_object().ok_or(HostError::Denied)?;
    let mut candidate = old.clone();
    for (key, value) in requested {
        if key == "kind" {
            continue;
        }
        candidate[key] =
            if ["columns", "practiceColumns", "qualifyingColumns"].contains(&key.as_str()) {
                column_edits(&stored, &old, key, value)?
            } else {
                value.clone()
            };
    }
    let projected = WidgetSettings::from_json(
        kind,
        &serde_json::to_string(&candidate).map_err(|_| HostError::Io)?,
    )?
    .ok_or(HostError::Denied)?;
    let next = serde_json::to_value(projected).map_err(|_| HostError::Io)?;
    if old == next {
        return Ok(false);
    }
    let mut keys: std::collections::BTreeSet<_> = requested.keys().cloned().collect();
    keys.extend(
        old.as_object()
            .ok_or(HostError::Protected)?
            .keys()
            .filter(|key| stored.0.contains_key(*key) && old_raw[*key] != old[*key])
            .cloned(),
    );
    if kind != WidgetKind::Pedals {
        keys.insert("contentVersion".into());
    }
    for key in keys {
        if key == "kind" || key == "brandVisible" {
            continue;
        }
        let Some(value) = next.get(&key) else {
            stored.0.remove(&key);
            continue;
        };
        if ["columns", "practiceColumns", "qualifyingColumns"].contains(&key.as_str()) {
            stored
                .0
                .insert(key.clone(), normalized_columns(&stored, &key, value)?);
        } else {
            stored.0.insert(
                key.clone(),
                known_object(stored.0.get(&key).map(Box::as_ref), value)?,
            );
        }
    }
    put(fields, "settings", &stored.0)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn fields(settings: Value) -> Fields {
        serde_json::from_value(json!({"settings":settings})).unwrap()
    }
    fn edit(fields: &mut Fields, patch: Value) -> Result<bool, HostError> {
        apply(
            fields,
            &serde_json::from_value(patch).unwrap(),
            Some(CatalogAccess::Pro),
        )
    }
    fn saved(fields: &Fields) -> Value {
        serde_json::from_str(fields.0["settings"].get()).unwrap()
    }
    #[test]
    fn sparse_write_preserves_unknown_members_and_uses_domain_disk_format() {
        let mut doc = fields(json!({"kind":"pedals","gap":2,"vendor":{"raw":42}}));
        assert!(edit(&mut doc, json!({"kind":"pedals","gap":3})).unwrap());
        let value = saved(&doc);
        assert_eq!(value["gap"], 3.0);
        assert_eq!(value["vendor"], json!({"raw":42}));
        assert!(value.get("brandVisible").is_none());
        let native: vantare_domain::widget_settings::pedals::Settings =
            serde_json::from_value(value).unwrap();
        assert_eq!(native.gap, 3.0);
    }
    #[test]
    fn unchanged_patch_neither_seeds_defaults_nor_changes_bytes() {
        let mut doc = fields(json!({"kind":"pedals","gap":2,"extra":"untouched"}));
        let before = doc.0["settings"].get().to_owned();
        assert!(!edit(&mut doc, json!({"kind":"pedals","gap":2})).unwrap());
        assert_eq!(doc.0["settings"].get(), before);
    }
    #[test]
    fn a_different_kind_and_unverified_access_cannot_write() {
        let mut doc = fields(json!({"kind":"pedals"}));
        let before = doc.0["settings"].get().to_owned();
        assert!(matches!(
            edit(&mut doc, json!({"kind":"delta","size":"compact"})),
            Err(HostError::Denied)
        ));
        assert!(matches!(
            apply(
                &mut doc,
                &serde_json::from_value(json!({"kind":"pedals","gap":3})).unwrap(),
                None
            ),
            Err(HostError::Denied)
        ));
        assert_eq!(doc.0["settings"].get(), before);
    }
    #[test]
    fn column_edits_keep_opaque_nested_fields_and_native_identity() {
        let mut doc = fields(json!({"kind":"relative","contentVersion":1,"columns":[{
            "id":"native-id","metricId":"driverName","enabled":true,"widthPreset":"lg",
            "format":{"mode":"full","maxChars":20,"extension":{"bytes":7}},
            "style":{"align":"left","future":true},"vendor":12
        }]}));
        assert!(edit(&mut doc,json!({"kind":"relative","columns":[{"metric":"driverName","format":{"maxChars":21}}]})).unwrap());
        let column = &saved(&doc)["columns"][0];
        assert_eq!(column["id"], "native-id");
        assert_eq!(column["format"]["maxChars"], 21);
        assert_eq!(column["format"]["extension"], json!({"bytes":7}));
        assert_eq!(column["style"]["future"], true);
        assert_eq!(column["vendor"], 12);
        assert_eq!(column["widthPreset"], "lg");
    }
}
