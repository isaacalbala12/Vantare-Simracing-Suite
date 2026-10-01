//! One coherent adverse scenario, preserving the same declared authorities.
use super::model::Model;
use super::replay::{ReplayResult, replay_model};
use super::{DecisionVector, Evaluation, Input};
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, Serialize)]
pub struct SolverRisk {
    pub code: String,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateDetail {
    pub decision: DecisionVector,
    pub evaluation: Evaluation,
    pub worst_case: Evaluation,
    pub feasible: bool,
    pub worst_case_feasible: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub risks: Vec<SolverRisk>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorstCaseTolerance {
    pub allow_hard_risk: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_expected_slowdown_ratio: Option<f64>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverVariant {
    pub kind: String,
    pub tolerance: WorstCaseTolerance,
    pub decision: DecisionVector,
    pub expected: Evaluation,
    pub worst_case: Evaluation,
    pub worst_case_feasible: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub risks: Vec<SolverRisk>,
}
fn raise(value: &mut Value, key: &str, upper: f64) {
    if let Some(v) = value[key].as_f64() {
        value[key] = Value::from(v.max(upper));
    }
}
pub(super) fn envelope(input: &Input, resources: bool) -> Input {
    let mut changed = input.clone();
    if let Some(p) = changed.extra.get_mut("projection")
        && p.is_object()
    {
        if resources {
            for key in ["fuelConsumption", "virtualEnergyConsumption"] {
                let f = &mut p[key];
                if f["presence"] == "valid" {
                    let mean = f["meanPerLap"].as_f64().unwrap_or(0.0);
                    let upper = f["rangeUpper"].as_f64().unwrap_or(0.0);
                    if mean > 0.0 && upper > mean {
                        f["meanPerLap"] = Value::from(upper);
                        if let Some(buckets) = f["byClimateBucket"].as_object_mut() {
                            for value in buckets.values_mut() {
                                if let Some(v) = value.as_f64() {
                                    *value = Value::from(v * upper / mean);
                                }
                            }
                        }
                    }
                }
            }
            let tyre = &mut p["tyreDegradation"];
            if tyre["presence"] == "valid"
                && let Some(lower) = tyre["lifeLapsRangeLower"].as_f64()
                && lower > 0.0
            {
                tyre["lifeLapsEstimate"] = Value::from(lower.floor());
            }
        }
        let curve = &mut p["combinedStintPaceCurve"];
        if curve["presence"] == "valid"
            && let Some(points) = curve["points"].as_array_mut()
        {
            for point in points {
                if let Some(upper) = point["rangeUpper"].as_f64() {
                    raise(point, "deltaSeconds", upper);
                }
            }
        }
    }
    for key in ["fuelWeight", "savingCost"] {
        if let Some(parameter) = changed.extra.get_mut(key)
            && let Some(upper) = parameter["confidence"]["rangeUpper"].as_f64()
        {
            if key == "fuelWeight" {
                raise(parameter, "secondsPerLiter", upper);
            } else if let Some(levels) = parameter["levels"].as_array_mut() {
                for level in levels {
                    raise(level, "timeCostPerLap", upper);
                }
            }
        }
    }
    if let Some(compounds) = changed
        .extra
        .get_mut("compoundPace")
        .and_then(Value::as_array_mut)
    {
        for c in compounds {
            if let Some(upper) = c["confidence"]["rangeUpper"].as_f64() {
                raise(c, "paceDeltaSeconds", upper);
            }
        }
    }
    changed
}
pub(super) fn active(expected: &Model, worst: &Model) -> bool {
    expected.fuel.per_lap != worst.fuel.per_lap
        || expected.ve.per_lap != worst.ve.per_lap
        || expected
            .input
            .tyre_life_laps
            .value
            .total_cmp(&worst.input.tyre_life_laps.value)
            .is_ne()
}
pub(super) fn detail(
    replayed: &ReplayResult,
    cost: &Model,
    full: &Model,
) -> Result<CandidateDetail, String> {
    let decision = &replayed.decision;
    let worst_cost = replay_model(cost, decision, None, true)?;
    let worst = if worst_cost.feasible {
        worst_cost.evaluation
    } else {
        replayed.evaluation.clone()
    };
    let full_feasible = match replay_model(full, decision, None, true) {
        Ok(r) => r.feasible,
        Err(e) if e.contains("pit service exceeds capacity") => false,
        Err(e) => return Err(e),
    };
    let mut risks = hard_risks(full, decision)?;
    let feasible = full_feasible && risks.is_empty();
    if !feasible && risks.is_empty() {
        risks.push(SolverRisk {
            code: "worst_case_constraint_violation".into(),
            message: "el caso malo viola una restriccion dura".into(),
        });
    }
    Ok(CandidateDetail {
        decision: decision.clone(),
        evaluation: replayed.evaluation.clone(),
        worst_case: worst,
        feasible: true,
        worst_case_feasible: feasible,
        risks,
    })
}
fn hard_risks(m: &Model, decision: &DecisionVector) -> Result<Vec<SolverRisk>, String> {
    let mut fuel = super::units(
        m.dims
            .initial_fuel_liters
            .as_ref()
            .map_or(super::amount(m.fuel.capacity), |s| s.value),
    )?;
    let mut ve = super::units(
        m.dims
            .initial_ve_percent
            .as_ref()
            .map_or(super::amount(m.ve.capacity), |s| s.value),
    )?;
    let (mut age, mut lap) = (0u32, 0u32);
    let mut tyre_usage = std::collections::BTreeMap::<String, u32>::new();
    let mut risks = vec![];
    let mut seen = std::collections::BTreeSet::new();
    for (i, s) in decision.stints.iter().enumerate() {
        let (f, v) = m.usage(lap + 1, s.laps, &s.driver, m.level(&s.saving_level)?)?;
        for (code, violated, message) in [
            (
                "worst_case_fuel_shortfall",
                f > fuel,
                "el consumo del caso malo agota el Fuel antes de terminar un stint",
            ),
            (
                "worst_case_virtual_energy_shortfall",
                v > ve,
                "el consumo del caso malo agota la Virtual Energy antes de terminar un stint",
            ),
        ] {
            if violated && seen.insert(code) {
                risks.push(SolverRisk {
                    code: code.into(),
                    message: message.into(),
                });
            }
        }
        let tyre_age = s.tyre_fitment.as_ref().map_or(age, |f| {
            f.ids()
                .iter()
                .map(|id| tyre_usage.get(*id).copied().unwrap_or(0))
                .max()
                .unwrap_or(0)
        });
        if m.input.tyre_life_laps.value > 0.0
            && f64::from(tyre_age + s.laps) > m.input.tyre_life_laps.value
            && seen.insert("worst_case_tyre_life_exceeded")
        {
            risks.push(SolverRisk {
                code: "worst_case_tyre_life_exceeded".into(),
                message: "la vida de neumatico del caso malo no cubre un stint".into(),
            });
        }
        if let Some(fitment) = &s.tyre_fitment {
            for id in fitment.ids() {
                *tyre_usage.entry(id.into()).or_default() += s.laps;
            }
        } else {
            age += s.laps;
        }
        fuel -= f;
        ve -= v;
        lap += s.laps;
        if let Some(pit) = decision.pit_stops.get(i) {
            fuel += super::units(pit.fuel_liters)?;
            ve += super::units(pit.ve_percent)?;
            if pit.change_tyres && pit.tyre_fitment.is_none() {
                age = 0;
            }
        }
    }
    Ok(risks)
}
pub(super) fn variants(candidates: &[CandidateDetail]) -> Vec<SolverVariant> {
    let mut variants = vec![];
    for (kind, allow, ratio) in [
        ("fast", true, None),
        ("balanced", false, Some(0.05)),
        ("conservative", false, Some(0.02)),
    ] {
        if let Some(c) = candidates.iter().find(|c| {
            (allow || c.worst_case_feasible)
                && ratio.is_none_or(|r| {
                    c.evaluation.total_seconds <= 0.0
                        || (c.worst_case.total_seconds - c.evaluation.total_seconds)
                            / c.evaluation.total_seconds
                            <= r
                })
        }) {
            variants.push(SolverVariant {
                kind: kind.into(),
                tolerance: WorstCaseTolerance {
                    allow_hard_risk: allow,
                    max_expected_slowdown_ratio: ratio,
                },
                decision: c.decision.clone(),
                expected: c.evaluation.clone(),
                worst_case: c.worst_case.clone(),
                worst_case_feasible: c.worst_case_feasible,
                risks: c.risks.clone(),
            });
        }
    }
    variants
}
