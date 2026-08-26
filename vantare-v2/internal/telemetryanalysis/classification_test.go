package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type classificationExpectation struct {
	track   string
	layout  string
	car     string
	class   string
	type_   SessionType
	weather string
	usable  bool
}

func TestClassifyHistoricalSession_ReproducesSanitizedSpikeInventory(t *testing.T) {
	t.Parallel()

	sessions := loadClassificationFixtures(t)
	want := classificationGroundTruth()
	if len(sessions) != len(want) {
		t.Fatalf("fixture count = %d, want %d", len(sessions), len(want))
	}

	for _, session := range sessions {
		session := session
		t.Run(session.ID, func(t *testing.T) {
			t.Parallel()

			expected, ok := want[session.ID]
			if !ok {
				t.Fatalf("unexpected fixture %q", session.ID)
			}
			got, err := ClassifyHistoricalSession(session)
			if err != nil {
				t.Fatal(err)
			}
			if got.SessionID != session.ID || got.Combination.SimID != SimIDLMU ||
				got.Combination.TrackName != expected.track || got.Combination.TrackLayout != expected.layout ||
				got.Combination.CarName != expected.car || got.Combination.CarClass != expected.class ||
				got.Type != expected.type_ || got.WeatherConditions != expected.weather {
				t.Fatalf("classification = %#v, want %#v", got, expected)
			}
			if !strings.HasPrefix(got.Combination.ID, "lmu:") {
				t.Fatalf("combination ID = %q, want LMU identity", got.Combination.ID)
			}
			expectedStatus := SessionStatusIdentifiedNotUsable
			if expected.usable {
				expectedStatus = SessionStatusIdentifiedUsable
			}
			if got.Status != expectedStatus {
				t.Fatalf("status = %q, want %q", got.Status, expectedStatus)
			}
			for _, family := range got.Families {
				switch {
				case family.Family == FamilySessionClassification:
					if !family.Usable {
						t.Fatalf("classification family not usable: %#v", family)
					}
				case !expected.usable:
					if family.Usable || family.Reason != UnusableReasonNoCompletedLap {
						t.Fatalf("short session family = %#v, want no completed lap", family)
					}
				case family.Family == FamilyObservedStrategy && got.Type != SessionTypeRace:
					if family.Usable || family.Reason != UnusableReasonNotRace {
						t.Fatalf("non-race observed strategy family = %#v", family)
					}
				case !family.Usable:
					t.Fatalf("family %q should be usable: %#v", family.Family, family)
				}
			}
		})
	}
}

func TestClassifyHistoricalSession_SpotCheckAccuracyEightOfEight(t *testing.T) {
	t.Parallel()

	matched := 0
	for _, session := range loadClassificationFixtures(t) {
		if !strings.HasPrefix(session.ID, "spot-") {
			continue
		}
		classified, err := ClassifyHistoricalSession(session)
		if err != nil {
			t.Fatalf("%s: %v", session.ID, err)
		}
		expected := classificationGroundTruth()[session.ID]
		if classified.Combination.TrackName == expected.track &&
			classified.Combination.TrackLayout == expected.layout &&
			classified.Combination.CarName == expected.car &&
			classified.Combination.CarClass == expected.class &&
			classified.Type == expected.type_ &&
			classified.WeatherConditions == expected.weather {
			matched++
		}
	}
	if matched != 8 {
		t.Fatalf("spot-check accuracy = %d/8, want 8/8", matched)
	}
}

func TestClassifyHistoricalSession_RejectsInvalidIdentityWithoutDroppingItSilently(t *testing.T) {
	t.Parallel()

	base := loadClassificationFixtures(t)[0]
	tests := []struct {
		name   string
		mutate func(*HistoricalSession)
		want   error
	}{
		{
			name: "unsupported simulator",
			mutate: func(session *HistoricalSession) {
				session.Provenance.Source.Kind = SourceExternal
			},
			want: ErrUnsupportedSessionSimulator,
		},
		{
			name: "missing metadata",
			mutate: func(session *HistoricalSession) {
				session.Metadata = session.Metadata[1:]
			},
			want: ErrInvalidSessionClassification,
		},
		{
			name: "unknown session type",
			mutate: func(session *HistoricalSession) {
				for index := range session.Metadata {
					if session.Metadata[index].Key == "SessionType" {
						session.Metadata[index].Value = "Warmup"
					}
				}
			},
			want: ErrInvalidSessionClassification,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			session := base
			session.Metadata = append([]HistoricalMetadata{}, base.Metadata...)
			test.mutate(&session)
			if _, err := ClassifyHistoricalSession(session); !errors.Is(err, test.want) {
				t.Fatalf("error = %v, want %v", err, test.want)
			}
		})
	}
}

