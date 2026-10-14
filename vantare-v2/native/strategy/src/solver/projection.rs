//! Resolve existing Analysis contracts; this module never derives telemetry.
use super::model::{Dimensions, require};
use super::{CurvePoint, Input, Scalar, projection_confidence, provenance, units};
use serde_json::Value;

fn derived(s: &mut Scalar, family: &Value, key: &str, positive: bool) -> Result<(), String> {
    if s.role == "user_override" || family["presence"] != "valid" {
        return Ok(());
    }
    if let Some(v) = family[key].as_f64()
        && v.is_finite()
        && if positive { v > 0.0 } else { v >= 0.0 }
    {
        provenance(&family["provenance"])?;
        projection_confidence(&family["confidence"])?;
        s.value = v;
        s.provenance = family["provenance"].clone();
        s.confidence = family["confidence"].clone();
        s.role = "derived".into();
    }
    Ok(())
}
#[allow(clippy::too_many_lines)] // Field precedence and curve validation share the same source snapshot.
pub(super) fn resolve(
    input: &mut Input,
    dims: &mut Dimensions,
) -> Result<(Vec<CurvePoint>, f64), String> {
    let Some(p) = &dims.projection else {
        return Ok((vec![], 0.0));
    };
    require(
        p["contractVersion"] == "strategyinputprojection.v2",
        "projection.contractVersion",
    )?;
    validate_projection(p)?;
    validate_revisions(p)?;
    let bucket = dims.base_lap_climate_bucket.as_deref().unwrap_or("dry");
    derived(
        &mut input.base_lap_seconds,
        &p["representativePaceByClimateBucket"][bucket],
        "medianLapSeconds",
        true,
    )?;
    derived(
        &mut input.fuel_per_lap_liters,
        &p["fuelConsumption"],
        "meanPerLap",
        true,
    )?;
    derived(
        &mut input.ve_per_lap_percent,
        &p["virtualEnergyConsumption"],
        "meanPerLap",
        true,
    )?;
    derived(
        &mut input.tyre_life_laps,
        &p["tyreDegradation"],
        "lifeLapsEstimate",
        true,
    )?;
    let pit = &p["pit"];
    if pit["presence"] == "valid" {
        derived(
            &mut input.pit_cost.transit_seconds,
            pit,
            "transitSecondsManual",
            false,
        )?;
        derived(
            &mut input.pit_cost.tyre_seconds,
            pit,
            "serviceSecondsManual",
            false,
        )?;
        derived(
            &mut input.pit_cost.refuel_rate_l_per_s,
            &pit["fuelRate"],
            "mean",
            true,
        )?;
        derived(
            &mut input.pit_cost.ve_rate_p_per_s,
            &pit["veRate"],
            "mean",
            true,
        )?;
    }
    let weight = &p["fuelWeightCurve"];
    if weight["presence"] == "valid" {
        require(
            dims.fuel_weight.is_none(),
            "derived and declared fuel weight cannot coexist",
        )?;
    }
    let curve = &p["combinedStintPaceCurve"];
    if !dims.compound_pace.is_empty() {
        require(
            curve["presence"] != "valid",
            "combined curve and compound pace cannot coexist",
        )?;
    }
    let mut points = vec![];
    let mut tail = 0.0;
    if input.degradation_per_lap_seconds.role != "user_override"
        && curve["presence"] == "valid"
        && curve["identifiability"] == "combined_only"
        && curve["points"].as_array().is_some_and(|p| !p.is_empty())
    {
        let confidence = &curve["confidence"];
        let sample = confidence["sampleSize"]
            .as_f64()
            .ok_or("invalid_input: curve sample size")?;
        let lower = confidence["rangeLower"]
            .as_f64()
            .ok_or("invalid_input: curve range lower")?;
        let upper = confidence["rangeUpper"]
            .as_f64()
            .ok_or("invalid_input: curve range upper")?;
        require(
            sample > 0.0 && lower.is_finite() && upper.is_finite() && lower <= upper,
            "combined curve confidence",
        )?;
        tail = (upper - lower) / sample.sqrt();
        let mut ages = std::collections::BTreeSet::new();
        for point in curve["points"]
            .as_array()
            .ok_or("invalid_input: curve points")?
        {
            let lap = u32::try_from(
                point["lapInStint"]
                    .as_u64()
                    .ok_or("invalid_input: curve lap")?,
            )
            .map_err(|e| format!("invalid_input: {e}"))?;
            let delta = point["deltaSeconds"]
                .as_f64()
                .ok_or("invalid_input: curve delta")?;
            require(
                lap > 0
                    && ages.insert(lap)
                    && delta.is_finite()
                    && point["sampleSize"].as_u64().is_some_and(|v| v > 0),
                "combined curve point",
            )?;
            require(
                point["rangeLower"].is_null() == point["rangeUpper"].is_null(),
                "curve incomplete point range",
            )?;
            if let (Some(lo), Some(hi)) =
                (point["rangeLower"].as_f64(), point["rangeUpper"].as_f64())
            {
                require(
                    lo.is_finite() && hi.is_finite() && lo <= hi,
                    "curve point range",
                )?;
            }
            points.push(CurvePoint {
                lap_in_stint: lap,
                delta_seconds: delta,
            });
        }
    }
    points.sort_by_key(|point| point.lap_in_stint);
    Ok((points, tail))
}
// The shared document validator predates open pit intervals. Normalize only
// a Go-valid open marker in the validation copy; never change the projection.
fn validate_projection(p: &Value) -> Result<(), String> {
    let mut validation = p.clone();
    if let Some(intervals) = validation["pit"]["observedIntervals"].as_array_mut() {
        for interval in intervals {
            if interval["endTimestamp"].is_null()
                && interval["durationSeconds"].as_f64().unwrap_or(0.0) == 0.0
                && interval["ambiguous"] == true
                && interval["ambiguityReason"] == "open_pit_lane_interval"
                && !interval["startTimestamp"].is_null()
            {
                require(
                    interval["hasFuelRise"] != true
                        && interval["hasVERise"] != true
                        && [
                            "fuelAddedLiters",
                            "veAddedPercent",
                            "fuelRateLPerS",
                            "veRatePPerS",
                        ]
                        .iter()
                        .all(|k| interval[*k].is_null()),
                    "open pit interval cannot publish resources",
                )?;
                interval["durationSeconds"] = Value::from(1.0);
            }
        }
    }
    super::super::projection::validate(&validation)
}
fn validate_revisions(p: &Value) -> Result<(), String> {
    if p["sourceRevisions"].is_null() {
        return Ok(());
    }
    let sessions = p["sourceSessions"].as_array().cloned().unwrap_or_default();
    let refs = p["sourceRevisions"]
        .as_array()
        .ok_or("invalid_input: sourceRevisions")?;
    require(
        !refs.is_empty() && refs.len() == sessions.len(),
        "sourceRevisions must cover sessions",
    )?;
    let mut seen = std::collections::BTreeSet::new();
    for s in &sessions {
        require(
            s.as_str()
                .is_some_and(|id| !id.trim().is_empty() && id.len() <= 256 && seen.insert(id)),
            "sourceSessions empty/duplicate",
        )?;
    }
    let mut ids = std::collections::BTreeSet::new();
    for r in refs {
        require(
            r["sessionId"]
                .as_str()
                .is_some_and(|id| seen.contains(id) && ids.insert(id)),
            "sourceRevision session",
        )?;
        for key in ["baseDigest", "revisionId", "snapshotId"] {
            require(
                r[key].as_str().is_some_and(|id| {
                    id.len() == 64
                        && id
                            .bytes()
                            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                }),
                "sourceRevision digest",
            )?;
        }
    }
    Ok(())
}
pub(super) fn selected_levels(
    dims: &Dimensions,
) -> Result<Option<Vec<super::SavingLevel>>, String> {
    let Some(p) = &dims.projection else {
        return Ok(None);
    };
    let family = &p["savingCost"];
    if family["presence"] != "valid"
        || dims
            .saving_cost
            .as_ref()
            .is_some_and(|s| s.role == "user_override")
    {
        return Ok(None);
    }
    provenance(&family["provenance"])?;
    projection_confidence(&family["confidence"])?;
    if family["levels"].as_array().is_none_or(Vec::is_empty) {
        return Ok(Some(vec![]));
    }
    if family["provenance"]["kind"] == "derived" {
        require(
            family["manualNote"] == "derived_from_controlled_ab_protocol",
            "saving derived A/B protocol",
        )?;
    }
    require(
        ["manual", "reference", "derived"]
            .contains(&family["provenance"]["kind"].as_str().unwrap_or("")),
        "saving projection kind",
    )?;
    let mut result = vec![];
    for level in family["levels"].as_array().into_iter().flatten() {
        let id = level["mixtureCode"].as_i64().unwrap_or(0);
        let fuel = level["fuelSavedPerLap"].as_f64().unwrap_or(0.0);
        let ve = level["veSavedPerLap"].as_f64().unwrap_or(0.0);
        let time = level["timeCostPerLap"].as_f64().unwrap_or(0.0);
        units(fuel)?;
        units(ve)?;
        require(time.is_finite() && time >= 0.0, "derived saving time")?;
        result.push(super::SavingLevel {
            level: format!("mixture_{id}"),
            fuel_saved_per_lap: fuel,
            ve_saved_per_lap: ve,
            time_cost_per_lap: time,
        });
    }
    Ok(Some(result))
}
