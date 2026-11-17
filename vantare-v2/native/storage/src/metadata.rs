//! Eventos pequeños de metadatos; una conexión y commits antes de cada ACK.
use duckdb::{Connection, OptionalExt, Row, params};
use serde_json::{Value, json};

use super::{Result, Store};

pub(super) const TABLES: &str = "
CREATE TABLE session_summaries (
    epoch UBIGINT, session UBIGINT, kind VARCHAR, kind_text VARCHAR,
    track_name VARCHAR, vehicle VARCHAR, class_name VARCHAR, started_at_ms UBIGINT,
    ended_at_ms UBIGINT NULL, sim_elapsed_s DOUBLE NULL, final_position UINTEGER NULL,
    final_class_position UINTEGER NULL, laps_completed UINTEGER NULL,
    best_lap_ms UINTEGER NULL, end_reason VARCHAR NULL, sealed BOOLEAN NOT NULL,
    PRIMARY KEY(epoch, session));
CREATE TABLE lap_times (
    epoch UBIGINT, session UBIGINT, car UINTEGER, lap UINTEGER,
    official_ms UINTEGER NULL, sector_ms VARCHAR NULL,
    PRIMARY KEY(epoch, session, car, lap));";

const OPEN: &[&str] = &[
    "epoch",
    "session",
    "kind",
    "kindText",
    "trackName",
    "vehicle",
    "className",
    "startedAtMs",
];
const CLOSE: &[&str] = &[
    "epoch",
    "session",
    "endedAtMs",
    "simElapsedS",
    "finalPosition",
    "finalClassPosition",
    "lapsCompleted",
    "bestLapMs",
    "endReason",
];
const LAP: &[&str] = &["epoch", "session", "car", "lap", "officialMs", "sectorMs"];
const MAX_TEXT_BYTES: usize = 256;
const MAX_SECTORS: usize = 16;
const MAX_ROWS: usize = 256;

fn integer(value: &Value, maximum: u64) -> bool {
    value.as_u64().is_some_and(|number| number <= maximum)
}

fn valid(name: &str, event: &Value) -> bool {
    let Some(object) = event.as_object() else {
        return false;
    };
    let keys = match name {
        "session-open" => OPEN,
        "session-close" => CLOSE,
        "lap" => LAP,
        _ => return false,
    };
    if object.len() != keys.len() || keys.iter().any(|key| !object.contains_key(*key)) {
        return false;
    }
    object.iter().all(|(key, value)| match key.as_str() {
        "epoch" | "session" | "startedAtMs" | "endedAtMs" => integer(value, u64::MAX),
        "car" | "lap" => integer(value, u64::from(u32::MAX)),
        "officialMs" | "finalPosition" | "finalClassPosition" | "lapsCompleted" | "bestLapMs" => {
            value.is_null() || integer(value, u64::from(u32::MAX))
        }
        "simElapsedS" => {
            value.is_null() || value.as_f64().is_some_and(|v| v.is_finite() && v >= 0.0)
        }
        "kind" => matches!(
            value.as_str(),
            Some("practice" | "qualifying" | "race" | "other" | "unknown")
        ),
        "endReason" => matches!(value.as_str(), Some("sessionChanged" | "coreStopped")),
        "kindText" | "trackName" | "vehicle" | "className" => {
            value.as_str().is_some_and(|v| v.len() <= MAX_TEXT_BYTES)
        }
        "sectorMs" => {
            value.is_null()
                || value.as_array().is_some_and(|sectors| {
                    sectors.len() <= MAX_SECTORS
                        && sectors.iter().all(|v| integer(v, u64::from(u32::MAX)))
                })
        }
        _ => false,
    })
}

fn session_row(row: &Row<'_>) -> duckdb::Result<Value> {
    Ok(json!({
        "epoch": row.get::<_,u64>(0)?, "session": row.get::<_,u64>(1)?,
        "kind": row.get::<_,String>(2)?, "kindText": row.get::<_,String>(3)?,
        "trackName": row.get::<_,String>(4)?, "vehicle": row.get::<_,String>(5)?,
        "className": row.get::<_,String>(6)?, "startedAtMs": row.get::<_,u64>(7)?,
        "endedAtMs": row.get::<_,Option<u64>>(8)?, "simElapsedS": row.get::<_,Option<f64>>(9)?,
        "finalPosition": row.get::<_,Option<u32>>(10)?, "finalClassPosition": row.get::<_,Option<u32>>(11)?,
        "lapsCompleted": row.get::<_,Option<u32>>(12)?, "bestLapMs": row.get::<_,Option<u32>>(13)?,
        "endReason": row.get::<_,Option<String>>(14)?, "sealed": row.get::<_,bool>(15)?
    }))
}

// Columnas explícitas: el orden físico de una tabla no forma parte del protocolo.
const SESSION_COLUMNS: &str = "epoch, session, kind, kind_text, track_name, vehicle, class_name, started_at_ms, ended_at_ms, sim_elapsed_s, final_position, final_class_position, laps_completed, best_lap_ms, end_reason, sealed";

