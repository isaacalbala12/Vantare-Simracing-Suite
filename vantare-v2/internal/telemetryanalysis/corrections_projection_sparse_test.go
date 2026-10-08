package telemetryanalysis

import (
	"context"
	"math"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func TestPagedProjectionBoundaryRowsMatchMaterializedSelection(t *testing.T) {
	model := correctionSourceExample(t)
	session, _, pages := pitFixtureSession(TimeOriginSourceTimestamp,
		[]float64{50, 50, 50, 50, 50, 50, 52, 52, 54, 54, 54, 54, 54, 54},
		[]float64{30, 30, 30, 30, 30, 30, 31, 31, 32, 32, 32, 32, 32, 32})
	session.ID = model.Session.ID
	session.SchemaVersion = HistoricalSchemaVersion
	session.Provenance = model.Session.Provenance
	finish := pitEventChannel("finish", "Finish Status")
	session.Channels = append(session.Channels, finish)
	pages = append(pages, pitEventPage("finish", []pitEventValue{{seconds: 6, value: true}}))
	corrected := cloneHistoricalPages(pages)
	corrected[1].Samples = append([]HistoricalSample(nil), corrected[1].Samples...)
	corrected[1].Samples[8].Values = append([]HistoricalValue(nil), corrected[1].Samples[8].Values...)
	corrected[1].Samples[8].Values[0].Scalar.Number = 55
	values := map[correctionRowKey]map[string]HistoricalValue{
		{channel: "fuel", index: 8}: {"": corrected[1].Samples[8].Values[0]},
	}
	start1, start2, start3 := secondsTimestamp(0), secondsTimestamp(2), secondsTimestamp(4)
	validity := LapValidityAnalysis{Laps: []AnalyzedLap{
		{Number: 1, Start: &start1, End: secondsTimestamp(2)},
		{Number: 2, Start: &start2, End: secondsTimestamp(4)},
		{Number: 3, Start: &start3, End: secondsTimestamp(6)},
	}}
	want := sparseProjectionFixturePages(t, session, corrected, validity, false)
	reader := &correctionInputReader{session: session, pages: pages}
	got, err := readPagedProjectionRows(context.Background(), reader, model.Artifact,
		CorrectionReadLimits{PageRows: 3, MaxSamples: 100, MaxValues: 100, MaxTextBytes: 4096},
		CorrectionSummary{Session: session}, validity, values)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"fuel", "ve", "finish"} {
		var selected, expected []HistoricalSample
		for _, page := range got.pages {
			if page.ChannelID == id {
				selected = append(selected, page.Samples...)
			}
		}
		for _, page := range want {
			if page.ChannelID == id {
				expected = append(expected, page.Samples...)
			}
		}
		if !reflect.DeepEqual(selected, expected) {
			t.Fatalf("selected %s rows differ from materialized boundary selection", id)
		}
	}
}

func TestCorrectedObservationsMatchBoundaryRowsOnRecordedFixture(t *testing.T) {
	fixture := loadLapValidityFixture(t, "lap-validity-s045-v1.json")
	session, pages := fixtureHistoricalInput(t, fixture)
	assertCorrectedObservationsMatchBoundaryRows(t, session, pages, "")
}

func TestCorrectedObservationsMatchBoundaryRowsOnPitFixture(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	assertCorrectedObservationsMatchBoundaryRows(t, session, pages, SessionTypeRace)
}

