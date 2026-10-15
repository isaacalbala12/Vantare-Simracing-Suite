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

pub(super) fn system(value: &Value) -> Value {
    fn numeric(value: &Value) -> bool {
        value
            .as_f64()
            .is_some_and(|v| v.is_finite() && (0.0..=1_000_000_000.0).contains(&v))
    }
    let mut out = Map::new();
    if let Some(os) = value["os"].as_object() {
        out.insert("os".into(), system_os(os));
    }
    if let Some(cpu) = value["cpu"].as_object() {
        let mut fields = Map::new();
        if let Some(cores) = cpu
            .get("cores")
            .filter(|v| v.as_u64().is_some_and(|v| v <= 1_000_000_000))
        {
            fields.insert("cores".into(), cores.clone());
        }
        out.insert("cpu".into(), Value::Object(fields));
    }
    if let Some(gpus) = value["gpu"].as_array() {
        out.insert(
            "gpu".into(),
            Value::Array(
                gpus.iter()
                    .take(8)
                    .filter_map(|g| {
                        g.get("driver_version")
                            .map(|v| serde_json::json!({"driver_version":version(v)}))
                    })
                    .collect(),
            ),
        );
    }
    if let Some(displays) = value["displays"].as_array() {
        out.insert(
            "displays".into(),
            Value::Array(
                displays
                    .iter()
                    .take(16)
                    .filter_map(|d| d.as_object())
                    .map(|d| {
                        Value::Object(
                            d.iter()
                                .filter(|(k, v)| {
                                    (matches!(k.as_str(), "width" | "height" | "hz" | "dpi_scale")
                                        && numeric(v))
                                        || (k.as_str() == "primary" && v.is_boolean())
                                })
                                .map(|(k, v)| (k.clone(), v.clone()))
                                .collect(),
                        )
                    })
                    .collect(),
            ),
        );
    }
    if let Some(ram) = value.get("ram_gb").filter(|v| numeric(v)) {
        out.insert("ram_gb".into(), ram.clone());
    }
    if let Some(obs) = value.get("obs_active").filter(|v| v.is_boolean()) {
        out.insert("obs_active".into(), obs.clone());
    }
    if let Some(overlays) = value["overlays_active"].as_array() {
        out.insert(
            "overlays_active".into(),
            Value::Array(
                overlays
                    .iter()
                    .filter(|v| {
                        matches!(
                            v.as_str(),
                            Some("OBS" | "Streamlabs" | "SimHub" | "CrewChief" | "Vantare")
                        )
                    })
                    .take(5)
                    .cloned()
                    .collect(),
            ),
        );
    }
    Value::Object(out)
}

fn system_os(os: &Map<String, Value>) -> Value {
    let mut fields = Map::new();
    if let Some(name) = os.get("name") {
        fields.insert(
            "name".into(),
            if matches!(name.as_str(), Some("Windows" | "Linux" | "macOS")) {
                name.clone()
            } else {
                Value::from("otro")
            },
        );
    }
    if let Some(v) = os.get("version") {
        fields.insert("version".into(), version(v));
    }
    if let Some(v) = os.get("build") {
        fields.insert(
            "build".into(),
            if v.as_str().is_some_and(|s| {
                !s.is_empty() && s.len() <= 6 && s.bytes().all(|b| b.is_ascii_digit())
            }) {
                v.clone()
            } else {
                Value::from("otro")
            },
        );
    }
    Value::Object(fields)
}
