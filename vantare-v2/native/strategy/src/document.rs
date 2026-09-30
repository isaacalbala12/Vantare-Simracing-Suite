//! V2 JSON retained as original bytes. Edits splice only their target field.
use std::collections::BTreeSet;
use std::ops::Range;

use chrono::DateTime;
use serde_json::{Value, json};

pub const MAX_BYTES: usize = 12 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct Document {
    bytes: Vec<u8>,
    value: Value,
}

impl Document {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() > MAX_BYTES {
            return Err("documento Strategy supera 12 MiB".into());
        }
        let value: Value =
            serde_json::from_slice(bytes).map_err(|e| format!("JSON Strategy: {e}"))?;
        validate(&value)?;
        Ok(Self {
            bytes: bytes.to_vec(),
            value,
        })
    }

    pub fn empty(timestamp: &str) -> Result<Self, String> {
        let bytes = serde_json::to_vec(&json!({
            "contractVersion":"strategy.v2", "schemaVersion":"2.0.0",
            "generatedAt":timestamp, "events":[]
        }))
        .map_err(|e| e.to_string())?;
        Self::parse(&bytes)
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
    pub fn value(&self) -> &Value {
        &self.value
    }

    /// JSON pointer (RFC 6901). Validates the whole candidate before committing.
    /// Untouched tokens retain whitespace, decimal spelling and unknown fields.
    pub fn set(&mut self, pointer: &str, value: &Value) -> Result<(), String> {
        let parts = pointer
            .strip_prefix('/')
            .ok_or("se requiere JSON pointer")?
            .split('/')
            .map(|s| s.replace("~1", "/").replace("~0", "~"))
            .collect::<Vec<_>>();
        let range = locate(&self.bytes, 0..self.bytes.len(), &parts)?;
        let encoded = serde_json::to_vec(value).map_err(|e| e.to_string())?;
        let mut bytes = self.bytes.clone();
        bytes.splice(range, encoded);
        *self = Self::parse(&bytes)?;
        Ok(())
    }

    pub fn edit_sourced(&mut self, pointer: &str, value: &Value) -> Result<(), String> {
        let mut next = self.clone();
        next.set(&format!("{pointer}/value"), value)?;
        next.set(
            &format!("{pointer}/evidence/provenance"),
            &json!({"kind":"manual","sourceId":"native:strategy-editor"}),
        )?;
        next.set(
            &format!("{pointer}/evidence/confidence"),
            &json!({"level":"high","basis":"entrada explícita del usuario"}),
        )?;
        *self = next;
        Ok(())
    }

    pub fn append_event(&mut self, event: &Value) -> Result<(), String> {
        if self.value["events"].is_null() {
            return self.set("/events", &json!([event]));
        }
        let parts = vec!["events".into()];
        let range = locate(&self.bytes, 0..self.bytes.len(), &parts)?;
        let mut insertion = serde_json::to_vec(event).map_err(|e| e.to_string())?;
        if !array(&self.value["events"]).is_empty() {
            insertion.insert(0, b',');
        }
        let mut bytes = self.bytes.clone();
        bytes.splice(range.end - 1..range.end - 1, insertion);
        *self = Self::parse(&bytes)?;
        Ok(())
    }

    /// Insert an optional property without rewriting any existing properties.
    pub fn put(&mut self, pointer: &str, value: &Value) -> Result<(), String> {
        if self.value.pointer(pointer).is_some() {
            return self.set(pointer, value);
        }
        let (parent, key) = pointer.rsplit_once('/').ok_or("se requiere JSON pointer")?;
        let object = self
            .value
            .pointer(parent)
            .and_then(Value::as_object)
            .ok_or("objeto padre ausente")?;
        let parts = if parent.is_empty() {
            vec![]
        } else {
            parent[1..]
                .split('/')
                .map(|s| s.replace("~1", "/").replace("~0", "~"))
                .collect::<Vec<_>>()
        };
        let range = locate(&self.bytes, 0..self.bytes.len(), &parts)?;
        let key = key.replace("~1", "/").replace("~0", "~");
        let mut insertion = serde_json::to_vec(&key).map_err(|e| e.to_string())?;
        insertion.push(b':');
        insertion.extend(serde_json::to_vec(value).map_err(|e| e.to_string())?);
        if !object.is_empty() {
            insertion.insert(0, b',');
        }
        let mut bytes = self.bytes.clone();
        bytes.splice(range.end - 1..range.end - 1, insertion);
        *self = Self::parse(&bytes)?;
        Ok(())
    }
}

