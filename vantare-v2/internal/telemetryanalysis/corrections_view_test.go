package telemetryanalysis

import (
	"errors"
	"reflect"
	"testing"
)

func TestCorrectionViewPreservesOriginalAndDetaches(t *testing.T) {
	base, ch, sample, request := correctionExample()
	timestamp := 12.5
	sample.TimestampSeconds = &timestamp
	pages := []HistoricalPage{{ChannelID: ch.ID, Start: 42, Samples: []HistoricalSample{sample}}}
	snapshot, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}})
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, pages, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if view.Pages[0].Samples[0].Values[0].Scalar.Number != 0 || view.Pages[0].Samples[0].Values[0].Quality != request.Expected.Quality {
		t.Fatal("correction or quality lost")
	}
	if pages[0].Samples[0].Values[0] != request.Expected || view.SnapshotID != snapshot.SnapshotID || len(view.Corrections) != 1 {
		t.Fatal("original or provenance lost")
	}
	view.Pages[0].Samples[0].Values[0].Scalar.Number = 999
	*view.Pages[0].Samples[0].TimestampSeconds = 999
	if sample.Values[0] != request.Expected || timestamp != 12.5 {
		t.Fatal("view aliases original")
	}
	view.Corrections[0].Request.Reason = "caller mutation"
	if snapshot.Corrections[0].Request.Reason == "caller mutation" {
		t.Fatal("view aliases snapshot")
	}
}
func TestCorrectionViewRejectsPartialOrAmbiguousInputs(t *testing.T) {
	base, ch, sample, request := correctionExample()
	snapshot, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}})
	if err != nil {
		t.Fatal(err)
	}
	page := HistoricalPage{ChannelID: ch.ID, Start: 42, Samples: []HistoricalSample{sample}}
	tests := []struct {
		name     string
		channels []HistoricalChannel
		pages    []HistoricalPage
	}{
		{"missing channel", nil, []HistoricalPage{page}},
		{"missing sample", []HistoricalChannel{ch}, nil},
		{"duplicate channel", []HistoricalChannel{ch, ch}, []HistoricalPage{page}},
		{"overlapping pages", []HistoricalChannel{ch}, []HistoricalPage{page, page}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			view, err := ApplySampleCorrectionSnapshot(base, tt.channels, tt.pages, snapshot)
			if !errors.Is(err, ErrCorrectionTarget) || !reflect.DeepEqual(view, EffectiveCorrectionView{}) {
				t.Fatal("partial/ambiguous accepted", err)
			}
		})
	}
	altered := snapshot
	altered.SnapshotID = "wrong"
	if _, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, []HistoricalPage{page}, altered); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("altered snapshot", err)
	}
	changedSample := sample
	changedSample.Values = append([]HistoricalValue(nil), sample.Values...)
	changedSample.Values[0].Scalar.Number++
	page.Samples = []HistoricalSample{changedSample}
	if _, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, []HistoricalPage{page}, snapshot); !errors.Is(err, ErrCorrectionPrecondition) {
		t.Fatal("stale original", err)
	}
}
func TestEmptyCorrectionViewRemainsDetached(t *testing.T) {
	base, ch, sample, _ := correctionExample()
	snapshot, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	pages := []HistoricalPage{{ChannelID: ch.ID, Samples: []HistoricalSample{sample}}}
	view, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, pages, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(view.Pages, pages) {
		t.Fatal("empty changed values")
	}
	view.Pages[0].Samples[0].Index = 99
	if pages[0].Samples[0].Index == 99 {
		t.Fatal("empty view aliases original")
	}
}

