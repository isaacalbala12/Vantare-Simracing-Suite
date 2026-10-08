package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func TestCorrectedDerivationRecomputesRecordedLapTimes(t *testing.T) {
	for _, quality := range []Quality{QualityValid, QualityInvalid} {
		t.Run(string(quality), func(t *testing.T) {
			fixture := loadLapValidityFixture(t, "lap-validity-s045-v1.json")
			session, pages := fixtureHistoricalInput(t, fixture)
			base, _, _, _ := correctionExample()
			base.SessionID = session.ID
			session.Provenance.Parser = ParserRef{ID: base.ParserID, Version: base.ParserVersion}
			session.Provenance.SchemaFingerprint = base.SchemaFingerprint
			classified := ClassifiedSession{SessionID: session.ID, Combination: CombinationIdentity{ID: "fixture-combination"}}
			// The sanitized fixture omits units; this test explicitly declares seconds
			// for its controlled Lap Time correction, not an inferred runtime unit.
			var inputs []SampleCorrectionInput
			for c := range session.Channels {
				if session.Channels[c].SourceName == "Lap Time" {
					channel := &session.Channels[c]
					channel.Unit = HistoricalUnit{Symbol: "s", Quality: QualityValid}
					for _, page := range pages {
						if page.ChannelID == channel.ID {
							for _, sample := range page.Samples {
								sample.Values[0].Quality = quality
								value := sample.Values[0]
								if value.Scalar.Number <= 0 {
									continue
								}
								replacement := value.Scalar
								replacement.Number++
								inputs = append(inputs, SampleCorrectionInput{Channel: *channel, Sample: sample, Request: SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: value.Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: value, Replacement: replacement, Reason: "controlled one second test"}})
							}
						}
					}
				}
			}
			if len(inputs) == 0 {
				t.Fatal("fixture has no correction targets")
			}
			original, err := json.Marshal(pages)
			if err != nil {
				t.Fatal(err)
			}
			empty, err := PrepareSampleCorrectionSnapshot(base, nil)
			if err != nil {
				t.Fatal(err)
			}
			baseline, err := DeriveCorrectedSession(base, session, pages, classified, empty)
			if err != nil {
				t.Fatal(err)
			}
			snapshot, err := PrepareSampleCorrectionSnapshot(base, inputs)
			if err != nil {
				t.Fatal(err)
			}
			changed, err := DeriveCorrectedSession(base, session, pages, classified, snapshot)
			if err != nil {
				t.Fatal(err)
			}
			if changed.SnapshotID == baseline.SnapshotID || changed.Base != base {
				t.Fatal("reused uncorrected derivations")
			}
			if equal := reflect.DeepEqual(changed.Validity.Laps, baseline.Validity.Laps); equal != (quality == QualityInvalid) {
				t.Fatal("changed value promoted invalid quality or failed to rederive valid lap times")
			}
			after, err := json.Marshal(pages)
			if err != nil {
				t.Fatal(err)
			}
			if string(after) != string(original) {
				t.Fatal("original changed")
			}
			if changed.Consumption.SessionID != session.ID || changed.Curves.SessionID != session.ID || changed.Pit.SessionID != session.ID {
				t.Fatal("lost session identity")
			}
			wrongParser := session
			wrongParser.Provenance.Parser.Version = "other"
			if _, err := DeriveCorrectedSession(base, wrongParser, pages, classified, snapshot); !errors.Is(err, ErrCorrectionInterpretationChanged) {
				t.Fatal("wrong parser", err)
			}
			wrong := session
			wrong.ID = "other"
			if _, err := DeriveCorrectedSession(base, wrong, pages, classified, snapshot); !errors.Is(err, ErrCorrectionSourceChanged) {
				t.Fatal("wrong source", err)
			}
		})
	}
}