pub fn manual(value: Value) -> Value {
    let mut sourced = json!({"evidence":{
        "provenance":{"kind":"manual","sourceId":"native:strategy-editor"},
        "confidence":{"level":"high","basis":"entrada explícita del usuario"}
    }});
    sourced["value"] = value;
    sourced
}

pub fn new_event(id: &str, name: &str, duration: u32, tank: f64, pit: f64) -> Value {
    json!({"id":id,"name":manual(json!(name)),"source":manual(json!("custom")),
        "track":manual(json!("")),"cls":manual(json!("")),"durationMin":manual(json!(duration)),
        "startAt":manual(Value::Null),"tankLiters":manual(json!(tank)),"pitLossSeconds":manual(json!(pit)),
        "drivers":[{"id":"driver-1","order":0}],"availability":{},"fillMode":manual(json!("manual")),
        "tyreInventory":{"sets":[]},"strategies":[{"id":"variant-1","name":manual(json!("Base")),
        "note":manual(json!("")),"mode":manual(json!("dry")),"state":manual(json!("draft")),"order":["driver-1"]}]})
}

// The input was already parsed by serde. This scanner only locates token spans;
// it never accepts JSON on its own and all edits go through serde + validation.
fn skip_space(bytes: &[u8], mut pos: usize) -> usize {
    while bytes.get(pos).is_some_and(u8::is_ascii_whitespace) {
        pos += 1;
    }
    pos
}

fn token_end(bytes: &[u8], start: usize) -> Result<usize, String> {
    let mut pos = start;
    let mut depth = 0usize;
    let mut quoted = false;
    while let Some(&byte) = bytes.get(pos) {
        if quoted {
            if byte == b'\\' {
                pos += 2;
                continue;
            }
            if byte == b'"' {
                quoted = false;
                if depth == 0 {
                    return Ok(pos + 1);
                }
            }
        } else {
            match byte {
                b'"' => quoted = true,
                b'{' | b'[' => depth += 1,
                b'}' | b']' if depth > 0 => {
                    depth -= 1;
                    if depth == 0 {
                        return Ok(pos + 1);
                    }
                }
                b',' | b'}' | b']' if depth == 0 => return Ok(pos),
                _ if byte.is_ascii_whitespace() && depth == 0 => return Ok(pos),
                _ => {}
            }
        }
        pos += 1;
    }
    if !quoted && depth == 0 {
        Ok(pos)
    } else {
        Err("token JSON incompleto".into())
    }
}

fn locate(bytes: &[u8], range: Range<usize>, parts: &[String]) -> Result<Range<usize>, String> {
    let start = skip_space(bytes, range.start);
    let end = token_end(bytes, start)?;
    let Some((key, rest)) = parts.split_first() else {
        return Ok(start..end);
    };
    let object = bytes.get(start) == Some(&b'{');
    if !object && bytes.get(start) != Some(&b'[') {
        return Err("ruta no es contenedor".into());
    }
    let mut pos = skip_space(bytes, start + 1);
    let mut index = 0;
    let mut found = None;
    while pos < end - 1 {
        let matched = if object {
            let key_end = token_end(bytes, pos)?;
            let name: String =
                serde_json::from_slice(&bytes[pos..key_end]).map_err(|e| e.to_string())?;
            pos = skip_space(bytes, key_end) + 1; // colon (already validated)
            name == *key
        } else {
            index.to_string() == *key
        };
        pos = skip_space(bytes, pos);
        let value_end = token_end(bytes, pos)?;
        if matched {
            found = Some(pos..value_end);
        }
        pos = skip_space(bytes, value_end);
        if bytes.get(pos) == Some(&b',') {
            pos = skip_space(bytes, pos + 1);
        }
        index += 1;
    }
    locate(
        bytes,
        found.ok_or_else(|| format!("campo no encontrado: {key}"))?,
        rest,
    )
}

