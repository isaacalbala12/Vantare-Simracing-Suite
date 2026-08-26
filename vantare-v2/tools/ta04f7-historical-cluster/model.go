package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
)

const protocolSHA = "7d239baae99cc0f51911bc2fae1b0a1dac1cc0b3"

type Population struct {
	InventoryCandidates        int `json:"inventory_candidates"`
	Duplicates                 int `json:"duplicates"`
	AuthorizationRejected      int `json:"authorization_rejected"`
	StabilityRejected          int `json:"stability_rejected"`
	ArtifactGuardRejected      int `json:"artifact_guard_rejected"`
	DataInvalid                int `json:"data_invalid"`
	CanonicalRecordings        int `json:"canonical_recordings"`
	InsufficientLapsRecordings int `json:"insufficient_laps_recordings"`
	EligibleRecordings         int `json:"eligible_recordings"`
}
type Group struct {
	GroupOrdinal                   int    `json:"group_ordinal"`
	DiscoveredRecordings           int    `json:"discovered_recordings"`
	InsufficientLapsRecordings     int    `json:"insufficient_laps_recordings"`
	EligibleRecordings             int    `json:"eligible_recordings"`
	ContributingRecordings         int    `json:"contributing_recordings"`
	PassingRecordings              int    `json:"passing_recordings"`
	FailingRecordings              int    `json:"failing_recordings"`
	CrossfitInsufficientRecordings int    `json:"crossfit_insufficient_recordings"`
	EvaluatedSlots                 int    `json:"evaluated_slots"`
	PassedSlots                    int    `json:"passed_slots"`
	FailedThresholdSlots           int    `json:"failed_threshold_slots"`
	FailedEvalGeometrySlots        int    `json:"failed_eval_geometry_slots"`
	FailedTrainingFoldSlots        int    `json:"failed_training_fold_slots"`
	Decision                       string `json:"decision"`
	CrossRecordingConfidence       string `json:"cross_recording_confidence"`
}
type Cleanup struct {
	OpenReaders    int `json:"open_readers"`
	StagingEntries int `json:"staging_entries"`
	StagingRoots   int `json:"staging_roots"`
}
type Manifest struct {
	Version                 string     `json:"version"`
	ProtocolSHA             string     `json:"protocol_sha"`
	RunnerSHA               string     `json:"runner_sha"`
	Mode                    string     `json:"mode,omitempty"`
	Outcome                 string     `json:"outcome"`
	InventoryStable         bool       `json:"inventory_stable"`
	Population              Population `json:"population"`
	Groups                  []Group    `json:"groups"`
	Cleanup                 Cleanup    `json:"cleanup"`
	LocalShape              string     `json:"local_shape"`
	ProductMapAuthorization bool       `json:"product_map_authorization"`
}

