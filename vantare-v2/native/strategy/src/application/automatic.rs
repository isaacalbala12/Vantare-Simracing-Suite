//! Read-only adaptation of Analysis-owned recorded-session projections.
use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{AnalysisRevisionRef, validate_analysis_revisions};

const MAX_RECORDED_SESSIONS: usize = 4;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ProjectionFamily {
    FuelConsumption,
    VirtualEnergyConsumption,
    Pace,
    TyreDegradation,
    SavingCost,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomaticPreparationStatus {
    Ready,
    Partial,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClimateBucket {
    Dry,
    Humid,
    Wet,
}

impl ClimateBucket {
    fn as_str(self) -> &'static str {
        match self {
            Self::Dry => "dry",
            Self::Humid => "humid",
            Self::Wet => "wet",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VirtualEnergyApplicability {
    Applicable,
    NotApplicable,
    Pending,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectionFamilyCoverage {
    pub family: ProjectionFamily,
    pub available: bool,
    pub sample_size: u64,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AutomaticPreparation {
    pub status: AutomaticPreparationStatus,
    pub source_revisions: Vec<AnalysisRevisionRef>,
    pub projection: Value,
    pub coverage: BTreeMap<ProjectionFamily, ProjectionFamilyCoverage>,
    pub blockers: Vec<ProjectionFamily>,
}

/// Prepares one Analysis-produced projection for the exact selected sessions.
/// It does not alter Analysis revisions or convert derived values into the
/// solver's separate manual scalar contract.
pub fn prepare_automatic(
    selected_sessions: &[String],
    source_revisions: &[AnalysisRevisionRef],
    projection: Value,
    climate_bucket: ClimateBucket,
    virtual_energy: VirtualEnergyApplicability,
) -> Result<AutomaticPreparation, String> {
    validate_analysis_revisions(selected_sessions, source_revisions)?;
    if selected_sessions.len() > MAX_RECORDED_SESSIONS {
        return Err("invalid_source_revisions".into());
    }
    if projection["contractVersion"] != "strategyinputprojection.v2"
        || projection["combinationId"]
            .as_str()
            .is_none_or(|value| value.trim().is_empty())
    {
        return Err("invalid_analysis_projection".into());
    }
    super::super::projection::validate(&projection)?;
    validate_projection_selection(selected_sessions, source_revisions, &projection)?;

    let mut coverage = BTreeMap::new();
    coverage.insert(
        ProjectionFamily::FuelConsumption,
        resource_coverage(
            ProjectionFamily::FuelConsumption,
            &projection["fuelConsumption"],
            false,
        ),
    );
    coverage.insert(
        ProjectionFamily::VirtualEnergyConsumption,
        resource_coverage(
            ProjectionFamily::VirtualEnergyConsumption,
            &projection["virtualEnergyConsumption"],
            true,
        ),
    );
    coverage.insert(
        ProjectionFamily::Pace,
        pace_coverage(&projection, climate_bucket),
    );
    coverage.insert(
        ProjectionFamily::TyreDegradation,
        tyre_coverage(&projection["tyreDegradation"]),
    );
    coverage.insert(
        ProjectionFamily::SavingCost,
        saving_coverage(&projection["savingCost"]),
    );

    let mut required = vec![ProjectionFamily::FuelConsumption, ProjectionFamily::Pace];
    if virtual_energy == VirtualEnergyApplicability::Applicable {
        required.push(ProjectionFamily::VirtualEnergyConsumption);
    }
    let blockers = required
        .into_iter()
        .filter(|family| !coverage[family].available)
        .collect::<Vec<_>>();
    let status = if blockers.is_empty() {
        AutomaticPreparationStatus::Ready
    } else {
        AutomaticPreparationStatus::Partial
    };
    Ok(AutomaticPreparation {
        status,
        source_revisions: source_revisions.to_vec(),
        projection,
        coverage,
        blockers,
    })
}

fn validate_projection_selection(
    sessions: &[String],
    revisions: &[AnalysisRevisionRef],
    projection: &Value,
) -> Result<(), String> {
    let session_set = sessions.iter().cloned().collect::<BTreeSet<_>>();
    let projected_sessions = projection["sourceSessions"]
        .as_array()
        .ok_or("invalid_analysis_projection")?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or("invalid_analysis_projection")
        })
        .collect::<Result<BTreeSet<_>, _>>()?;
    if projected_sessions.len() != sessions.len() || projected_sessions != session_set {
        return Err("analysis_session_mismatch".into());
    }

    let projected_revisions =
        serde_json::from_value::<Vec<AnalysisRevisionRef>>(projection["sourceRevisions"].clone())
            .map_err(|_| "invalid_analysis_projection")?;
    validate_analysis_revisions(sessions, &projected_revisions)?;
    let expected = revisions
        .iter()
        .map(|reference| (reference.session_id.as_str(), reference))
        .collect::<BTreeMap<_, _>>();
    let actual = projected_revisions
        .iter()
        .map(|reference| (reference.session_id.as_str(), reference))
        .collect::<BTreeMap<_, _>>();
    if actual != expected {
        return Err("analysis_revision_mismatch".into());
    }
    Ok(())
}

fn resource_coverage(
    family: ProjectionFamily,
    value: &Value,
    allow_zero: bool,
) -> ProjectionFamilyCoverage {
    let sample_size = sample_size(value);
    let mean = value["meanPerLap"].as_f64();
    let usable_mean = mean.is_some_and(|number| {
        number.is_finite() && (number > 0.0 || (allow_zero && number == 0.0))
    });
    coverage(
        family,
        value,
        value["presence"] == "valid" && sample_size > 0 && usable_mean,
        sample_size,
        if usable_mean {
            None
        } else {
            Some("missing_family_value")
        },
    )
}

fn pace_coverage(projection: &Value, bucket: ClimateBucket) -> ProjectionFamilyCoverage {
    let family = &projection["representativePaceByClimateBucket"][bucket.as_str()];
    let usable = family["presence"] == "valid"
        && sample_size(family) > 0
        && family["medianLapSeconds"]
            .as_f64()
            .is_some_and(|value| value.is_finite() && value > 0.0);
    coverage(
        ProjectionFamily::Pace,
        family,
        usable,
        sample_size(family),
        if usable {
            None
        } else {
            Some("no_covered_pace_bucket")
        },
    )
}

fn tyre_coverage(value: &Value) -> ProjectionFamilyCoverage {
    let measured = ["byAxle", "byWheel", "byCorner", "lifeLapsByWheel"]
        .iter()
        .any(|key| valid_nonnegative_map(&value[*key]))
        || value["lifeLapsEstimate"]
            .as_i64()
            .is_some_and(|laps| laps > 0);
    let sample_size = sample_size(value);
    coverage(
        ProjectionFamily::TyreDegradation,
        value,
        value["presence"] == "valid" && sample_size > 0 && measured,
        sample_size,
        if measured {
            None
        } else {
            Some("missing_tyre_measurement")
        },
    )
}

fn saving_coverage(value: &Value) -> ProjectionFamilyCoverage {
    let levels = value["levels"].as_array();
    let available = value["presence"] == "valid"
        && levels.is_some_and(|levels| !levels.is_empty())
        && levels.is_some_and(|levels| {
            levels.iter().all(|level| {
                ["fuelSavedPerLap", "timeCostPerLap"]
                    .iter()
                    .all(|key| nonnegative_number(&level[*key]))
                    && (level["veSavedPerLap"].is_null()
                        || nonnegative_number(&level["veSavedPerLap"]))
            })
        });
    coverage(
        ProjectionFamily::SavingCost,
        value,
        available,
        sample_size(value),
        if available {
            None
        } else {
            Some("missing_saving_levels")
        },
    )
}

fn valid_nonnegative_map(value: &Value) -> bool {
    value
        .as_object()
        .is_some_and(|values| !values.is_empty() && values.values().all(nonnegative_number))
}

fn nonnegative_number(value: &Value) -> bool {
    value
        .as_f64()
        .is_some_and(|number| number.is_finite() && number >= 0.0)
}

fn sample_size(value: &Value) -> u64 {
    value["confidence"]["sampleSize"]
        .as_u64()
        .unwrap_or_default()
}

fn coverage(
    family: ProjectionFamily,
    value: &Value,
    available: bool,
    sample_size: u64,
    fallback_reason: Option<&'static str>,
) -> ProjectionFamilyCoverage {
    let reason = if available {
        None
    } else {
        value["reason"]
            .as_str()
            .filter(|reason| !reason.is_empty())
            .map(str::to_owned)
            .or_else(|| fallback_reason.map(str::to_owned))
            .or_else(|| Some("family_not_covered".into()))
    };
    ProjectionFamilyCoverage {
        family,
        available,
        sample_size,
        reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn references() -> Vec<AnalysisRevisionRef> {
        vec![
            AnalysisRevisionRef {
                session_id: "sess-026".into(),
                base_digest: "a".repeat(64),
                revision_id: "b".repeat(64),
                snapshot_id: "c".repeat(64),
            },
            AnalysisRevisionRef {
                session_id: "sess-125".into(),
                base_digest: "d".repeat(64),
                revision_id: "e".repeat(64),
                snapshot_id: "f".repeat(64),
            },
        ]
    }

    fn recorded_projection() -> Value {
        let mut projection: Value = serde_json::from_str(include_str!(
            "../../testdata/oracle/strategyinputprojection-v2-go.json"
        ))
        .expect("Go projection fixture");
        projection["sourceRevisions"] = serde_json::to_value(references()).expect("revision refs");
        projection
    }

    #[test]
    fn prepares_go_projection_with_family_specific_coverage() {
        let result = prepare_automatic(
            &["sess-026".into(), "sess-125".into()],
            &references(),
            recorded_projection(),
            ClimateBucket::Dry,
            VirtualEnergyApplicability::Applicable,
        )
        .expect("projection is valid");

        assert_eq!(result.status, AutomaticPreparationStatus::Ready);
        assert_eq!(result.blockers, []);
        assert!(result.coverage[&ProjectionFamily::FuelConsumption].available);
        assert!(result.coverage[&ProjectionFamily::VirtualEnergyConsumption].available);
        assert!(result.coverage[&ProjectionFamily::Pace].available);
        assert!(result.coverage[&ProjectionFamily::TyreDegradation].available);
        assert!(!result.coverage[&ProjectionFamily::SavingCost].available);
        assert_eq!(result.source_revisions, references());
    }

    #[test]
    fn missing_family_coverage_is_partial_and_never_filled() {
        let mut projection = recorded_projection();
        projection["fuelConsumption"]["presence"] = json!("missing");
        projection["representativePaceByClimateBucket"]["dry"]["presence"] = json!("stale");
        projection["representativePaceByClimateBucket"]["dry"]["reason"] = json!("source_stale");
        let result = prepare_automatic(
            &["sess-026".into(), "sess-125".into()],
            &references(),
            projection,
            ClimateBucket::Dry,
            VirtualEnergyApplicability::Applicable,
        )
        .expect("partial projections are accepted");
        assert_eq!(result.status, AutomaticPreparationStatus::Partial);
        assert_eq!(
            result.blockers,
            [ProjectionFamily::FuelConsumption, ProjectionFamily::Pace]
        );
        assert!(!result.coverage[&ProjectionFamily::FuelConsumption].available);
        assert!(!result.coverage[&ProjectionFamily::Pace].available);
    }

    #[test]
    fn refuses_session_or_revision_substitution() {
        let selected = ["sess-026".into(), "sess-125".into()];
        let mut cases = Vec::new();
        let mut other_session = recorded_projection();
        other_session["sourceSessions"][0] = json!("other");
        cases.push(("session", other_session, "analysis_session_mismatch"));
        let mut other_revision = recorded_projection();
        other_revision["sourceRevisions"][0]["revisionId"] = json!("0".repeat(64));
        cases.push(("revision", other_revision, "analysis_revision_mismatch"));
        for (name, projection, expected) in cases {
            assert_eq!(
                prepare_automatic(
                    &selected,
                    &references(),
                    projection,
                    ClimateBucket::Dry,
                    VirtualEnergyApplicability::Applicable,
                )
                .expect_err("substituted projection must fail"),
                expected,
                "{name}"
            );
        }
    }

    #[test]
    fn exact_revisions_are_required_even_for_an_unpinned_projection() {
        let mut projection = recorded_projection();
        projection
            .as_object_mut()
            .expect("projection object")
            .remove("sourceRevisions");
        assert_eq!(
            prepare_automatic(
                &["sess-026".into(), "sess-125".into()],
                &references(),
                projection,
                ClimateBucket::Dry,
                VirtualEnergyApplicability::Applicable,
            )
            .expect_err("an unpinned projection must fail"),
            "invalid_analysis_projection"
        );
    }

    #[test]
    fn virtual_energy_only_blocks_when_applicable_and_pace_is_climate_specific() {
        let sessions = ["sess-026".into(), "sess-125".into()];
        let mut projection = recorded_projection();
        projection["virtualEnergyConsumption"]["presence"] = json!("unsupported");
        projection["virtualEnergyConsumption"]["reason"] = json!("not_applicable");
        let pending = prepare_automatic(
            &sessions,
            &references(),
            projection.clone(),
            ClimateBucket::Dry,
            VirtualEnergyApplicability::NotApplicable,
        )
        .expect("VE does not apply to this class");
        assert_eq!(pending.status, AutomaticPreparationStatus::Ready);
        assert!(pending.blockers.is_empty());

        let applicable = prepare_automatic(
            &sessions,
            &references(),
            projection.clone(),
            ClimateBucket::Dry,
            VirtualEnergyApplicability::Applicable,
        )
        .expect("missing VE returns partial coverage");
        assert_eq!(
            applicable.blockers,
            [ProjectionFamily::VirtualEnergyConsumption]
        );

        let wet = prepare_automatic(
            &sessions,
            &references(),
            projection,
            ClimateBucket::Wet,
            VirtualEnergyApplicability::NotApplicable,
        )
        .expect("missing wet pace returns partial coverage");
        assert_eq!(wet.blockers, [ProjectionFamily::Pace]);
    }
}
