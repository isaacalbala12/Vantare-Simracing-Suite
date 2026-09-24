package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

func TestLapDistResetObservationsMatchSortedPath(t *testing.T) {
	sample := func(index int64, distance, seconds float64) HistoricalSample {
		return HistoricalSample{
			Index: index, TimestampSeconds: &seconds,
			Values: []HistoricalValue{{Column: "Lap Dist", Present: true, Quality: QualityValid,
				Scalar: HistoricalScalar{Kind: ScalarNumber, Number: distance}}},
		}
	}
	sampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginSourceTimestamp}
	ordered := []HistoricalPage{
		{Sampling: sampling, Samples: []HistoricalSample{sample(0, 900, 10), sample(1, 950, 10.1)}},
		{Sampling: sampling, Samples: []HistoricalSample{sample(2, 10, 10.2), sample(4, 990, 10.4), sample(5, 20, 10.5)}},
	}
	unordered := []HistoricalPage{
		{Sampling: sampling, Samples: []HistoricalSample{sample(2, 10, 10.2), sample(0, 900, 10)}},
		{Sampling: sampling, Samples: []HistoricalSample{sample(1, 950, 10.1), sample(4, 990, 10.4), sample(5, 20, 10.5)}},
	}
	unknownOrigin := append([]HistoricalPage(nil), ordered...)
	unknownOrigin[1].Sampling.Origin = TimeOriginUnknown
	mismatch := append([]HistoricalPage(nil), ordered...)
	mismatch[1].Sampling.FrequencyHz = 5
	for _, test := range []struct {
		name  string
		pages []HistoricalPage
	}{
		{name: "ordered across pages and gaps", pages: ordered},
		{name: "unordered fallback", pages: unordered},
		{name: "unknown timestamp origin", pages: unknownOrigin},
		{name: "frequency mismatch", pages: mismatch},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, gotFrequency := readLapDistResetObservations(test.pages)
			want, wantFrequency := readUnorderedLapDistResetObservations(test.pages)
			if gotFrequency != wantFrequency || !reflect.DeepEqual(got, want) {
				t.Fatalf("streamed resets (%v, %d) differ from sorted path (%v, %d)", got, gotFrequency, want, wantFrequency)
			}
		})
	}
	got, frequency := readLapDistResetObservations(ordered)
	if frequency != 10 || len(got) != 2 || got[0].index != 2 || got[1].index != 5 ||
		got[0].seconds == nil || *got[0].seconds != 10.2 || !got[0].qualityValid {
		t.Fatalf("unexpected ordered lap resets: %v, frequency %d", got, frequency)
	}
	var scan orderedLapDistResetScan
	for _, page := range ordered {
		if !scan.accept(page) {
			t.Fatal("ordered page was rejected")
		}
	}
	streamed, streamedFrequency := scan.finish()
	if streamedFrequency != frequency || !reflect.DeepEqual(streamed, got) {
		t.Fatalf("page-fed resets (%v, %d) differ from materialized (%v, %d)", streamed, streamedFrequency, got, frequency)
	}
}

func TestChannelCoverageWindowKeepsUnorderedSemantics(t *testing.T) {
	sampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginSourceTimestamp}
	point := func(index int64, seconds float64) HistoricalSample {
		return HistoricalSample{Index: index, TimestampSeconds: &seconds}
	}
	ordered := []HistoricalPage{
		{Sampling: sampling, Samples: []HistoricalSample{point(0, 10), point(1, 10.1)}},
		{Sampling: sampling, Samples: []HistoricalSample{point(2, 10.2)}},
	}
	// The first page seems to have a gap, but the second fills it. A one-pass
	// rejection would change the existing sorted interpretation.
	unordered := []HistoricalPage{
		{Sampling: sampling, Samples: []HistoricalSample{point(0, 10), point(2, 10.2)}},
		{Sampling: sampling, Samples: []HistoricalSample{point(1, 10.1)}},
	}
	gap := []HistoricalPage{{Sampling: sampling, Samples: []HistoricalSample{point(0, 10), point(2, 10.2)}}}
	badTime := []HistoricalPage{{Sampling: sampling, Samples: []HistoricalSample{point(0, 10), point(1, 9)}}}
	for _, test := range []struct {
		name  string
		pages []HistoricalPage
	}{
		{name: "ordered pages", pages: ordered},
		{name: "unordered pages that fill a gap", pages: unordered},
		{name: "missing index", pages: gap},
		{name: "nonmonotonic clock", pages: badTime},
	} {
		t.Run(test.name, func(t *testing.T) {
			start, end, ok := channelCoverageWindow(test.pages)
			wantStart, wantEnd, wantOK := unorderedChannelCoverageWindow(test.pages)
			if start != wantStart || end != wantEnd || ok != wantOK {
				t.Fatalf("coverage (%v, %v, %v), sorted path (%v, %v, %v)", start, end, ok, wantStart, wantEnd, wantOK)
			}
		})
	}
	start, end, ok := channelCoverageWindow(unordered)
	if !ok || start != 10 || end != 10.2 {
		t.Fatalf("filled unordered coverage = (%v, %v, %v)", start, end, ok)
	}
}

type lapValidityFixture struct {
	FixtureVersion      string                    `json:"fixtureVersion"`
	FixtureID           string                    `json:"fixtureId"`
	Pages               []lapValidityFixturePage  `json:"pages"`
	ExpectedSpikeCounts lapValidityExpectedCounts `json:"expectedSpikeCounts"`
}