func TestCorrectedDerivationAppliesFamilyUseAfterReanalysis(t *testing.T) {
	fixture := loadLapValidityFixture(t, "lap-validity-s045-v1.json")
	session, pages := fixtureHistoricalInput(t, fixture)
	base, _, _, _ := correctionExample()
	base.SessionID = session.ID
	session.Provenance.Parser = ParserRef{ID: base.ParserID, Version: base.ParserVersion}
	session.Provenance.SchemaFingerprint = base.SchemaFingerprint
	classified := ClassifiedSession{SessionID: session.ID, Combination: CombinationIdentity{ID: "fixture-combination"}}
	original, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	base.AnalysisVersion = original.ComputationVersion
	base.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", original.Temporal)
	if err != nil {
		t.Fatal(err)
	}
	target := -1
	for i, lap := range original.Laps {
		if lap.Start != nil && lap.Complete && familyIncluded(lap, FamilyCombinedStintPaceCurve) {
			target = i
			break
		}
	}
	if target < 0 {
		t.Fatal("fixture lacks an included complete lap")
	}
	lap := original.Laps[target]
	request := LapFamilyUseCorrection{Base: base, Target: LapCorrectionTarget{Number: lap.Number, Start: *lap.Start, End: lap.End}, Family: FamilyCombinedStintPaceCurve, Included: false, Reason: "controlled pace exclusion"}
	for _, use := range lap.FamilyUse {
		if use.Family == request.Family {
			request.Expected = use
		}
	}
	snapshot, err := PrepareObservationCorrectionSnapshot(base, nil, original, []LapFamilyUseCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	before, err := json.Marshal(pages)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DeriveCorrectedSession(base, session, pages, classified, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if got.SnapshotID != snapshot.SnapshotID || familyIncluded(got.Validity.Laps[target], request.Family) {
		t.Fatal("family decision or full identity lost")
	}
	for i, observed := range original.Laps {
		for _, use := range observed.FamilyUse {
			if i == target && use.Family == request.Family {
				continue
			}
			for _, effective := range got.Validity.Laps[i].FamilyUse {
				if effective.Family == use.Family && !reflect.DeepEqual(effective, use) {
					t.Fatal("unrelated family changed")
				}
			}
		}
	}
	for _, derived := range got.Consumption.Laps {
		if derived.Number == lap.Number && derived.RepresentativePace != nil {
			t.Fatal("excluded pace reached consumption derivation")
		}
	}
	after, err := json.Marshal(pages)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("original input mutated")
	}
	snapshot.ContractVersion = "unknown"
	if _, err := DeriveCorrectedSession(base, session, pages, classified, snapshot); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("unknown version accepted", err)
	}
}

// classifiedDerivationFixture attaches fully specified classification metadata
// to the lap-validity pages. In-memory contract fields, not real-bank evidence.
func classifiedDerivationFixture(t *testing.T) (SourceAnalysisRef, HistoricalSession, []HistoricalPage) {
	t.Helper()
	fixture := loadLapValidityFixture(t, "lap-validity-s045-v1.json")
	session, pages := fixtureHistoricalInput(t, fixture)
	base, _, _, _ := correctionExample()
	base.SessionID = session.ID
	session.Provenance.Source.Kind = SourceLMU
	session.Provenance.Parser = ParserRef{ID: base.ParserID, Version: base.ParserVersion}
	session.Provenance.SchemaFingerprint = base.SchemaFingerprint
	meta := func(key, value string) HistoricalMetadata {
		return HistoricalMetadata{Key: key, Present: true, Value: value, Quality: QualityValid}
	}
	session.Metadata = []HistoricalMetadata{
		meta("TrackName", "Imola"), meta("TrackLayout", "GP"), meta("CarName", "Oreca 07"), meta("CarClass", "LMP2"),
		meta("SessionType", "race"), meta("WeatherConditions", "Dry"),
	}
	return base, session, pages
}

func classifiedDerivationCaller(t *testing.T, session HistoricalSession) ClassifiedSession {
	t.Helper()
	caller, err := ClassifyHistoricalSession(session)
	if err != nil {
		t.Fatal(err)
	}
	return caller
}

