package app

import (
	"encoding/json"
	"fmt"

	"github.com/vantare/overlays/v2/internal/engineer/service"
)

type engineerCommand struct {
	RequestID string `json:"requestId"`
	Action    string `json:"action"`
	Enabled   *bool  `json:"enabled,omitempty"`
	Value     string `json:"value,omitempty"`
	Category  string `json:"category,omitempty"`
}

// A correlated reply confirms both runtime acceptance and persistence. Errors
// expose stable codes; filesystem paths remain in local logs.
func (b *EngineerBridge) handleCommand(data any) {
	var request engineerCommand
	raw, err := json.Marshal(data)
	if err != nil || json.Unmarshal(raw, &request) != nil || request.RequestID == "" || len(request.RequestID) > 80 {
		return
	}
	outcome := b.mutateAndPersist(request.Action, func() error {
		switch request.Action {
		case "enabled", "spotter", "subtitles":
			if request.Enabled == nil {
				return fmt.Errorf("missing enabled")
			}
			switch request.Action {
			case "enabled":
				return b.service.SetEnabled(*request.Enabled)
			case "spotter":
				return b.service.SetSpotterEnabled(*request.Enabled)
			default:
				b.service.SetSubtitlesEnabled(*request.Enabled)
				return nil
			}
		case "sensitivity":
			return b.service.SetSensitivity(request.Value)
		case "output":
			return b.service.SetOutputMode(request.Category, request.Value)
		default:
			return fmt.Errorf("unknown engineer action")
		}
	})
	b.emitter.Emit("engineer:command:result", struct {
		RequestID   string                      `json:"requestId"`
		Outcome     string                      `json:"outcome"`
		Diagnostics service.EngineerDiagnostics `json:"diagnostics"`
	}{request.RequestID, outcome, b.service.Diagnostics()})
}
