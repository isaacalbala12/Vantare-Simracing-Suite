package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
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

func mixedInspectionExample(t *testing.T) (SourceAnalysisRef, CorrectionInput, PreparedSampleCorrectionSnapshot, LapFamilyUseCorrection) {
	t.Helper()
	base, original, family := lapFamilyCorrectionExample(t)
	session := mixedSnapshotSession(base)
	snapshot, err := PrepareMixedCorrectionSnapshot(base, nil, original,
		[]LapFamilyUseCorrection{family}, session, mixedSnapshotClassRequests(base))
	if err != nil {
		t.Fatal(err)
	}
	return base, CorrectionInput{Base: base, Session: session, Validity: original}, snapshot, family
}

func TestCorrectionLapInspectionAcceptsMixedClassification(t *testing.T) {
	_, input, snapshot, _ := mixedInspectionExample(t)
	page, err := InspectCorrectionLaps(input, snapshot, 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || page.SnapshotID != snapshot.SnapshotID {
		t.Fatal("lost v3 identity")
	}
	if page.Total != len(input.Validity.Laps) || len(page.Laps) == 0 || len(page.Laps[0].Capabilities) != len(CorrectableLapFamilies()) {
		t.Fatal("lost pagination or physical capabilities")
	}
}

func TestCorrectionLapInspectionMatchesV2ExceptIdentity(t *testing.T) {
	base, input, snapshot, family := mixedInspectionExample(t)
	mixed, err := InspectCorrectionLaps(input, snapshot, 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := PrepareObservationCorrectionSnapshot(base, nil, input.Validity, []LapFamilyUseCorrection{family})
	if err != nil {
		t.Fatal(err)
	}
	observed, err := InspectCorrectionLaps(input, plain, 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	mixed.SnapshotID, observed.SnapshotID = "", ""
	if !reflect.DeepEqual(mixed, observed) {
		t.Fatal("labels changed physical inspection")
	}
}

func TestCorrectionLapInspectionAcceptsClassificationAlone(t *testing.T) {
	base, original, _ := lapFamilyCorrectionExample(t)
	session := mixedSnapshotSession(base)
	snapshot, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, mixedSnapshotClassRequests(base))
	if err != nil {
		t.Fatal(err)
	}
	input := CorrectionInput{Base: base, Session: session, Validity: original}
	page, err := InspectCorrectionLaps(input, snapshot, 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if page.SnapshotID != snapshot.SnapshotID || page.Total != len(original.Laps) || len(page.Laps[0].Capabilities) != len(CorrectableLapFamilies()) {
		t.Fatal("lost class-only identity or capabilities")
	}
}

func TestCorrectionLapInspectionKeepsValidFieldWithMissingMetadata(t *testing.T) {
	base, original, _ := lapFamilyCorrectionExample(t)
	session := mixedSnapshotSession(base)
	kept := make([]HistoricalMetadata, 0, len(session.Metadata))
	for _, entry := range session.Metadata {
		if entry.Key != "WeatherConditions" {
			kept = append(kept, entry)
		}
	}
	session.Metadata = kept
	requests := mixedSnapshotClassRequests(base)[:1]
	snapshot, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, requests)
	if err != nil {
		t.Fatal(err)
	}
	input := CorrectionInput{Base: base, Session: session, Validity: original}
	page, err := InspectCorrectionLaps(input, snapshot, 0, 50)
	if err != nil {
		t.Fatal("valid field blocked by missing weather", err)
	}
	if page.SnapshotID != snapshot.SnapshotID || page.Total != len(original.Laps) {
		t.Fatal("lost identity inspecting valid field")
	}
}

func TestCorrectionLapInspectionDetachesRollbackInput(t *testing.T) {
	_, input, snapshot, _ := mixedInspectionExample(t)
	marshal := func(value any) string {
		data, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	beforeInput, beforeSnapshot := marshal(input), marshal(snapshot)
	page, err := InspectCorrectionLaps(input, snapshot, 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Laps) == 0 || page.Laps[0].Effective == nil || page.Laps[0].Original.Start == nil {
		t.Fatal("missing inspectable row")
	}
	page.Laps[0].Original.FamilyUse[0].Included = false
	start := *page.Laps[0].Original.Start
	*page.Laps[0].Original.Start = start.Add(time.Hour)
	page.Laps[0].Effective.FamilyUse[0].Included = false
	if marshal(input) != beforeInput || marshal(snapshot) != beforeSnapshot {
		t.Fatal("inspection aliases rollback input or snapshot")
	}
}

func TestCorrectionLapInspectionRejectsTamperedSnapshot(t *testing.T) {
	fresh := func(t *testing.T) (CorrectionInput, PreparedSampleCorrectionSnapshot) {
		t.Helper()
		_, input, snapshot, _ := mixedInspectionExample(t)
		return input, snapshot
	}
	tests := []struct {
		name string
		edit func(*PreparedSampleCorrectionSnapshot)
		ok   bool
	}{
		{"unaltered", nil, true},
		{"tampered corrected", func(snapshot *PreparedSampleCorrectionSnapshot) {
			snapshot.Classifications[0].Corrected = "Storm"
		}, false},
		{"tampered identity", func(snapshot *PreparedSampleCorrectionSnapshot) {
			snapshot.SnapshotID = "wrong"
		}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input, snapshot := fresh(t)
			if tt.edit != nil {
				tt.edit(&snapshot)
			}
			got, err := InspectCorrectionLaps(input, snapshot, 0, 50)
			if tt.ok {
				if err != nil || got.SnapshotID != snapshot.SnapshotID {
					t.Fatalf("positive control failed: %v", err)
				}
				return
			}
			if !errors.Is(err, ErrInvalidCorrection) || !reflect.DeepEqual(got, CorrectionLapPage{}) {
				t.Fatalf("got %+v, %v", got, err)
			}
		})
	}
}

func TestCorrectionLapInspectionRejectsInvalidOriginalMetadata(t *testing.T) {
	_, input, snapshot, _ := mixedInspectionExample(t)
	bad := input
	bad.Session.Metadata = append([]HistoricalMetadata(nil), input.Session.Metadata...)
	for i, entry := range bad.Session.Metadata {
		if entry.Key == "SessionType" {
			bad.Session.Metadata[i].Quality = QualityUnknown
		}
	}
	got, err := InspectCorrectionLaps(bad, snapshot, 0, 50)
	if !errors.Is(err, ErrInvalidSessionClassification) || !reflect.DeepEqual(got, CorrectionLapPage{}) {
		t.Fatal("invalid original metadata inspected", err)
	}
}

func TestCorrectionLapInspectionEnforcesJointQuota(t *testing.T) {
	_, input, snapshot, _ := mixedInspectionExample(t)
	flood := snapshot
	flood.Corrections = make([]PreparedSampleCorrection, MaxSampleCorrections)
	if _, err := InspectCorrectionLaps(input, flood, 0, 50); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("quota bypassed", err)
	}
}

func TestCorrectionLapInspectionAppliesThreeGroups(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	validity, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	base.AnalysisVersion = validity.ComputationVersion
	base.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", validity.Temporal)
	if err != nil {
		t.Fatal(err)
	}
	var target AnalyzedLap
	found := false
	for _, lap := range validity.Laps {
		if lap.Start != nil && lap.Complete && familyIncluded(lap, FamilyCombinedStintPaceCurve) {
			target, found = lap, true
			break
		}
	}
	if !found {
		t.Fatal("fixture lacks an included complete lap")
	}
	familyRequest := LapFamilyUseCorrection{Base: base, Target: LapCorrectionTarget{Number: target.Number, Start: *target.Start, End: target.End}, Family: FamilyCombinedStintPaceCurve, Included: false, Reason: "controlled pace exclusion"}
	for _, use := range target.FamilyUse {
		if use.Family == familyRequest.Family {
			familyRequest.Expected = use
		}
	}
	var scalar *SampleCorrectionInput
outer:
	for c := range session.Channels {
		channel := &session.Channels[c]
		if channel.SourceName != "Lap Time" {
			continue
		}
		channel.Unit = HistoricalUnit{Symbol: "s", Quality: QualityValid}
		for _, page := range pages {
			if page.ChannelID != channel.ID {
				continue
			}
			for _, sample := range page.Samples {
				if sample.Values[0].Scalar.Number <= 0 {
					continue
				}
				replacement := sample.Values[0].Scalar
				replacement.Number++
				scalar = &SampleCorrectionInput{Channel: *channel, Sample: sample, Request: SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: sample.Values[0].Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: sample.Values[0], Replacement: replacement, Reason: "controlled one second test"}}
				break outer
			}
		}
	}
	if scalar == nil {
		t.Fatal("fixture has no lap time target")
	}
	snapshot, err := PrepareMixedCorrectionSnapshot(base, []SampleCorrectionInput{*scalar}, validity,
		[]LapFamilyUseCorrection{familyRequest}, session, mixedSnapshotClassRequests(base))
	if err != nil {
		t.Fatal(err)
	}
	input := CorrectionInput{Base: base, Session: session, Pages: pages, Validity: validity}
	page, err := InspectCorrectionLaps(input, snapshot, 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || page.SnapshotID != snapshot.SnapshotID || page.Total != len(validity.Laps) {
		t.Fatal("lost v3 identity or pagination")
	}
	deltas := 0
	excluded := false
	for _, row := range page.Laps {
		if row.Effective == nil || row.Original.LapTimeSeconds == nil || row.Effective.LapTimeSeconds == nil {
			continue
		}
		if *row.Effective.LapTimeSeconds != *row.Original.LapTimeSeconds {
			if *row.Effective.LapTimeSeconds != *row.Original.LapTimeSeconds+1 {
				t.Fatalf("lap %d changed by %gs, want exactly +1s", row.Original.Number, *row.Effective.LapTimeSeconds-*row.Original.LapTimeSeconds)
			}
			deltas++
		}
		if row.Target != nil && row.Target.Number == target.Number {
			if familyIncluded(row.Original, FamilyCombinedStintPaceCurve) && !familyIncluded(*row.Effective, FamilyCombinedStintPaceCurve) {
				excluded = true
			}
		}
	}
	if deltas == 0 {
		t.Fatal("scalar correction invisible in inspection")
	}
	if !excluded {
		t.Fatal("family exclusion invisible in inspection")
	}
}
