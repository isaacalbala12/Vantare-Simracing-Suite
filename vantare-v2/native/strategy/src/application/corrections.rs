//! Exact, local preparation of Analysis-owned per-family corrections.
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{AnalysisRevisionRef, validate_analysis_revisions};

const MAX_FAMILY_CORRECTIONS: usize = 256;
const TEMPORAL_CONTRACT_V1: &str = "temporalsegments.v1";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum CorrectionFamily {
    FuelConsumption,
    VirtualEnergyConsumption,
    CombinedStintPaceCurve,
    TyreDegradation,
    SavingCost,
}

impl CorrectionFamily {
    fn as_str(self) -> &'static str {
        match self {
            Self::FuelConsumption => "fuel_consumption",
            Self::VirtualEnergyConsumption => "virtual_energy_consumption",
            Self::CombinedStintPaceCurve => "combined_stint_pace_curve",
            Self::TyreDegradation => "tyre_degradation",
            Self::SavingCost => "saving_cost",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceAnalysisRef {
    pub session_id: String,
    pub content_sha256: String,
    pub size_bytes: i64,
    pub parser_id: String,
    pub parser_version: String,
    pub schema_fingerprint: String,
    pub analysis_version: String,
    pub segmentation_digest: String,
}

impl SourceAnalysisRef {
    /// Returns the Go correction-base identity for this exact source.
    pub fn digest(&self) -> Result<String, String> {
        for value in [
            &self.session_id,
            &self.parser_id,
            &self.parser_version,
            &self.schema_fingerprint,
            &self.analysis_version,
        ] {
            if !valid_text(value, 256) {
                return Err("invalid_correction_base".into());
            }
        }
        if self.size_bytes <= 0
            || !is_digest(&self.content_sha256)
            || !is_digest(&self.segmentation_digest)
        {
            return Err("invalid_correction_base".into());
        }
        digest_json("analysis.correction-base.v1", self)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LapExclusionReason {
    Incomplete,
    OutLap,
    InLap,
    Pit,
    IncidentOfftrack,
    PaceOutlier,
    ManualExclusion,
}

impl LapExclusionReason {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Incomplete => "incomplete",
            Self::OutLap => "out_lap",
            Self::InLap => "in_lap",
            Self::Pit => "pit",
            Self::IncidentOfftrack => "incident_offtrack",
            Self::PaceOutlier => "pace_outlier",
            Self::ManualExclusion => "manual_exclusion",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FamilyUse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correction_id: Option<String>,
    pub family: CorrectionFamily,
    pub included: bool,
    pub exclusion_reasons: Option<Vec<LapExclusionReason>>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidityLap {
    pub number: i64,
    pub start: String,
    pub end: String,
    pub complete: bool,
    pub family_use: Vec<FamilyUse>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuousCoverage {
    pub start: String,
    pub end: String,
    pub presence: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoverageGap {
    pub start: String,
    pub end: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisValidity {
    pub session_id: String,
    pub computation_version: String,
    pub temporal_contract_version: String,
    pub segmentation_digest: String,
    pub laps: Vec<ValidityLap>,
    pub segments: Vec<ContinuousCoverage>,
    pub gaps: Vec<CoverageGap>,
}

/// Exact Analysis inputs used to prepare a family correction.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CorrectionSource {
    pub base: SourceAnalysisRef,
    pub revision: AnalysisRevisionRef,
    pub validity: AnalysisValidity,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FamilyCorrectionTarget {
    pub number: i64,
    pub start: String,
    pub end: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FamilyCorrectionRequest {
    pub base: SourceAnalysisRef,
    pub target: FamilyCorrectionTarget,
    pub family: CorrectionFamily,
    pub expected: FamilyUse,
    pub included: bool,
    pub reason: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreparedFamilyCorrection {
    pub base_id: String,
    pub correction_id: String,
    pub request: FamilyCorrectionRequest,
    pub original: FamilyUse,
    pub corrected: FamilyUse,
}

/// Prepares a sorted correction set against one exact Analysis revision.
pub fn prepare_family_corrections(
    source: &CorrectionSource,
    selected_revisions: &[AnalysisRevisionRef],
    requests: &[FamilyCorrectionRequest],
) -> Result<Vec<PreparedFamilyCorrection>, String> {
    if requests.len() > MAX_FAMILY_CORRECTIONS {
        return Err("invalid_correction_set".into());
    }
    validate_correction_source(source, selected_revisions)?;

    let mut prepared = requests
        .iter()
        .map(|request| prepare_one(source, request.clone()))
        .collect::<Result<Vec<_>, _>>()?;
    prepared.sort_by(|left, right| {
        left.request
            .family
            .as_str()
            .cmp(right.request.family.as_str())
            .then_with(|| left.request.target.start.cmp(&right.request.target.start))
            .then_with(|| left.request.target.end.cmp(&right.request.target.end))
            .then_with(|| left.request.target.number.cmp(&right.request.target.number))
    });
    for pair in prepared.windows(2) {
        let previous = &pair[0].request;
        let current = &pair[1].request;
        if previous.family == current.family && current.target.start < previous.target.end {
            return Err("overlapping_corrections".into());
        }
    }
    Ok(prepared)
}

/// Reapplies a prepared set to an effective view without changing unrelated families.
pub fn apply_family_corrections(
    source: &CorrectionSource,
    selected_revisions: &[AnalysisRevisionRef],
    effective_laps: &[ValidityLap],
    corrections: &[PreparedFamilyCorrection],
) -> Result<Vec<ValidityLap>, String> {
    let requests = corrections
        .iter()
        .map(|correction| correction.request.clone())
        .collect::<Vec<_>>();
    let checked = prepare_family_corrections(source, selected_revisions, &requests)?;
    if checked != corrections {
        return Err("invalid_correction_set".into());
    }

    let mut result = effective_laps.to_vec();
    for correction in &checked {
        let (target_start, target_end) = parse_target(&correction.request.target)?;
        let mut matching_lap = None;
        let mut matching_use = None;
        for (lap_index, lap) in result.iter().enumerate() {
            if lap.number != correction.request.target.number
                || parse_time(&lap.start)? != target_start
                || parse_time(&lap.end)? != target_end
            {
                continue;
            }
            if matching_lap.is_some() {
                return Err("unresolved_correction_target".into());
            }
            matching_lap = Some(lap_index);
            for (use_index, family_use) in lap.family_use.iter().enumerate() {
                if family_use.family == correction.request.family {
                    if matching_use.is_some() {
                        return Err("unresolved_correction_target".into());
                    }
                    matching_use = Some(use_index);
                }
            }
        }
        let (Some(lap_index), Some(use_index)) = (matching_lap, matching_use) else {
            return Err("unresolved_correction_target".into());
        };
        let lap = &mut result[lap_index];
        if correction.request.included {
            validate_inclusion(&source.validity, lap)?;
        }
        let family_use = &mut lap.family_use[use_index];
        family_use.included = correction.request.included;
        family_use.correction_id = Some(correction.correction_id.clone());
        if family_use.included {
            family_use.exclusion_reasons = None;
        } else {
            let reasons = family_use.exclusion_reasons.get_or_insert_with(Vec::new);
            if !reasons
                .iter()
                .any(|reason| reason.as_str() == "manual_exclusion")
            {
                reasons.push(LapExclusionReason::ManualExclusion);
            }
        }
    }
    Ok(result)
}

/// Continues a saved exact revision only while Analysis still exposes that same reference.
pub fn continue_with_analysis_revision(
    saved: &AnalysisRevisionRef,
    available_revisions: &[AnalysisRevisionRef],
) -> Result<AnalysisRevisionRef, String> {
    validate_analysis_revisions(
        std::slice::from_ref(&saved.session_id),
        std::slice::from_ref(saved),
    )?;
    let matches = available_revisions
        .iter()
        .filter(|available| *available == saved)
        .count();
    if matches != 1 {
        return Err("analysis_revision_unavailable".into());
    }
    Ok(saved.clone())
}

fn validate_correction_source(
    source: &CorrectionSource,
    selected_revisions: &[AnalysisRevisionRef],
) -> Result<String, String> {
    let base_id = source.base.digest()?;
    if source.revision.session_id != source.base.session_id
        || source.revision.base_digest != base_id
        || source.validity.session_id != source.base.session_id
        || source.validity.computation_version != source.base.analysis_version
        || source.validity.temporal_contract_version != TEMPORAL_CONTRACT_V1
        || source.validity.segmentation_digest != source.base.segmentation_digest
    {
        return Err("analysis_interpretation_changed".into());
    }
    validate_analysis_revisions(
        std::slice::from_ref(&source.base.session_id),
        std::slice::from_ref(&source.revision),
    )?;
    let selected_for_session = selected_revisions
        .iter()
        .filter(|revision| revision.session_id == source.base.session_id)
        .collect::<Vec<_>>();
    if selected_for_session.len() != 1 || selected_for_session[0] != &source.revision {
        return Err("analysis_revision_mismatch".into());
    }
    Ok(base_id)
}

fn prepare_one(
    source: &CorrectionSource,
    mut request: FamilyCorrectionRequest,
) -> Result<PreparedFamilyCorrection, String> {
    let base_id = source.base.digest()?;
    if request.base != source.base {
        return Err("analysis_revision_mismatch".into());
    }
    if request.expected.correction_id.is_some()
        || request.expected.family != request.family
        || !valid_text(&request.reason, 1024)
    {
        return Err("invalid_family_correction".into());
    }
    if request.target.number < 0 {
        return Err("unresolved_correction_target".into());
    }
    let (target_start, target_end) = parse_target(&request.target)?;
    request.target.start = format_time(target_start);
    request.target.end = format_time(target_end);

    let mut matched_lap = None;
    let mut original = None;
    for lap in &source.validity.laps {
        if lap.number != request.target.number
            || parse_time(&lap.start)? != target_start
            || parse_time(&lap.end)? != target_end
        {
            continue;
        }
        if matched_lap.is_some() {
            return Err("unresolved_correction_target".into());
        }
        matched_lap = Some(lap);
        for family_use in &lap.family_use {
            if family_use.family == request.family {
                if original.is_some() {
                    return Err("unresolved_correction_target".into());
                }
                original = Some(family_use);
            }
        }
    }
    let (Some(lap), Some(original)) = (matched_lap, original) else {
        return Err("unresolved_correction_target".into());
    };
    if original.correction_id.is_some() || original != &request.expected {
        return Err("correction_precondition_changed".into());
    }
    if request.included {
        if request
            .expected
            .exclusion_reasons
            .as_ref()
            .is_some_and(|reasons| reasons.iter().any(|reason| reason.as_str() == "incomplete"))
        {
            return Err("incompatible_correction_value".into());
        }
        validate_inclusion(&source.validity, lap)?;
    }

    let correction_id = digest_json("analysis.lap-family-correction.v1", &request)?;
    let corrected = if request.included {
        FamilyUse {
            correction_id: None,
            family: request.family,
            included: true,
            exclusion_reasons: None,
        }
    } else {
        let mut reasons = match &request.expected.exclusion_reasons {
            Some(reasons) => reasons.clone(),
            None => Vec::new(),
        };
        if !reasons
            .iter()
            .any(|reason| reason.as_str() == "manual_exclusion")
        {
            reasons.push(LapExclusionReason::ManualExclusion);
        }
        FamilyUse {
            correction_id: None,
            family: request.family,
            included: false,
            exclusion_reasons: Some(reasons),
        }
    };
    Ok(PreparedFamilyCorrection {
        base_id,
        correction_id,
        original: request.expected.clone(),
        corrected,
        request,
    })
}

fn validate_inclusion(validity: &AnalysisValidity, lap: &ValidityLap) -> Result<(), String> {
    if !lap.complete || parse_time(&lap.start)? >= parse_time(&lap.end)? {
        return Err("incompatible_correction_value".into());
    }
    let start = parse_time(&lap.start)?;
    let end = parse_time(&lap.end)?;
    for gap in &validity.gaps {
        if start < parse_time(&gap.end)? && end > parse_time(&gap.start)? {
            return Err("incompatible_correction_value".into());
        }
    }
    let covered = validity.segments.iter().any(|segment| {
        let Ok(segment_start) = parse_time(&segment.start) else {
            return false;
        };
        let Ok(segment_end) = parse_time(&segment.end) else {
            return false;
        };
        start >= segment_start
            && end <= segment_end
            && matches!(segment.presence.as_str(), "valid" | "stale")
    });
    if !covered {
        return Err("incompatible_correction_value".into());
    }
    Ok(())
}

fn parse_target(target: &FamilyCorrectionTarget) -> Result<(DateTime<Utc>, DateTime<Utc>), String> {
    let start = parse_time(&target.start)?;
    let end = parse_time(&target.end)?;
    if start >= end {
        return Err("unresolved_correction_target".into());
    }
    Ok((start, end))
}

fn parse_time(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|time| time.with_timezone(&Utc))
        .map_err(|_| "invalid_correction_timestamp".into())
}

fn format_time(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::AutoSi, true)
}

fn digest_json<T: Serialize>(domain: &str, value: &T) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(|_| "invalid_correction_json")?;
    let mut digest = Sha256::new();
    digest.update(domain.as_bytes());
    digest.update(b"\n");
    digest.update(bytes);
    let bytes = digest.finalize();
    let mut result = String::with_capacity(64);
    for byte in bytes {
        use std::fmt::Write as _;
        write!(&mut result, "{byte:02x}").map_err(|_| "invalid_correction_digest")?;
    }
    Ok(result)
}

fn valid_text(value: &str, maximum_bytes: usize) -> bool {
    value.len() <= maximum_bytes && !value.trim().is_empty()
}

fn is_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn example() -> (
        CorrectionSource,
        Vec<AnalysisRevisionRef>,
        FamilyCorrectionRequest,
    ) {
        let base = SourceAnalysisRef {
            session_id: "session-1".into(),
            content_sha256: "a".repeat(64),
            size_bytes: 64,
            parser_id: "parser".into(),
            parser_version: "1".into(),
            schema_fingerprint: "schema".into(),
            analysis_version: "analysis-v1".into(),
            segmentation_digest: "b7f2e7a8f6d3c1a0b7f2e7a8f6d3c1a0b7f2e7a8f6d3c1a0b7f2e7a8f6d3c1a0"
                .into(),
        };
        let base_id = base.digest().expect("valid Go-compatible source digest");
        let revision = AnalysisRevisionRef {
            session_id: base.session_id.clone(),
            base_digest: base_id,
            revision_id: "c".repeat(64),
            snapshot_id: "d".repeat(64),
        };
        let start = "2026-09-10T12:00:00Z";
        let end = "2026-09-10T12:01:30Z";
        let original = FamilyUse {
            correction_id: None,
            family: CorrectionFamily::CombinedStintPaceCurve,
            included: true,
            exclusion_reasons: None,
        };
        let validity = AnalysisValidity {
            session_id: base.session_id.clone(),
            computation_version: base.analysis_version.clone(),
            temporal_contract_version: TEMPORAL_CONTRACT_V1.into(),
            segmentation_digest: base.segmentation_digest.clone(),
            laps: vec![ValidityLap {
                number: 2,
                start: start.into(),
                end: end.into(),
                complete: true,
                family_use: vec![original.clone()],
            }],
            segments: vec![ContinuousCoverage {
                start: start.into(),
                end: end.into(),
                presence: "valid".into(),
            }],
            gaps: Vec::new(),
        };
        let source = CorrectionSource {
            base: base.clone(),
            revision: revision.clone(),
            validity,
        };
        let request = FamilyCorrectionRequest {
            base,
            target: FamilyCorrectionTarget {
                number: 2,
                start: start.into(),
                end: end.into(),
            },
            family: CorrectionFamily::CombinedStintPaceCurve,
            expected: original,
            included: false,
            reason: "Reviewed lap: exclude pace only".into(),
        };
        (source, vec![revision], request)
    }

    #[test]
    fn correction_identity_matches_go_json_sha256_golden() {
        let (source, selected, request) = example();
        let prepared =
            prepare_family_corrections(&source, &selected, &[request]).expect("valid correction");
        let golden: Value = serde_json::from_str(include_str!(
            "../../testdata/oracle/family-correction-v1-go.json"
        ))
        .expect("Go generated correction fixture");
        assert_eq!(prepared[0].base_id, golden["baseId"]);
        assert_eq!(prepared[0].correction_id, golden["correctionId"]);
        assert_eq!(prepared[0].request.target.start, "2026-09-10T12:00:00Z");
        assert_eq!(prepared[0].request.target.end, "2026-09-10T12:01:30Z");
    }

    #[test]
    fn family_corrections_require_exact_revision_and_coverage() {
        for family in [
            CorrectionFamily::FuelConsumption,
            CorrectionFamily::VirtualEnergyConsumption,
            CorrectionFamily::CombinedStintPaceCurve,
            CorrectionFamily::TyreDegradation,
            CorrectionFamily::SavingCost,
        ] {
            let (mut source, selected, mut request) = example();
            source.validity.laps[0].family_use[0].family = family;
            request.family = family;
            request.expected.family = family;
            assert!(prepare_family_corrections(&source, &selected, &[request.clone()]).is_ok());

            let mut substituted = selected.clone();
            substituted[0].snapshot_id = "e".repeat(64);
            assert!(prepare_family_corrections(&source, &substituted, &[request.clone()]).is_err());

            source.validity.segments[0].presence = "missing".into();
            request.included = true;
            assert!(prepare_family_corrections(&source, &selected, &[request]).is_err());
        }
    }

    #[test]
    fn correction_set_rejects_same_family_overlap_and_keeps_other_family() {
        let (source, selected, request) = example();
        assert_eq!(
            prepare_family_corrections(&source, &selected, &[request.clone(), request.clone()])
                .expect_err("overlap is rejected"),
            "overlapping_corrections"
        );

        let corrections = prepare_family_corrections(&source, &selected, &[request])
            .expect("prepared correction");
        let mut effective = source.validity.laps.clone();
        effective[0].family_use.push(FamilyUse {
            correction_id: None,
            family: CorrectionFamily::FuelConsumption,
            included: true,
            exclusion_reasons: None,
        });
        let applied = apply_family_corrections(&source, &selected, &effective, &corrections)
            .expect("apply family only");
        assert_eq!(
            applied[0].family_use[0].correction_id,
            Some(corrections[0].correction_id.clone())
        );
        assert_eq!(
            applied[0].family_use[1].family,
            CorrectionFamily::FuelConsumption
        );
        assert_eq!(
            applied[0].family_use[0].exclusion_reasons,
            Some(vec![LapExclusionReason::ManualExclusion])
        );
    }

    #[test]
    fn continue_requires_saved_revision_without_replacement() {
        let (source, selected, _) = example();
        assert_eq!(
            continue_with_analysis_revision(&selected[0], &selected),
            Ok(selected[0].clone())
        );
        let latest = AnalysisRevisionRef {
            revision_id: "f".repeat(64),
            ..selected[0].clone()
        };
        assert_eq!(
            continue_with_analysis_revision(&selected[0], &[latest])
                .expect_err("saved ref missing"),
            "analysis_revision_unavailable"
        );
        assert_eq!(source.revision, selected[0]);
    }

    #[test]
    fn malformed_base_and_incomplete_inclusion_are_rejected() {
        let (mut source, selected, mut request) = example();
        source.validity.laps[0].complete = false;
        request.included = true;
        assert!(prepare_family_corrections(&source, &selected, &[request]).is_err());

        let (source, selected, mut request) = example();
        request.reason = " \n".into();
        assert!(prepare_family_corrections(&source, &selected, &[request]).is_err());
    }
}
