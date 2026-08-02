package service

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
)

type OutputMode string

const (
	OutputAudio    OutputMode = "audio"
	OutputVisual   OutputMode = "visual"
	OutputBoth     OutputMode = "both"
	OutputDisabled OutputMode = "disabled"
)

var outputFamilies = [...]messagepolicy.Family{
	messagepolicy.FamilySpotter,
	messagepolicy.FamilyFuel,
	messagepolicy.FamilyPenalties,
	messagepolicy.FamilyLaps,
	messagepolicy.FamilyTimings,
	messagepolicy.FamilyPitStops,
}

func defaultOutputModes() map[messagepolicy.Family]OutputMode {
	modes := make(map[messagepolicy.Family]OutputMode, len(outputFamilies))
	for _, family := range outputFamilies {
		modes[family] = OutputBoth
	}
	return modes
}

func parseOutputMode(value string) (OutputMode, error) {
	mode := OutputMode(value)
	switch mode {
	case OutputAudio, OutputVisual, OutputBoth, OutputDisabled:
		return mode, nil
	default:
		return "", fmt.Errorf("invalid engineer output mode: %q", value)
	}
}

func parseOutputFamily(value string) (messagepolicy.Family, error) {
	family := messagepolicy.Family(value)
	for _, allowed := range outputFamilies {
		if family == allowed {
			return family, nil
		}
	}
	return "", fmt.Errorf("invalid engineer output family: %q", value)
}

func (s *EngineerService) OutputMode(family messagepolicy.Family) OutputMode {
	s.mu.Lock()
	defer s.mu.Unlock()
	if mode, ok := s.outputModes[family]; ok {
		return mode
	}
	return OutputDisabled
}

func (s *EngineerService) SetOutputMode(familyValue, modeValue string) error {
	family, err := parseOutputFamily(familyValue)
	if err != nil {
		return err
	}
	mode, err := parseOutputMode(modeValue)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.outputModes[family] == mode {
		return nil
	}
	s.outputModes[family] = mode
	// The active visual may belong to this family. Invalidate it on every
	// effective routing change instead of letting a stale card survive after
	// visual output has been disabled.
	s.advancePresentationLifecycleLocked()
	s.emitStatusLocked()
	return nil
}

func (s *EngineerService) outputModesSnapshotLocked() map[string]OutputMode {
	result := make(map[string]OutputMode, len(s.outputModes))
	for family, mode := range s.outputModes {
		result[string(family)] = mode
	}
	return result
}