pub(crate) fn array(value: &Value) -> &[Value] {
    value.as_array().map_or(&[], Vec::as_slice)
}
pub(super) fn string(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}
fn nonempty(value: &Value) -> bool {
    !string(value).trim().is_empty()
}
pub(super) fn check(ok: bool, field: &str) -> Result<(), String> {
    if ok {
        Ok(())
    } else {
        Err(format!("campo inválido: {field}"))
    }
}
pub(super) fn timestamp(value: &Value) -> Result<DateTime<chrono::FixedOffset>, String> {
    let time =
        DateTime::parse_from_rfc3339(string(value)).map_err(|e| format!("timestamp: {e}"))?;
    // Go time.Time's zero is 0001-01-01T00:00:00Z, regardless of written offset.
    check(
        time.timestamp() != -62_135_596_800 || time.timestamp_subsec_nanos() != 0,
        "timestamp cero",
    )?;
    Ok(time)
}

pub(crate) fn provenance(value: &Value) -> Result<(), String> {
    let kind = string(&value["kind"]);
    check(
        [
            "unknown",
            "observed",
            "corrected",
            "manual",
            "derived",
            "estimated",
            "range",
            "reference",
            "legacy_synthetic_default",
        ]
        .contains(&kind),
        "provenance.kind",
    )?;
    if kind == "unknown" {
        check(
            !nonempty(&value["sourceId"]) && value["observedAt"].is_null(),
            "unknown provenance",
        )?;
    } else {
        check(nonempty(&value["sourceId"]), "provenance.sourceId")?;
        if !value["observedAt"].is_null() {
            timestamp(&value["observedAt"])?;
        }
    }
    Ok(())
}

pub(crate) fn evidence(value: &Value) -> Result<(), String> {
    provenance(&value["provenance"])?;
    let confidence = &value["confidence"];
    let level = string(&confidence["level"]);
    check(
        ["unknown", "low", "medium", "high"].contains(&level),
        "confidence.level",
    )?;
    check(
        nonempty(&confidence["basis"]) == (level != "unknown"),
        "confidence.basis",
    )
}

fn sourced(value: &Value) -> Result<(), String> {
    check(
        value.is_object() && value.get("value").is_some(),
        "sourced.value",
    )?;
    evidence(&value["evidence"])
}
fn number(value: &Value, minimum: f64, positive: bool) -> Result<f64, String> {
    let n = value.as_f64().ok_or("valor numérico requerido")?;
    check(
        n.is_finite() && n >= minimum && (!positive || n > 0.0),
        "número fuera de rango",
    )?;
    Ok(n)
}
fn unique_ids(values: &[Value], field: &str) -> Result<BTreeSet<String>, String> {
    let mut seen = BTreeSet::new();
    for value in values {
        check(nonempty(&value[field]), field)?;
        check(
            seen.insert(string(&value[field]).into()),
            "identificador duplicado",
        )?;
    }
    Ok(seen)
}

pub fn validate(doc: &Value) -> Result<(), String> {
    check(doc["contractVersion"] == "strategy.v2", "contractVersion")?;
    check(doc["schemaVersion"] == "2.0.0", "schemaVersion")?;
    timestamp(&doc["generatedAt"])?;
    check(
        doc["events"].is_array() || doc["events"].is_null(),
        "events",
    )?;
    let events = array(&doc["events"]);
    let ids = unique_ids(events, "id")?;
    for event in events {
        validate_event(event)?;
    }
    if !doc["activeEventId"].is_null() {
        check(ids.contains(string(&doc["activeEventId"])), "activeEventId")?;
    }
    if !doc["migrationMeta"].is_null() {
        validate_migration(&doc["migrationMeta"])?;
    }
    for archive in array(&doc["migrationArchives"]) {
        check(nonempty(&archive["journalId"]), "archive.journalId")?;
        timestamp(&archive["archivedAt"])?;
        let archived = json!({"contractVersion":"strategy.v2","schemaVersion":"2.0.0",
            "generatedAt":archive["generatedAt"],"events":archive["events"],"activeEventId":archive["activeEventId"]});
        validate(&archived)?;
    }
    Ok(())
}

