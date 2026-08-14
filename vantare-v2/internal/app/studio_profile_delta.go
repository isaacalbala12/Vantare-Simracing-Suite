package app

import (
	"fmt"
	"sort"

	"github.com/vantare/overlays/v2/pkg/config"
)

const (
	deltaReferencePersonalBest = "personal-best"
	deltaReferenceSessionBest  = "session-best"
	deltaReferencePreviousLap  = "previous-lap"
)

func nextDeltaReference(current string) string {
	switch current {
	case "", deltaReferencePersonalBest:
		return deltaReferenceSessionBest
	case deltaReferenceSessionBest:
		return deltaReferencePreviousLap
	default:
		return deltaReferencePersonalBest
	}
}

// CycleDeltaReference advances the single Delta reference for every explicit
// session layout in the active profile, persists it, and broadcasts the updated
// runtime document. Session layouts are synchronized because only one of them
// can be active at a time and the hotkey represents one global driver choice.
func (s *StudioProfileService) CycleDeltaReference() (string, error) {
	s.deltaCycleMu.Lock()
	defer s.deltaCycleMu.Unlock()

	if s.loaded == nil || s.loaded.Document == nil {
		return "", fmt.Errorf("profile not loaded")
	}

	document := config.NormalizeProfileDocumentV3(s.loaded.Document)
	layoutTypes := make([]string, 0, len(document.Layouts))
	for layoutType := range document.Layouts {
		layoutTypes = append(layoutTypes, string(layoutType))
	}
	sort.Strings(layoutTypes)
	// General is the canonical fallback and should decide the first transition.
	for index, layoutType := range layoutTypes {
		if layoutType == string(config.LayoutGeneral) {
			layoutTypes[0], layoutTypes[index] = layoutTypes[index], layoutTypes[0]
			break
		}
	}

	current := ""
	found := false
	canonicalSelected := false
	for _, layoutName := range layoutTypes {
		layout := document.Layouts[config.LayoutType(layoutName)]
		for _, widget := range layout.Widgets {
			if widget.Type != config.WidgetTypeDelta {
				continue
			}
			found = true
			if !canonicalSelected {
				canonicalSelected = true
				if reference, ok := widget.Content["reference"].(string); ok {
					current = reference
				}
			}
		}
	}
	if !found {
		return "", fmt.Errorf("delta widget not found in active profile")
	}

	next := nextDeltaReference(current)
	for layoutType, layout := range document.Layouts {
		for index := range layout.Widgets {
			if layout.Widgets[index].Type != config.WidgetTypeDelta {
				continue
			}
			content := make(map[string]any, len(layout.Widgets[index].Content)+1)
			for key, value := range layout.Widgets[index].Content {
				content[key] = value
			}
			content["reference"] = next
			layout.Widgets[index].Content = content
		}
		document.Layouts[layoutType] = layout
	}

	if err := s.Save("hotkey:cycle-delta-reference", s.loaded.Revision, document); err != nil {
		return "", fmt.Errorf("persist delta reference: %w", err)
	}
	s.EmitRuntimeLoaded()
	return next, nil
}