func TestCorrectionViewAppliesEveryColumnWithoutChangingTime(t *testing.T) {
	base, ch, sample, request := correctionExample()
	otherValue := HistoricalValue{Column: "active", Present: true, Quality: QualityValid, Scalar: HistoricalScalar{Kind: ScalarBoolean, Boolean: true}}
	sample.Values = append(sample.Values, otherValue)
	sample.RelativeTimeSeconds = 17
	ch.Columns = append(ch.Columns, HistoricalColumn{Name: "active", Type: ScalarBoolean})
	other := request
	other.Target.Column = "active"
	other.Expected = otherValue
	other.Replacement = HistoricalScalar{Kind: ScalarBoolean, Boolean: false}
	snapshot, err := PrepareSampleCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}, {Channel: ch, Sample: sample, Request: other}})
	if err != nil {
		t.Fatal(err)
	}
	page := HistoricalPage{ChannelID: ch.ID, Start: 42, Samples: []HistoricalSample{sample}}
	view, err := ApplySampleCorrectionSnapshot(base, []HistoricalChannel{ch}, []HistoricalPage{page}, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	got := view.Pages[0].Samples[0]
	if got.Values[0].Scalar.Number != 0 || got.Values[1].Scalar.Boolean || got.RelativeTimeSeconds != 17 || len(view.Corrections) != 2 {
		t.Fatal("lost zero/false/time/provenance")
	}
	changed := base
	changed.AnalysisVersion = "new"
	if _, err := ApplySampleCorrectionSnapshot(changed, []HistoricalChannel{ch}, []HistoricalPage{page}, snapshot); !errors.Is(err, ErrCorrectionInterpretationChanged) {
		t.Fatal("stale analysis", err)
	}
}

func TestObservationViewValidatesWholeSnapshot(t *testing.T) {
	base, validity, family := lapFamilyCorrectionExample(t)
	_, ch, sample, request := correctionExample()
	request.Base = base
	pages := []HistoricalPage{{ChannelID: ch.ID, Samples: []HistoricalSample{sample}}}
	snapshot, err := PrepareObservationCorrectionSnapshot(base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}}, validity, []LapFamilyUseCorrection{family})
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplyObservationCorrectionSnapshot(base, []HistoricalChannel{ch}, pages, validity, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if view.SnapshotID != snapshot.SnapshotID || len(view.FamilyUses) != 1 || view.Pages[0].Samples[0].Values[0] != snapshot.Corrections[0].Corrected {
		t.Fatal("lost mixed content or identity")
	}
	view.FamilyUses[0].Corrected.ExclusionReasons[0] = "caller mutation"
	if snapshot.FamilyUses[0].Corrected.ExclusionReasons[0] != LapExclusionManual {
		t.Fatal("family view aliases snapshot")
	}
	for _, mutate := range []func(*PreparedSampleCorrectionSnapshot){
		func(s *PreparedSampleCorrectionSnapshot) { s.SnapshotID = "wrong" },
		func(s *PreparedSampleCorrectionSnapshot) { s.ContractVersion = "analysis.sample-snapshot.v1" },
		func(s *PreparedSampleCorrectionSnapshot) { s.FamilyUses = nil },
		func(s *PreparedSampleCorrectionSnapshot) { s.Corrections = nil },
	} {
		altered := snapshot
		mutate(&altered)
		got, err := ApplyObservationCorrectionSnapshot(base, []HistoricalChannel{ch}, pages, validity, altered)
		if err == nil || !reflect.DeepEqual(got, EffectiveCorrectionView{}) {
			t.Fatal("partial/tampered accepted", err)
		}
	}
	if _, err := ApplyObservationCorrectionSnapshot(base, []HistoricalChannel{ch}, nil, validity, snapshot); !errors.Is(err, ErrCorrectionTarget) {
		t.Fatal("missing scalar coverage", err)
	}
	if _, err := ApplyObservationCorrectionSnapshot(base, []HistoricalChannel{ch}, pages, LapValidityAnalysis{}, snapshot); err == nil {
		t.Fatal("missing original model accepted")
	}
}

func mixedCorrectionViewExample(t *testing.T) (SourceAnalysisRef, []HistoricalPage, LapValidityAnalysis, HistoricalSession, PreparedSampleCorrectionSnapshot) {
	t.Helper()
	base, validity, family := lapFamilyCorrectionExample(t)
	_, channel, sample, request := correctionExample()
	request.Base = base
	pages := []HistoricalPage{{ChannelID: channel.ID, Samples: []HistoricalSample{sample}}}
	session := mixedSnapshotSession(base)
	session.Channels = []HistoricalChannel{channel}
	snapshot, err := PrepareMixedCorrectionSnapshot(
		base,
		[]SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}},
		validity,
		[]LapFamilyUseCorrection{family},
		session,
		mixedSnapshotClassRequests(base),
	)
	if err != nil {
		t.Fatal(err)
	}
	return base, pages, validity, session, snapshot
}

