package telemetryanalysis

import (
	"errors"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
	"testing"
	"time"
)

func TestCorrectionLapInspectionShowsOriginalEffectiveAndCapabilities(t *testing.T) {
	base, original, request := lapFamilyCorrectionExample(t)
	snapshot, err := PrepareObservationCorrectionSnapshot(base, nil, original, []LapFamilyUseCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	input := CorrectionInput{Base: base, Session: HistoricalSession{ID: base.SessionID}, Validity: original}
	page, err := InspectCorrectionLaps(input, snapshot, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || len(page.Laps) != 1 || page.SnapshotID != snapshot.SnapshotID {
		t.Fatal("lost pagination or identity")
	}
	row := page.Laps[0]
	if row.Target == nil || row.Effective == nil || row.StintBoundary != nil || !familyIncluded(row.Original, request.Family) || familyIncluded(*row.Effective, request.Family) {
		t.Fatal("lost original/effective distinction or invented stint")
	}
	for _, capability := range row.Capabilities {
		if !capability.CanExclude || !capability.CanInclude {
			t.Fatal("complete covered lap unavailable", capability)
		}
	}
	*row.Original.Start = row.Original.Start.Add(time.Hour)
	row.Effective.FamilyUse[0].Included = false
	if !original.Laps[0].Start.Equal(request.Target.Start) || !original.Laps[0].FamilyUse[0].Included {
		t.Fatal("inspection aliases input")
	}
	beyond, err := InspectCorrectionLaps(input, snapshot, 100, 50)
	if err != nil || len(beyond.Laps) != 0 || beyond.Total != 1 {
		t.Fatal("bad end page", err)
	}
	if _, err := InspectCorrectionLaps(input, snapshot, 0, 51); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("page limit ignored", err)
	}
	snapshot.SnapshotID = "tampered"
	if _, err := InspectCorrectionLaps(input, snapshot, 0, 1); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("tampered revision inspected", err)
	}
}

func TestCorrectionLapInspectionDoesNotAdvertiseUnsafeInclusion(t *testing.T) {
	for _, mode := range []string{"unknown coverage", "incomplete", "missing start", "duplicate target"} {
		t.Run(mode, func(t *testing.T) {
			base, original, _ := lapFamilyCorrectionExample(t)
			switch mode {
			case "unknown coverage":
				original.Temporal.Segments[0].Presence = strategyprojection.PresenceUnknown
			case "incomplete":
				original.Laps[0].Complete = false
			case "missing start":
				original.Laps[0].Start = nil
			case "duplicate target":
				original.Laps = append(original.Laps, original.Laps[0])
			}
			var err error
			base.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", original.Temporal)
			if err != nil {
				t.Fatal(err)
			}
			snapshot, err := PrepareSampleCorrectionSnapshot(base, nil)
			if err != nil {
				t.Fatal(err)
			}
			input := CorrectionInput{Base: base, Session: HistoricalSession{ID: base.SessionID}, Validity: original}
			page, err := InspectCorrectionLaps(input, snapshot, 0, 50)
			if err != nil {
				t.Fatal(err)
			}
			for _, capability := range page.Laps[0].Capabilities {
				if capability.CanInclude || capability.Reason == "" {
					t.Fatal("unsafe inclusion advertised", capability)
				}
				wantExclude := mode == "unknown coverage" || mode == "incomplete"
				if capability.CanExclude != wantExclude {
					t.Fatal("wrong exclusion capability", capability)
				}
			}
		})
	}
}

func TestInspectionStintBoundaryIsRecordedDetachedAndUnambiguous(t *testing.T) {
	at := fixtureTime(100)
	value := 2.0
	boundaries := []strategyprojection.StintBoundary{{StintNumber: 2, Timestamp: fixtureTime(50), Presence: strategyprojection.PresenceUnknown, Confidence: strategyprojection.Confidence{RangeLower: &value}}, {StintNumber: 3, Timestamp: fixtureTime(120)}}
	got := precedingRecordedStintBoundary(at, boundaries)
	if got == nil || got.StintNumber != 2 || got.Presence != strategyprojection.PresenceUnknown {
		t.Fatal("invented boundary quality")
	}
	*got.Confidence.RangeLower = 99
	if value != 2 {
		t.Fatal("stint metadata aliases input")
	}
	if precedingRecordedStintBoundary(fixtureTime(1), boundaries) != nil {
		t.Fatal("invented initial stint")
	}
	boundaries = append(boundaries, boundaries[0])
	if precedingRecordedStintBoundary(at, boundaries) != nil {
		t.Fatal("ambiguous boundary selected")
	}
}

func TestInspectionReportsConsumerRuleRatherThanOnlyRawUseFlag(t *testing.T) {
	base, original, request := lapFamilyCorrectionExample(t)
	original.Laps[0].Labels = append(original.Laps[0].Labels, LapLabelTraffic)
	request.Included = true
	snapshot, err := PrepareObservationCorrectionSnapshot(base, nil, original, []LapFamilyUseCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	page, err := InspectCorrectionLaps(CorrectionInput{Base: base, Session: HistoricalSession{ID: base.SessionID}, Validity: original}, snapshot, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, capability := range page.Laps[0].Capabilities {
		if capability.EffectiveIncluded == nil {
			t.Fatal("resolved effective rule missing")
		}
		switch capability.Family {
		case FamilyCombinedStintPaceCurve:
			if capability.AutomaticIncluded || !*capability.EffectiveIncluded {
				t.Fatal("explicit traffic inclusion ignored")
			}
		case FamilySavingCost:
			if capability.AutomaticIncluded || *capability.EffectiveIncluded {
				t.Fatal("pace decision leaked to saving")
			}
		default:
			if !capability.AutomaticIncluded || !*capability.EffectiveIncluded {
				t.Fatal("traffic changed unrelated rule")
			}
		}
	}
	original.Laps = append(original.Laps, original.Laps[0])
	empty, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	unresolved, err := InspectCorrectionLaps(CorrectionInput{Base: base, Session: HistoricalSession{ID: base.SessionID}, Validity: original}, empty, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, capability := range unresolved.Laps[0].Capabilities {
		if capability.EffectiveIncluded != nil {
			t.Fatal("unresolved rule presented as known")
		}
	}
}