type lapValidityFixturePage struct {
	Channel        string                     `json:"channel"`
	Sampling       SamplingKind               `json:"sampling"`
	FrequencyHz    int                        `json:"frequencyHz"`
	SourceRowCount int                        `json:"sourceRowCount"`
	Samples        []lapValidityFixtureSample `json:"samples"`
}

type lapValidityFixtureSample struct {
	Index  int64 `json:"index"`
	TS     *float64
	Values []any `json:"values"`
}

func (s *lapValidityFixtureSample) UnmarshalJSON(data []byte) error {
	type fixtureSample struct {
		Index  int64    `json:"index"`
		TS     *float64 `json:"ts"`
		Values []any    `json:"values"`
	}
	var decoded fixtureSample
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	s.Index = decoded.Index
	s.TS = decoded.TS
	s.Values = decoded.Values
	return nil
}

type lapValidityExpectedCounts struct {
	Laps               int              `json:"laps"`
	LapEventRows       int              `json:"lapEventRows"`
	LapTimeUsableRows  int              `json:"lapTimeUsableRows"`
	LapDistResets      int              `json:"lapDistResets"`
	PitLaps            int              `json:"pitLaps"`
	ApparentStints     int              `json:"apparentStints"`
	Labels             map[LapLabel]int `json:"labels"`
	BoundarySources    map[string]int   `json:"boundarySources"`
	BoundaryQualities  map[string]int   `json:"boundaryQualities"`
	StintCauses        map[string]int   `json:"stintCauses"`
	CoverageGapSeconds float64          `json:"coverageGapSeconds"`
}

func TestAnalyzeLapValidityRealSanitizedFixtures(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		file string
	}{
		{name: "S045 baseline simple", file: "lap-validity-s045-v1.json"},
		{name: "S266 delta temporal adversarial", file: "lap-validity-s266-v1.json"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			fixture := loadLapValidityFixture(t, test.file)
			session, pages := fixtureHistoricalInput(t, fixture)

			analysis, err := AnalyzeLapValidity(session, pages)
			if err != nil {
				t.Fatalf("AnalyzeLapValidity() error = %v", err)
			}

			expected := fixture.ExpectedSpikeCounts
			if analysis.Diagnostics.ReconciledLaps != expected.Laps ||
				analysis.Diagnostics.LapEventRows != expected.LapEventRows ||
				analysis.Diagnostics.UsableLapTimeRows != expected.LapTimeUsableRows ||
				analysis.Diagnostics.LapDistResets != expected.LapDistResets {
				t.Fatalf("diagnostics = %+v, expected spike counts = %+v", analysis.Diagnostics, expected)
			}
			if got := countLapLabel(analysis.Laps, LapLabelPit); got != expected.PitLaps {
				t.Fatalf("pit labels = %d, expected %d", got, expected.PitLaps)
			}
			if analysis.Diagnostics.TemporalBridge.Aligned || analysis.Diagnostics.TemporalBridge.Reason != "bridge_absent" {
				t.Fatalf("fixture without GPS bridge = %+v", analysis.Diagnostics.TemporalBridge)
			}
			if got := len(analysis.Temporal.Gaps); got != 0 {
				t.Fatalf("unaligned fixture published %d coverage gaps", got)
			}
			if len(analysis.Laps) != expected.LapEventRows {
				t.Fatalf("lap records = %d, expected one per lap event (%d)", len(analysis.Laps), expected.LapEventRows)
			}
			if got := countCompleteLaps(analysis.Laps); got != expected.LapTimeUsableRows {
				t.Fatalf("complete lap records = %d, expected %d", got, expected.LapTimeUsableRows)
			}
			labelsWithoutTraffic := cloneCountMap(expected.Labels)
			delete(labelsWithoutTraffic, LapLabelTraffic)
			if got := lapLabelCounts(analysis.Laps); !equalCountMaps(got, labelsWithoutTraffic) {
				t.Fatalf("labels = %v, expected fail-closed %v", got, labelsWithoutTraffic)
			}
			if got := boundarySourceCounts(analysis); !equalCountMaps(got, map[string]int{"lap_event": expected.LapEventRows}) {
				t.Fatalf("boundary sources = %v, expected event-only boundaries", got)
			}
			if got := boundaryQualityCounts(analysis); !equalCountMaps(got, map[string]int{"unknown": expected.LapEventRows}) {
				t.Fatalf("boundary qualities = %v, expected unknown without bridge", got)
			}
			causesWithoutFuel := cloneCountMap(expected.StintCauses)
			delete(causesWithoutFuel, "fuel_jump")
			if got := stintCauseCounts(analysis); !equalCountMaps(got, causesWithoutFuel) {
				t.Fatalf("stint causes = %v, expected fail-closed %v", got, causesWithoutFuel)
			}
			assertTemporalContractValid(t, analysis)
			assertFamilyReasonsExplicit(t, analysis.Laps)
		})
	}
}

