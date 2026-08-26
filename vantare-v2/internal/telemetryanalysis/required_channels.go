package telemetryanalysis

import "sort"

// RequiredHistoricalPageChannels is derived from the page-consuming
// derivation families. Importers use this union instead of maintaining a
// second channel list that can drift from the calculations.
func RequiredHistoricalPageChannels() []string {
	families := historicalPageChannelFamilies()
	unique := make(map[string]struct{})
	for _, channels := range families {
		for _, channel := range channels {
			unique[channel] = struct{}{}
		}
	}
	result := make([]string, 0, len(unique))
	for channel := range unique {
		result = append(result, channel)
	}
	sort.Strings(result)
	return result
}

func historicalPageChannelFamilies() map[string][]string {
	return map[string][]string{
		"consumption_pace": consumptionPaceHistoricalPageChannels(),
		"derived_curves":   derivedCurvesHistoricalPageChannels(),
		"lap_validity":     lapValidityHistoricalPageChannels(),
		"pit_observation":  pitObservationHistoricalPageChannels(),
	}
}
