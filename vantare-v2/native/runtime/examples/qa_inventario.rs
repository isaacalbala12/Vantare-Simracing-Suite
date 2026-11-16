//! Inventario CPU: lector LMU y proyecciones productivas, sin UI ni credenciales.
use serde_json::{Value, json};
use std::{collections::BTreeMap, path::Path, time::Duration};
use vantare_domain::{self as d, Adapter, Snapshot, format::Preferences};
use vantare_runtime::{adapter::open_replay, core::Core};

#[derive(Default)]
struct Coverage {
    frames: u64,
    central_frames: u64,
    first: Option<f64>,
    last: Option<f64>,
    example: Option<String>,
}
impl Coverage {
    fn add(&mut self, at: f64, ready: bool, value: impl std::fmt::Debug) {
        if ready {
            self.frames += 1;
            if (5.0..55.0).contains(&at) {
                self.central_frames += 1;
            }
            self.first.get_or_insert(at);
            self.last = Some(at);
            if self.example.is_none() {
                self.example = Some(format!("{value:?}"));
            }
        }
    }
    fn json(&self) -> Value {
        json!({"frames_with_data":self.frames,"frames_5_55s_desde_primer_evento":self.central_frames,"first_s":self.first,"last_s":self.last,"first_projection":self.example})
    }
}
fn projections(s: &Snapshot, at: f64, out: &mut BTreeMap<&'static str, Coverage>) {
    let p = Preferences::default();
    macro_rules! record {
        ($name:literal, $vm:expr, $ready:expr) => {{
            let vm = $vm;
            let ready = ($ready)(&vm);
            out.entry($name).or_default().add(at, ready, vm);
        }};
    }
    record!(
        "relative",
        d::relative::project(s, p),
        |v: &d::relative::ViewModel| v.slots.iter().any(Option::is_some)
    );
    record!(
        "multiclass-relative",
        d::multiclass_relative::project(s, p, d::multiclass_relative::Content::default()),
        |v: &d::multiclass_relative::ViewModel| !v.rows.is_empty()
    );
    record!("radar", d::radar::project(s), |v: &d::radar::ViewModel| v
        .available);
    record!(
        "fuel-strategy",
        d::fuel_strategy::project(s, p),
        |v: &d::fuel_strategy::Board| v.fuel.level.is_some()
    );
    record!(
        "car-damage-visual",
        d::car_damage_visual::project(s, p),
        |v: &d::car_damage_visual::ViewModel| v
            .damage
            .iter()
            .chain(v.tyres.iter())
            .any(Option::is_some)
    );
    record!(
        "car-damage-numbers",
        d::car_damage_numbers::project(s, p, true),
        |v: &d::car_damage_numbers::ViewModel| v.status_text.is_none()
    );
    record!(
        "track-weather",
        d::track_weather::project(s, p),
        |v: &d::track_weather::ViewModel| !v.metrics.is_empty()
    );
    record!(
        "racing-flags",
        d::racing_flags::project(s, p),
        |v: &d::racing_flags::ViewModel| v.flag.is_some() || v.sectors.iter().any(Option::is_some)
    );
    record!(
        "pedals",
        d::pedals::project(s, p),
        |v: &d::pedals::ViewModel| v.throttle.is_some() || v.brake.is_some()
    );
    record!(
        "pedals-telemetry",
        d::pedals_telemetry::project(s, p),
        |v: &d::pedals_telemetry::ViewModel| v.pedals.iter().any(Option::is_some)
    );
    record!(
        "input-telemetry",
        d::input_telemetry::project(s, p),
        |v: &d::input_telemetry::ViewModel| v.pedals.iter().any(Option::is_some)
    );
    record!(
        "delta-trace",
        d::delta_trace::project(s, p),
        |v: &d::delta_trace::ViewModel| v.status_text.is_none()
            && v.current_text != d::format::PLACEHOLDER
    );
    record!(
        "broadcast-tower",
        d::broadcast_tower::project(s, p),
        |v: &d::broadcast_tower::ViewModel| !v.rows.is_empty()
    );
    record!(
        "head-to-head",
        d::head_to_head::project(s, p, d::head_to_head::Target::default()),
        |v: &d::head_to_head::ViewModel| !v.rows.is_empty()
    );
    record!(
        "fastest-lap",
        d::fastest_lap::project(s, p),
        |v: &d::fastest_lap::ViewModel| v.candidate.is_some()
    );
    record!(
        "session-alerts",
        d::session_alerts::project(s),
        |v: &Option<d::session_alerts::SessionInput>| v.is_some()
    );
    record!(
        "track-map",
        d::track_map::project_with_geometry(s, p, None),
        |v: &d::track_map::ViewModel| !v.outline.is_empty()
    );
}
fn run(path: &Path, build: Option<&str>) -> Result<Value, Box<dyn std::error::Error>> {
    let mut replay = open_replay(path, build)?;
    let first_recorded_at = replay.next_recorded_at().unwrap_or(Duration::ZERO);
    let mut core = Core::new(1);
    let mut coverage = BTreeMap::new();
    let mut events = 0_u64;
    let mut photos = 0_u64;
    let mut last = Duration::ZERO;
    let mut states = BTreeMap::<String, u64>::new();
    let mut classes = std::collections::BTreeSet::new();
    let mut flags = std::collections::BTreeSet::new();
    let mut damaged = 0_u64;
    let mut in_pits = 0_u64;
    let mut radar_max_cars = 0;
    let mut fuel_min: Option<f64> = None;
    let mut fuel_max: Option<f64> = None;
    let mut records = d::fastest_lap::Records::default();
    let mut record_notices = 0_u64;
    let mut alerts = d::session_alerts::Machine::default();
    let alert_options = d::session_alerts::Options::default();
    let mut alert_events = std::collections::BTreeSet::new();
    let mut relative_rows_max = 0;
    let mut multiclass_rows_max = 0;
    let mut traffic_photos = 0_u64;
    while let Some(at) = replay.next_recorded_at() {
        last = at;
        events += 1;
        if let Some(observation) = replay.poll(at)? {
            core.observe(observation)
                .map_err(|e| format!("merge: {e:?}"))?;
            let s = core.snapshot();
            photos += 1;
            *states
                .entry(format!("{:?}", s.state.source_state))
                .or_default() += 1;
            for car in &s.state.cars {
                if let Some(c) = &car.class {
                    classes.insert(c.name.clone());
                }
            }
            let projected = d::racing_flags::project(&s, Preferences::default());
            if let Some(flag) = projected.flag {
                flags.insert(format!("{flag:?}"));
            }
            let prefs = Preferences::default();
            let damage = d::car_damage_visual::project(&s, prefs);
            if damage.damage.iter().flatten().any(|value| *value > 0.0) {
                damaged += 1;
            }
            if d::relative::project(&s, prefs).player_in_pits {
                in_pits += 1;
            }
            let relative = d::relative::project(&s, prefs);
            relative_rows_max = relative_rows_max.max(relative.slots.iter().flatten().count());
            if relative.traffic.is_some() {
                traffic_photos += 1;
            }
            multiclass_rows_max = multiclass_rows_max.max(
                d::multiclass_relative::project(
                    &s,
                    prefs,
                    d::multiclass_relative::Content::default(),
                )
                .rows
                .len(),
            );
            radar_max_cars = radar_max_cars.max(d::radar::project(&s).cars.len());
            if let Some(level) = d::fuel_strategy::project(&s, prefs).fuel.level {
                fuel_min = Some(fuel_min.map_or(level, |old| old.min(level)));
                fuel_max = Some(fuel_max.map_or(level, |old| old.max(level)));
            }
            if matches!(
                records.accept(d::fastest_lap::project(&s, prefs)),
                d::fastest_lap::Update::Notice(..)
            ) {
                record_notices += 1;
            }
            let clock_ms = u64::try_from(at.as_millis())?;
            alerts.session(d::session_alerts::project(&s), clock_ms, &alert_options);
            if let Some(notice) = alerts.tick(clock_ms, &alert_options).active {
                alert_events.insert(notice.event);
            }
            projections(
                &s,
                at.saturating_sub(first_recorded_at).as_secs_f64(),
                &mut coverage,
            );
        }
    }
    Ok(
        json!({"path":path,"events":events,"photos":photos,"first_recorded_event_s":first_recorded_at.as_secs_f64(),"last_event_s":last.as_secs_f64(),"recorded_span_s":last.saturating_sub(first_recorded_at).as_secs_f64(),"states":states,"classes":classes,"projected_flags":flags,"photos_damage_nonzero":damaged,"photos_player_in_pits":in_pits,"relative_rows_max":relative_rows_max,"multiclass_rows_max":multiclass_rows_max,"traffic_photos":traffic_photos,"radar_max_cars":radar_max_cars,"fuel_level_min":fuel_min,"fuel_level_max":fuel_max,"record_notices":record_notices,"session_alert_events":alert_events,"coverage":coverage.iter().map(|(k,v)|(*k,v.json())).collect::<BTreeMap<_,_>>(),"limitations":"Presence is not a transition/event or a continuous 50 s window. Coverage times are relative to first recorded event (the temporal tar reader adds 1 s internally). No map geometry or calendar injected. Record notices and session events use existing domain machines, with relative replay clock. No rendering or license checks."}),
    )
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let path = args
        .first()
        .ok_or("usage: vantare-qa-inventario <recording> [build]")?;
    println!(
        "{}",
        serde_json::to_string_pretty(&run(Path::new(path), args.get(1).map(String::as_str))?)?
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn waiting_is_not_claimed_as_real_telemetry_coverage() {
        let mut out = BTreeMap::new();
        projections(&Snapshot::default(), 0.0, &mut out);
        assert_eq!(out.len(), 17);
        assert!(out.values().all(|value| value.frames == 0));
    }
}