func TestLapValidityLabelsAndFamilyExclusions(t *testing.T) {
	t.Parallel()
	fixture := loadLapValidityFixture(t, "lap-validity-s266-v1.json")
	session, pages := fixtureHistoricalInput(t, fixture)

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatalf("AnalyzeLapValidity() error = %v", err)
	}
	if countLapLabel(analysis.Laps, LapLabelOutLap) == 0 ||
		countLapLabel(analysis.Laps, LapLabelInLap) == 0 ||
		countLapLabel(analysis.Laps, LapLabelIncidentOfftrack) == 0 ||
		countLapLabel(analysis.Laps, LapLabelPaceOutlier) == 0 {
		t.Fatalf("required labels missing: %+v", lapLabelCounts(analysis.Laps))
	}
	if countLapLabel(analysis.Laps, LapLabelTraffic) != 0 {
		t.Fatal("unaligned traffic was attributed to a lap")
	}

}

func TestAnalyzeLapValidityDeclaresSingleSourceQuality(t *testing.T) {
	t.Parallel()
	fixture := loadLapValidityFixture(t, "lap-validity-s045-v1.json")
	session, pages := fixtureHistoricalInput(t, fixture)
	filtered := pages[:0]
	for _, page := range pages {
		if fixtureSourceNameForPage(session, page) != "Lap Dist" {
			filtered = append(filtered, page)
		}
	}

	analysis, err := AnalyzeLapValidity(session, filtered)
	if err != nil {
		t.Fatalf("AnalyzeLapValidity() error = %v", err)
	}
	for _, boundary := range analysis.Temporal.LapBoundaries {
		if boundary.Source != "lap_event" || boundary.Quality != "unknown" {
			t.Fatalf("single-source boundary = %+v", boundary)
		}
	}
}

func TestReconcileLapBoundariesRequiresIndependentAlignedReset(t *testing.T) {
	t.Parallel()
	events := []observedLapEvent{
		{seconds: 1000, lapNumber: 0, qualityValid: true}, // Initial state, not a proved crossing.
		{seconds: 1100, lapNumber: 1, qualityValid: true},
		{seconds: 1200, lapNumber: 2, qualityValid: true},
	}
	for _, test := range []struct {
		name   string
		resets []observedLapReset
		want   []string
	}{
		{name: "aligned independent crossings", resets: []observedLapReset{{seconds: floatPointer(1100.05), qualityValid: true}, {seconds: floatPointer(1200.05), qualityValid: true}}, want: []string{"unknown", "valid", "valid"}},
		{name: "one crossing missing", resets: []observedLapReset{{seconds: floatPointer(1100.05), qualityValid: true}}, want: []string{"unknown", "valid", "unknown"}},
		{name: "unmatched distance clock", resets: []observedLapReset{{seconds: floatPointer(1100.11), qualityValid: true}, {seconds: floatPointer(1200.11), qualityValid: true}}, want: []string{"unknown", "unknown", "unknown"}},
		{name: "ambiguous double reset", resets: []observedLapReset{{seconds: floatPointer(1100.04), qualityValid: true}, {seconds: floatPointer(1100.05), qualityValid: true}, {seconds: floatPointer(1200.05), qualityValid: true}}, want: []string{"unknown", "unknown", "valid"}},
		{name: "unaligned reset", resets: []observedLapReset{{}, {}}, want: []string{"unknown", "unknown", "unknown"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			boundaries := reconcileLapBoundaries(events, test.resets, 10, true, strategyprojection.Provenance{})
			if len(boundaries) != len(test.want) {
				t.Fatalf("boundaries=%d, want %d", len(boundaries), len(test.want))
			}
			for index, boundary := range boundaries {
				if string(boundary.Quality) != test.want[index] {
					t.Fatalf("boundary %d quality=%s, want %s", index, boundary.Quality, test.want[index])
				}
			}
		})
	}
}

func TestReconcileLapBoundariesRejectsUntrustedCrossings(t *testing.T) {
	t.Parallel()
	baseEvents := []observedLapEvent{
		{seconds: 1000, lapNumber: 0, qualityValid: true},
		{seconds: 1100, lapNumber: 1, qualityValid: true},
	}
	baseResets := []observedLapReset{{seconds: floatPointer(1100.05), qualityValid: true}}
	for _, test := range []struct {
		name    string
		mutate  func([]observedLapEvent, []observedLapReset)
		aligned bool
	}{
		{name: "no GPS bridge", aligned: false},
		{name: "uncertain event", aligned: true, mutate: func(events []observedLapEvent, _ []observedLapReset) { events[1].qualityValid = false }},
		{name: "uncertain distance", aligned: true, mutate: func(_ []observedLapEvent, resets []observedLapReset) { resets[0].qualityValid = false }},
		{name: "lap number jump", aligned: true, mutate: func(events []observedLapEvent, _ []observedLapReset) { events[1].lapNumber = 2 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			events := append([]observedLapEvent(nil), baseEvents...)
			resets := append([]observedLapReset(nil), baseResets...)
			if test.mutate != nil {
				test.mutate(events, resets)
			}
			boundaries := reconcileLapBoundaries(events, resets, 10, test.aligned, strategyprojection.Provenance{})
			if boundaries[1].Quality != strategyprojection.PresenceUnknown {
				t.Fatalf("untrusted crossing became %s", boundaries[1].Quality)
			}
		})
	}
}

