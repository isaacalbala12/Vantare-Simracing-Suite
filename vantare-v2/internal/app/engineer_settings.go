package app

import "fmt"

var engineerOutputFamilies = [...]string{"spotter", "fuel", "penalties", "laps", "timings", "pitstops"}

type engineerSettingsTarget interface {
	SetEnabled(bool) error
	SetSpotterEnabled(bool) error
	SetSubtitlesEnabled(bool)
	SetSensitivity(string) error
	SetOutputMode(string, string) error
}

// ApplyEngineerSettings restores persisted controls before the Engineer
// service starts consuming telemetry. The target remains the validation
// authority; persisted strings never bypass its closed enums.
func ApplyEngineerSettings(target engineerSettingsTarget, settings *EngineerSettings) error {
	if target == nil {
		return fmt.Errorf("engineer settings target is required")
	}
	settings = normalizeEngineerSettings(settings)
	if err := target.SetSensitivity(settings.Sensitivity); err != nil {
		return fmt.Errorf("restore engineer sensitivity: %w", err)
	}
	for _, family := range engineerOutputFamilies {
		if err := target.SetOutputMode(family, settings.OutputModes[family]); err != nil {
			return fmt.Errorf("restore engineer output %s: %w", family, err)
		}
	}
	target.SetSubtitlesEnabled(settings.SubtitlesEnabled)
	if err := target.SetSpotterEnabled(settings.SpotterEnabled); err != nil {
		return fmt.Errorf("restore engineer spotter: %w", err)
	}
	if err := target.SetEnabled(settings.Enabled); err != nil {
		return fmt.Errorf("restore engineer enabled: %w", err)
	}
	return nil
}
