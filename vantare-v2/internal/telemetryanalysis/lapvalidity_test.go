package telemetryanalysis

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

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
		gaps int
	}{
		{name: "S045 baseline simple", file: "lap-validity-s045-v1.json", gaps: 1},
		{name: "S266 delta temporal adversarial", file: "lap-validity-s266-v1.json", gaps: 1},
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
			if got := len(analysis.Temporal.StintBoundaries) + 1; got != expected.ApparentStints {
				t.Fatalf("apparent stints = %d, expected %d", got, expected.ApparentStints)
			}
			if got := len(analysis.Temporal.Gaps); got != test.gaps {
				t.Fatalf("coverage gaps = %d, expected %d", got, test.gaps)
			}
			if len(analysis.Laps) != expected.LapEventRows {
				t.Fatalf("lap records = %d, expected one per lap event (%d)", len(analysis.Laps), expected.LapEventRows)
			}
			if got := countCompleteLaps(analysis.Laps); got != expected.LapTimeUsableRows {
				t.Fatalf("complete lap records = %d, expected %d", got, expected.LapTimeUsableRows)
			}
			if got := lapLabelCounts(analysis.Laps); !equalCountMaps(got, expected.Labels) {
				t.Fatalf("labels = %v, expected %v", got, expected.Labels)
			}
			if got := boundarySourceCounts(analysis); !equalCountMaps(got, expected.BoundarySources) {
				t.Fatalf("boundary sources = %v, expected %v", got, expected.BoundarySources)
			}
			if got := boundaryQualityCounts(analysis); !equalCountMaps(got, expected.BoundaryQualities) {
				t.Fatalf("boundary qualities = %v, expected %v", got, expected.BoundaryQualities)
			}
			if got := stintCauseCounts(analysis); !equalCountMaps(got, expected.StintCauses) {
				t.Fatalf("stint causes = %v, expected %v", got, expected.StintCauses)
			}
			gapSeconds := analysis.Temporal.Gaps[0].EndTs.Sub(analysis.Temporal.Gaps[0].StartTs).Seconds()
			if math.Abs(gapSeconds-expected.CoverageGapSeconds) > 0.001 {
				t.Fatalf("coverage gap = %.3fs, expected %.3fs", gapSeconds, expected.CoverageGapSeconds)
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
		countLapLabel(analysis.Laps, LapLabelTraffic) == 0 ||
		countLapLabel(analysis.Laps, LapLabelPaceOutlier) == 0 {
		t.Fatalf("required labels missing: %+v", lapLabelCounts(analysis.Laps))
	}

	for _, lap := range analysis.Laps {
		if !lap.HasLabel(LapLabelTraffic) {
			continue
		}
		for _, use := range lap.FamilyUse {
			for _, reason := range use.ExclusionReasons {
				if reason == "traffic" {
					t.Fatalf("traffic excluded from %s on lap %d", use.Family, lap.Number)
				}
			}
		}
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

func TestAnalyzeLapValidityPreservesResetOnlyIncompleteLaps(t *testing.T) {
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
	if err != nil {
		t.Fatalf("AnalyzeLapValidity() error = %v", err)
	}
	if len(analysis.Laps) != fixture.ExpectedSpikeCounts.LapDistResets {
		t.Fatalf("reset-only laps = %d", len(analysis.Laps))
	}
	for _, lap := range analysis.Laps {
		if lap.Complete || !lap.HasLabel(LapLabelIncomplete) {
			t.Fatalf("reset-only lap claims completeness: %+v", lap)
		}
	}
	for _, boundary := range analysis.Temporal.LapBoundaries {
		if boundary.Source != "lap_dist_reset" || boundary.Quality != "unknown" {
			t.Fatalf("reset-only boundary = %+v", boundary)
		}
	}
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