func TestAnalyzeLapValidityRejectsUnalignedResetOnlyLaps(t *testing.T) {
	t.Parallel()
	fixture := loadLapValidityFixture(t, "lap-validity-s045-v1.json")
	session, pages := fixtureHistoricalInput(t, fixture)
	filtered := pages[:0]
	for _, page := range pages {
		name := fixtureSourceNameForPage(session, page)
		if name != "Lap" && name != "Lap Time" {
			filtered = append(filtered, page)
		}
	}

	analysis, err := AnalyzeLapValidity(session, filtered)
	if !errors.Is(err, ErrInvalidLapValidityInput) || len(analysis.Laps) != 0 {
		t.Fatalf("unaligned reset-only source was accepted: analysis=%+v err=%v", analysis, err)
	}
}

func TestAnalyzeLapValidityHandlesIncidentsOutsideLapRange(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                   string
		incidentSeconds        float64
		expectedIncidentLabels int
	}{
		{name: "before first lap", incidentSeconds: 5, expectedIncidentLabels: 1},
		{name: "after last lap", incidentSeconds: 35, expectedIncidentLabels: 0},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			fixture := lapValidityFixture{
				FixtureVersion: "lap-validity-fixture.v1",
				FixtureID:      "synthetic-incident-outside-laps",
				Pages: []lapValidityFixturePage{
					{
						Channel: "Lap", Sampling: SamplingEventTimestamped, SourceRowCount: 3,
						Samples: []lapValidityFixtureSample{
							{Index: 0, TS: floatPointer(10), Values: []any{float64(0)}},
							{Index: 1, TS: floatPointer(20), Values: []any{float64(1)}},
							{Index: 2, TS: floatPointer(30), Values: []any{float64(2)}},
						},
					},
					{
						Channel: "LastImpactMagnitude", Sampling: SamplingEventTimestamped, SourceRowCount: 1,
						Samples: []lapValidityFixtureSample{
							{Index: 0, TS: &test.incidentSeconds, Values: []any{true}},
						},
					},
				},
			}
			session, pages := fixtureHistoricalInput(t, fixture)

			analysis, err := AnalyzeLapValidity(session, pages)
			if err != nil {
				t.Fatalf("AnalyzeLapValidity() error = %v", err)
			}
			if got := countLapLabel(analysis.Laps, LapLabelIncidentOfftrack); got != test.expectedIncidentLabels {
				t.Fatalf("incident labels = %d, expected %d", got, test.expectedIncidentLabels)
			}
		})
	}
}

func TestAnalyzeLapValidityUsesAlignedFuelRiseAndCoverage(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	originalFuelTimestamp := pages[2].Samples[17].TimestampSeconds

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	if analysis.ComputationVersion != "lap-validity.v3" {
		t.Fatalf("computation version = %q", analysis.ComputationVersion)
	}
	if !analysis.Diagnostics.TemporalBridge.Aligned {
		t.Fatalf("temporal bridge = %+v", analysis.Diagnostics.TemporalBridge)
	}
	if len(analysis.Temporal.StintBoundaries) != 1 {
		t.Fatalf("stint boundaries = %+v; gradual refuel created a phantom stint", analysis.Temporal.StintBoundaries)
	}
	boundary := analysis.Temporal.StintBoundaries[0]
	if boundary.Cause != "pit" || timestampSeconds(boundary.Timestamp) != 1025 {
		t.Fatalf("merged pit/fuel boundary = %+v", boundary)
	}
	if len(analysis.Temporal.Segments) != 1 {
		t.Fatalf("coverage segments = %+v", analysis.Temporal.Segments)
	}
	segment := analysis.Temporal.Segments[0]
	if timestampSeconds(segment.SessionStartTs) != 1005 || timestampSeconds(segment.SessionEndTs) != 1025 {
		t.Fatalf("coverage = %v..%v, want 1005..1025", segment.SessionStartTs, segment.SessionEndTs)
	}
	if originalFuelTimestamp != nil || pages[2].Samples[17].TimestampSeconds != nil {
		t.Fatal("analysis mutated original pages")
	}
}

func TestAnalyzeLapValidityFailsClosedWithoutTemporalBridge(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	session.Channels = session.Channels[1:]
	pages = pages[1:]

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	if analysis.Diagnostics.TemporalBridge.Aligned || analysis.Diagnostics.TemporalBridge.Reason != "bridge_absent" {
		t.Fatalf("temporal bridge = %+v", analysis.Diagnostics.TemporalBridge)
	}
	for _, boundary := range analysis.Temporal.StintBoundaries {
		if boundary.Cause == "fuel_jump" {
			t.Fatalf("unaligned fuel produced boundary %+v", boundary)
		}
	}
	if len(analysis.Temporal.Segments) != 0 || len(analysis.Temporal.Gaps) != 0 {
		t.Fatalf("unaligned continuous data produced coverage: %+v", analysis.Temporal)
	}
}

func TestAnalyzeLapValidityUsesAlignedGradualFuelRiseWithoutPitEvents(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	pages = pages[:6]

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	if got := stintCauseCounts(analysis); !equalCountMaps(got, map[string]int{"fuel_jump": 1}) {
		t.Fatalf("stint causes = %v, want one gradual fuel rise", got)
	}
}