func TestCorrectedObservationsAcceptPitOverrideWithoutPitSamples(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	base, _, _, _ := correctionExample()
	base.SessionID = session.ID
	session.Provenance.Parser = ParserRef{ID: base.ParserID, Version: base.ParserVersion}
	session.Provenance.SchemaFingerprint = base.SchemaFingerprint
	classified := ClassifiedSession{SessionID: session.ID, Type: SessionTypeRace, Combination: CombinationIdentity{ID: "fixture-combination"}}
	snapshot, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	want, err := DeriveCorrectedSession(base, session, pages, classified, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	alignment := BuildTemporalAlignment(session, pages)
	validity, err := AnalyzeAlignedLapValidity(alignment)
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplyMixedCorrectionSnapshot(base, alignment.Pages, validity, alignment.Session, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	sparse := sparseProjectionFixturePages(t, alignment.Session, view.Pages, validity, false)
	pit, err := DeriveSessionPitObservation(alignment.Session, view.Pages, classified)
	if err != nil {
		t.Fatal(err)
	}
	got, err := deriveCorrectedObservationsWithPit(base, alignment.Session, sparse, classified, validity, view, false, &pit)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("pit override and boundary rows changed corrected derivation: %v", err)
	}
}

func assertCorrectedObservationsMatchBoundaryRows(t *testing.T, session HistoricalSession, pages []HistoricalPage, sessionType SessionType) {
	t.Helper()
	base, _, _, _ := correctionExample()
	base.SessionID = session.ID
	session.Provenance.Parser = ParserRef{ID: base.ParserID, Version: base.ParserVersion}
	session.Provenance.SchemaFingerprint = base.SchemaFingerprint
	classified := ClassifiedSession{SessionID: session.ID, Type: sessionType, Combination: CombinationIdentity{ID: "fixture-combination"}}
	snapshot, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	want, err := DeriveCorrectedSession(base, session, pages, classified, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	alignment := BuildTemporalAlignment(session, pages)
	validity, err := AnalyzeAlignedLapValidity(alignment)
	if err != nil {
		t.Fatal(err)
	}
	view, err := ApplyMixedCorrectionSnapshot(base, alignment.Pages, validity, alignment.Session, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	sparse := sparseProjectionFixturePages(t, alignment.Session, view.Pages, validity, true)
	got, err := deriveCorrectedObservations(base, alignment.Session, sparse, classified, validity, view, false)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("boundary rows changed corrected derivation: consumption=%v curves=%v pit=%v observed=%v",
			!reflect.DeepEqual(got.Consumption, want.Consumption), !reflect.DeepEqual(got.Curves, want.Curves),
			!reflect.DeepEqual(got.Pit, want.Pit), !reflect.DeepEqual(got.Observed, want.Observed))
	}
}

// This test-only selection starts from materialized pages. It proves which
// boundary observations the existing derivations consume; it is not a bounded
// source reader and must not be used as runtime evidence.
func sparseProjectionFixturePages(t *testing.T, session HistoricalSession, pages []HistoricalPage, validity LapValidityAnalysis, includePitRows bool) []HistoricalPage {
	t.Helper()
	queries := make([]float64, 0, len(validity.Laps)*4)
	for _, lap := range validity.Laps {
		queries = append(queries, timestampSeconds(lap.End))
		if lap.Start != nil {
			start := timestampSeconds(*lap.Start)
			queries = append(queries, start, start+0.001, start+vectorBoundaryToleranceSeconds)
		}
	}
	sort.Float64s(queries)
	unique := queries[:0]
	for _, query := range queries {
		if len(unique) == 0 || query != unique[len(unique)-1] {
			unique = append(unique, query)
		}
	}
	channels := make(map[string]HistoricalChannel, len(session.Channels))
	grouped, err := groupPagesBySource(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	pitIntervals := observedPitIntervals(readEvents(grouped["in pits"]))
	scans := make(map[string]*orderedProjectionBoundaryScan)
	for _, channel := range session.Channels {
		channels[channel.ID] = channel
		switch strings.ToLower(strings.TrimSpace(channel.SourceName)) {
		case "fuel level", "virtual energy", "minimum path wetness", "fuelmixturemap", "tyres wear":
			scan, err := newOrderedProjectionBoundaryScan(unique)
			if err != nil {
				t.Fatal(err)
			}
			scans[channel.ID] = scan
		}
	}
	result := make([]HistoricalPage, 0, len(pages))
	for _, page := range pages {
		channel := channels[page.ChannelID]
		if page.Sampling.Kind != SamplingContinuousImplicitFrequency {
			result = append(result, page)
			continue
		}
		scan := scans[page.ChannelID]
		if scan == nil {
			continue
		}
		vector := strings.EqualFold(channel.SourceName, "Tyres Wear")
		for _, sample := range page.Samples {
			usable := false
			if vector {
				_, _, usable = numericVector(sample.Values)
			} else {
				_, _, usable = numericValue(sample.Values)
			}
			if !scan.accept(sample, usable) {
				t.Fatal("fixture projection rows are not time ordered")
			}
			if includePitRows && usable && sample.TimestampSeconds != nil && !math.IsNaN(*sample.TimestampSeconds) && !math.IsInf(*sample.TimestampSeconds, 0) &&
				(strings.EqualFold(channel.SourceName, "Fuel Level") || strings.EqualFold(channel.SourceName, "Virtual Energy")) {
				for _, interval := range pitIntervals {
					if !interval.open && *sample.TimestampSeconds >= interval.start && *sample.TimestampSeconds <= interval.end {
						scan.selectSample(sample)
						break
					}
				}
			}
		}
	}
	for _, channel := range session.Channels {
		if scan := scans[channel.ID]; scan != nil {
			result = append(result, HistoricalPage{ChannelID: channel.ID, Sampling: channel.Sampling, Samples: scan.finish()})
		}
	}
	return result
}
