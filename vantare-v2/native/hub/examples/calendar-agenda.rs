//! Headless expected values from the frozen Calendar model; no window or services.
#![allow(dead_code, clippy::all, clippy::pedantic)]
#[path = "../src/calendar/alerts.rs"]
mod alerts;
#[path = "../src/calendar/clock.rs"]
mod clock;
#[path = "../src/calendar/model.rs"]
pub(crate) mod model;
// The frozen alerts unit tests refer to the application module by this name.
#[cfg(test)]
pub(crate) mod calendar {
    pub(crate) use super::model;
}
use chrono::{Duration, Local, Offset, TimeZone};
use serde_json::{Value, json};
fn sample(source: &str, case: &str, document: &Value, index: usize, first: bool) -> Value {
    let schedule =
        model::Schedule::parse(&serde_json::to_vec(document).expect("frozen GPUI oracle fixture"))
            .expect("frozen GPUI oracle fixture");
    let series = &schedule.series[index];
    let (begin, end) = schedule.window().expect("frozen GPUI oracle fixture");
    let from = begin + Duration::minutes(if first { 0 } else { 7 });
    let until = if series.kind() == model::Kind::Daily {
        end.min(from + Duration::hours(6))
    } else {
        end
    };
    let starts = schedule
        .starts(series, from, until)
        .expect("frozen GPUI oracle fixture");
    let mut alerts = alerts::Alerts::default();
    if series.kind() == model::Kind::Daily {
        alerts
            .set_band(
                &series.id,
                Some(alerts::Band {
                    series_id: series.id.clone(),
                    from: 0,
                    to: 1440,
                    days: alerts::Days::All,
                    mode: if first {
                        alerts::Mode::First
                    } else {
                        alerts::Mode::Each
                    },
                }),
            )
            .expect("frozen GPUI oracle fixture");
    } else if let Some(at) = starts.first() {
        alerts
            .toggle_slot(&series.id, *at)
            .expect("frozen GPUI oracle fixture");
    }
    let causes: Vec<_> = starts
        .iter()
        .map(|at| match alerts.cause(&schedule, series, *at) {
            Some(alerts::Cause::Band) => "band",
            Some(alerts::Cause::Slot) => "slot",
            None => "none",
        })
        .collect();
    let raw = &document["series"][index];
    json!({"source":source,"case":case,"seriesId":series.id,"intervalMinutes":raw["recurrence"]["intervalMinutes"].as_u64().unwrap_or(0),"startOffsetMinute":raw["startOffsetMinute"].as_i64().unwrap_or(0),"from":from.timestamp_millis(),"until":until.timestamp_millis(),"offsetSeconds":Local.from_utc_datetime(&from.naive_utc()).offset().fix().local_minus_utc(),"alerts":alerts,"starts":starts.iter().map(chrono::DateTime::timestamp_millis).collect::<Vec<_>>(),"causes":causes})
}
pub(crate) fn value() -> Value {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let cases: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("fixtures/calendar/cases.json")).expect("shared corpus"),
    )
    .expect("frozen GPUI oracle fixture");
    let mut rows = Vec::new();
    for case in cases
        .as_array()
        .expect("frozen GPUI oracle fixture")
        .iter()
        .filter(|case| case["valid"] == true)
    {
        for first in [false, true] {
            rows.push(sample(
                "shared",
                case["name"].as_str().expect("frozen GPUI oracle fixture"),
                &case["document"],
                0,
                first,
            ));
        }
    }
    let october: Value = serde_json::from_str(
        &std::fs::read_to_string(
            root.join("native/hub/reference/fixtures/calendar-lmu-2026-10-06.json"),
        )
        .expect("October corpus"),
    )
    .expect("October JSON");
    for index in 0..october["series"]
        .as_array()
        .expect("frozen GPUI oracle fixture")
        .len()
    {
        for first in [false, true] {
            rows.push(sample("october", "publication", &october, index, first));
        }
    }
    for offset in [5, -17] {
        let mut modified = october.clone();
        modified["series"][0]["recurrence"]["intervalMinutes"] = 37.into();
        modified["series"][0]["startOffsetMinute"] = offset.into();
        for first in [false, true] {
            rows.push(sample("october", "interval-37", &modified, 0, first));
        }
    }
    let sources = json!({
        "model": vantare_services::content_hash(include_str!("../src/calendar/model.rs").replace("\r\n", "\n").as_bytes()),
        "clock": vantare_services::content_hash(include_str!("../src/calendar/clock.rs").replace("\r\n", "\n").as_bytes()),
        "alerts": vantare_services::content_hash(include_str!("../src/calendar/alerts.rs").replace("\r\n", "\n").as_bytes()),
    });
    json!({"sources": sources, "cases": rows})
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = std::env::args_os()
        .nth(1)
        .ok_or("usage: calendar-agenda <output.json>")?;
    let mut bytes = serde_json::to_vec_pretty(&value())?;
    bytes.push(b'\n');
    std::fs::write(output, bytes)?;
    Ok(())
}