#[allow(clippy::too_many_lines)] // Sequential V2 wire checks mirror Go document.Validate; no alternate domain model.
fn validate_event(event: &Value) -> Result<(), String> {
    for field in ["name", "source", "track", "cls", "fillMode"] {
        text_value(&event[field]["value"])?;
    }
    for field in ["seriesId", "team", "teamMode"] {
        if !event[field].is_null() {
            text_value(&event[field]["value"])?;
        }
    }
    for field in ["drivers", "strategies", "weatherScenarios"] {
        collection(&event[field], true)?;
    }
    collection(&event["availability"], false)?;
    if !event["rawLegacy"].is_null() {
        base64(&event["rawLegacy"])?;
    }
    for field in [
        "name",
        "source",
        "track",
        "cls",
        "durationMin",
        "startAt",
        "tankLiters",
        "pitLossSeconds",
        "fillMode",
    ] {
        sourced(&event[field])?;
    }
    for field in ["seriesId", "team", "teamMode", "lastOpenedAt"] {
        if !event[field].is_null() {
            sourced(&event[field])?;
        }
    }
    check(nonempty(&event["name"]["value"]), "event.name")?;
    check(
        ["custom", "series", "roster"].contains(&string(&event["source"]["value"])),
        "event.source",
    )?;
    if !event["seriesId"].is_null() {
        check(nonempty(&event["seriesId"]["value"]), "seriesId")?;
    }
    check(
        event["durationMin"]["value"]
            .as_i64()
            .is_some_and(|value| value > 0),
        "durationMin entero positivo",
    )?;
    number(&event["tankLiters"]["value"], 0.0, true)?;
    number(&event["pitLossSeconds"]["value"], 0.0, false)?;
    check(event["fillMode"]["value"] == "manual", "fillMode")?;
    if !event["teamMode"].is_null() {
        check(
            ["solo", "team"].contains(&string(&event["teamMode"]["value"])),
            "teamMode",
        )?;
    }
    for field in ["startAt", "lastOpenedAt"] {
        if !event[field]["value"].is_null() {
            timestamp(&event[field]["value"])?;
        }
    }
    let drivers = array(&event["drivers"]);
    let driver_ids = unique_ids(drivers, "id")?;
    let mut orders = BTreeSet::new();
    for driver in drivers {
        collection(&driver["rawExtra"], false)?;
        let order = driver["order"]
            .as_u64()
            .ok_or("driver.order entero requerido")?;
        check(
            order < u64::try_from(drivers.len()).map_err(|e| e.to_string())?
                && orders.insert(order),
            "driver.order",
        )?;
        for field in ["name", "ini", "color", "cls"] {
            if !driver[field].is_null() {
                text_value(&driver[field]["value"])?;
                sourced(&driver[field])?;
            }
        }
    }
    let variants = array(&event["strategies"]);
    let variant_ids = unique_ids(variants, "id")?;
    for variant in variants {
        for field in ["name", "note", "mode", "state"] {
            text_value(&variant[field]["value"])?;
        }
        for field in ["overrides", "tyres"] {
            collection(&variant[field], false)?;
        }
        for field in ["name", "note", "mode", "state"] {
            sourced(&variant[field])?;
        }
        check(nonempty(&variant["name"]["value"]), "variant.name")?;
        check(
            ["dry", "wet", "eco", "humid"].contains(&string(&variant["mode"]["value"])),
            "variant.mode",
        )?;
        check(
            ["draft", "ok"].contains(&string(&variant["state"]["value"])),
            "variant.state",
        )?;
        let order = array(&variant["order"]);
        check(!order.is_empty(), "variant.order")?;
        let mut seen = BTreeSet::new();
        for id in order {
            check(
                driver_ids.contains(string(id)) && seen.insert(string(id)),
                "variant.driver",
            )?;
        }
    }
    if !event["activeStrategyId"].is_null() {
        check(
            variant_ids.contains(string(&event["activeStrategyId"])),
            "activeStrategyId",
        )?;
    }
    if let Some(availability) = event["availability"].as_object() {
        for (id, windows) in availability {
            collection(windows, true)?;
            check(driver_ids.contains(id), "availability.driver")?;
            let mut ranges = Vec::new();
            for window in array(windows) {
                check(
                    ["ok", "no"].contains(&string(&window["state"])),
                    "availability.state",
                )?;
                let from = window["from"].as_i64().ok_or("availability.from")?;
                let to = window["to"].as_i64().ok_or("availability.to")?;
                check(from >= 0 && from < to && to <= 1440, "availability.range")?;
                check(
                    !ranges.iter().any(|&(a, b)| from < b && a < to),
                    "availability.overlap",
                )?;
                ranges.push((from, to));
            }
        }
    }
    validate_inventory(&event["tyreInventory"])?;
    validate_planning(event)?;
    let scenarios = array(&event["weatherScenarios"]);
    check(scenarios.len() <= 16, "weatherScenarios length")?;
    let mut scenario_ids = BTreeSet::new();
    for weighted in scenarios {
        number(&weighted["weight"], 0.0, true)?;
        let scenario = &weighted["scenario"];
        validate_weather(scenario)?;
        check(
            scenario_ids.insert(string(&scenario["scenarioId"])),
            "scenario duplicate",
        )?;
        if !event["combination"].is_null() {
            check(
                scenario["combinationId"] == event["combination"]["combinationId"],
                "scenario.combination",
            )?;
        }
    }
    Ok(())
}