func classificationDerivationRequest(base SourceAnalysisRef, field ClassificationField, expected, replacement string) ClassificationCorrection {
	return ClassificationCorrection{Base: base, Field: field, ExpectedOriginal: expected, Replacement: replacement, Reason: "reviewed classification", Provenance: ClassificationProvenanceManual}
}

func TestCorrectedDerivationReclassifiesSessionTypeUsability(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	snapshot, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session,
		[]ClassificationCorrection{classificationDerivationRequest(base, ClassificationFieldSessionType, "race", "qualify")})
	if err != nil {
		t.Fatal(err)
	}
	derived, err := DeriveCorrectedSession(base, session, pages, caller, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	// Preliminary usability only: this path never calls the real observed
	// strategy derivation, which additionally requires race identity, temporal
	// segments and pit presence.
	if derived.Classified.Type != SessionTypeQualify || derived.Classified.SessionID != session.ID {
		t.Fatalf("not reclassified: %+v", derived.Classified)
	}
	if !reflect.DeepEqual(derived.Classified.Combination, caller.Combination) {
		t.Fatal("type change altered the canonical combination")
	}
	complete := false
	for _, lap := range derived.Validity.Laps {
		if lap.Complete {
			complete = true
			break
		}
	}
	if !complete {
		t.Fatal("fixture lost its complete lap")
	}
	if derived.Classified.Status != SessionStatusIdentifiedUsable {
		t.Fatalf("wrong status: %s", derived.Classified.Status)
	}
	observed := false
	for _, family := range derived.Classified.Families {
		if family.Family != FamilyObservedStrategy {
			continue
		}
		observed = true
		if family.Usable || family.Reason != UnusableReasonNotRace {
			t.Fatalf("wrong observed preliminary gate: %+v", family)
		}
	}
	if !observed {
		t.Fatal("observed_strategy preliminary gate missing")
	}
}

func TestCorrectedDerivationWeatherLabelLeavesPhysicalUnchanged(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	derive := func(replacement string) CorrectedSessionDerivations {
		t.Helper()
		snapshot, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session,
			[]ClassificationCorrection{classificationDerivationRequest(base, ClassificationFieldWeatherConditions, "Dry", replacement)})
		if err != nil {
			t.Fatal(err)
		}
		derived, err := DeriveCorrectedSession(base, session, pages, caller, snapshot)
		if err != nil {
			t.Fatal(err)
		}
		return derived
	}
	wet, dry := derive("Wet"), derive("Dry")
	if !reflect.DeepEqual(wet.Consumption, dry.Consumption) || !reflect.DeepEqual(wet.Curves, dry.Curves) || !reflect.DeepEqual(wet.Pit, dry.Pit) {
		t.Fatal("weather label changed physical derivations")
	}
	if wet.Classified.WeatherConditions != "Wet" || dry.Classified.WeatherConditions != "Dry" || wet.Classified.Type != SessionTypeRace {
		t.Fatal("weather label not carried")
	}
	if !reflect.DeepEqual(wet.Classified.Combination, caller.Combination) || !reflect.DeepEqual(dry.Classified.Combination, caller.Combination) {
		t.Fatal("weather change altered the canonical combination")
	}
}