func TestAnalyzeLapValidityIgnoresInitialFuelRiseAndPitState(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	fuel := &pages[2]
	for index := range fuel.Samples {
		fuel.Samples[index].Values = []HistoricalValue{numberValue("Fuel Level", 100-float64(index))}
	}
	for index := 1; index <= 4; index++ {
		fuel.Samples[index].Values = []HistoricalValue{numberValue("Fuel Level", 100+float64(index)*2)}
	}
	pages[6].Samples = []HistoricalSample{
		{Index: 0, TimestampSeconds: floatPointer(1000), Values: []HistoricalValue{booleanValue("In Pits", true)}},
		{Index: 1, TimestampSeconds: floatPointer(1004), Values: []HistoricalValue{booleanValue("In Pits", false)}},
	}

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	if len(analysis.Temporal.StintBoundaries) != 0 {
		t.Fatalf("initial state created stint boundaries: %+v", analysis.Temporal.StintBoundaries)
	}
}

func TestAnalyzeLapValidityIgnoresFuelRiseInsideInitialPitState(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	pages[6].Samples = []HistoricalSample{
		{Index: 0, TimestampSeconds: floatPointer(1000), Values: []HistoricalValue{booleanValue("In Pits", true)}},
		{Index: 1, TimestampSeconds: floatPointer(1022), Values: []HistoricalValue{booleanValue("In Pits", false)}},
	}

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	if len(analysis.Temporal.StintBoundaries) != 0 {
		t.Fatalf("fuel rise inside initial pit state created stint boundaries: %+v", analysis.Temporal.StintBoundaries)
	}
}

func TestAnalyzeLapValidityMergesPitCrossingWithLaterFuelRise(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	pages[6].Samples = []HistoricalSample{
		{Index: 0, TimestampSeconds: floatPointer(1000), Values: []HistoricalValue{booleanValue("In Pits", false)}},
		{Index: 1, TimestampSeconds: floatPointer(1014), Values: []HistoricalValue{booleanValue("In Pits", true)}},
		{Index: 2, TimestampSeconds: floatPointer(1018), Values: []HistoricalValue{booleanValue("In Pits", false)}},
	}

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	if got := stintCauseCounts(analysis); !equalCountMaps(got, map[string]int{"pit": 1}) {
		t.Fatalf("stint causes = %v, want one pit-priority boundary", got)
	}
	if got := timestampSeconds(analysis.Temporal.StintBoundaries[0].Timestamp); got != 1015 {
		t.Fatalf("pit boundary = %v, want crossed lap boundary 1015", got)
	}
}

func TestAnalyzeLapValidityAttributesAlignedTraffic(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	session.Channels = append(session.Channels, HistoricalChannel{
		ID: "traffic", SourceName: "Time Behind Next",
		Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 1, Origin: TimeOriginUnknown},
		Columns:  []HistoricalColumn{{Name: "Time Behind Next", Type: ScalarNumber}},
	})
	pages = append(pages, HistoricalPage{
		ChannelID: "traffic", Sampling: session.Channels[len(session.Channels)-1].Sampling,
		Samples: []HistoricalSample{
			{Index: 5, Values: []HistoricalValue{numberValue("Time Behind Next", 20)}},
			{Index: 6, Values: []HistoricalValue{numberValue("Time Behind Next", 1)}},
			{Index: 7, Values: []HistoricalValue{numberValue("Time Behind Next", 20)}},
		},
	})

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	if got := countLapLabel(analysis.Laps, LapLabelTraffic); got != 1 {
		t.Fatalf("traffic labels = %d, want 1", got)
	}
	for _, lap := range analysis.Laps {
		if lap.HasLabel(LapLabelTraffic) {
			assertTrafficExcludedFromRelevantFamilies(t, lap)
		}
	}
}

func TestContinuousCoverageUsesOneContiguousChannel(t *testing.T) {
	sampling := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 1, Origin: TimeOriginSourceTimestamp}
	discontinuous := []HistoricalPage{{Sampling: sampling, Samples: []HistoricalSample{
		{Index: 0, TimestampSeconds: floatPointer(1000)},
		{Index: 2, TimestampSeconds: floatPointer(1002)},
	}}}
	fallback := []HistoricalPage{{Sampling: sampling, Samples: []HistoricalSample{
		{Index: 5, TimestampSeconds: floatPointer(1005)},
		{Index: 6, TimestampSeconds: floatPointer(1006)},
	}}}

	start, end, ok := continuousCoverageWindow(discontinuous, fallback)
	if !ok || start != 1005 || end != 1006 {
		t.Fatalf("coverage = %v..%v ok=%v, want contiguous fallback 1005..1006", start, end, ok)
	}
	if _, _, ok := continuousCoverageWindow(discontinuous); ok {
		t.Fatal("discontinuous channel claimed continuous coverage")
	}
}

func TestAnalyzeLapValidityUsesAlignedResetsWithoutLapEvents(t *testing.T) {
	session, pages := reducedT19aTemporalRegression(t)
	session.Channels = session.Channels[:4]
	pages = pages[:4]

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	if len(analysis.Laps) != 3 || len(analysis.Temporal.LapBoundaries) != 3 {
		t.Fatalf("aligned reset-only result: laps=%d boundaries=%d", len(analysis.Laps), len(analysis.Temporal.LapBoundaries))
	}
	for _, boundary := range analysis.Temporal.LapBoundaries {
		if boundary.Source != "lap_dist_reset" {
			t.Fatalf("reset boundary = %+v", boundary)
		}
	}
}