fn validate_inventory(inventory: &Value) -> Result<(), String> {
    collection(inventory, false)?;
    collection(&inventory["sets"], true)?;
    collection(&inventory["byCompound"], false)?;
    for set in array(&inventory["sets"]) {
        check(
            !set["compoundRaw"].is_null() || !set["compound"].is_null(),
            "tyre.compound",
        )?;
        if !set["compoundRaw"].is_null() {
            check(
                set["compoundRaw"].as_u64().is_some_and(|v| v <= 2),
                "compoundRaw",
            )?;
        }
        if !set["compound"].is_null() {
            check(nonempty(&set["compound"]), "compound")?;
        }
        check(set["count"].as_i64().is_some_and(|v| v > 0), "tyre.count")?;
        check(
            [
                "valid",
                "missing",
                "invalid",
                "stale",
                "unsupported",
                "unknown",
            ]
            .contains(&string(&set["presence"])),
            "tyre.presence",
        )?;
        provenance(&set["provenance"])?;
    }
    if let Some(counts) = inventory["byCompound"].as_object() {
        for (compound, count) in counts {
            check(
                !compound.trim().is_empty() && count.as_i64().is_some_and(|v| v >= 0),
                "byCompound",
            )?;
        }
    }
    Ok(())
}

fn validate_planning(event: &Value) -> Result<(), String> {
    let combination = &event["combination"];
    if !combination.is_null() {
        collection(&combination["sessions"], true)?;
        for session in array(&combination["sessions"]) {
            check(
                session["included"].is_null() || session["included"].is_boolean(),
                "session.included",
            )?;
        }
        check(nonempty(&combination["combinationId"]), "combinationId")?;
        unique_ids(array(&combination["sessions"]), "sessionId")?;
    }
    let inputs = &event["planningInputs"];
    collection(inputs, false)?;
    collection(&inputs["overrides"], false)?;
    if let Some(overrides) = inputs["overrides"].as_object() {
        for (field, value) in overrides {
            check(
                [
                    "fuel_per_lap_liters",
                    "ve_per_lap_percent",
                    "base_pace_seconds",
                    "tank_liters",
                    "pit_loss_seconds",
                    "tyre_life_laps",
                    "degradation_per_lap_seconds",
                    "saving_fuel_per_lap",
                    "saving_time_cost_per_lap",
                    "reserve_laps",
                ]
                .contains(&field.as_str()),
                "planning override",
            )?;
            let positive = [
                "fuel_per_lap_liters",
                "ve_per_lap_percent",
                "base_pace_seconds",
                "tank_liters",
                "tyre_life_laps",
            ]
            .contains(&field.as_str());
            number(&value["value"], 0.0, positive)?;
            check(value["presence"] == "valid", "override.presence")?;
            check(
                ["manual", "reference"].contains(&string(&value["provenance"]["kind"])),
                "override.provenance",
            )?;
            super::projection::provenance(&value["provenance"])?;
            projection_confidence(&value["confidence"])?;
        }
    }
    let projection = &inputs["projection"];
    if !projection.is_null() {
        check(
            projection["contractVersion"] == "strategyinputprojection.v2",
            "projection.contractVersion",
        )?;
        timestamp(&projection["generatedAt"])?;
        check(
            nonempty(&projection["computationVersion"]),
            "projection.computationVersion",
        )?;
        collection(&projection["sourceSessions"], true)?;
        check(
            !combination.is_null() && projection["combinationId"] == combination["combinationId"],
            "projection.combination",
        )?;
        let included = array(&combination["sessions"])
            .iter()
            .filter(|s| s["included"] == true)
            .map(|s| string(&s["sessionId"]))
            .collect::<BTreeSet<_>>();
        check(
            included.len() == array(&projection["sourceSessions"]).len()
                && array(&projection["sourceSessions"])
                    .iter()
                    .all(|source| included.contains(string(source))),
            "projection.selection",
        )?;
        super::projection::validate(projection)?;
    }
    Ok(())
}

