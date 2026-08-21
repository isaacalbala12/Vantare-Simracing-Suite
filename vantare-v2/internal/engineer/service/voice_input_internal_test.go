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
			name: "permitted status key rejects spoken text as its value",
			turn: commands.Turn{Outcome: commands.OutcomeQueryAnswered, IntentID: "query.tyres", ResponseKey: "response.tyres", Values: map[string]string{
				"status": "jamie smith",
			}},
			wantIntent: voiceIntentUnavailable,
			forbidden:  []string{"jamie smith"},
		},
		{
			name: "permitted status key accepts a declared enum value",
			turn: commands.Turn{Outcome: commands.OutcomeQueryAnswered, IntentID: "query.tyres", ResponseKey: "response.tyres", Values: map[string]string{
				"status": "ok",
			}},
			wantIntent: voiceIntentAnswer,
			want:       "status ok",
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

func TestVoiceQueryOutputContractsCoverCatalogWithoutInputSlots(t *testing.T) {
	queries := 0
	for _, intent := range commands.DefaultCatalogV1().Intents {
		if intent.Kind != commands.KindQuery {
			continue
		}
		queries++
		contract, ok := voiceQueryOutputContracts[intent.ID]
		if !ok || contract.responseKey != intent.ResponseKey {
			t.Fatalf("missing or mismatched output contract for %q", intent.ID)
		}
		allowed := make(map[string]struct{}, len(contract.fields))
		for _, field := range contract.fields {
			allowed[field.key] = struct{}{}
			if field.rule.kind == 0 {
				t.Fatalf("output contract %q has no value rule for %q", intent.ID, field.key)
			}
		}
		for _, slot := range intent.Slots {
			if _, leaked := allowed[slot.Name]; leaked {
				t.Fatalf("output contract %q permits query slot %q", intent.ID, slot.Name)
			}
		}
	}
	if queries != len(voiceQueryOutputContracts) {
		t.Fatalf("catalog has %d queries, output contracts have %d", queries, len(voiceQueryOutputContracts))
	}
}
