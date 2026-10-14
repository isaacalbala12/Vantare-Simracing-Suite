//! Closed values shared with the worker; no supplied text fingerprints.
use serde_json::{Map, Value};
use std::sync::OnceLock;

fn catalog() -> &'static Value {
    static CATALOG: OnceLock<Value> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../../../tools/triage/structured-catalog.json"
        ))
        .unwrap_or(Value::Null)
    })
}

fn closed(value: &Value, kind: &str) -> Value {
    if value.is_string()
        && catalog()[kind]
            .as_array()
            .is_some_and(|values| values.contains(value))
    {
        value.clone()
    } else {
        Value::from("otro")
    }
}

fn number(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 6
        && text.bytes().all(|b| b.is_ascii_digit())
        && (text.len() == 1 || !text.starts_with('0'))
}

pub(super) fn version(value: &Value) -> Value {
    let Some(text) = value.as_str().filter(|s| s.len() <= 64) else {
        return Value::from("otro");
    };
    let (release, build) = text
        .split_once('+')
        .map_or((text, None), |(a, b)| (a, Some(b)));
    let (core, pre) = release
        .split_once('-')
        .map_or((release, None), |(a, b)| (a, Some(b)));
    let core: Vec<_> = core.split('.').collect();
    let valid = core.len() == 3
        && core.into_iter().all(number)
        && build.is_none_or(|b| b.split('.').all(number))
        && pre.is_none_or(|p| {
            let mut parts = p.split('.');
            let label = Value::from(parts.next().unwrap_or_default());
            catalog()["release_labels"]
                .as_array()
                .is_some_and(|labels| labels.contains(&label))
                && parts.all(number)
        });
    if valid {
        value.clone()
    } else {
        Value::from("otro")
    }
}

pub(super) fn record(value: &Value) -> Value {
    let mut out = Map::new();
    let Some(value) = value.as_object() else {
        return Value::Object(out);
    };
    for (key, kind) in [
        ("level", "levels"),
        ("error_code", "errors"),
        ("error_type", "errors"),
        ("module", "modules"),
    ] {
        if let Some(value) = value.get(key) {
            out.insert(key.into(), closed(value, kind));
        }
    }
    if let Some(value) = value.get("version") {
        out.insert("version".into(), version(value));
    }
    for key in ["count", "relative_ms"] {
        if let Some(value) = value.get(key) {
            let clean = if value.as_u64().is_some_and(|v| v <= 1_000_000_000) {
                value.clone()
            } else {
                Value::from("otro")
            };
            out.insert(key.into(), clean);
        }
    }
    Value::Object(out)
}

pub(super) fn error_record(value: &Value) -> Value {
    let mut out = record(value);
    if let Some(kind) = value.get("type") {
        out["type"] = closed(kind, "errors");
    }
    if !out.as_object().is_none_or(Map::is_empty) {
        out.sort_all_objects();
        let content = format!("vantare.triage.error.v1:{out}");
        out["fingerprint"] = Value::from(crate::content_hash(content.as_bytes()));
    }
    out
}
