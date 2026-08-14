package main

import "errors"

const liveProtocolSHA = "d278e7599c4a0acbac720ff23b0e73916757dd57"
const liveAuthorizationSHA = "f0f8c9ffe5e825c4bf65d045b17338e9e4c1c78b"
const liveShapeMode = "existing-live-inventory-shape"

var expectedLiveShapeOutputPath = projectOutputPath("ta04f9-shape-export-v1.json")
var expectedLiveControlOutputPath = projectOutputPath("ta04f9-historical-cluster-manifest-v1.json")

const (
	liveBaselineCandidates   = 319
	liveBaselineCanonical    = 186
	liveBaselineInsufficient = 183
	liveBaselineInvalid      = 133
	liveBaselineEligible     = 3
	liveBaselineGroupCount   = 48
)

// validateLiveInventoryControl is the preregistered TA-04F9 C1-C5 gate. It
// compares only the accepted TA-04F7 freeze-v2 baseline and never consumes a
// rejected TA-04F7/TA-04F8 artifact.
func validateLiveInventoryControl(freeze, current Manifest) error {
	if err := freeze.Validate(); err != nil || freeze.Mode != "" || len(freeze.Groups) != liveBaselineGroupCount {
		return errors.New("live baseline")
	}
	fp := freeze.Population
	if fp.InventoryCandidates != liveBaselineCandidates || fp.CanonicalRecordings != liveBaselineCanonical ||
		fp.InsufficientLapsRecordings != liveBaselineInsufficient || fp.DataInvalid != liveBaselineInvalid ||
		fp.EligibleRecordings != liveBaselineEligible || fp.Duplicates != 0 || fp.AuthorizationRejected != 0 ||
		fp.StabilityRejected != 0 || fp.ArtifactGuardRejected != 0 {
		return errors.New("live baseline population")
	}
	if err := current.Validate(); err != nil {
		return errors.New("live manifest")
	}
	if current.ProtocolSHA != liveProtocolSHA || current.Mode != liveShapeMode {
		return errors.New("live header")
	}
	if len(current.Groups) < liveBaselineGroupCount {
		return errors.New("C1 group count")
	}
	for i := 0; i < liveBaselineGroupCount; i++ {
		if current.Groups[i] != freeze.Groups[i] {
			return errors.New("C1 prefix")
		}
	}
	var added int
	for _, g := range current.Groups[liveBaselineGroupCount:] {
		if g.GroupOrdinal < liveBaselineGroupCount+1 || g.DiscoveredRecordings < 1 ||
			g.DiscoveredRecordings != g.InsufficientLapsRecordings || g.EligibleRecordings != 0 ||
			g.ContributingRecordings != 0 || g.PassingRecordings != 0 || g.FailingRecordings != 0 ||
			g.CrossfitInsufficientRecordings != 0 || g.EvaluatedSlots != 0 || g.PassedSlots != 0 ||
			g.FailedThresholdSlots != 0 || g.FailedEvalGeometrySlots != 0 || g.FailedTrainingFoldSlots != 0 ||
			g.Decision != "stop_insufficient" || g.CrossRecordingConfidence != "none" {
			return errors.New("C2 additive group")
		}
		added += g.DiscoveredRecordings
	}
	p := current.Population
	dCandidates := p.InventoryCandidates - liveBaselineCandidates
	dCanonical := p.CanonicalRecordings - liveBaselineCanonical
	dInsufficient := p.InsufficientLapsRecordings - liveBaselineInsufficient
	dInvalid := p.DataInvalid - liveBaselineInvalid
	if dCandidates < 0 || dCanonical < 0 || dInsufficient < 0 || dInvalid < 0 ||
		p.Duplicates != 0 || p.AuthorizationRejected != 0 || p.StabilityRejected != 0 || p.ArtifactGuardRejected != 0 ||
		p.EligibleRecordings != liveBaselineEligible || dCandidates != dCanonical+dInvalid ||
		dCanonical != dInsufficient || dCanonical != added {
		return errors.New("C3 population")
	}
	if current.Groups[0].Decision != "technical_go_local_shape_local_only" || current.Groups[0].CrossRecordingConfidence != "none" ||
		current.Groups[36].Decision != "technical_go_local_shape_local_only" || current.Groups[36].CrossRecordingConfidence != "none" ||
		current.Groups[35].Decision != "technical_no_go_local_shape" {
		return errors.New("C4 decisions")
	}
	if current.Outcome != "analysis_complete" || !current.InventoryStable || current.Cleanup != (Cleanup{}) ||
		current.LocalShape != "unknown" || current.ProductMapAuthorization {
		return errors.New("C5 state")
	}
	return nil
}
