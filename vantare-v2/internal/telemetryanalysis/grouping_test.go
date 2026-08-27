package telemetryanalysis

import (
	"strings"
	"testing"
)

func TestGroupClassifiedSessions_AssociatesPracticesWithEveryRaceOfCombination(t *testing.T) {
	t.Parallel()

	classified := []ClassifiedSession{}
	for _, session := range loadClassificationFixtures(t) {
		item, err := ClassifyHistoricalSession(session)
		if err != nil {
			t.Fatal(err)
		}
		classified = append(classified, item)
	}

	groups := GroupClassifiedSessions(classified)
	groupedSessions := 0
	for _, group := range groups {
		groupedSessions += len(group.Sessions)
	}
	if groupedSessions != len(classified) {
		t.Fatalf("grouped sessions = %d, want %d", groupedSessions, len(classified))
	}
	assertRacePractices(t, groups, "spot-237", []string{"spot-234"})
	assertRacePractices(t, groups, "spot-251", []string{"spot-249"})
}

func assertRacePractices(t *testing.T, groups []CombinationGroup, raceID string, want []string) {
	t.Helper()
	for _, group := range groups {
		for _, race := range group.Races {
			if race.Race.SessionID != raceID {
				continue
			}
			got := make([]string, 0, len(race.Practices))
			for _, practice := range race.Practices {
				got = append(got, practice.SessionID)
			}
			if strings.Join(got, ",") != strings.Join(want, ",") {
				t.Fatalf("race %q practices = %v, want %v", raceID, got, want)
			}
			return
		}
	}
	t.Fatalf("race %q not found", raceID)
}