func TestCorrectedDerivationMissingMetadataFailsAtomically(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	without := func(key string) HistoricalSession {
		altered := session
		altered.Metadata = make([]HistoricalMetadata, 0, len(session.Metadata))
		for _, entry := range session.Metadata {
			if entry.Key != key {
				altered.Metadata = append(altered.Metadata, entry)
			}
		}
		return altered
	}
	unknown := session
	unknown.Metadata = append([]HistoricalMetadata(nil), session.Metadata...)
	unknown.Metadata[4].Value = "banana"
	tests := []struct {
		name    string
		session HistoricalSession
		field   ClassificationField
		expect  string
		replace string
	}{
		{"missing weather blocks weather correction", without("WeatherConditions"), ClassificationFieldWeatherConditions, "Dry", "Wet"},
		{"unknown session type", unknown, ClassificationFieldSessionType, "banana", "race"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Missing or unknown corrected fields already fail live preparation
			// atomically: nothing is produced and no derivation runs.
			if _, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, tc.session,
				[]ClassificationCorrection{classificationDerivationRequest(base, tc.field, tc.expect, tc.replace)}); !errors.Is(err, ErrInvalidSessionClassification) {
				t.Fatalf("live preparation succeeded: %v", err)
			}
		})
	}
	// A revision prepared against complete metadata still fails atomically at
	// derivation time when the session presented then lacks a required key
	// (e.g. redacted after saving): no partial derivations escape.
	full, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session,
		[]ClassificationCorrection{classificationDerivationRequest(base, ClassificationFieldSessionType, "race", "qualify")})
	if err != nil {
		t.Fatal(err)
	}
	stripped := without("WeatherConditions")
	got, err := DeriveCorrectedSession(base, stripped, pages, caller, full)
	if !errors.Is(err, ErrInvalidSessionClassification) || !reflect.DeepEqual(got, CorrectedSessionDerivations{}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestRefreshClassifiedDerivationUsesActualValidity(t *testing.T) {
	stub := ClassifiedSession{SessionID: "s", Type: SessionTypeRace}
	none := refreshClassifiedDerivation(stub, LapValidityAnalysis{})
	if none.Status != SessionStatusIdentifiedNotUsable {
		t.Fatalf("empty validity usable: %s", none.Status)
	}
	for _, family := range none.Families {
		if family.Family == FamilySessionClassification {
			if !family.Usable {
				t.Fatal("classification family must stay usable")
			}
			continue
		}
		if family.Usable || family.Reason != UnusableReasonNoCompletedLap {
			t.Fatalf("wrong gate without complete lap: %+v", family)
		}
	}
	one := refreshClassifiedDerivation(stub, LapValidityAnalysis{Laps: []AnalyzedLap{{Number: 1, Complete: true}}})
	if one.Status != SessionStatusIdentifiedUsable {
		t.Fatalf("complete validity unusable: %s", one.Status)
	}
	for _, family := range one.Families {
		if family.Family == FamilyObservedStrategy && (!family.Usable || family.Reason != "") {
			t.Fatalf("race with complete lap must keep observed preliminary usable: %+v", family)
		}
	}
}

func TestCorrectedDerivationLegacyRefreshIgnoresSessionLaps(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	session.Laps = nil
	empty, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DeriveCorrectedSession(base, session, pages, caller, empty)
	if err != nil {
		t.Fatal(err)
	}
	if got.Classified.Status != SessionStatusIdentifiedUsable || got.Classified.Type != caller.Type || got.Classified.Combination != caller.Combination {
		t.Fatalf("legacy identity or gate wrong: %+v", got.Classified)
	}
	usable := false
	for _, family := range got.Classified.Families {
		if family.Family == FamilyLapValidity && family.Usable {
			usable = true
		}
	}
	if !usable {
		t.Fatal("complete validity not usable without session laps")
	}
	wantUsable := got.Classified.Families[0].Usable
	got.Classified.Families[0].Usable = !wantUsable
	again, err := DeriveCorrectedSession(base, session, pages, caller, empty)
	if err != nil || again.Classified.Families[0].Usable != wantUsable {
		t.Fatal("families alias output", err)
	}
	var inputs []SampleCorrectionInput
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
				replacement.Number = 0
				inputs = append(inputs, SampleCorrectionInput{Channel: *channel, Sample: sample, Request: SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: sample.Values[0].Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: sample.Values[0], Replacement: replacement, Reason: "zero lap time"}})
			}
		}
	}
	if len(inputs) == 0 {
		t.Fatal("fixture has no lap time targets")
	}
	wipedSnapshot, err := PrepareSampleCorrectionSnapshot(base, inputs)
	if err != nil {
		t.Fatal(err)
	}
	wiped, err := DeriveCorrectedSession(base, session, pages, caller, wipedSnapshot)
	if err != nil {
		t.Fatal(err)
	}
	if wiped.Classified.Status != SessionStatusIdentifiedNotUsable {
		t.Fatalf("scalar removing lap times kept usable: %s", wiped.Classified.Status)
	}
}