fn same(previous: &Value, event: &Value, keys: &[&str]) -> bool {
    keys.iter().all(|key| {
        if *key == "simElapsedS" {
            previous[*key].as_f64() == event[*key].as_f64()
        } else {
            previous[*key] == event[*key]
        }
    })
}

pub(super) fn write(store: &mut Store, name: &str, event: &Value) -> Result<Value> {
    if !store.metadata {
        return Ok(json!(["unsupported", "meta"]));
    }
    if store.read_only || store.failed {
        return Err("metadatos no escribibles; reabrir antes de continuar".into());
    }
    if !valid(name, event) {
        return Err("evento de metadatos inválido o fuera de límites".into());
    }
    // Un comando completo (comparación incluida), una transacción. Incluso un
    // reintento idéntico solo recibe ACK después de confirmar el COMMIT.
    store.failed = true;
    let tx = store.connection.transaction()?;
    let response = write_valid(&tx, name, event)?;
    tx.commit()?;
    store.failed = false;
    Ok(response)
}

fn write_valid(connection: &Connection, name: &str, event: &Value) -> Result<Value> {
    let epoch = event["epoch"].as_u64().ok_or("época inválida")?;
    let session = event["session"].as_u64().ok_or("sesión inválida")?;
    let previous = connection
        .query_row(
            &format!("SELECT {SESSION_COLUMNS} FROM session_summaries WHERE epoch=? AND session=?"),
            params![epoch, session],
            session_row,
        )
        .optional()?;
    let Some(previous) = previous else {
        if name != "session-open" {
            return Ok(json!(["rejected", "missing"]));
        }
        connection.execute(
            "INSERT INTO session_summaries (epoch, session, kind, kind_text, track_name, vehicle, class_name, started_at_ms, sealed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, false)",
            params![epoch, session, event["kind"].as_str(), event["kindText"].as_str(), event["trackName"].as_str(), event["vehicle"].as_str(), event["className"].as_str(), event["startedAtMs"].as_u64()],
        )?;
        return Ok(json!(["ack-session", "open", epoch, session]));
    };
    if name == "session-open" {
        return Ok(if same(&previous, event, OPEN) {
            json!(["ack-session", "open", epoch, session])
        } else {
            json!(["rejected", "conflict"])
        });
    }
    let sealed = previous["sealed"] == true;
    if name == "session-close" {
        if sealed {
            return Ok(if same(&previous, event, CLOSE) {
                json!(["ack-session", "close", epoch, session])
            } else {
                json!(["rejected", "sealed"])
            });
        }
        connection.execute(
            "UPDATE session_summaries SET ended_at_ms=?, sim_elapsed_s=?, final_position=?, final_class_position=?, laps_completed=?, best_lap_ms=?, end_reason=?, sealed=true WHERE epoch=? AND session=? AND NOT sealed",
            params![event["endedAtMs"].as_u64(), event["simElapsedS"].as_f64(), event["finalPosition"].as_u64(), event["finalClassPosition"].as_u64(), event["lapsCompleted"].as_u64(), event["bestLapMs"].as_u64(), event["endReason"].as_str(), epoch, session],
        )?;
        return Ok(json!(["ack-session", "close", epoch, session]));
    }
    let car = event["car"].as_u64().ok_or("coche inválido")?;
    let lap = event["lap"].as_u64().ok_or("vuelta inválida")?;
    let sectors = if event["sectorMs"].is_null() {
        None
    } else {
        Some(serde_json::to_string(&event["sectorMs"])?)
    };
    let official = event["officialMs"].as_u64();
    let existing = connection.query_row(
        "SELECT official_ms, sector_ms FROM lap_times WHERE epoch=? AND session=? AND car=? AND lap=?",
        params![epoch, session, car, lap],
        |row| Ok((row.get::<_,Option<u64>>(0)?, row.get::<_,Option<String>>(1)?)),
    ).optional()?;
    if let Some(existing) = existing {
        if existing != (official, sectors) {
            return Ok(json!([
                "rejected",
                if sealed { "sealed" } else { "conflict" }
            ]));
        }
    } else {
        if sealed {
            return Ok(json!(["rejected", "sealed"]));
        }
        connection.execute(
            "INSERT OR IGNORE INTO lap_times VALUES (?, ?, ?, ?, ?, ?)",
            params![epoch, session, car, lap, official, sectors],
        )?;
    }
    Ok(json!(["ack-lap", epoch, session, car, lap]))
}