pub(crate) fn projection_confidence(value: &Value) -> Result<(), String> {
    check(
        value["sampleSize"].is_null() || value["sampleSize"].as_i64().is_some_and(|v| v >= 0),
        "sampleSize",
    )?;
    check(
        !string(&value["computationVersion"]).is_empty(),
        "computationVersion",
    )?;
    if let (Some(lower), Some(upper)) = (value["rangeLower"].as_f64(), value["rangeUpper"].as_f64())
    {
        check(lower <= upper, "confidence.range")?;
    }
    Ok(())
}

pub fn validate_weather(scenario: &Value) -> Result<(), String> {
    check(
        scenario["contractVersion"] == "weatherscenario.v1",
        "weather.contractVersion",
    )?;
    check(
        !string(&scenario["scenarioId"]).is_empty() && string(&scenario["scenarioId"]).len() <= 128,
        "scenarioId",
    )?;
    check(
        !string(&scenario["combinationId"]).is_empty(),
        "weather.combinationId",
    )?;
    let generated = timestamp(&scenario["generatedAt"])?;
    check(
        generated.offset().local_minus_utc() == 0
            && string(&scenario["generatedAt"]).ends_with('Z'),
        "weather UTC",
    )?;
    let nodes = array(&scenario["nodes"]);
    check(nodes.len() == 5, "weather.nodes")?;
    for (node, progress) in nodes.iter().zip(["START", "25", "50", "75", "FINISH"]) {
        check(node["progress"] == progress, "weather.progress")?;
        let rain = number(&node["rainChance"], 0.0, false)?;
        check(rain <= 100.0, "rainChance")?;
        check(
            [
                "clear",
                "light_clouds",
                "mostly_cloudy",
                "overcast",
                "partially_cloudy",
                "drizzle",
            ]
            .contains(&string(&node["sky"])),
            "sky",
        )?;
        for field in ["airTempC", "trackTempC"] {
            check(node[field].as_f64().is_some_and(f64::is_finite), field)?;
        }
    }
    let provenance = &scenario["provenance"];
    check(!string(&provenance["source"]).is_empty(), "weather.source")?;
    check(
        timestamp(&provenance["freshUntil"])? > timestamp(&provenance["capturedAt"])?,
        "freshUntil",
    )
}

