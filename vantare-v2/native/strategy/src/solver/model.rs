//! The same model is used for search, replay and editor resource requirements.
use super::{
    Deserialize, Evaluation, Input, Resource, Scalar, Serialize, Value, amount, json,
    projection_confidence, provenance, reserve_amount, units,
};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecisionVector {
    #[serde(default)]
    pub pit_stops: Vec<PitDecision>,
    #[serde(default)]
    pub stints: Vec<StintDecision>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StintDecision {
    #[serde(default)]
    pub index: usize,
    pub laps: u32,
    #[serde(default)]
    pub compound: String,
    #[serde(default)]
    pub driver: String,
    #[serde(default)]
    pub saving_level: String,
    #[serde(default)]
    pub fuel_saved_per_lap: f64,
    #[serde(default)]
    pub ve_saved_per_lap: f64,
    #[serde(default)]
    pub time_cost_per_lap: f64,
    #[serde(default)]
    pub saving_cost_seconds: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tyre_fitment: Option<super::Fitment>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PitDecision {
    pub lap: u32,
    #[serde(default)]
    pub fuel_liters: f64,
    #[serde(default)]
    pub ve_percent: f64,
    #[serde(default)]
    pub compound: String,
    #[serde(default)]
    pub driver: String,
    #[serde(default)]
    pub saving_level: String,
    #[serde(default)]
    pub service_mode: String,
    #[serde(default)]
    pub change_tyres: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pit_cost_input: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pit_breakdown: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tyre_fitment: Option<super::Fitment>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Dimensions {
    pub tyre_inventory: Option<super::TyreInventory>,
    #[serde(default)]
    pub compound_pace: Vec<super::CompoundPace>,
    pub initial_fuel_liters: Option<Scalar>,
    #[serde(rename = "initialVEPercent")]
    pub initial_ve_percent: Option<Scalar>,
    pub fuel_weight: Option<FuelWeight>,
    pub saving_cost: Option<SavingCost>,
    pub projection: Option<Value>,
    pub observed: Option<Value>,
    pub base_lap_climate_bucket: Option<String>,
    pub race_duration_seconds: Option<f64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FuelWeight {
    pub presence: String,
    pub seconds_per_liter: f64,
    pub provenance: Value,
    pub confidence: Value,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavingCost {
    pub presence: String,
    pub provenance: Value,
    pub confidence: Value,
    pub role: String,
    pub levels: Vec<SavingLevel>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavingLevel {
    pub level: String,
    pub fuel_saved_per_lap: f64,
    pub ve_saved_per_lap: f64,
    pub time_cost_per_lap: f64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // Wire flags are independent Go contract fields.
pub struct ResourceReserveStatus {
    pub resource: String,
    pub configured: bool,
    pub active: bool,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub kind: String,
    pub requested_laps: f64,
    pub required_amount: f64,
    pub remaining_amount: f64,
    pub effective_laps: f64,
    pub effective_laps_available: bool,
    pub satisfied: bool,
    pub evidence: Value,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReserveStatus {
    pub satisfied: bool,
    pub effective_laps: f64,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub limiting_resource: String,
    pub fuel: ResourceReserveStatus,
    pub virtual_energy: ResourceReserveStatus,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRequirement {
    pub fuel_liters: f64,
    pub ve_percent: f64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionResourceRequirements {
    pub initial: ResourceRequirement,
    pub stints: Vec<ResourceRequirement>,
    pub finish: ResourceRequirement,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ExtraRules {
    #[serde(default)]
    pub mandatory_compounds: Vec<String>,
}

#[derive(Clone)]
pub(super) struct Model {
    pub input: Input,
    pub dims: Dimensions,
    pub fuel: Resource,
    pub ve: Resource,
    pub levels: Vec<SavingLevel>,
    pub fuel_weight: f64,
    pub tyres: super::tyres::TyreModel,
    pub rules: ExtraRules,
}

pub(super) fn require(condition: bool, field: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(format!("invalid_input: {field}"))
    }
}
pub(super) fn nonnegative(value: f64, field: &str) -> Result<(), String> {
    require(value.is_finite() && value >= 0.0, field)
}
pub(super) fn source(p: &Value, c: &Value) -> Result<(), String> {
    require(
        ["manual", "reference"].contains(&p["kind"].as_str().unwrap_or("")),
        "source.kind",
    )?;
    provenance(p)?;
    projection_confidence(c)
}

impl Model {
    #[allow(clippy::too_many_lines)] // Ordered validation of the immutable model.
    pub fn new(input: &Input) -> Result<Self, String> {
        let dims: Dimensions = serde_json::from_value(json!(input.extra))
            .map_err(|e| format!("unsupported_native_dimension: {e}"))?;
        let mut scalar = input.clone();
        scalar.extra.clear();
        scalar.event_rules.extra.clear();
        scalar.validate()?;
        for (initial, capacity) in [
            (&dims.initial_fuel_liters, scalar.fuel_capacity_liters.value),
            (&dims.initial_ve_percent, scalar.ve_capacity_percent.value),
        ] {
            if let Some(initial) = initial {
                initial.validate(true)?;
                require(
                    initial.value <= capacity,
                    "initial resource exceeds capacity",
                )?;
            }
        }
        require(
            dims.projection.is_none() && dims.observed.is_none(),
            "projection/observed not yet supported",
        )?;
        if let Some(bucket) = &dims.base_lap_climate_bucket {
            require(
                ["dry", "humid", "wet"].contains(&bucket.as_str()),
                "baseLapClimateBucket",
            )?;
        }
        if let Some(duration) = dims.race_duration_seconds {
            require(
                duration.is_finite() && duration > scalar.formation.seconds.value,
                "raceDurationSeconds",
            )?;
        }
        let fuel = Resource::new(
            scalar.fuel_capacity_liters.value,
            scalar.fuel_per_lap_liters.value,
            scalar.discretization.fuel_liters,
            &Value::Null,
            scalar.race_laps,
        )?;
        let ve = Resource::new(
            scalar.ve_capacity_percent.value,
            scalar.ve_per_lap_percent.value,
            scalar.discretization.ve_percent,
            &Value::Null,
            scalar.race_laps,
        )?;
        // Validate reserves even when no complete candidate is found.
        reserve_amount(
            &input.fuel_reserve,
            scalar.fuel_per_lap_liters.value,
            scalar.race_laps,
        )?;
        reserve_amount(
            &input.virtual_energy_reserve,
            scalar.ve_per_lap_percent.value,
            scalar.race_laps,
        )?;
        let mut fuel_weight = 0.0;
        if let Some(weight) = &dims.fuel_weight {
            require(weight.presence == "valid", "fuelWeight.presence")?;
            source(&weight.provenance, &weight.confidence)?;
            nonnegative(weight.seconds_per_liter, "fuelWeight.secondsPerLiter")?;
            fuel_weight = weight.seconds_per_liter;
        }
        let mut levels = vec![SavingLevel {
            level: "none".into(),
            ..SavingLevel::default()
        }];
        if let Some(saving) = &dims.saving_cost {
            require(saving.presence == "valid", "savingCost.presence")?;
            source(&saving.provenance, &saving.confidence)?;
            require(
                ["fallback", "user_override"].contains(&saving.role.as_str()),
                "savingCost.role",
            )?;
            require(
                saving.role != "user_override" || saving.provenance["kind"] == "manual",
                "savingCost.override",
            )?;
            require(
                !saving.levels.is_empty() && saving.levels.len() <= 16,
                "savingCost.levels",
            )?;
            let mut seen = std::collections::BTreeSet::new();
            for level in &saving.levels {
                require(
                    !level.level.is_empty() && level.level != "none" && seen.insert(&level.level),
                    "savingCost.level identifier",
                )?;
                nonnegative(level.fuel_saved_per_lap, "saving fuel")?;
                nonnegative(level.ve_saved_per_lap, "saving VE")?;
                nonnegative(level.time_cost_per_lap, "saving time")?;
                require(
                    units(level.fuel_saved_per_lap)? <= fuel.per_lap
                        && units(level.ve_saved_per_lap)? <= ve.per_lap,
                    "saving exceeds consumption",
                )?;
                if level.fuel_saved_per_lap != 0.0
                    || level.ve_saved_per_lap != 0.0
                    || level.time_cost_per_lap != 0.0
                {
                    levels.push(level.clone());
                }
            }
        }
        let tyres = super::tyres::TyreModel::new(
            &scalar,
            dims.tyre_inventory.as_ref(),
            &dims.compound_pace,
        )?;
        let rules: ExtraRules = serde_json::from_value(json!(input.event_rules.extra))
            .map_err(|e| format!("invalid_input: eventRules: {e}"))?;
        let mut mandatory = std::collections::BTreeSet::new();
        for compound in &rules.mandatory_compounds {
            require(
                tyres.compounds.contains_key(compound) && mandatory.insert(compound),
                "mandatory compound absent or duplicate",
            )?;
        }
        Ok(Self {
            input: scalar,
            dims,
            fuel,
            ve,
            levels,
            fuel_weight,
            tyres,
            rules,
        })
    }
    pub fn level(&self, id: &str) -> Result<&SavingLevel, String> {
        let id = if id.is_empty() { "none" } else { id };
        self.levels
            .iter()
            .find(|s| s.level == id)
            .ok_or_else(|| "invalid_input: savingLevel not configured".into())
    }
    pub fn usage(
        &self,
        _start: u32,
        laps: u32,
        _driver: &str,
        level: &SavingLevel,
    ) -> Result<(i64, i64), String> {
        Ok((
            i64::from(laps) * (self.fuel.per_lap - units(level.fuel_saved_per_lap)?),
            i64::from(laps) * (self.ve.per_lap - units(level.ve_saved_per_lap)?),
        ))
    }
    pub fn stint(
        &self,
        start: u32,
        laps: u32,
        fuel: i64,
        driver: &str,
        level: &SavingLevel,
        compound: &str,
    ) -> Result<Evaluation, String> {
        let (used, _) = self.usage(start, 1, driver, level)?;
        let count = f64::from(laps);
        let mut eval = Evaluation {
            green_seconds: count * self.input.base_lap_seconds.value,
            degradation_seconds: count * (count - 1.0) / 2.0
                * self.input.degradation_per_lap_seconds.value,
            fuel_weight_seconds: (count * amount(fuel)
                - count * (count - 1.0) / 2.0 * amount(used))
                * self.fuel_weight,
            saving_seconds: count * level.time_cost_per_lap,
            ..Evaluation::default()
        };
        if let Some(cost) = self.tyres.compounds.get(compound) {
            eval.compound_seconds = count * cost.pace_delta_seconds;
            eval.degradation_seconds = (1..=laps).map(|lap| cost.delta(lap)).sum();
        }
        eval.total();
        require(eval.total_seconds.is_finite(), "cost overflow")?;
        Ok(eval)
    }
    pub fn pit(&self, requested: &PitDecision) -> (PitDecision, f64) {
        let p = &self.input.pit_cost;
        let fuel = requested.fuel_liters / p.refuel_rate_l_per_s.value;
        let ve = requested.ve_percent / p.ve_rate_p_per_s.value;
        let tyre = if requested.change_tyres {
            p.tyre_seconds.value
        } else {
            0.0
        };
        let service = if p.service_mode == "parallel" {
            fuel.max(ve).max(tyre)
        } else {
            fuel + ve + tyre
        };
        let total = p.transit_seconds.value + service;
        let evidence = json!({"provenance":{"kind":"derived","sourceId":"strategy.solver.v2"},"confidence":{"level":"high","basis":"deterministic candidate service cost"}});
        let sourced = |v| json!({"value":v,"evidence":evidence});
        let mut pit = requested.clone();
        pit.service_mode.clone_from(&p.service_mode);
        pit.pit_cost_input = Some(
            json!({"entry":sourced(0.0),"transit":sourced(p.transit_seconds.value),"exit":sourced(0.0),"refuel":sourced(fuel),"virtualEnergy":sourced(ve),"tyres":sourced(tyre),"serviceMode":p.service_mode,"modeSelection":evidence}),
        );
        pit.pit_breakdown = Some(
            json!({"travelSeconds":p.transit_seconds.value,"coreServiceSeconds":service,"repairSeconds":0.0,"penaltySeconds":0.0,"fixedSeconds":p.transit_seconds.value,"variableSeconds":service,"overlapSavedSeconds":fuel+ve+tyre-service,"totalSeconds":total,"assumptions":[
                {"field":"pit.entry","unit":"duration_seconds","value":"0","provenance":evidence["provenance"],"confidence":evidence["confidence"]},
                {"field":"pit.transit","unit":"duration_seconds","value":p.transit_seconds.value.to_string(),"provenance":evidence["provenance"],"confidence":evidence["confidence"]},
                {"field":"pit.exit","unit":"duration_seconds","value":"0","provenance":evidence["provenance"],"confidence":evidence["confidence"]},
                {"field":"pit.refuel","unit":"duration_seconds","value":fuel.to_string(),"provenance":evidence["provenance"],"confidence":evidence["confidence"]},
                {"field":"pit.tyres","unit":"duration_seconds","value":tyre.to_string(),"provenance":evidence["provenance"],"confidence":evidence["confidence"]},
                {"field":"pit.virtualEnergy","unit":"duration_seconds","value":ve.to_string(),"provenance":evidence["provenance"],"confidence":evidence["confidence"]},
                {"field":"pit.serviceMode","unit":"pit_service_mode","value":p.service_mode,"provenance":evidence["provenance"],"confidence":evidence["confidence"]}
            ]}),
        );
        (pit, total)
    }
}

impl Evaluation {
    pub(super) fn total(&mut self) {
        self.total_seconds = self.formation_seconds
            + self.green_seconds
            + self.degradation_seconds
            + self.compound_seconds
            + self.weather_seconds
            + self.fuel_weight_seconds
            + self.saving_seconds
            + self.pit_seconds;
    }
    pub(super) fn add(&mut self, other: &Self) {
        self.green_seconds += other.green_seconds;
        self.degradation_seconds += other.degradation_seconds;
        self.compound_seconds += other.compound_seconds;
        self.weather_seconds += other.weather_seconds;
        self.fuel_weight_seconds += other.fuel_weight_seconds;
        self.saving_seconds += other.saving_seconds;
        self.pit_seconds += other.pit_seconds;
        self.formation_seconds += other.formation_seconds;
        self.total();
    }
}