// Igual que summaries v1: retención explícita y salida acotada, nunca SQL del cliente.
pub(super) fn sessions(store: &Store) -> Result<Value> {
    if !store.metadata {
        return Ok(json!(["unsupported", "meta"]));
    }
    let total: u64 =
        store
            .connection
            .query_row("SELECT count(*) FROM session_summaries", [], |row| {
                row.get(0)
            })?;
    let mut statement = store.connection.prepare(&format!("SELECT {SESSION_COLUMNS} FROM session_summaries ORDER BY epoch DESC, session DESC LIMIT {MAX_ROWS}"))?;
    let rows = statement
        .query_map([], session_row)?
        .collect::<duckdb::Result<Vec<_>>>()?;
    Ok(json!(["session-summaries", total, rows]))
}

pub(super) fn laps(store: &Store, epoch: &Value, session: &Value) -> Result<Value> {
    if !store.metadata {
        return Ok(json!(["unsupported", "meta"]));
    }
    let epoch = epoch.as_u64().ok_or("época inválida")?;
    let session = session.as_u64().ok_or("sesión inválida")?;
    let total: u64 = store.connection.query_row(
        "SELECT count(*) FROM lap_times WHERE epoch=? AND session=?",
        params![epoch, session],
        |row| row.get(0),
    )?;
    let mut statement = store.connection.prepare(&format!("SELECT car, lap, official_ms, sector_ms FROM lap_times WHERE epoch=? AND session=? ORDER BY car, lap LIMIT {MAX_ROWS}"))?;
    let rows = statement.query_map(params![epoch, session], |row| {
        Ok((
            row.get::<_, u32>(0)?,
            row.get::<_, u32>(1)?,
            row.get::<_, Option<u32>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;
    let mut values = Vec::new();
    for row in rows {
        let (car, lap, official, sectors) = row?;
        let sectors = sectors
            .map(|text| serde_json::from_str::<Vec<u32>>(&text))
            .transpose()?;
        values.push(json!({"epoch":epoch, "session":session, "car":car, "lap":lap, "officialMs":official, "sectorMs":sectors}));
    }
    Ok(json!(["lap-times", total, values]))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn open() -> Value {
        json!({"epoch":u64::MAX,"session":3,"kind":"unknown","kindText":"",
            "trackName":"Le Mans","vehicle":"Porsche","className":"LMGT3","startedAtMs":1000})
    }

    #[test]
    fn closed_events_enforce_byte_lengths_enums_nullable_numbers_and_sector_bounds() {
        for kind in ["practice", "qualifying", "race", "other", "unknown"] {
            let mut event = open();
            event["kind"] = kind.into();
            assert!(valid("session-open", &event));
        }
        for key in ["kindText", "trackName", "vehicle", "className"] {
            let mut event = open();
            event[key] = "é".repeat(128).into();
            assert!(valid("session-open", &event));
            event[key] = "é".repeat(129).into();
            assert!(!valid("session-open", &event));
            event[key] = Value::Null;
            assert!(!valid("session-open", &event));
        }
        let mut event = open();
        event["kind"] = "invalid".into();
        assert!(!valid("session-open", &event));
        event = open();
        event["extra"] = true.into();
        assert!(!valid("session-open", &event));
        event = open();
        event.as_object_mut().unwrap().remove("vehicle");
        assert!(!valid("session-open", &event));
        let mut lap = json!({"epoch":1,"session":3,"car":u32::MAX,"lap":u32::MAX,
            "officialMs":u32::MAX,"sectorMs":vec![u32::MAX;MAX_SECTORS]});
        assert!(valid("lap", &lap));
        assert!(serde_json::to_string(&lap["sectorMs"]).unwrap().len() <= MAX_TEXT_BYTES);
        lap["sectorMs"] = json!(vec![1; MAX_SECTORS + 1]);
        assert!(!valid("lap", &lap));
        for invalid in [
            json!([-1]),
            json!([0.5]),
            json!([null]),
            json!([u64::MAX]),
            json!("[]"),
        ] {
            lap["sectorMs"] = invalid;
            assert!(!valid("lap", &lap));
        }
        lap["sectorMs"] = Value::Null;
        lap["officialMs"] = Value::Null;
        assert!(valid("lap", &lap));
        for invalid in [json!(-1), json!(1.5), json!(u64::MAX), json!("1")] {
            lap["officialMs"] = invalid;
            assert!(!valid("lap", &lap));
        }
        let mut close = json!({"epoch":1,"session":3,"endedAtMs":u64::MAX,"simElapsedS":null,
            "finalPosition":null,"finalClassPosition":null,"lapsCompleted":null,"bestLapMs":null,
            "endReason":"coreStopped"});
        assert!(valid("session-close", &close));
        close["endReason"] = "sessionChanged".into();
        for elapsed in [json!(0), json!(123.25)] {
            close["simElapsedS"] = elapsed;
            assert!(valid("session-close", &close));
        }
        close["simElapsedS"] = json!(-0.1);
        assert!(!valid("session-close", &close));
        close["simElapsedS"] = Value::Null;
        close["endReason"] = "finished".into();
        assert!(!valid("session-close", &close));
    }
}