func TestMixedViewAppliesThreeGroupsWithExactIdentity(t *testing.T) {
	base, pages, validity, session, snapshot := mixedCorrectionViewExample(t)
	view, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if view.Base != base || view.SnapshotID != snapshot.SnapshotID {
		t.Fatal("lost base or revision identity")
	}
	if len(view.Corrections) != 1 || len(view.FamilyUses) != 1 || len(view.Classifications) != 2 || len(view.Metadata) != len(session.Metadata) {
		t.Fatalf("wrong mixed view shape: %d/%d/%d/%d", len(view.Corrections), len(view.FamilyUses), len(view.Classifications), len(view.Metadata))
	}
	if view.Pages[0].Samples[0].Values[0] != snapshot.Corrections[0].Corrected {
		t.Fatal("scalar not applied to pages")
	}
	got := make(map[string]HistoricalMetadata, len(view.Metadata))
	for _, entry := range view.Metadata {
		got[entry.Key] = entry
	}
	if got["SessionType"].Value != "qualify" || got["WeatherConditions"].Value != "Wet" {
		t.Fatalf("classification not applied: %+v", got)
	}
	if got["TrackName"].Value != "Imola" || got["SessionType"].Quality != QualityValid || !got["WeatherConditions"].Present {
		t.Fatal("untouched metadata changed")
	}
}

func TestMixedViewAppliesClassificationAlone(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	snapshot, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, mixedSnapshotClassRequests(base))
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplyMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, session, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if view.SnapshotID != snapshot.SnapshotID || snapshot.ContractVersion != "analysis.mixed-snapshot.v3" {
		t.Fatal("lost v3 identity")
	}
	if len(view.Corrections) != 0 || len(view.FamilyUses) != 0 || len(view.Classifications) != 2 {
		t.Fatal("wrong classification-only shape")
	}
	if view.Metadata[4].Value != "qualify" || view.Metadata[5].Value != "Wet" {
		t.Fatalf("classification not applied: %+v", view.Metadata)
	}
}

func TestMixedViewDetachesOriginalAndOutput(t *testing.T) {
	base, pages, validity, session, snapshot := mixedCorrectionViewExample(t)
	before := append([]HistoricalMetadata(nil), session.Metadata...)
	view, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(session.Metadata, before) {
		t.Fatal("original session metadata changed")
	}
	view.Metadata[4].Value = "caller mutation"
	view.Pages[0].Samples[0].Values[0].Scalar.Number = 999
	view.Classifications[0].Request.Reason = "caller mutation"
	if session.Metadata[4].Value != "race" || pages[0].Samples[0].Values[0].Scalar.Number != 10 {
		t.Fatal("view aliases session or pages")
	}
	if snapshot.Classifications[0].Request.Reason == "caller mutation" {
		t.Fatal("view aliases snapshot")
	}
}

func TestMixedViewAcceptsValidFieldWithMissingMetadata(t *testing.T) {
	base, pages, validity, session, _ := mixedCorrectionViewExample(t)
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
	view, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, snapshot)
	if err != nil || len(view.Classifications) != 1 || view.Metadata[4].Value != "qualify" {
		t.Fatal("valid field with missing weather rejected", err)
	}
	if _, err := ClassifyHistoricalSession(session); !errors.Is(err, ErrInvalidSessionClassification) {
		t.Fatal("partial global classification succeeded on original", err)
	}
	effective := HistoricalSession{
		SchemaVersion: session.SchemaVersion,
		ID:            session.ID,
		Provenance:    session.Provenance,
		Metadata:      view.Metadata,
		Laps:          session.Laps,
	}
	if _, err := ClassifyHistoricalSession(effective); !errors.Is(err, ErrInvalidSessionClassification) {
		t.Fatal("effective metadata invented the missing weather", err)
	}
}

