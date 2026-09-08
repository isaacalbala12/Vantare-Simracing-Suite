package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func correctionSourceExample(t *testing.T) AuthorizedSessionModel {
	t.Helper()
	session, pages := fixtureHistoricalInput(t, loadLapValidityFixture(t, "lap-validity-s266-v1.json"))
	model := catalogModel(t, session.ID, "Race", true, time.Unix(100, 0), strategyprojection.ClimateBucketDry)
	session.Provenance = model.Session.Provenance
	session.Provenance.SchemaFingerprint = "fixture-schema"
	model.Session = session
	validity, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	model.Validity = &validity
	return model
}

func TestCorrectionSourceUsesProducerIdentityAndSurvivesEncoding(t *testing.T) {
	model := correctionSourceExample(t)
	ref, err := CorrectionSourceFromModel(model)
	if err != nil {
		t.Fatal(err)
	}
	if ref.AnalysisVersion == "" || ref.SessionID != model.Session.ID || ref.ContentSHA256 != model.Artifact.Manifest().ContentSHA256 {
		t.Fatal("identity not from producer", ref)
	}
	bytes, err := json.Marshal(model.Validity)
	if err != nil {
		t.Fatal(err)
	}
	var decoded LapValidityAnalysis
	if err := json.Unmarshal(bytes, &decoded); err != nil {
		t.Fatal(err)
	}
	model.Validity = &decoded
	again, err := CorrectionSourceFromModel(model)
	if err != nil || ref != again {
		t.Fatal("base changed on encoding", err)
	}
	model.Validity.Temporal.LapBoundaries[0].Timestamp = model.Validity.Temporal.LapBoundaries[0].Timestamp.Add(time.Millisecond)
	changed, err := CorrectionSourceFromModel(model)
	if err != nil || changed.SegmentationDigest == ref.SegmentationDigest {
		t.Fatal("segmentation change not identified", err)
	}
}

func TestCorrectionSourceRejectsMissingOrMismatchedAuthority(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*AuthorizedSessionModel)
	}{
		{"no artifact", func(m *AuthorizedSessionModel) { m.Artifact = AuthorizedHistoricalArtifact{} }},
		{"different parser", func(m *AuthorizedSessionModel) { m.Session.Provenance.Parser.Version = "other" }},
		{"no schema", func(m *AuthorizedSessionModel) { m.Session.Provenance.SchemaFingerprint = "" }},
		{"no analysis", func(m *AuthorizedSessionModel) { m.Validity = nil }},
		{"legacy analysis", func(m *AuthorizedSessionModel) { m.Validity.ComputationVersion = "" }},
		{"different analysis", func(m *AuthorizedSessionModel) { m.Validity.ComputationVersion = "future" }},
		{"another session", func(m *AuthorizedSessionModel) { m.Validity.SessionID = "another-session" }},
		{"invalid boundary", func(m *AuthorizedSessionModel) { m.Validity.Temporal.LapBoundaries[0].Source = "invalid" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			model := correctionSourceExample(t)
			tt.mutate(&model)
			_, err := CorrectionSourceFromModel(model)
			if !errors.Is(err, ErrInvalidCorrectionSource) {
				t.Fatal("invalid base accepted", err)
			}
		})
	}
}
