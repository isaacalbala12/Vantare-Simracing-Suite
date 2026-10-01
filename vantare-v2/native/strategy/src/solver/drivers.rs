use super::model::{nonnegative, require, source};
use super::{Evaluation, Input, SavingLevel, units};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DriverProfile {
    pub driver_id: String,
    pub profile: Option<Value>,
    pub manual: Option<ManualDriverProfile>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManualDriverProfile {
    pub base_lap_seconds: f64,
    pub fuel_per_lap_liters: f64,
    pub ve_per_lap_percent: f64,
    pub provenance: Value,
    pub confidence: Value,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DriverLimit {
    pub min_laps: Option<u32>,
    pub max_laps: Option<u32>,
    pub max_continuous_time_seconds: Option<f64>,
    pub max_total_time_seconds: Option<f64>,
    #[serde(default)]
    pub unavailable: Vec<super::Window>,
    #[serde(default)]
    pub unavailable_time: Vec<TimeWindow>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeWindow {
    pub from_seconds: f64,
    pub to_seconds: f64,
}
#[derive(Clone, Debug)]
pub(super) struct Driver {
    pub id: String,
    pub base: f64,
    pub fuel: i64,
    pub ve: i64,
}
#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct DriverState {
    pub current: String,
    pub continuous: f64,
    pub usage: BTreeMap<String, (u32, f64)>,
}
impl DriverProfile {
    fn driver(&self) -> Result<Driver, String> {
        require(!self.driver_id.trim().is_empty(), "driverId")?;
        require(
            self.profile.is_some() != self.manual.is_some(),
            "driver exactly one profile/manual",
        )?;
        let (base, fuel, ve) = if let Some(manual) = &self.manual {
            source(&manual.provenance, &manual.confidence)?;
            (
                manual.base_lap_seconds,
                manual.fuel_per_lap_liters,
                manual.ve_per_lap_percent,
            )
        } else if let Some(p) = &self.profile {
            require(
                p["contractVersion"] == "pilotprofile.v1",
                "pilotprofile version",
            )?;
            for key in ["profileId", "combinationId", "displayName"] {
                require(
                    p[key].as_str().is_some_and(|s| !s.trim().is_empty()),
                    "pilotprofile identity",
                )?;
            }
            require(
                p["profileId"].as_str().is_some_and(|s| s.len() <= 128),
                "profileId length",
            )?;
            require(
                ["dry", "wet", "mixed"].contains(&p["condition"].as_str().unwrap_or("")),
                "profile condition",
            )?;
            require(
                p["exportedAt"].as_str().is_some_and(|s| {
                    chrono::DateTime::parse_from_rfc3339(s).is_ok() && !s.starts_with("0001-")
                }),
                "profile exportedAt",
            )?;
            super::provenance(&p["provenance"])?;
            (
                p["pace"]["baseSeconds"]
                    .as_f64()
                    .ok_or("invalid_input: driver pace")?,
                p["fuel"]["meanPerLap"]
                    .as_f64()
                    .ok_or("invalid_input: driver fuel")?,
                p["ve"]["meanPerLap"]
                    .as_f64()
                    .ok_or("invalid_input: driver VE")?,
            )
        } else {
            return Err("invalid_input: driver profile".into());
        };
        require(base.is_finite() && base > 0.0, "driver pace")?;
        Ok(Driver {
            id: self.driver_id.clone(),
            base,
            fuel: units(fuel)?,
            ve: units(ve)?,
        })
    }
}
pub(super) fn drivers(
    input: &Input,
    profiles: &[DriverProfile],
    sequence: &[String],
    limits: &BTreeMap<String, DriverLimit>,
    levels: &[SavingLevel],
) -> Result<Vec<Driver>, String> {
    let mut result = vec![];
    if profiles.is_empty() {
        require(
            sequence.is_empty() && limits.is_empty(),
            "driver rules require driverProfiles",
        )?;
        result.push(Driver {
            id: String::new(),
            base: input.base_lap_seconds.value,
            fuel: units(input.fuel_per_lap_liters.value)?,
            ve: units(input.ve_per_lap_percent.value)?,
        });
    }
    let mut seen = BTreeSet::new();
    for p in profiles {
        let d = p.driver()?;
        require(seen.insert(d.id.clone()), "duplicate driver")?;
        result.push(d);
    }
    for d in &result {
        for level in levels {
            require(
                units(level.fuel_saved_per_lap)? <= d.fuel
                    && units(level.ve_saved_per_lap)? <= d.ve,
                "saving exceeds driver consumption",
            )?;
        }
    }
    for id in sequence {
        require(seen.contains(id), "sequence driver absent")?;
    }
    for (id, l) in limits {
        require(seen.contains(id), "limit driver absent")?;
        require(
            l.min_laps.is_none_or(|v| v <= input.race_laps)
                && l.max_laps.is_none_or(|v| v <= input.race_laps),
            "driver lap limit",
        )?;
        require(
            l.min_laps
                .zip(l.max_laps)
                .is_none_or(|(min, max)| min <= max),
            "driver lap range",
        )?;
        for v in [l.max_continuous_time_seconds, l.max_total_time_seconds]
            .into_iter()
            .flatten()
        {
            nonnegative(v, "driver time limit")?;
            require(v > 0.0, "driver time limit")?;
        }
        for w in &l.unavailable {
            require(
                w.from_lap > 0 && w.to_lap >= w.from_lap && w.to_lap <= input.race_laps,
                "driver unavailable lap range",
            )?;
        }
        for w in &l.unavailable_time {
            require(
                w.from_seconds.is_finite()
                    && w.to_seconds.is_finite()
                    && w.from_seconds >= 0.0
                    && w.to_seconds > w.from_seconds,
                "driver unavailable time range",
            )?;
        }
    }
    Ok(result)
}
impl super::model::Model {
    pub fn driver(&self, id: &str) -> Result<&Driver, String> {
        let id = if id.is_empty() && self.drivers.len() == 1 {
            self.drivers[0].id.as_str()
        } else {
            id
        };
        self.drivers
            .iter()
            .find(|d| d.id == id)
            .ok_or_else(|| "invalid_input: driver not configured".into())
    }
    pub fn sequence_allows(&self, index: usize, id: &str) -> bool {
        self.dims.driver_sequence.is_empty()
            || self.dims.driver_sequence[index % self.dims.driver_sequence.len()] == id
    }
    pub fn apply_driver(
        &self,
        state: &mut DriverState,
        id: &str,
        start_lap: u32,
        laps: u32,
        before: &Evaluation,
        after: &Evaluation,
    ) -> Option<&'static str> {
        if self.dims.driver_profiles.is_empty() {
            return None;
        }
        let end_lap = start_lap + laps - 1;
        let driving = |e: &Evaluation| {
            e.green_seconds
                + e.degradation_seconds
                + e.compound_seconds
                + e.fuel_weight_seconds
                + e.saving_seconds
        };
        let seconds = driving(after) - driving(before);
        let prior = state.usage.get(id).copied().unwrap_or_default();
        let usage = (prior.0 + laps, prior.1 + seconds);
        let continuous = seconds
            + if state.current == id {
                state.continuous
            } else {
                0.0
            };
        if let Some(limit) = self.rules.driver_limits.get(id) {
            if limit
                .unavailable
                .iter()
                .any(|w| start_lap <= w.to_lap && end_lap >= w.from_lap)
            {
                return Some("driver_unavailable");
            }
            if limit.unavailable_time.iter().any(|w| {
                super::replay::time_cmp(before.total_seconds, w.to_seconds).is_lt()
                    && super::replay::time_cmp(after.total_seconds, w.from_seconds).is_gt()
            }) {
                return Some("driver_unavailable_time");
            }
            if limit.max_laps.is_some_and(|m| usage.0 > m) {
                return Some("driver_maximum_laps");
            }
            if limit.max_total_time_seconds.is_some_and(|m| usage.1 > m) {
                return Some("driver_total_time");
            }
            if limit
                .max_continuous_time_seconds
                .is_some_and(|m| continuous > m)
            {
                return Some("driver_continuous_time");
            }
        }
        state.current = id.into();
        state.continuous = continuous;
        state.usage.insert(id.into(), usage);
        None
    }
}
