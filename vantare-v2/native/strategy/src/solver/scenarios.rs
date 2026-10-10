//! Union of per-scenario candidates, ranked by minimax regret, as in Go.
use super::model::require;
use super::{
    DecisionVector, Evaluation, Input, OptimalityStatus, RainThresholds, SolverOutcome,
    WeatherBucket, WeatherCondition, WeatherPlan, replay_decision_v2,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeightedWeatherScenario {
    pub scenario: Value,
    pub weight: f64,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeatherScenarioSet {
    pub scenarios: Vec<WeightedWeatherScenario>,
    #[serde(default)]
    pub thresholds: RainThresholds,
    #[serde(default)]
    pub bucket_parameters: Vec<WeatherBucket>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherScenarioPlan {
    pub scenario_id: String,
    pub weight: f64,
    pub timeline: Vec<WeatherCondition>,
    pub result: SolverOutcome,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioEvaluation {
    pub scenario_id: String,
    pub feasible: bool,
    pub evaluation: Evaluation,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RobustRecommendation {
    pub method: &'static str,
    pub decision: DecisionVector,
    pub max_regret_seconds: f64,
    pub weighted_expected_loss_seconds: f64,
    pub by_scenario: Vec<ScenarioEvaluation>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherThresholdSensitivity {
    pub parameter: &'static str,
    pub delta_percent_points: f64,
    pub changed_laps: usize,
    pub impact_seconds: f64,
    pub feasible: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherScenarioResult {
    pub plans: Vec<WeatherScenarioPlan>,
    pub robust: RobustRecommendation,
    pub threshold_sensitivity: Vec<WeatherThresholdSensitivity>,
}
fn with_weather(
    input: &Input,
    scenario: &Value,
    thresholds: &RainThresholds,
    buckets: &[WeatherBucket],
) -> Result<Input, String> {
    let mut input = input.clone();
    input.extra.insert(
        "weather".into(),
        serde_json::to_value(WeatherPlan {
            scenario: scenario.clone(),
            thresholds: thresholds.clone(),
            bucket_parameters: buckets.to_vec(),
        })
        .map_err(|e| format!("invalid_input: weather: {e}"))?,
    );
    Ok(input)
}
pub fn solve_weather_scenarios(
    input: &Input,
    set: &WeatherScenarioSet,
) -> Result<WeatherScenarioResult, String> {
    solve_weather_scenarios_cancellable(input, set, &AtomicBool::new(false))
}
#[allow(clippy::too_many_lines)] // Per-scenario solve, union and a single deterministic minimax ranking.
pub fn solve_weather_scenarios_cancellable(
    input: &Input,
    set: &WeatherScenarioSet,
    cancel: &AtomicBool,
) -> Result<WeatherScenarioResult, String> {
    require(
        !set.scenarios.is_empty() && set.scenarios.len() <= 16,
        "weather scenarios 1..16",
    )?;
    let thresholds = set.thresholds.normalized()?;
    let total: f64 = set.scenarios.iter().map(|s| s.weight).sum();
    require(
        total.is_finite() && total > 0.0,
        "weather scenario weight total",
    )?;
    let mut seen = std::collections::BTreeSet::new();
    let (mut plans, mut inputs) = (vec![], vec![]);
    let mut union: BTreeMap<String, DecisionVector> = BTreeMap::new();
    for weighted in &set.scenarios {
        require(
            weighted.weight.is_finite() && weighted.weight > 0.0,
            "weather scenario weight",
        )?;
        let id = weighted.scenario["scenarioId"]
            .as_str()
            .ok_or("invalid_input: scenarioId")?;
        require(seen.insert(id), "duplicate scenarioId")?;
        let input = with_weather(
            input,
            &weighted.scenario,
            &thresholds,
            &set.bucket_parameters,
        )?;
        let result = super::search::solve(&input, cancel, true, Some(input.budget.p95_millis))?;
        require(
            result.certificate.status != OptimalityStatus::NotProven,
            "weather scenario optimum not proven",
        )?;
        require(result.result.feasible, "no feasible weather scenario plan")?;
        for d in &result.result.candidates {
            union.insert(
                serde_json::to_string(d).map_err(|e| format!("decision: {e}"))?,
                d.clone(),
            );
        }
        if let Some(d) = &result.result.best {
            union.insert(
                serde_json::to_string(d).map_err(|e| format!("decision: {e}"))?,
                d.clone(),
            );
        }
        let timeline = super::weather::timeline(&weighted.scenario, input.race_laps, &thresholds);
        plans.push(WeatherScenarioPlan {
            scenario_id: id.into(),
            weight: weighted.weight / total,
            timeline,
            result,
        });
        inputs.push(input);
    }
    let mut best: Option<(f64, f64, String, DecisionVector, Vec<ScenarioEvaluation>)> = None;
    for (key, decision) in union {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }
        let (mut max_regret, mut loss, mut by_scenario, mut feasible) =
            (0.0f64, 0.0f64, vec![], true);
        for (index, input) in inputs.iter().enumerate() {
            let replay = replay_decision_v2(input, &decision)?;
            by_scenario.push(ScenarioEvaluation {
                scenario_id: plans[index].scenario_id.clone(),
                feasible: replay.feasible,
                evaluation: replay.evaluation.clone(),
            });
            if !replay.feasible {
                feasible = false;
                break;
            }
            let regret = (replay.evaluation.total_seconds
                - plans[index].result.result.expected.total_seconds)
                .max(0.0);
            max_regret = max_regret.max(regret);
            loss += plans[index].weight * regret;
        }
        if feasible
            && best.as_ref().is_none_or(|(max, expected, old_key, _, _)| {
                max_regret < max - 1e-9
                    || ((max_regret - max).abs() <= 1e-9
                        && (loss < expected - 1e-9
                            || ((loss - expected).abs() <= 1e-9 && key < *old_key)))
            })
        {
            best = Some((max_regret, loss, key, decision, by_scenario));
        }
    }
    let (max, loss, _, decision, by_scenario) =
        best.ok_or("infeasible: no candidate feasible in every scenario")?;
    let sensitivities = sensitivity(input, set, &thresholds, &decision, &plans)?;
    Ok(WeatherScenarioResult {
        plans,
        robust: RobustRecommendation {
            method: "minimax_regret",
            decision,
            max_regret_seconds: max,
            weighted_expected_loss_seconds: loss,
            by_scenario,
        },
        threshold_sensitivity: sensitivities,
    })
}
fn sensitivity(
    input: &Input,
    set: &WeatherScenarioSet,
    thresholds: &RainThresholds,
    decision: &DecisionVector,
    plans: &[WeatherScenarioPlan],
) -> Result<Vec<WeatherThresholdSensitivity>, String> {
    let mut baseline = 0.0;
    for (i, s) in set.scenarios.iter().enumerate() {
        baseline += plans[i].weight
            * replay_decision_v2(
                &with_weather(input, &s.scenario, thresholds, &set.bucket_parameters)?,
                decision,
            )?
            .evaluation
            .total_seconds;
    }
    let mut result = vec![];
    for delta in [-5.0, 5.0] {
        let changed_threshold = RainThresholds {
            humid_percent: thresholds.humid_percent,
            wet_percent: thresholds.wet_percent + delta,
        };
        if changed_threshold.wet_percent <= changed_threshold.humid_percent {
            continue;
        }
        let (mut changed, mut cost, mut feasible) = (0usize, 0.0, true);
        for (i, s) in set.scenarios.iter().enumerate() {
            let timeline =
                super::weather::timeline(&s.scenario, input.race_laps, &changed_threshold);
            changed += plans[i]
                .timeline
                .iter()
                .zip(timeline)
                .filter(|(l, r)| l.bucket != r.bucket)
                .count();
            let adjusted = with_weather(
                input,
                &s.scenario,
                &changed_threshold,
                &set.bucket_parameters,
            )?;
            match replay_decision_v2(&adjusted, decision) {
                Ok(r) if r.feasible => cost += plans[i].weight * r.evaluation.total_seconds,
                _ => feasible = false,
            }
        }
        result.push(WeatherThresholdSensitivity {
            parameter: "wetRainChancePercent",
            delta_percent_points: delta,
            changed_laps: changed,
            impact_seconds: if feasible { cost - baseline } else { 0.0 },
            feasible,
        });
    }
    Ok(result)
}