func reducedT19aTemporalRegression(t *testing.T) (HistoricalSession, []HistoricalPage) {
	t.Helper()
	continuous := func(id, name string) HistoricalChannel {
		return HistoricalChannel{ID: id, SourceName: name, Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 1, Origin: TimeOriginUnknown}, Columns: []HistoricalColumn{{Name: name, Type: ScalarNumber}}}
	}
	event := func(id, name string, kind ScalarKind) HistoricalChannel {
		return HistoricalChannel{ID: id, SourceName: name, Sampling: HistoricalSampling{Kind: SamplingEventTimestamped, Origin: TimeOriginSourceTimestamp}, Columns: []HistoricalColumn{{Name: name, Type: kind}}}
	}
	session := HistoricalSession{SchemaVersion: HistoricalSchemaVersion, ID: "t19a-reduced-regression", Channels: []HistoricalChannel{
		{ID: "gps", SourceName: "GPS Time", Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginUnknown}, Columns: []HistoricalColumn{{Name: "GPS Time", Type: ScalarNumber}}},
		continuous("lap-dist", "Lap Dist"),
		continuous("fuel", "Fuel Level"),
		continuous("track-temp", "Track Temperature"),
		event("lap", "Lap", ScalarNumber),
		event("lap-time", "Lap Time", ScalarNumber),
		event("pits", "In Pits", ScalarBoolean),
	}}
	gps := HistoricalPage{ChannelID: "gps", Sampling: session.Channels[0].Sampling}
	for index := int64(0); index <= 300; index++ {
		gps.Samples = append(gps.Samples, HistoricalSample{Index: index, Values: []HistoricalValue{numberValue("GPS Time", 1000+float64(index)*0.1+float64(index)*0.00001)}})
	}
	lapDist := HistoricalPage{ChannelID: "lap-dist", Sampling: session.Channels[1].Sampling}
	fuel := HistoricalPage{ChannelID: "fuel", Sampling: session.Channels[2].Sampling}
	trackTemperature := HistoricalPage{ChannelID: "track-temp", Sampling: session.Channels[3].Sampling}
	fuelLevel := 90.0
	for index := int64(0); index <= 30; index++ {
		distance := float64(index%10) * 600
		lapDist.Samples = append(lapDist.Samples, HistoricalSample{Index: index, Values: []HistoricalValue{numberValue("Lap Dist", distance)}})
		if index > 0 {
			fuelLevel -= 0.5
		}
		if index >= 17 && index <= 20 {
			fuelLevel += 2
		}
		fuel.Samples = append(fuel.Samples, HistoricalSample{Index: index, Values: []HistoricalValue{numberValue("Fuel Level", fuelLevel)}})
		trackTemperature.Samples = append(trackTemperature.Samples, HistoricalSample{Index: index, Values: []HistoricalValue{numberValue("Track Temperature", 30)}})
	}
	lap := HistoricalPage{ChannelID: "lap", Sampling: session.Channels[4].Sampling, Samples: []HistoricalSample{
		{Index: 0, TimestampSeconds: floatPointer(1005), Values: []HistoricalValue{numberValue("Lap", 1)}},
		{Index: 1, TimestampSeconds: floatPointer(1015), Values: []HistoricalValue{numberValue("Lap", 2)}},
		{Index: 2, TimestampSeconds: floatPointer(1025), Values: []HistoricalValue{numberValue("Lap", 3)}},
	}}
	lapTime := HistoricalPage{ChannelID: "lap-time", Sampling: session.Channels[5].Sampling, Samples: []HistoricalSample{
		{Index: 0, TimestampSeconds: floatPointer(1005), Values: []HistoricalValue{numberValue("Lap Time", 10)}},
		{Index: 1, TimestampSeconds: floatPointer(1015), Values: []HistoricalValue{numberValue("Lap Time", 10)}},
		{Index: 2, TimestampSeconds: floatPointer(1025), Values: []HistoricalValue{numberValue("Lap Time", 10)}},
	}}
	pits := HistoricalPage{ChannelID: "pits", Sampling: session.Channels[6].Sampling, Samples: []HistoricalSample{
		{Index: 0, TimestampSeconds: floatPointer(1000), Values: []HistoricalValue{booleanValue("In Pits", false)}},
		{Index: 1, TimestampSeconds: floatPointer(1016), Values: []HistoricalValue{booleanValue("In Pits", true)}},
		{Index: 2, TimestampSeconds: floatPointer(1022), Values: []HistoricalValue{booleanValue("In Pits", false)}},
	}}
	return session, []HistoricalPage{gps, lapDist, fuel, trackTemperature, lap, lapTime, pits}
}

func booleanValue(column string, value bool) HistoricalValue {
	return HistoricalValue{Column: column, Present: true, Quality: QualityValid, Scalar: HistoricalScalar{Kind: ScalarBoolean, Boolean: value}}
}

func loadLapValidityFixture(t *testing.T, name string) lapValidityFixture {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var fixture lapValidityFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.FixtureVersion != "lap-validity-fixture.v1" {
		t.Fatalf("fixture version = %q", fixture.FixtureVersion)
	}
	return fixture
}