func TestCorrectedDerivationMixedRegressionKeepsInputs(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	original, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	base.AnalysisVersion = original.ComputationVersion
	base.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", original.Temporal)
	if err != nil {
		t.Fatal(err)
	}
	var target AnalyzedLap
	targetIdx, found := 0, false
	for i, lap := range original.Laps {
		if lap.Start != nil && lap.Complete && familyIncluded(lap, FamilyCombinedStintPaceCurve) {
			target, targetIdx, found = lap, i, true
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
	var scalarInput *SampleCorrectionInput
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
				scalarInput = &SampleCorrectionInput{Channel: *channel, Sample: sample, Request: SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: sample.Values[0].Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: sample.Values[0], Replacement: replacement, Reason: "controlled one second test"}}
				break outer
			}
		}
	}
	if scalarInput == nil {
		t.Fatal("fixture has no lap time target")
	}
	snapshot, err := PrepareMixedCorrectionSnapshot(base, []SampleCorrectionInput{*scalarInput}, original,
		[]LapFamilyUseCorrection{familyRequest}, session,
		[]ClassificationCorrection{classificationDerivationRequest(base, ClassificationFieldSessionType, "race", "qualify")})
	if err != nil {
		t.Fatal(err)
	}
	marshal := func(value any) string {
		data, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	beforeSession, beforePages, beforeCaller, beforeSnapshot := marshal(session), marshal(pages), marshal(caller), marshal(snapshot)
	emptySnap, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	baseline, err := DeriveCorrectedSession(base, session, pages, caller, emptySnap)
	if err != nil {
		t.Fatal(err)
	}
	derived, err := DeriveCorrectedSession(base, session, pages, caller, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if derived.Classified.Type != SessionTypeQualify || derived.SnapshotID != snapshot.SnapshotID {
		t.Fatal("mixed regression lost identity")
	}
	deltas := 0
	for _, lap := range derived.Validity.Laps {
		if lap.LapTimeSeconds == nil {
			continue
		}
		for _, reference := range baseline.Validity.Laps {
			if reference.Number != lap.Number || reference.LapTimeSeconds == nil || *reference.LapTimeSeconds == *lap.LapTimeSeconds {
				continue
			}
			if *lap.LapTimeSeconds != *reference.LapTimeSeconds+1 {
				t.Fatalf("lap %d changed by %gs, want exactly +1s", lap.Number, *lap.LapTimeSeconds-*reference.LapTimeSeconds)
			}
			deltas++
		}
	}
	if deltas == 0 {
		t.Fatal("scalar correction invisible in reanalysis")
	}
	excluded := false
	for _, lap := range derived.Consumption.Laps {
		if lap.Number == target.Number && lap.RepresentativePace != nil {
			t.Fatal("excluded pace reached consumption derivation")
		}
		if lap.Number == target.Number {
			excluded = true
		}
	}
	if !excluded {
		t.Fatal("excluded lap missing from consumption")
	}
	for i, observed := range original.Laps {
		for _, use := range observed.FamilyUse {
			if i == targetIdx && use.Family == familyRequest.Family {
				continue
			}
			for _, effective := range derived.Validity.Laps[i].FamilyUse {
				if effective.Family == use.Family && !reflect.DeepEqual(effective, use) {
					t.Fatal("unrelated family changed")
				}
			}
		}
	}
	wantFamilies := marshal(derived.Classified.Families)
	derived.Classified.Families[0].Usable = !derived.Classified.Families[0].Usable
	again, err := DeriveCorrectedSession(base, session, pages, caller, snapshot)
	if err != nil || marshal(again.Classified.Families) != wantFamilies {
		t.Fatal("families alias output", err)
	}
	if marshal(session) != beforeSession || marshal(pages) != beforePages || marshal(caller) != beforeCaller || marshal(snapshot) != beforeSnapshot {
		t.Fatal("derivation mutated its inputs")
	}
}
