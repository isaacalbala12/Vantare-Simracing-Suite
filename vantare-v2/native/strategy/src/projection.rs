//! Validation used by Go's StrategyInputProjectionV2.Validate, without acquisition.
use serde_json::Value;

use super::document::{
    array, check, projection_confidence, provenance as document_provenance, string, timestamp,
};

fn presence(value: &Value) -> Result<(), String> {
    check(
        [
            "valid",
            "missing",
            "invalid",
            "stale",
            "unsupported",
            "unknown",
        ]
        .contains(&string(value)),
        "projection.presence",
    )
}

fn canonical_timestamp(value: &Value) -> Result<(), String> {
    let time = timestamp(value)?;
    check(
        string(value).ends_with('Z') && time.timestamp_subsec_nanos() % 1_000_000 == 0,
        "projection UTC millisecond timestamp",
    )
}

pub(super) fn provenance(value: &Value) -> Result<(), String> {
    document_provenance(value)?;
    check(
        value["kind"] != "legacy_synthetic_default",
        "projection provenance.kind",
    )?;
    if !value["observedAt"].is_null() {
        canonical_timestamp(&value["observedAt"])?;
    }
    Ok(())
}

fn axes(value: &Value) -> Result<(), String> {
    presence(&value["presence"])?;
    provenance(&value["provenance"])?;
    projection_confidence(&value["confidence"])
}

fn representative_pace(value: &Value) -> Result<(), String> {
    axes(value)?;
    if value["presence"] == "valid" {
        check(
            value["medianLapSeconds"]
                .as_f64()
                .is_some_and(|n| n.is_finite() && n > 0.0),
            "projection.medianLapSeconds",
        )?;
        check(
            value["confidence"]["sampleSize"]
                .as_i64()
                .is_some_and(|n| n > 0),
            "projection pace sampleSize",
        )
    } else {
        check(
            !string(&value["reason"]).is_empty(),
            "projection pace reason",
        )
    }
}

fn class_pace(value: &Value) -> Result<(), String> {
    axes(value)?;
    check(
        value["provenance"]["kind"] == "reference",
        "projection class pace reference",
    )?;
    let values = value["byClassName"].as_object();
    check(
        value["byClassName"].is_null() || values.is_some(),
        "projection byClassName shape",
    )?;
    if value["presence"] == "valid" {
        check(
            string(&value["reason"]).is_empty() && values.is_some_and(|v| !v.is_empty()),
            "projection valid class pace",
        )?;
        check(
            value["confidence"]["sampleSize"]
                .as_i64()
                .is_some_and(|n| n > 0),
            "projection class pace sampleSize",
        )?;
        if let Some(values) = values {
            for (class, pace) in values {
                check(
                    !class.trim().is_empty()
                        && pace.as_f64().is_some_and(|n| n.is_finite() && n > 0.0),
                    "projection class pace value",
                )?;
            }
        }
    } else {
        check(
            value["reason"] == "no_class_pace_source"
                && values.is_none_or(serde_json::Map::is_empty),
            "projection missing class pace",
        )?;
    }
    Ok(())
}

fn pit(value: &Value) -> Result<(), String> {
    presence(&value["presence"])?;
    check(
        value["observedIntervals"].is_null() || value["observedIntervals"].is_array(),
        "projection pit intervals shape",
    )?;
    for interval in array(&value["observedIntervals"]) {
        check(
            interval["durationSeconds"]
                .as_f64()
                .is_some_and(|n| n > 0.0),
            "projection pit duration",
        )?;
        for key in ["hasFuelRise", "hasVERise", "ambiguous"] {
            check(
                interval[key].is_null() || interval[key].is_boolean(),
                "projection pit flag",
            )?;
        }
        let fuel = interval["hasFuelRise"] == true;
        let ve = interval["hasVERise"] == true;
        let ambiguous = interval["ambiguous"] == true;
        check(
            fuel || ve || ambiguous,
            "projection pit ambiguous without rise",
        )?;
        check(
            !ambiguous || !string(&interval["ambiguityReason"]).is_empty(),
            "projection pit ambiguity reason",
        )?;
        check(
            fuel || interval["fuelRateLPerS"].is_null(),
            "projection pit fuel rise",
        )?;
        check(
            ve || interval["veRatePPerS"].is_null(),
            "projection pit VE rise",
        )?;
    }
    Ok(())
}

pub(super) fn validate(value: &Value) -> Result<(), String> {
    canonical_timestamp(&value["generatedAt"])?;
    check(
        !string(&value["computationVersion"]).is_empty(),
        "projection computationVersion",
    )?;
    check(
        value["representativePaceByClimateBucket"].is_null()
            || value["representativePaceByClimateBucket"].is_object(),
        "projection pace buckets shape",
    )?;
    if let Some(buckets) = value["representativePaceByClimateBucket"].as_object() {
        for (bucket, pace) in buckets {
            check(
                ["dry", "humid", "wet"].contains(&bucket.as_str()),
                "projection climate bucket",
            )?;
            representative_pace(pace)?;
        }
    }
    if !value["classPace"].is_null() {
        class_pace(&value["classPace"])?;
    }
    let combined = &value["combinedStintPaceCurve"];
    axes(combined)?;
    check(
        ["combined_only", "separable"].contains(&string(&combined["identifiability"])),
        "projection identifiability",
    )?;
    for key in ["fuelWeightCurve", "tyreAgeCurve"] {
        let curve = &value[key];
        if !curve.is_null() {
            check(
                combined["identifiability"] == "separable",
                "projection separable curve",
            )?;
            axes(curve)?;
            // Go's absent float64 decodes as zero.
            check(
                curve["slopeSecondsPerUnit"].is_null()
                    || curve["slopeSecondsPerUnit"]
                        .as_f64()
                        .is_some_and(|n| n.is_finite() && (key != "fuelWeightCurve" || n >= 0.0)),
                "projection slopeSecondsPerUnit",
            )?;
        }
    }
    pit(&value["pit"])
}