func fixtureHistoricalInput(t *testing.T, fixture lapValidityFixture) (HistoricalSession, []HistoricalPage) {
	t.Helper()
	session := HistoricalSession{SchemaVersion: HistoricalSchemaVersion, ID: fixture.FixtureID}
	pages := make([]HistoricalPage, 0, len(fixture.Pages))
	for order, source := range fixture.Pages {
		if source.SourceRowCount <= 0 {
			t.Fatalf("channel %q lacks source row count", source.Channel)
		}
		frequency := source.FrequencyHz
		origin := TimeOriginSourceTimestamp
		if source.Sampling == SamplingContinuousImplicitFrequency {
			origin = TimeOriginUnknown
		}
		channel := HistoricalChannel{
			ID: source.Channel, Order: order, SourceName: source.Channel,
			Sampling:   HistoricalSampling{Kind: source.Sampling, FrequencyHz: frequency, Origin: origin},
			Columns:    []HistoricalColumn{{Name: "value", Type: ScalarNumber}},
			Capability: QualityValid,
		}
		session.Channels = append(session.Channels, channel)
		page := HistoricalPage{ChannelID: channel.ID, Sampling: channel.Sampling}
		for _, row := range source.Samples {
			if row.Index < 0 || row.Index >= int64(source.SourceRowCount) {
				t.Fatalf("channel %q sample %d outside source row count %d", source.Channel, row.Index, source.SourceRowCount)
			}
			sample := HistoricalSample{Index: row.Index, TimestampSeconds: row.TS}
			if source.Sampling == SamplingContinuousImplicitFrequency {
				sample.RelativeTimeSeconds = float64(row.Index) / float64(frequency)
			}
			for index, raw := range row.Values {
				value := HistoricalValue{Column: "value", Present: true, Quality: QualityValid}
				if index > 0 {
					value.Column = "value" + strconv.Itoa(index+1)
				}
				switch typed := raw.(type) {
				case float64:
					value.Scalar = HistoricalScalar{Kind: ScalarNumber, Number: typed}
				case bool:
					value.Scalar = HistoricalScalar{Kind: ScalarBoolean, Boolean: typed}
				default:
					t.Fatalf("unsupported fixture scalar %T", raw)
				}
				sample.Values = append(sample.Values, value)
			}
			page.Samples = append(page.Samples, sample)
		}
		pages = append(pages, page)
	}
	return session, pages
}

func fixtureSourceNameForPage(session HistoricalSession, page HistoricalPage) string {
	for _, channel := range session.Channels {
		if channel.ID == page.ChannelID {
			return channel.SourceName
		}
	}
	return ""
}

func countLapLabel(laps []AnalyzedLap, label LapLabel) int {
	count := 0
	for _, lap := range laps {
		if lap.HasLabel(label) {
			count++
		}
	}
	return count
}

func countCompleteLaps(laps []AnalyzedLap) int {
	count := 0
	for _, lap := range laps {
		if lap.Complete {
			count++
		}
	}
	return count
}

func lapLabelCounts(laps []AnalyzedLap) map[LapLabel]int {
	counts := make(map[LapLabel]int)
	for _, lap := range laps {
		for _, label := range lap.Labels {
			counts[label]++
		}
	}
	return counts
}

func boundarySourceCounts(analysis LapValidityAnalysis) map[string]int {
	counts := make(map[string]int)
	for _, boundary := range analysis.Temporal.LapBoundaries {
		counts[string(boundary.Source)]++
	}
	return counts
}

func boundaryQualityCounts(analysis LapValidityAnalysis) map[string]int {
	counts := make(map[string]int)
	for _, boundary := range analysis.Temporal.LapBoundaries {
		counts[string(boundary.Quality)]++
	}
	return counts
}

func stintCauseCounts(analysis LapValidityAnalysis) map[string]int {
	counts := make(map[string]int)
	for _, boundary := range analysis.Temporal.StintBoundaries {
		counts[string(boundary.Cause)]++
	}
	return counts
}

func equalCountMaps[K comparable](left, right map[K]int) bool {
	if len(left) != len(right) {
		return false
	}
	for key, count := range left {
		if right[key] != count {
			return false
		}
	}
	return true
}

