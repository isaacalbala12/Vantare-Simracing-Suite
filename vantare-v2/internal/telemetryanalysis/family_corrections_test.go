package telemetryanalysis

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func lapFamilyCorrectionExample(t *testing.T) (SourceAnalysisRef, LapValidityAnalysis, LapFamilyUseCorrection) {
	t.Helper()
	base, _, _, _ := correctionExample()
	start := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	lap := AnalyzedLap{Number: 2, Start: &start, End: start.Add(90 * time.Second), Complete: true}
	lap.FamilyUse = familyUseForLap(lap)
	validity := LapValidityAnalysis{SessionID: base.SessionID, ComputationVersion: base.AnalysisVersion, Laps: []AnalyzedLap{lap}}
	validity.Temporal.ContractVersion = strategyprojection.ContractVersionTemporalSegmentsV1
	validity.Temporal.Segments = []strategyprojection.ContinuousSegment{{SessionStartTs: start, SessionEndTs: lap.End, Presence: strategyprojection.PresenceValid}}
	digest, err := correctionDigest("analysis.correction-segmentation.v1", validity.Temporal)
	if err != nil {
		t.Fatal(err)
	}
	base.SegmentationDigest = digest
	request := LapFamilyUseCorrection{Base: base, Target: LapCorrectionTarget{Number: lap.Number, Start: start, End: lap.End}, Family: FamilyCombinedStintPaceCurve, Included: false, Reason: "Reviewed lap: exclude pace only"}
	for _, use := range lap.FamilyUse {
		if use.Family == request.Family {
			request.Expected = use
		}
	}
	return base, validity, request
}

func TestLapFamilyCorrectionPreservesOtherFamiliesAndOriginal(t *testing.T) {
	base, validity, request := lapFamilyCorrectionExample(t)
	before := append([]LapFamilyUse(nil), validity.Laps[0].FamilyUse...)
	got, err := PrepareLapFamilyUseCorrection(base, validity, request)
	if err != nil {
		t.Fatal(err)
	}
	if got.Corrected.Included || !got.Original.Included || !reflect.DeepEqual(got.Corrected.ExclusionReasons, []LapExclusionReason{LapExclusionManual}) {
		t.Fatal("incorrect corrected/original use", got)
	}
	if !reflect.DeepEqual(before, validity.Laps[0].FamilyUse) || !familyIncluded(validity.Laps[0], FamilyFuelConsumption) || !familyIncluded(validity.Laps[0], FamilyVirtualEnergyConsumption) {
		t.Fatal("mutated original or unrelated family")
	}
	local := request
	local.Target.Start = local.Target.Start.In(time.FixedZone("local", 3600))
	again, err := PrepareLapFamilyUseCorrection(base, validity, local)
	if err != nil || again.CorrectionID != got.CorrectionID {
		t.Fatal("equivalent instant changed correction identity", err)
	}
}

func TestLapFamilyInclusionDoesNotCreateCoverage(t *testing.T) {
	for _, presence := range []strategyprojection.Presence{strategyprojection.PresenceUnknown, strategyprojection.PresenceMissing, strategyprojection.PresenceInvalid, strategyprojection.PresenceUnsupported} {
		t.Run(string(presence), func(t *testing.T) {
			base, validity, request := lapFamilyCorrectionExample(t)
			validity.Temporal.Segments[0].Presence = presence
			digest, err := correctionDigest("analysis.correction-segmentation.v1", validity.Temporal)
			if err != nil {
				t.Fatal(err)
			}
			base.SegmentationDigest = digest
			request.Base, request.Included = base, true
			if _, err := PrepareLapFamilyUseCorrection(base, validity, request); !errors.Is(err, ErrCorrectionValue) {
				t.Fatal("manual inclusion promoted missing coverage", err)
			}
		})
	}
}

func TestLapFamilyCorrectionRejectsUnresolvedAndChangedTargets(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(*LapValidityAnalysis, *LapFamilyUseCorrection)
		want error
	}{
		{"number only", func(_ *LapValidityAnalysis, r *LapFamilyUseCorrection) { r.Target.Start = time.Time{} }, ErrCorrectionTarget},
		{"different boundary", func(_ *LapValidityAnalysis, r *LapFamilyUseCorrection) { r.Target.End = r.Target.End.Add(time.Second) }, ErrCorrectionTarget},
		{"duplicate lap", func(v *LapValidityAnalysis, _ *LapFamilyUseCorrection) { v.Laps = append(v.Laps, v.Laps[0]) }, ErrCorrectionTarget},
		{"duplicate family", func(v *LapValidityAnalysis, r *LapFamilyUseCorrection) {
			v.Laps[0].FamilyUse = append(v.Laps[0].FamilyUse, r.Expected)
		}, ErrCorrectionTarget},
		{"changed original", func(_ *LapValidityAnalysis, r *LapFamilyUseCorrection) { r.Expected.Included = false }, ErrCorrectionPrecondition},
		{"unsupported family", func(_ *LapValidityAnalysis, r *LapFamilyUseCorrection) { r.Family = FamilyPit }, ErrInvalidCorrection},
		{"generic pace", func(_ *LapValidityAnalysis, r *LapFamilyUseCorrection) { r.Family = "pace" }, ErrInvalidCorrection},
		{"reason", func(_ *LapValidityAnalysis, r *LapFamilyUseCorrection) { r.Reason = " " }, ErrInvalidCorrection},
		{"source changed", func(_ *LapValidityAnalysis, r *LapFamilyUseCorrection) { r.Base.SizeBytes++ }, ErrCorrectionSourceChanged},
		{"analysis changed", func(v *LapValidityAnalysis, _ *LapFamilyUseCorrection) { v.ComputationVersion = "next" }, ErrCorrectionInterpretationChanged},
		{"include incomplete", func(v *LapValidityAnalysis, r *LapFamilyUseCorrection) { v.Laps[0].Complete = false; r.Included = true }, ErrCorrectionValue},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base, validity, request := lapFamilyCorrectionExample(t)
			tc.edit(&validity, &request)
			if _, err := PrepareLapFamilyUseCorrection(base, validity, request); !errors.Is(err, tc.want) {
				t.Fatalf("error %v, want %v", err, tc.want)
			}
		})
	}
}

func TestLapFamilyCorrectionRetainsReviewedExclusionWithoutAliasing(t *testing.T) {
	base, validity, request := lapFamilyCorrectionExample(t)
	request.Expected.Included = false
	request.Expected.ExclusionReasons = []LapExclusionReason{LapExclusionPaceOutlier}
	for i := range validity.Laps[0].FamilyUse {
		if validity.Laps[0].FamilyUse[i].Family == request.Family {
			validity.Laps[0].FamilyUse[i] = request.Expected
		}
	}
	request.Included = true
	got, err := PrepareLapFamilyUseCorrection(base, validity, request)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Corrected.Included || len(got.Corrected.ExclusionReasons) != 0 || got.Original.Included {
		t.Fatal("review did not preserve original exclusion", got)
	}
	got.Request.Expected.ExclusionReasons[0] = LapExclusionManual
	if got.Original.ExclusionReasons[0] != LapExclusionPaceOutlier || request.Expected.ExclusionReasons[0] != LapExclusionPaceOutlier {
		t.Fatal("retained mutable caller collection")
	}
}
