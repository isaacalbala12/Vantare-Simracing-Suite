use super::model::{require, source};
use super::tyres::valid_compound;
use super::{CompoundPace, Input, units};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RainThresholds {
    pub humid_percent: f64,
    pub wet_percent: f64,
}
impl RainThresholds {
    pub(super) fn normalized(&self) -> Result<Self, String> {
        let result = if self.humid_percent == 0.0 && self.wet_percent == 0.0 {
            Self {
                humid_percent: 20.0,
                wet_percent: 60.0,
            }
        } else {
            self.clone()
        };
        require(
            result.humid_percent.is_finite()
                && result.wet_percent.is_finite()
                && result.humid_percent > 0.0
                && result.humid_percent < result.wet_percent
                && result.wet_percent <= 100.0,
            "weather thresholds",
        )?;
        Ok(result)
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeatherPlan {
    pub scenario: Value,
    #[serde(default)]
    pub thresholds: RainThresholds,
    #[serde(default)]
    pub bucket_parameters: Vec<WeatherBucket>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeatherBucket {
    pub bucket: String,
    pub pace_delta_seconds: f64,
    pub fuel_per_lap_liters: Option<f64>,
    pub ve_per_lap_percent: Option<f64>,
    #[serde(default)]
    pub driver_profiles: Vec<WeatherDriver>,
    #[serde(default)]
    pub compound_pace: Vec<CompoundPace>,
    pub provenance: Value,
    pub confidence: Value,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeatherDriver {
    pub driver_id: String,
    pub pace_delta_seconds: f64,
    pub fuel_per_lap_liters: Option<f64>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherCondition {
    pub lap: u32,
    pub rain_chance: f64,
    pub bucket: String,
}
#[derive(Clone, Default)]
pub(super) struct WeatherModel {
    pub timeline: Vec<WeatherCondition>,
    pub parameters: BTreeMap<String, WeatherBucket>,
    pub allowed: BTreeMap<String, Vec<String>>,
    pub projection: Option<Value>,
}
pub(super) fn valid_bucket(b: &str) -> bool {
    ["dry", "humid", "wet"].contains(&b)
}
impl WeatherModel {
    #[allow(clippy::too_many_lines)] // Validate all bucket authorities before constructing lap conditions.
    pub fn new(
        input: &Input,
        plan: Option<&WeatherPlan>,
        drivers: &[super::drivers::Driver],
        tyres: &super::tyres::TyreModel,
        allowed: &BTreeMap<String, Vec<String>>,
        projection: Option<&Value>,
    ) -> Result<Self, String> {
        let Some(plan) = plan else {
            require(allowed.is_empty(), "allowed compounds requires weather")?;
            return Ok(Self::default());
        };
        super::super::document::validate_weather(&plan.scenario)?;
        let thresholds = plan.thresholds.normalized()?;
        let mut model = Self {
            timeline: timeline(&plan.scenario, input.race_laps, &thresholds),
            projection: projection.cloned(),
            ..Self::default()
        };
        for p in &plan.bucket_parameters {
            require(
                valid_bucket(&p.bucket) && !model.parameters.contains_key(&p.bucket),
                "weather bucket duplicate/invalid",
            )?;
            source(&p.provenance, &p.confidence)?;
            require(p.pace_delta_seconds.is_finite(), "weather pace delta")?;
            for v in [p.fuel_per_lap_liters, p.ve_per_lap_percent]
                .into_iter()
                .flatten()
            {
                units(v)?;
            }
            for (family, value) in [
                ("fuelConsumption", p.fuel_per_lap_liters),
                ("virtualEnergyConsumption", p.ve_per_lap_percent),
            ] {
                if value.is_some()
                    && projection.is_some_and(|pr| {
                        pr[family]["presence"] == "valid"
                            && pr[family]["byClimateBucket"].get(&p.bucket).is_some()
                    })
                {
                    return Err(
                        "invalid_input: weather consumption duplicates projection authority".into(),
                    );
                }
            }
            let mut seen = BTreeSet::new();
            for dp in &p.driver_profiles {
                require(
                    !dp.driver_id.is_empty() && seen.insert(&dp.driver_id),
                    "weather driver duplicate/empty",
                )?;
                let d = drivers
                    .iter()
                    .find(|d| d.id == dp.driver_id)
                    .ok_or("invalid_input: weather driver absent")?;
                require(
                    dp.pace_delta_seconds.is_finite() && d.base + dp.pace_delta_seconds > 0.0,
                    "weather driver pace",
                )?;
                if let Some(v) = dp.fuel_per_lap_liters {
                    units(v)?;
                }
            }
            require(
                p.driver_profiles.is_empty() || p.driver_profiles.len() == drivers.len(),
                "weather profiles must cover every driver",
            )?;
            let mut seen = BTreeSet::new();
            for cp in &p.compound_pace {
                require(
                    tyres.compounds.contains_key(&cp.compound) && seen.insert(&cp.compound),
                    "weather compound unknown/duplicate",
                )?;
                cp.validate(input)?;
            }
            model.parameters.insert(p.bucket.clone(), p.clone());
        }
        for c in &model.timeline {
            require(
                c.bucket == "dry" || model.parameters.contains_key(&c.bucket),
                "weather parameters missing encountered bucket",
            )?;
        }
        for (bucket, compounds) in allowed {
            require(
                valid_bucket(bucket) && !compounds.is_empty(),
                "allowed climate bucket/compounds",
            )?;
            let mut seen = BTreeSet::new();
            for c in compounds {
                require(
                    valid_compound(c) && seen.insert(c),
                    "allowed compound invalid/duplicate",
                )?;
            }
        }
        model.allowed.clone_from(allowed);
        Ok(model)
    }
    pub fn bucket(&self, lap: u32) -> &str {
        usize::try_from(lap)
            .ok()
            .and_then(|i| i.checked_sub(1))
            .and_then(|i| self.timeline.get(i))
            .map_or("dry", |c| c.bucket.as_str())
    }
    pub fn parameter(&self, lap: u32) -> Option<&WeatherBucket> {
        self.parameters.get(self.bucket(lap))
    }
    pub fn consumption(
        &self,
        fuel: bool,
        lap: u32,
        driver: &str,
        fallback: i64,
    ) -> Result<i64, String> {
        if self.timeline.is_empty() {
            return Ok(fallback);
        }
        let p = self.parameter(lap);
        if fuel
            && let Some(value) = p
                .and_then(|p| p.driver_profiles.iter().find(|d| d.driver_id == driver))
                .and_then(|d| d.fuel_per_lap_liters)
        {
            return units(value);
        }
        let family = if fuel {
            "fuelConsumption"
        } else {
            "virtualEnergyConsumption"
        };
        if let Some(pr) = &self.projection
            && pr[family]["presence"] == "valid"
            && let Some(value) = pr[family]["byClimateBucket"][self.bucket(lap)].as_f64()
        {
            return units(value);
        }
        let value = p.and_then(|p| {
            if fuel {
                p.fuel_per_lap_liters
            } else {
                p.ve_per_lap_percent
            }
        });
        value.map_or(Ok(fallback), units)
    }
    pub fn allowed(&self, compound: &str, start: u32, laps: u32) -> bool {
        !valid_compound(compound)
            || (start..start + laps).all(|lap| {
                self.allowed
                    .get(self.bucket(lap))
                    .is_none_or(|cs| cs.iter().any(|c| c == compound))
            })
    }
    pub fn adjustment(
        &self,
        compound: &str,
        driver: &str,
        start: u32,
        laps: u32,
        global: &super::tyres::TyreModel,
    ) -> (f64, f64) {
        let (mut pace, mut degradation) = (0.0, 0.0);
        for offset in 0..laps {
            if let Some(p) = self.parameter(start + offset) {
                pace += p
                    .driver_profiles
                    .iter()
                    .find(|d| d.driver_id == driver)
                    .map_or(p.pace_delta_seconds, |d| d.pace_delta_seconds);
                if let Some(cost) = p.compound_pace.iter().find(|c| c.compound == compound)
                    && let Some(base) = global.compounds.get(compound)
                {
                    pace += cost.pace_delta_seconds - base.pace_delta_seconds;
                    degradation += cost.delta(offset + 1) - base.delta(offset + 1);
                }
            }
        }
        (pace, degradation)
    }
}
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)] // Position is bounded to 0..=4 by validated lap counts.
pub(super) fn timeline(
    scenario: &Value,
    laps: u32,
    thresholds: &RainThresholds,
) -> Vec<WeatherCondition> {
    (1..=laps)
        .map(|lap| {
            let denominator = laps.saturating_sub(1).max(1);
            let position = f64::from(lap - 1) / f64::from(denominator) * 4.0;
            let left = position.floor() as u32;
            let left_index = usize::try_from(left.min(4)).unwrap_or(4);
            let rain = |i: usize| scenario["nodes"][i]["rainChance"].as_f64().unwrap_or(0.0);
            let chance = if left >= 4 {
                rain(4)
            } else {
                rain(left_index)
                    + (rain(left_index + 1) - rain(left_index)) * (position - f64::from(left))
            };
            WeatherCondition {
                lap,
                rain_chance: chance,
                bucket: if chance >= thresholds.wet_percent {
                    "wet"
                } else if chance >= thresholds.humid_percent {
                    "humid"
                } else {
                    "dry"
                }
                .into(),
            }
        })
        .collect()
}
