//! Generate portable ICS expectations from the actual frozen pure GPUI modules.
#![allow(dead_code, clippy::all, clippy::pedantic)]
#[path = "../src/calendar/alerts.rs"]
mod alerts;
#[path = "../src/calendar/clock.rs"]
mod clock;
#[path = "../src/calendar/ics.rs"]
mod ics;
#[path = "../src/calendar/model.rs"]
pub(crate) mod model;
#[cfg(test)]
pub(crate) mod calendar {
    pub(crate) use super::model;
}
use chrono::Duration;
use serde_json::{Value, json};
fn rows(name: &str, document: &Value, late: bool) -> Vec<Value> {
    let schedule =
        model::Schedule::parse(&serde_json::to_vec(document).expect("serialize schedule fixture"))
            .expect("valid schedule fixture");
    let (from, until) = schedule.window().expect("fixture publication window");
    let now = if late {
        until - Duration::hours(4)
    } else {
        from
    };
    let following: Vec<_> = schedule.series.iter().map(|s| s.id.clone()).collect();
    let mut alerts = alerts::Alerts::default();
    for series in &schedule.series {
        if late && series.kind() == model::Kind::Daily {
            alerts
                .set_band(
                    &series.id,
                    Some(alerts::Band {
                        series_id: series.id.clone(),
                        from: 0,
                        to: 1440,
                        days: alerts::Days::All,
                        mode: alerts::Mode::Each,
                    }),
                )
                .expect("valid full-day fixture band");
        } else if series.kind() != model::Kind::Daily {
            if let Some(at) = schedule
                .starts(series, now, until)
                .expect("bounded fixture starts")
                .first()
            {
                alerts
                    .toggle_slot(&series.id, *at)
                    .expect("valid fixture slot");
            }
        }
    }
    [("favs", ics::Scope::Favs), ("events", ics::Scope::Events), ("all", ics::Scope::All)].into_iter().map(|(scope, kind)| {
        let entries = ics::entries(&schedule, &following, &alerts, ics::Options { scope: kind, alarm: false }, now).expect("bounded fixture ICS entries");
        let preview: Vec<_> = entries.iter().take(4).map(|e| json!({"seriesId":e.series_id,"start":e.start.timestamp_millis(),"end":e.end.timestamp_millis(),"summary":e.summary,"track":e.track})).collect();
        let uids: Vec<_> = entries.iter().map(|e| format!("{}-{}@vantare", e.series_id, e.start.timestamp())).collect();
        json!({"name":name,"late":late,"scope":scope,"now":now.timestamp_millis(),"following":following,"alerts":alerts,"total":entries.len(),"preview":preview,"uids":uids})
    }).collect()
}
pub(crate) fn value() -> Value {
    let root = std::env::var_os("VANTARE_CALENDAR_FIXTURES").map_or_else(
        || std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.."),
        std::path::PathBuf::from,
    );
    let cases: Value = serde_json::from_slice(
        &std::fs::read(root.join("fixtures/calendar/cases.json"))
            .expect("read shared calendar fixtures"),
    )
    .expect("parse shared calendar fixtures");
    let mut out = Vec::new();
    for case in cases
        .as_array()
        .expect("calendar fixture array")
        .iter()
        .filter(|c| c["valid"] == true)
    {
        for late in [false, true] {
            out.extend(rows(
                case["name"].as_str().expect("fixture name"),
                &case["document"],
                late,
            ));
        }
    }
    let october: Value = serde_json::from_slice(
        &std::fs::read(root.join("native/hub/reference/fixtures/calendar-lmu-2026-10-06.json"))
            .expect("read October calendar fixture"),
    )
    .expect("parse October calendar fixture");
    for late in [false, true] {
        out.extend(rows("october-2026", &october, late));
    }
    // Fixed inputs; no window, OS time or local-zone dependent First bands.
    json!({"cases":out})
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = std::env::args_os()
        .nth(1)
        .ok_or("usage: calendar-ics <output.json>")?;
    let mut bytes = serde_json::to_vec_pretty(&value())?;
    bytes.push(b'\n');
    std::fs::write(output, bytes)?;
    Ok(())
}
