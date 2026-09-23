package derive

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestRelativeLapBadgeUsesPlayerProgressRatherThanLeaderDeficits(t *testing.T) {
	for _, tc := range []struct {
		name                          string
		playerLaps, rivalLaps         int32
		playerDistance, rivalDistance float64
		want                          standings.RelativeLaps
	}{
		{"same lap across leader boundary", 9, 9, 300, 100, 0},
		{"timing line crossing", 10, 9, 10, 990, 0},
		{"rival a lap down", 10, 8, 10, 990, -1},
		{"rival a lap ahead", 8, 10, 990, 10, 1},
		{"exact lap", 10, 9, 300, 300, -1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			player := gapVehicle("player", 0, 0, schema.FreshnessFresh)
			rival := gapVehicle("rival", 0, 1, schema.FreshnessFresh)
			player.CompletedLaps = derivedInput(standings.CompletedLaps(tc.playerLaps), schema.FreshnessFresh)
			rival.CompletedLaps = derivedInput(standings.CompletedLaps(tc.rivalLaps), schema.FreshnessFresh)
			player.LapDistance = derivedInput(standings.LapDistance(tc.playerDistance), schema.FreshnessFresh)
			rival.LapDistance = derivedInput(standings.LapDistance(tc.rivalDistance), schema.FreshnessFresh)
			length := derivedInput(standings.LapDistance(1000), schema.FreshnessFresh)
			got := relativeProgressLaps(player, rival, length)
			value, present := got.Value()
			if !present || value != tc.want || got.Freshness() != schema.FreshnessFresh {
				t.Fatalf("laps=%v,%v quality=%v", value, present, got.Freshness())
			}
			rival.CompletedLaps = derivedInput(standings.CompletedLaps(tc.rivalLaps), schema.FreshnessStale)
			if relativeProgressLaps(player, rival, length).Freshness() != schema.FreshnessMissing {
				t.Fatal("mixed samples asserted lapped status")
			}
			if relativeProgressLaps(player, rival, schema.MissingField[standings.LapDistance]()).Freshness() != schema.FreshnessMissing {
				t.Fatal("missing length asserted lapped status")
			}
		})
	}
}