func TestMixedViewPreservesObservationSemantics(t *testing.T) {
	base, validity, family := lapFamilyCorrectionExample(t)
	_, channel, sample, request := correctionExample()
	request.Base = base
	pages := []HistoricalPage{{ChannelID: channel.ID, Samples: []HistoricalSample{sample}}}
	session := mixedSnapshotSession(base)
	session.Channels = []HistoricalChannel{channel}
	inputs := []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}}
	scalarSnap, err := PrepareSampleCorrectionSnapshot(base, inputs)
	if err != nil {
		t.Fatal(err)
	}
	legacy, err := ApplyObservationCorrectionSnapshot(base, []HistoricalChannel{channel}, pages, validity, scalarSnap)
	if err != nil {
		t.Fatal(err)
	}
	mixed, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, scalarSnap)
	if err != nil || !reflect.DeepEqual(legacy, mixed) {
		t.Fatal("scalar-only view changed", err)
	}
	familySnap, err := PrepareObservationCorrectionSnapshot(base, inputs, validity, []LapFamilyUseCorrection{family})
	if err != nil {
		t.Fatal(err)
	}
	legacy, err = ApplyObservationCorrectionSnapshot(base, []HistoricalChannel{channel}, pages, validity, familySnap)
	if err != nil {
		t.Fatal(err)
	}
	mixed, err = ApplyMixedCorrectionSnapshot(base, pages, validity, session, familySnap)
	if err != nil || !reflect.DeepEqual(legacy, mixed) {
		t.Fatal("family-only view changed", err)
	}
}

func TestMixedViewRejectsAtomically(t *testing.T) {
	fresh := func(t *testing.T) (SourceAnalysisRef, []HistoricalPage, LapValidityAnalysis, HistoricalSession, PreparedSampleCorrectionSnapshot) {
		t.Helper()
		return mixedCorrectionViewExample(t)
	}
	tests := []struct {
		name string
		edit func(*SourceAnalysisRef, *HistoricalSession, *PreparedSampleCorrectionSnapshot)
		want error
		ok   bool
	}{
		{"unaltered", nil, nil, true},
		{"altered identity", func(_ *SourceAnalysisRef, _ *HistoricalSession, snapshot *PreparedSampleCorrectionSnapshot) {
			snapshot.SnapshotID = "wrong"
		}, ErrInvalidCorrection, false},
		{"downgraded tag", func(_ *SourceAnalysisRef, _ *HistoricalSession, snapshot *PreparedSampleCorrectionSnapshot) {
			snapshot.ContractVersion = "analysis.observation-snapshot.v2"
		}, ErrInvalidCorrection, false},
		{"tampered corrected", func(_ *SourceAnalysisRef, _ *HistoricalSession, snapshot *PreparedSampleCorrectionSnapshot) {
			snapshot.Classifications[0].Corrected = "Storm"
		}, ErrInvalidCorrection, false},
		{"tampered reason", func(_ *SourceAnalysisRef, _ *HistoricalSession, snapshot *PreparedSampleCorrectionSnapshot) {
			snapshot.Classifications[0].Request.Reason = "forged"
		}, ErrInvalidCorrection, false},
		{"foreign analysis", func(base *SourceAnalysisRef, _ *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			base.AnalysisVersion = "new"
		}, ErrCorrectionInterpretationChanged, false},
		{"foreign hash", func(base *SourceAnalysisRef, _ *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			base.ContentSHA256 = "efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef"
		}, ErrCorrectionSourceChanged, false},
		{"stale original", func(_ *SourceAnalysisRef, session *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			session.Metadata[4].Value = "practice"
		}, ErrCorrectionPrecondition, false},
		{"unusable quality", func(_ *SourceAnalysisRef, session *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			session.Metadata[4].Quality = QualityUnknown
		}, ErrInvalidSessionClassification, false},
		{"duplicate metadata", func(_ *SourceAnalysisRef, session *HistoricalSession, _ *PreparedSampleCorrectionSnapshot) {
			session.Metadata = append(session.Metadata, session.Metadata[4])
		}, ErrInvalidSessionClassification, false},
		{"joint quota", func(_ *SourceAnalysisRef, _ *HistoricalSession, snapshot *PreparedSampleCorrectionSnapshot) {
			snapshot.Corrections = make([]PreparedSampleCorrection, MaxSampleCorrections)
		}, ErrInvalidCorrection, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			base, pages, validity, session, snapshot := fresh(t)
			if tt.edit != nil {
				tt.edit(&base, &session, &snapshot)
			}
			view, err := ApplyMixedCorrectionSnapshot(base, pages, validity, session, snapshot)
			if tt.ok {
				if err != nil || view.SnapshotID != snapshot.SnapshotID || len(view.Classifications) != 2 {
					t.Fatalf("positive control failed: %v", err)
				}
				return
			}
			if !errors.Is(err, tt.want) || !reflect.DeepEqual(view, EffectiveCorrectionView{}) {
				t.Fatalf("got %v, want %v", err, tt.want)
			}
		})
	}
}
