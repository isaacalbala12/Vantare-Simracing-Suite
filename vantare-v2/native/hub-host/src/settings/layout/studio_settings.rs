//! Sparse settings writes over the existing duplicate-safe `RawValue` adapter.
use super::{Fields, HostError, WidgetKind, put, read, typed_settings};
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
    // Native session overrides inherit the saved main columns when absent or
    // null. An explicit empty array remains empty.
    if value.is_none() && ["practiceColumns", "qualifyingColumns"].contains(&key) {
        return stored_columns(stored, "columns");
    }
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
        if existing.is_none()
            && old
                .iter()
                .any(|old| read::<String>(old, "id").as_deref() == Ok(metric))
        {
            return Err(HostError::Denied);
        }
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
    let next = serde_json::to_value(&projected).map_err(|_| HostError::Io)?;
    if old == next {
        return Ok(false);
    }
    // Persist exactly domain's normalized struct, retaining unknown members.
    // Raw serialization is essential: to_value(f32) widens the number to f64.
    let normalized: Fields =
        serde_json::from_str(projected.raw()?.get()).map_err(|_| HostError::Io)?;
    for key in WidgetSettings::keys(kind) {
        let Some(raw) = normalized.0.get(&key) else {
            stored.0.remove(&key);
            continue;
        };
        let value = if ["columns", "practiceColumns", "qualifyingColumns"].contains(&key.as_str()) {
            normalized_columns(&stored, &key, &next[&key])?
        } else {
            raw.clone()
        };
        stored.0.insert(key, value);
    }
    put(fields, "settings", &stored.0)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn fields(settings: &Value) -> Fields {
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
        let mut doc = fields(&json!({"kind":"pedals","gap":2,"vendor":{"raw":42}}));
        assert!(edit(&mut doc, json!({"kind":"pedals","gap":3})).unwrap());
        let value = saved(&doc);
        assert_eq!(value["gap"], 3.0);
        assert_eq!(value["vendor"], json!({"raw":42}));
        assert!(value.get("brandVisible").is_none());
        let native: vantare_domain::widget_settings::pedals::Settings =
            serde_json::from_value(value).unwrap();
        assert_eq!(native.gap.to_bits(), 3.0f32.to_bits());
    }
    #[test]
    fn unchanged_patch_neither_seeds_defaults_nor_changes_bytes() {
        let mut doc = fields(&json!({"kind":"pedals","gap":2,"extra":"untouched"}));
        let before = doc.0["settings"].get().to_owned();
        assert!(!edit(&mut doc, json!({"kind":"pedals","gap":2})).unwrap());
        assert_eq!(doc.0["settings"].get(), before);
    }
    #[test]
    fn a_different_kind_and_unverified_access_cannot_write() {
        let mut doc = fields(&json!({"kind":"pedals"}));
        let before = doc.0["settings"].get().to_owned();
        assert!(matches!(
            edit(&mut doc, json!({"kind":"delta","size":"pill"})),
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
        let mut doc = fields(&json!({"kind":"relative","contentVersion":1,"columns":[{
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

#[cfg(test)]
mod preserved_native_fields {
    use super::*;
    #[test]
    fn editing_fuel_history_preserves_native_source_and_unknown_settings_bytes() {
        let raw = r#"{"settings":{"kind":"fuel-strategy","contentVersion":1,"source":"virtual-energy","units":"liters","future":{"keep":  1.00}}}"#;
        let mut fields: Fields = serde_json::from_str(raw).unwrap();
        let patch = serde_json::from_str(r#"{"kind":"fuel-strategy","historyRows":3}"#).unwrap();
        assert!(apply(&mut fields, &patch, Some(CatalogAccess::Pro)).unwrap());
        let stored: Fields = read(&fields, "settings").unwrap();
        assert_eq!(stored.0["source"].get(), r#""virtual-energy""#);
        assert_eq!(stored.0["units"].get(), r#""liters""#);
        assert_eq!(stored.0["future"].get(), r#"{"keep":  1.00}"#);
    }
}

#[cfg(test)]
mod inheritance_tests {
    use super::*;
    #[test]
    fn session_override_preserves_inherited_format_and_can_return_to_inheritance() {
        let mut fields:Fields=serde_json::from_str(r#"{"settings":{"kind":"standings","contentVersion":1,"columns":[{"id":"saved","metricId":"driverName","widthPreset":"lg","format":{"mode":"surname","future":17}}]}}"#).unwrap();
        let update = serde_json::from_str(
            r#"{"kind":"standings","practiceColumns":[{"metric":"driverName","enabled":false}]}"#,
        )
        .unwrap();
        assert!(apply(&mut fields, &update, Some(CatalogAccess::Pro)).unwrap());
        let stored: Fields = read(&fields, "settings").unwrap();
        let value: Value = serde_json::from_str(fields.0["settings"].get()).unwrap();
        assert_eq!(value["practiceColumns"][0]["id"], "saved");
        assert_eq!(value["practiceColumns"][0]["widthPreset"], "lg");
        assert_eq!(value["practiceColumns"][0]["format"]["future"], 17);
        assert!(stored.0.contains_key("columns"));
        let clear = serde_json::from_str(r#"{"kind":"standings","practiceColumns":null}"#).unwrap();
        assert!(apply(&mut fields, &clear, Some(CatalogAccess::Pro)).unwrap());
        let stored: Fields = read(&fields, "settings").unwrap();
        assert!(!stored.0.contains_key("practiceColumns"));
        let view =
            serde_json::to_value(typed_settings(WidgetKind::Standings, &stored).unwrap()).unwrap();
        assert!(view.get("practiceColumns").is_none());
    }
}

#[cfg(test)]
mod review_tests {
    use super::*;
    use serde_json::json;
    use vantare_domain::widget_settings as native;
    fn write(input: Value, update: Value) -> Value {
        let mut fields: Fields = serde_json::from_value(json!({"settings":input})).unwrap();
        let update = serde_json::from_value(update).unwrap();
        assert!(apply(&mut fields, &update, Some(CatalogAccess::Pro)).unwrap());
        serde_json::from_str(fields.0["settings"].get()).unwrap()
    }
    #[test]
    fn legacy_and_out_of_range_settings_save_the_complete_normalized_struct() {
        let columns: Vec<_> = (0..13)
            .map(|i| json!({"id":i.to_string(),"metricId":"gap"}))
            .collect();
        let cases = [
            json!({"kind":"standings","rowCount":99,"windowAround":3,"columns":columns}),
            json!({"kind":"standings","designSystem":"vantare","classificationMode":"multiclass"}),
            json!({"kind":"relative","designSystem":"eficiencia","columns":(0..9).map(|i|json!({"id":i.to_string(),"metricId":"gap"})).collect::<Vec<_>>()}),
            json!({"kind":"fuel-strategy","designSystem":"vantare"}),
        ];
        for input in cases {
            let kind = input["kind"].as_str().unwrap();
            let expected = match kind {
                "standings" => {
                    let mut data =
                        serde_json::from_value::<native::standings::Settings>(input.clone())
                            .unwrap()
                            .normalized();
                    data.accent = native::look::Accent::White;
                    serde_json::to_value(data.normalized()).unwrap()
                }
                "relative" => {
                    let mut data =
                        serde_json::from_value::<native::relative::Settings>(input.clone())
                            .unwrap()
                            .normalized();
                    data.accent = native::look::Accent::White;
                    serde_json::to_value(data.normalized()).unwrap()
                }
                "fuel-strategy" => {
                    let mut data =
                        serde_json::from_value::<native::fuel_strategy::Settings>(input.clone())
                            .unwrap()
                            .normalized();
                    data.accent = native::look::Accent::White;
                    serde_json::to_value(data.normalized()).unwrap()
                }
                _ => unreachable!(),
            };
            let mut actual = write(input.clone(), json!({"kind":kind,"accent":"white"}));
            actual.as_object_mut().unwrap().remove("kind");
            assert_eq!(actual, expected, "{input}");
        }
    }
    #[test]
    fn fractional_gap_uses_the_native_number_bytes_and_negative_zero_is_noop() {
        let mut fields: Fields =
            serde_json::from_str(r#"{"settings":{"kind":"pedals","gap":0.0}}"#).unwrap();
        let before = fields.0["settings"].get().to_owned();
        assert!(
            !apply(
                &mut fields,
                &serde_json::from_str(r#"{"kind":"pedals","gap":-0.0}"#).unwrap(),
                Some(CatalogAccess::Pro)
            )
            .unwrap()
        );
        assert_eq!(fields.0["settings"].get(), before);
        assert!(
            apply(
                &mut fields,
                &serde_json::from_str(r#"{"kind":"pedals","gap":2.7}"#).unwrap(),
                Some(CatalogAccess::Pro)
            )
            .unwrap()
        );
        let stored: Fields = read(&fields, "settings").unwrap();
        let native = native::pedals::Settings {
            gap: 2.7,
            ..Default::default()
        };
        let expected: Fields =
            serde_json::from_str(&serde_json::to_string(&native).unwrap()).unwrap();
        assert_eq!(stored.0["gap"].get(), expected.0["gap"].get());
        assert_eq!(stored.0["gap"].get(), "2.7");
    }
    #[test]
    fn complete_column_lists_delete_reorder_and_reject_new_id_collisions() {
        let input = json!({"kind":"relative","contentVersion":1,"columns":[{"id":"gap","metricId":"driverName"},{"id":"old","metricId":"position"}]});
        let mut fields: Fields = serde_json::from_value(json!({"settings":input})).unwrap();
        let update =
            serde_json::from_value(json!({"kind":"relative","columns":[{"metric":"gap"}]}))
                .unwrap();
        let before = fields.0["settings"].get().to_owned();
        assert!(matches!(
            apply(&mut fields, &update, Some(CatalogAccess::Pro)),
            Err(HostError::Denied)
        ));
        assert_eq!(fields.0["settings"].get(), before);
        let actual = write(
            json!({"kind":"relative","contentVersion":1,"columns":[{"id":"p","metricId":"position"},{"id":"d","metricId":"driverName"},{"id":"g","metricId":"gap"}]}),
            json!({"kind":"relative","columns":[{"metric":"gap"},{"metric":"driverName","format":{"maxChars":0}}]}),
        );
        assert_eq!(actual["columns"].as_array().unwrap().len(), 2);
        assert_eq!(actual["columns"][0]["id"], "g");
        assert_eq!(actual["columns"][1]["format"]["maxChars"], 0);
    }
}
