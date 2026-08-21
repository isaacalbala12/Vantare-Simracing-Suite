package service

import (
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/commands"
)

func TestVoiceActionPresentationRemainsFailClosed(t *testing.T) {
	intent, response := voiceTurnPresentation(commands.Turn{Outcome: commands.OutcomeUnavailable, Reason: commands.ReasonActionUnavailable, IntentID: "action.pit.request"}, commands.LocaleSpanish)
	if intent != voiceIntentActionOff || response == "" {
		t.Fatalf("action presentation = %q, %q", intent, response)
	}
}

func TestVoiceTurnPresentationDropsQuerySlotsAndUnknownValues(t *testing.T) {
	tests := []struct {
		name       string
		turn       commands.Turn
		wantIntent string
		want       string
		forbidden  []string
	}{
		{
			name: "fuel permits only its response fields",
			turn: commands.Turn{Outcome: commands.OutcomeQueryAnswered, IntentID: "query.fuel", ResponseKey: "response.fuel", Values: map[string]string{
				"litres": "12", "driver_name": "spoken secret", "unexpected": "private",
			}},
			wantIntent: voiceIntentAnswer,
			want:       "litres 12",
			forbidden:  []string{"spoken secret", "private", "driver_name", "unexpected"},
		},
		{
			name: "rival lookup never echoes identifying query slots",
			turn: commands.Turn{Outcome: commands.OutcomeQueryAnswered, IntentID: "query.rival.by_name", ResponseKey: "response.rival", Values: map[string]string{
				"position": "3", "driver_name": "jamie smith", "car_number": "51",
			}},
			wantIntent: voiceIntentAnswer,
			want:       "position 3",
			forbidden:  []string{"jamie smith", "driver_name", "car_number", "51"},
		},
		{
			name:       "unknown query intent fails closed",
			turn:       commands.Turn{Outcome: commands.OutcomeQueryAnswered, IntentID: "query.future", ResponseKey: "response.future", Values: map[string]string{"value": "private"}},
			wantIntent: voiceIntentUnavailable,
			forbidden:  []string{"private", "response.future"},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			intent, response := voiceTurnPresentation(test.turn, commands.LocaleEnglish)
			if intent != test.wantIntent {
				t.Fatalf("intent = %q, want %q", intent, test.wantIntent)
			}
			if test.want != "" && !strings.Contains(response, test.want) {
				t.Fatalf("response %q does not contain %q", response, test.want)
			}
			for _, forbidden := range test.forbidden {
				if strings.Contains(response, forbidden) {
					t.Fatalf("response %q leaked forbidden value %q", response, forbidden)
				}
			}
		})
	}
}