func loadClassificationFixtures(t *testing.T) []HistoricalSession {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "session-classification-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	sessions := []HistoricalSession{}
	if err := json.Unmarshal(data, &sessions); err != nil {
		t.Fatal(err)
	}
	return sessions
}

func classificationGroundTruth() map[string]classificationExpectation {
	return map[string]classificationExpectation{
		"candidate-026": {track: "Autodromo Nazionale Monza", layout: "Autodromo Nazionale Monza", car: "Synthetic Hypercar A", class: "Hyper", type_: SessionTypeRace, weather: "Light Clouds", usable: true},
		"candidate-040": {track: "Autódromo José Carlos Pace", layout: "Autódromo José Carlos Pace", car: "Synthetic Hypercar A", class: "Hyper", type_: SessionTypePractice, weather: "Cloudy & Drizzle", usable: true},
		"candidate-045": {track: "Circuit de Spa-Francorchamps", layout: "Circuit de Spa-Francorchamps", car: "Synthetic GT3 A", class: "GT3", type_: SessionTypeRace, weather: "Clear", usable: true},
		"candidate-125": {track: "Autodromo Enzo e Dino Ferrari", layout: "Autodromo Enzo e Dino Ferrari", car: "Synthetic LMP2 A", class: "LMP2_ELMS", type_: SessionTypeRace, weather: "Partially Cloudy", usable: true},
		"candidate-266": {track: "Algarve International Circuit", layout: "Algarve International Circuit", car: "Synthetic LMP2 B", class: "LMP2_ELMS", type_: SessionTypeRace, weather: "Clear", usable: true},
		"candidate-287": {track: "Circuit of the Americas", layout: "Circuit of the Americas", car: "Synthetic LMP2 B", class: "LMP2_ELMS", type_: SessionTypeRace, weather: "Partially Cloudy", usable: true},
		"spot-049":      {track: "Circuit de la Sarthe", layout: "Circuit de la Sarthe Mulsanne", car: "Synthetic GT3 B", class: "GT3", type_: SessionTypePractice, weather: "Light Clouds"},
		"spot-103":      {track: "Bahrain International Circuit", layout: "Bahrain Outer Circuit", car: "Synthetic LMP2 C", class: "LMP2_ELMS", type_: SessionTypePractice, weather: "Light Clouds"},
		"spot-218":      {track: "Silverstone Circuit", layout: "Silverstone Grand Prix Circuit - ELMS", car: "Synthetic LMP3 A", class: "LMP3", type_: SessionTypePractice, weather: "Mostly Cloudy"},
		"spot-234":      {track: "Fuji Speedway", layout: "Fuji Speedway Classic", car: "Synthetic LMP3 B", class: "LMP3", type_: SessionTypePractice, weather: "Partially Cloudy"},
		"spot-237":      {track: "Fuji Speedway", layout: "Fuji Speedway Classic", car: "Synthetic LMP3 B", class: "LMP3", type_: SessionTypeRace, weather: "Partially Cloudy"},
		"spot-249":      {track: "Fuji Speedway", layout: "Fuji Speedway Classic", car: "Synthetic LMP3 C", class: "LMP3", type_: SessionTypePractice, weather: "Partially Cloudy"},
		"spot-251":      {track: "Fuji Speedway", layout: "Fuji Speedway Classic", car: "Synthetic LMP3 C", class: "LMP3", type_: SessionTypeRace, weather: "Partially Cloudy"},
		"spot-254":      {track: "Circuit of the Americas", layout: "COTA National Circuit", car: "Synthetic GT3 C", class: "GT3", type_: SessionTypeQualify, weather: "Partially Cloudy"},
	}
}
