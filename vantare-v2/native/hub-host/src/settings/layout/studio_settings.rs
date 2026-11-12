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
fn column_edits(stored: &Fields, key: &str, edits: &Value) -> Result<Value, HostError> {
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
                column_edits(&stored, key, value)?
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
