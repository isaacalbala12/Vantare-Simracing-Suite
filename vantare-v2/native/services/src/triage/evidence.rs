//! Closed scalar projection shared with the worker's `privacy.log_record`.
use serde_json::{Map, Value};

pub(super) fn record(value: &Value) -> Value {
    let mut out = Map::new();
    let Some(value) = value.as_object() else {
        return Value::Object(out);
    };
    if value
        .get("level")
        .and_then(Value::as_str)
        .is_some_and(|s| matches!(s, "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL"))
    {
        out.insert("level".into(), value["level"].clone());
    }
    for key in ["error_code", "error_type", "module", "version"] {
        if value.get(key).and_then(Value::as_str).is_some_and(|s| {
            (1..=64).contains(&s.len())
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))
        }) {
            out.insert(key.into(), value[key].clone());
        }
    }
    for key in ["count", "relative_ms"] {
        if value
            .get(key)
            .and_then(Value::as_u64)
            .is_some_and(|v| v <= 1_000_000_000)
        {
            out.insert(key.into(), value[key].clone());
        }
    }
    Value::Object(out)
}
