package telemetryanalysis

import "testing"

func pitOverlapEvent(seconds float64, active bool) observedEvent {
	return observedEvent{seconds: seconds, values: []HistoricalValue{{Present: true, Quality: QualityValid, Scalar: HistoricalScalar{Kind: ScalarBoolean, Boolean: active}}}}
}

func TestPitOverlapInsideLapAndBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name   string
		events []observedEvent
		pit    bool
	}{
		{"inside", []observedEvent{pitOverlapEvent(80, true), pitOverlapEvent(100, false)}, true},
		{"entry_at_end", []observedEvent{pitOverlapEvent(120, true)}, true},
		{"exit_at_start", []observedEvent{pitOverlapEvent(40, true), pitOverlapEvent(60, false)}, false},
		{"before_lap", []observedEvent{pitOverlapEvent(40, true), pitOverlapEvent(50, false)}, false},
		{"after_lap", []observedEvent{pitOverlapEvent(121, true)}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			start := secondsTimestamp(60)
			laps := []AnalyzedLap{{Number: 2, Start: &start, End: secondsTimestamp(120), Complete: true}}
			labelPitLaps(laps, tc.events)
			if laps[0].HasLabel(LapLabelPit) != tc.pit {
				t.Fatalf("labels=%v wantPit=%t", laps[0].Labels, tc.pit)
			}
			laps[0].FamilyUse = familyUseForLap(laps[0])
			if tc.pit && familyIncluded(laps[0], FamilyCombinedStintPaceCurve) {
				t.Fatal("pit lap contaminates pace")
			}
			if !familyIncluded(laps[0], FamilyPit) || !familyIncluded(laps[0], FamilyObservedStrategy) {
				t.Fatal("pit evidence was discarded")
			}
		})
	}
}

func TestPitOverlapAcrossLapsKeepsEntryAndExit(t *testing.T) {
	laps := make([]AnalyzedLap, 3)
	for index := range laps {
		start := secondsTimestamp(float64((index + 1) * 60))
		laps[index] = AnalyzedLap{Number: index + 2, Start: &start, End: secondsTimestamp(float64((index + 2) * 60)), Complete: true}
	}
	labelPitLaps(laps, []observedEvent{pitOverlapEvent(80, true), pitOverlapEvent(200, false)})
	if !laps[0].HasLabel(LapLabelPit) || !laps[1].HasLabel(LapLabelPit) || !laps[2].HasLabel(LapLabelOutLap) {
		t.Fatalf("labels=%+v", laps)
	}
	for _, lap := range laps {
		lap.FamilyUse = familyUseForLap(lap)
		if familyIncluded(lap, FamilyCombinedStintPaceCurve) {
			t.Fatal("pit span contaminates pace")
		}
	}
}

func TestPitOverlapIgnoresInvalidEvent(t *testing.T) {
	start := secondsTimestamp(60)
	laps := []AnalyzedLap{{Start: &start, End: secondsTimestamp(120), Complete: true}}
	event := pitOverlapEvent(80, true)
	event.values[0].Quality = QualityInvalid
	labelPitLaps(laps, []observedEvent{event, pitOverlapEvent(100, false)})
	if laps[0].HasLabel(LapLabelPit) {
		t.Fatal("invalid event contaminated labels")
	}
}
