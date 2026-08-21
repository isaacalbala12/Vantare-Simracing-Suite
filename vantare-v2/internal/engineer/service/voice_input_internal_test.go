package service

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/commands"
)

func TestVoiceActionPresentationRemainsFailClosed(t *testing.T) {
	intent, response := voiceTurnPresentation(commands.Turn{Outcome: commands.OutcomeUnavailable, Reason: commands.ReasonActionUnavailable, IntentID: "action.pit.request"}, commands.LocaleSpanish)
	if intent != voiceIntentActionOff || response == "" {
		t.Fatalf("action presentation = %q, %q", intent, response)
	}
}