func (m Manifest) Validate() error {
	if m.Version != "ta04f7/v1" || m.RunnerSHA == "" || !m.InventoryStable || m.Cleanup != (Cleanup{}) || m.LocalShape != "unknown" || m.ProductMapAuthorization {
		return errors.New("manifest semantics")
	}
	// mode is the single enumerated schema difference of the TA-04F8 control
	// manifest; it is bound to its own protocol SHA and to no other value.
	switch m.Mode {
	case "":
		if m.ProtocolSHA != protocolSHA {
			return errors.New("protocol")
		}
	case shapeMode:
		if m.ProtocolSHA != shapeProtocolSHA {
			return errors.New("protocol")
		}
	case liveShapeMode:
		if m.ProtocolSHA != liveProtocolSHA {
			return errors.New("protocol")
		}
	default:
		return errors.New("mode")
	}
	if m.Outcome != "analysis_complete" && m.Outcome != "stop_insufficient" && m.Outcome != "pipeline_fault" {
		return errors.New("outcome")
	}
	p := m.Population
	if p.InventoryCandidates < 0 || p.Duplicates < 0 || p.AuthorizationRejected < 0 || p.StabilityRejected < 0 || p.ArtifactGuardRejected < 0 || p.DataInvalid < 0 || p.CanonicalRecordings < 0 || p.InsufficientLapsRecordings < 0 || p.EligibleRecordings < 0 {
		return errors.New("negative population")
	}
	if p.InventoryCandidates != p.Duplicates+p.AuthorizationRejected+p.StabilityRejected+p.ArtifactGuardRejected+p.DataInvalid+p.CanonicalRecordings {
		return errors.New("population conservation")
	}
	var d, il, e int
	for i, g := range m.Groups {
		if g.GroupOrdinal != i+1 {
			return errors.New("group ordinal")
		}
		if g.Decision != "stop_insufficient" && g.Decision != "technical_no_go_local_shape" && g.Decision != "technical_go_local_shape" && g.Decision != "technical_go_local_shape_local_only" {
			return errors.New("decision")
		}
		if g.CrossRecordingConfidence != "none" && g.CrossRecordingConfidence != "limited" && g.CrossRecordingConfidence != "provisional" {
			return errors.New("confidence")
		}
		if g.Decision != decision(g.EligibleRecordings, g.PassingRecordings, g.FailingRecordings, g.CrossfitInsufficientRecordings) || g.CrossRecordingConfidence != confidence(g.ContributingRecordings) {
			return errors.New("derived group semantics")
		}
		if g.Decision == "technical_go_local_shape_local_only" && g.EligibleRecordings != 1 {
			return errors.New("local only")
		}
		if minGroup(g) < 0 || g.DiscoveredRecordings != g.InsufficientLapsRecordings+g.EligibleRecordings || g.EligibleRecordings != g.ContributingRecordings+g.CrossfitInsufficientRecordings || g.ContributingRecordings != g.PassingRecordings+g.FailingRecordings || g.EvaluatedSlots != g.PassedSlots+g.FailedThresholdSlots+g.FailedEvalGeometrySlots+g.FailedTrainingFoldSlots {
			return errors.New("group conservation")
		}
		d += g.DiscoveredRecordings
		il += g.InsufficientLapsRecordings
		e += g.EligibleRecordings
	}
	if d != p.CanonicalRecordings || il != p.InsufficientLapsRecordings || e != p.EligibleRecordings {
		return errors.New("group totals")
	}
	complete := false
	for _, g := range m.Groups {
		if g.Decision != "stop_insufficient" {
			complete = true
		}
	}
	expected := "stop_insufficient"
	if complete {
		expected = "analysis_complete"
	}
	if m.Outcome != expected {
		return errors.New("global outcome")
	}
	return nil
}
func minGroup(g Group) int {
	v := []int{g.GroupOrdinal, g.DiscoveredRecordings, g.InsufficientLapsRecordings, g.EligibleRecordings, g.ContributingRecordings, g.PassingRecordings, g.FailingRecordings, g.CrossfitInsufficientRecordings, g.EvaluatedSlots, g.PassedSlots, g.FailedThresholdSlots, g.FailedEvalGeometrySlots, g.FailedTrainingFoldSlots}
	m := v[0]
	for _, x := range v {
		if x < m {
			m = x
		}
	}
	return m
}
func encodeManifest(m Manifest) ([]byte, error) {
	if err := m.Validate(); err != nil {
		return nil, err
	}
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(b, '\n'), nil
}
func strictDecode(b []byte) (Manifest, error) {
	var m Manifest
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if err := d.Decode(&m); err != nil {
		return m, err
	}
	if d.More() {
		return m, errors.New("trailing")
	}
	if err := m.Validate(); err != nil {
		return m, err
	}
	canonical, err := encodeManifest(m)
	if err != nil || !bytes.Equal(b, canonical) {
		return m, errors.New("noncanonical schema order")
	}
	return m, nil
}
func validClass(v string) bool {
	switch v {
	case "duplicate", "authorization", "stability", "artifact_guard", "data_invalid", "insufficient_laps", "accepted":
		return true
	}
	return false
}
func syntheticManifest() ([]byte, error) {
	m, err := runExistingCore(context.Background(), RunConfig{ProtocolSHA: protocolSHA, RunnerSHA: "synthetic"}, newSyntheticBackend(), [32]byte{})
	if err != nil {
		return nil, err
	}
	return encodeManifest(m)
}