fn validate_migration(meta: &Value) -> Result<(), String> {
    check(
        nonempty(&meta["sourceFingerprint"]) && nonempty(&meta["journalId"]),
        "migration identity",
    )?;
    timestamp(&meta["migratedAt"])?;
    check(
        ["backed_up", "committed", "rolled_back"].contains(&string(&meta["status"])),
        "migration.status",
    )?;
    check(!array(&meta["sources"]).is_empty(), "migration.sources")?;
    for source in array(&meta["sources"]) {
        check(
            source["present"].is_null() || source["present"].is_boolean(),
            "source.present",
        )?;
        if !source["raw"].is_null() {
            base64(&source["raw"])?;
        }
        check(nonempty(&source["key"]), "source.key")?;
        check(
            source["present"] == true || string(&source["raw"]).is_empty(),
            "absent source bytes",
        )?;
    }
    for journal in array(&meta["supersededJournals"]) {
        check(
            nonempty(&journal["sourceFingerprint"])
                && nonempty(&journal["journalId"])
                && !array(&journal["sources"]).is_empty(),
            "superseded journal",
        )?;
        timestamp(&journal["backedUpAt"])?;
    }
    Ok(())
}

fn collection(value: &Value, list: bool) -> Result<(), String> {
    check(
        value.is_null()
            || if list {
                value.is_array()
            } else {
                value.is_object()
            },
        "forma JSON de colección",
    )
}
fn text_value(value: &Value) -> Result<(), String> {
    check(value.is_null() || value.is_string(), "valor de texto")
}
fn base64(value: &Value) -> Result<(), String> {
    if let Some(bytes) = value.as_array() {
        return check(
            bytes.iter().all(|b| b.as_u64().is_some_and(|b| b <= 255)),
            "backup byte array",
        );
    }
    let text = value.as_str().ok_or("backup base64 requerido")?;
    let symbols = text
        .bytes()
        .filter(|c| *c != b'\r' && *c != b'\n')
        .collect::<Vec<_>>();
    check(symbols.len() % 4 == 0, "longitud base64")?;
    let padding = symbols.iter().rev().take_while(|c| **c == b'=').count();
    check(padding <= 2, "padding base64")?;
    check(
        symbols[..symbols.len() - padding]
            .iter()
            .all(|c| c.is_ascii_alphanumeric() || *c == b'+' || *c == b'/'),
        "alfabeto base64",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn go_document_acceptance_and_byte_preservation() {
        let cases: Value = serde_json::from_str(include_str!("../testdata/oracle/documents.json"))
            .expect("frozen Go documents");
        assert!(!array(&cases).is_empty());
        for case in array(&cases) {
            let bytes = serde_json::to_vec(&case["input"]).expect("fixture");
            let parsed = Document::parse(&bytes);
            assert_eq!(
                parsed.is_ok(),
                case["valid"] == true,
                "{}: {parsed:?}",
                case["name"]
            );
            if let Ok(doc) = parsed {
                assert_eq!(doc.bytes(), bytes);
            }
        }
    }

    #[test]
    fn edits_leave_all_other_bytes_and_evidence_intact() {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("empty");
        doc.append_event(&new_event("event", "Original", 60, 90.0, 30.0))
            .expect("event");
        let bytes = String::from_utf8(doc.bytes().to_vec())
            .expect("utf8")
            .replace(
                "\"schemaVersion\":",
                "\"opaque\": {\"decimal\": 9007199254740993.0001}, \"schemaVersion\":",
            );
        let mut doc = Document::parse(bytes.as_bytes()).expect("opaque document");
        doc.edit_sourced("/events/0/name", &json!("Edited"))
            .expect("edit");
        assert!(
            String::from_utf8_lossy(doc.bytes()).contains("{\"decimal\": 9007199254740993.0001}")
        );
        assert_eq!(
            doc.value()["events"][0]["name"]["evidence"]["provenance"]["kind"],
            "manual"
        );
        let before = doc.bytes().to_vec();
        assert!(
            doc.edit_sourced("/events/0/durationMin", &json!(0))
                .is_err()
        );
        assert_eq!(doc.bytes(), before);
    }
}