func cloneCountMap[K comparable](source map[K]int) map[K]int {
	clone := make(map[K]int, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

func assertFamilyReasonsExplicit(t *testing.T, laps []AnalyzedLap) {
	t.Helper()
	for _, lap := range laps {
		for _, use := range lap.FamilyUse {
			if use.Included && len(use.ExclusionReasons) != 0 {
				t.Fatalf("included family %s has reasons on lap %d", use.Family, lap.Number)
			}
			if !use.Included && len(use.ExclusionReasons) == 0 {
				t.Fatalf("excluded family %s lacks reason on lap %d", use.Family, lap.Number)
			}
		}
	}
}

func assertTrafficExcludedFromRelevantFamilies(t *testing.T, lap AnalyzedLap) {
	t.Helper()
	for _, use := range lap.FamilyUse {
		for _, reason := range use.ExclusionReasons {
			if reason == "traffic" {
				t.Fatalf("traffic excluded from %s on lap %d", use.Family, lap.Number)
			}
		}
	}
}

func assertTemporalContractValid(t *testing.T, analysis LapValidityAnalysis) {
	t.Helper()
	if analysis.Temporal.Segments == nil || analysis.Temporal.Gaps == nil ||
		analysis.Temporal.LapBoundaries == nil || analysis.Temporal.StintBoundaries == nil {
		t.Fatal("temporal arrays must never be nil")
	}
	if err := analysis.Temporal.ContractVersion.ValidateTemporal(); err != nil {
		t.Fatal(err)
	}
	for _, segment := range analysis.Temporal.Segments {
		if segment.DriverID != nil {
			t.Fatalf("invented driver identity: %q", *segment.DriverID)
		}
		if err := segment.Validate(); err != nil {
			t.Fatalf("invalid segment: %v", err)
		}
	}
	for _, gap := range analysis.Temporal.Gaps {
		if err := gap.Validate(); err != nil {
			t.Fatalf("invalid gap: %v", err)
		}
	}
	for _, boundary := range analysis.Temporal.LapBoundaries {
		if err := boundary.Validate(); err != nil {
			t.Fatalf("invalid lap boundary: %v", err)
		}
	}
	for _, boundary := range analysis.Temporal.StintBoundaries {
		if boundary.Cause == "driver_change" || boundary.Cause == "unknown" {
			t.Fatalf("unsupported inferred stint cause: %q", boundary.Cause)
		}
		if err := boundary.Validate(); err != nil {
			t.Fatalf("invalid stint boundary: %v", err)
		}
	}
}

func lapValidityNumberSample(index int64, ts *float64, value float64) HistoricalSample {
	sample := HistoricalSample{Index: index, TimestampSeconds: ts}
	sample.Values = append(sample.Values, HistoricalValue{
		Column: "value", Present: true, Quality: QualityValid,
		Scalar: HistoricalScalar{Kind: ScalarNumber, Number: value},
	})
	return sample
}

func TestAnalyzeLapValidityDropsDuplicateLapEvents(t *testing.T) {
	t.Parallel()
	sampling := HistoricalSampling{Kind: SamplingEventTimestamped, Origin: TimeOriginSourceTimestamp}
	session := HistoricalSession{SchemaVersion: HistoricalSchemaVersion, ID: "dup-laps"}
	session.Channels = append(session.Channels, HistoricalChannel{
		ID: "lap-ch", Order: 0, SourceName: "Lap", Sampling: sampling,
		Columns: []HistoricalColumn{{Name: "value", Type: ScalarNumber}}, Capability: QualityValid,
	})
	at := func(seconds float64) *float64 { return &seconds }
	page := HistoricalPage{ChannelID: "lap-ch", Sampling: sampling}
	page.Samples = append(page.Samples,
		lapValidityNumberSample(0, at(60), 1),
		lapValidityNumberSample(1, at(120), 2),
		lapValidityNumberSample(2, at(121), 2),
		lapValidityNumberSample(3, at(180), 3),
	)

	analysis, err := AnalyzeLapValidity(session, []HistoricalPage{page})
	if err != nil {
		t.Fatalf("AnalyzeLapValidity() error = %v", err)
	}
	if analysis.Diagnostics.DuplicateLapEvents != 1 {
		t.Fatalf("DuplicateLapEvents = %d, want 1", analysis.Diagnostics.DuplicateLapEvents)
	}
	if len(analysis.Laps) != 3 || analysis.Diagnostics.LapEventRows != 3 {
		t.Fatalf("laps = %d rows = %d, want 3 deduplicated lap events", len(analysis.Laps), analysis.Diagnostics.LapEventRows)
	}
	for index, lap := range analysis.Laps {
		if lap.Number != index+1 {
			t.Fatalf("lap %d number = %d", index, lap.Number)
		}
	}
}

func TestAnalyzeLapValidityDoesNotCompareFuelAcrossMissingBoundary(t *testing.T) {
	t.Parallel()
	continuous := HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 10, Origin: TimeOriginSourceTimestamp}
	session := HistoricalSession{SchemaVersion: HistoricalSchemaVersion, ID: "sparse-fuel"}
	pages := []HistoricalPage{}
	addChannel := func(name string, samples []HistoricalSample) {
		channel := HistoricalChannel{
			ID: name + "-ch", Order: len(session.Channels), SourceName: name, Sampling: continuous,
			Columns: []HistoricalColumn{{Name: "value", Type: ScalarNumber}}, Capability: QualityValid,
		}
		session.Channels = append(session.Channels, channel)
		pages = append(pages, HistoricalPage{ChannelID: channel.ID, Sampling: continuous, Samples: samples})
	}
	lapDist := []HistoricalSample{}
	for index := int64(0); index <= 30; index++ {
		meters := float64(index%10) * 400
		if index%10 == 0 && index > 0 {
			meters = 0
		}
		seconds := 100 + float64(index)/10
		lapDist = append(lapDist, lapValidityNumberSample(index, &seconds, meters))
	}
	addChannel("Lap Dist", lapDist)
	at := func(seconds float64) *float64 { return &seconds }
	fuel := []HistoricalSample{
		lapValidityNumberSample(10, at(101), 30),
		{Index: 11, TimestampSeconds: at(101.1), Values: []HistoricalValue{{Column: "value", Quality: QualityMissing}}},
		lapValidityNumberSample(12, at(101.2), 65),
	}
	addChannel("Fuel Level", fuel)

	analysis, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatalf("AnalyzeLapValidity() error = %v", err)
	}
	for _, boundary := range analysis.Temporal.StintBoundaries {
		if boundary.Cause == "fuel_jump" {
			t.Fatalf("fuel jump inferred across a missing boundary sample: %+v", boundary)
		}
	}
}
