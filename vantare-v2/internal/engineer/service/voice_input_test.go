package service_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/commands"
	"github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/engineer/voiceinput"
)

func TestVoiceTurnUsesRegistrableRadioPresentationAndAggregateHealth(t *testing.T) {
	engineer := service.NewEngineerService(nil)
	voiceHealth := voiceinput.Health{Experimental: true, Enabled: true, State: voiceinput.StateIdle, Transcriptions: 1, Queries: 1}
	if err := engineer.SetVoiceInputHealth(func() voiceinput.Health { return voiceHealth }); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := engineer.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer engineer.Stop()
	notifications, unsubscribe := engineer.Subscribe()
	defer unsubscribe()
	turn := commands.Turn{SchemaVersion: commands.DialogueContractVersionV1, Outcome: commands.OutcomeQueryAnswered, IntentID: "query.fuel", ResponseKey: "response.fuel", Values: map[string]string{"litres": "12"}}
	if err := engineer.PublishVoiceTurn(ctx, turn, commands.LocaleSpanish); err != nil {
		t.Fatal(err)
	}
	select {
	case notification := <-notifications:
		if notification.Source != "voice-input" || notification.Category != "voice" || notification.TextKey != "voice.query_answered" || !strings.Contains(notification.Text, "12") {
			t.Fatalf("notification = %+v", notification)
		}
	case <-time.After(time.Second):
		t.Fatal("radio.v1 did not publish the voice turn")
	}
	health := engineer.Health().VoiceInput
	if !health.Experimental || !health.Enabled || health.Transcriptions != 1 || health.Queries != 1 {
		t.Fatalf("voice health = %+v", health)
	}
}
