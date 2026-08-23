package telemetryanalysis

import (
	"slices"
	"testing"
)

func TestRequiredHistoricalPageChannelsComeFromDerivationFamilies(t *testing.T) {
	t.Parallel()

	families := historicalPageChannelFamilies()
	wantFamilies := []string{"consumption_pace", "derived_curves", "lap_validity", "pit_observation"}
	gotFamilies := make([]string, 0, len(families))
	for family, channels := range families {
		gotFamilies = append(gotFamilies, family)
		if len(channels) == 0 {
			t.Fatalf("family %q declares no channels", family)
		}
	}
	slices.Sort(gotFamilies)
	if !slices.Equal(gotFamilies, wantFamilies) {
		t.Fatalf("families = %v, want %v", gotFamilies, wantFamilies)
	}

	declared := map[string]struct{}{}
	for _, channels := range families {
		for _, channel := range channels {
			declared[channel] = struct{}{}
		}
	}
	got := RequiredHistoricalPageChannels()
	if !slices.IsSorted(got) {
		t.Fatalf("required channels are not sorted: %v", got)
	}
	if len(got) != len(declared) {
		t.Fatalf("required channels = %v, family declarations = %v", got, declared)
	}
	for _, channel := range got {
		if _, ok := declared[channel]; !ok {
			t.Fatalf("required channel %q is not declared by a derivation family", channel)
		}
	}
}
