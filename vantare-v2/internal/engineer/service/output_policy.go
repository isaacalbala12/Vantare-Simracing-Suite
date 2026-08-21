package service

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/delivery"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/radio"
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
	previous := s.outputModes[family]
	if previous == mode {
		return nil
	}
	s.outputModes[family] = mode
	if mode == OutputDisabled {
		if s.scheduler != nil {
			s.scheduler.CancelFamily(family, messagepolicy.ReasonDecisionNotApproved)
		}
		s.queue.ClearCategory(audio.Category(family))
	}
	if (mode == OutputDisabled || (outputHasAudio(previous) && !outputHasAudio(mode))) &&
		s.activeDelivery != nil && s.activeDelivery.family() == family {
		s.activeDelivery.cancel(delivery.ErrLifecycleBoundary)
	}
	if family == messagepolicy.FamilySpotter && mode == OutputDisabled {
		s.resetSpotterRadioLocked(radio.ErrLifecycleBoundary)
	} else if mode == OutputDisabled {
		s.resetFamilyRadioLocked(family, radio.ErrLifecycleBoundary)
	}
	if outputHasVisual(previous) && !outputHasVisual(mode) &&
		s.activePresentation != nil && s.activePresentation.Category == string(family) {
		s.advancePresentationLifecycleLocked()
	}
	s.emitStatusLocked()
	return nil
}

func outputHasVisual(mode OutputMode) bool { return mode == OutputVisual || mode == OutputBoth }
func outputHasAudio(mode OutputMode) bool  { return mode == OutputAudio || mode == OutputBoth }

func (s *EngineerService) outputModesSnapshotLocked() map[string]OutputMode {
	result := make(map[string]OutputMode, len(s.outputModes))
	for family, mode := range s.outputModes {
		result[string(family)] = mode
	}
	return result
}
