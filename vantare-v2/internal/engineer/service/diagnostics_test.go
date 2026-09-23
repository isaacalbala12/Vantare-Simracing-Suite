package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/commands"
	"github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/engineer/voiceinput"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"
)

type diagnosticPlayer struct {
	play func(context.Context, string) error
}

func (p diagnosticPlayer) PlayContext(ctx context.Context, path string) error {
	return p.play(ctx, path)
}

type diagnosticCache struct {
	path string
	err  error
}

func (c diagnosticCache) ResolvePresentationCached(context.Context, audio.PresentationRequest) (string, error) {
	return c.path, c.err
}
func TestDiagnosticsRecordsActualDeliveryAndPreservesConfiguredMode(t *testing.T) {
	for _, tc := range []struct {
		name, path, want string
		err              error
	}{
		{name: "cache miss", want: "cache_miss"},
		{name: "player completed", path: "private-cache-path", want: "completed"},
		{name: "player failed", path: "private-cache-path", want: "failed", err: errors.New("private-player-path")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := service.NewEngineerService(nil)
			s.SetAudioPlayer(diagnosticPlayer{play: func(context.Context, string) error { return tc.err }})
			s.SetAudioResolver(diagnosticCache{path: tc.path})
			if err := s.SetVoiceInputHealth(func() voiceinput.Health { return voiceinput.Health{Enabled: true} }); err != nil {
				t.Fatal(err)
			}
			if err := s.Start(context.Background()); err != nil {
				t.Fatal(err)
			}
			defer s.Stop()
			turn := commands.Turn{SchemaVersion: commands.DialogueContractVersionV1, Outcome: commands.OutcomeQueryAnswered, IntentID: "query.fuel", ResponseKey: "response.fuel", Values: map[string]string{"litres": "12"}}
			if err := s.PublishVoiceTurn(context.Background(), turn, commands.LocaleSpanish); err != nil {
				t.Fatal(err)
			}
			deadline := time.Now().Add(time.Second)
			var d service.EngineerDiagnostics
			for time.Now().Before(deadline) {
				d = s.Diagnostics()
				if len(d.Deliveries) == 1 && (d.Deliveries[0].State == "completed" || d.Deliveries[0].State == "failed") {
					break
				}
				runtime.Gosched()
			}
			if len(d.Deliveries) != 1 {
				t.Fatalf("deliveries: %+v", d)
			}
			got := d.Deliveries[0]
			if got.Audio != tc.want || !got.Visual || got.Mode != "both" {
				t.Fatalf("delivery: %+v", got)
			}
			if err := s.SetOutputMode("voice", "visual"); err != nil {
				t.Fatal(err)
			}
			if s.Diagnostics().Deliveries[0].Mode != "both" {
				t.Fatal("history changed with settings")
			}
			raw, err := json.Marshal(d.Deliveries)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(raw), "private-") {
				t.Fatalf("private path leaked: %s", raw)
			}
		})
	}
}
func TestAudioTestUsesRealPlayerAndRequiresEngineerOff(t *testing.T) {
	s := service.NewEngineerService(nil)
	calls := 0
	s.SetAudioPlayer(diagnosticPlayer{play: func(_ context.Context, path string) error {
		calls++
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if len(data) < 44 || string(data[:4]) != "RIFF" {
			t.Error("not WAV")
		}
		return nil
	}})
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	if got := s.TestAudio(context.Background(), "tone"); got.Outcome != "busy" {
		t.Fatalf("enabled test=%+v", got)
	}
	if err := s.SetEnabled(false); err != nil {
		t.Fatal(err)
	}
	if got := s.TestAudio(context.Background(), "tone"); got.Outcome != "completed" {
		t.Fatalf("tone=%+v", got)
	}
	if calls != 1 {
		t.Fatalf("calls=%d", calls)
	}
	if got := s.TestAudio(context.Background(), "cached"); got.Outcome != "cache_miss" {
		t.Fatalf("cache=%+v", got)
	}
	if calls != 1 {
		t.Fatal("cache miss played")
	}
}
func TestAudioTestCancelledOnEnable(t *testing.T) {
	s := service.NewEngineerService(nil)
	started := make(chan struct{})
	s.SetAudioPlayer(diagnosticPlayer{play: func(ctx context.Context, _ string) error { close(started); <-ctx.Done(); return ctx.Err() }})
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	if err := s.SetEnabled(false); err != nil {
		t.Fatal(err)
	}
	result := make(chan service.AudioTestResult, 1)
	go func() { result <- s.TestAudio(context.Background(), "tone") }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("test not started")
	}
	if !s.Diagnostics().AudioTestActive {
		t.Fatal("busy state missing")
	}
	if err := s.SetEnabled(true); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-result:
		if got.Outcome != "cancelled" {
			t.Fatalf("result=%+v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("test not cancelled")
	}
}

type cancellingDiagnosticCache struct{ cancel func() }

func (c cancellingDiagnosticCache) ResolvePresentationCached(context.Context, audio.PresentationRequest) (string, error) {
	c.cancel()
	return "private-path", nil
}
func TestDiagnosticsCancelledBeforePlaybackIsNotAttempted(t *testing.T) {
	s := service.NewEngineerService(nil)
	s.SetAudioPlayer(diagnosticPlayer{play: func(context.Context, string) error { t.Error("cancelled audio played"); return nil }})
	s.SetAudioResolver(cancellingDiagnosticCache{cancel: func() {
		if err := s.SetEnabled(false); err != nil {
			t.Error(err)
		}
	}})
	if err := s.SetVoiceInputHealth(func() voiceinput.Health { return voiceinput.Health{Enabled: true} }); err != nil {
		t.Fatal(err)
	}
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	turn := commands.Turn{SchemaVersion: commands.DialogueContractVersionV1, Outcome: commands.OutcomeQueryAnswered, IntentID: "query.fuel", ResponseKey: "response.fuel", Values: map[string]string{"litres": "12"}}
	if err := s.PublishVoiceTurn(context.Background(), turn, commands.LocaleSpanish); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		d := s.Diagnostics()
		if len(d.Deliveries) == 1 && d.Deliveries[0].State == "cancelled" {
			if d.Deliveries[0].Audio != "not_attempted" {
				t.Fatalf("delivery=%+v", d.Deliveries[0])
			}
			return
		}
		runtime.Gosched()
	}
	t.Fatal("cancelled delivery not observed")
}
func TestAudioTestCancelledByStopOrCaller(t *testing.T) {
	for _, stopService := range []bool{false, true} {
		t.Run(map[bool]string{false: "caller", true: "stop"}[stopService], func(t *testing.T) {
			s := service.NewEngineerService(nil)
			started := make(chan struct{})
			s.SetAudioPlayer(diagnosticPlayer{play: func(ctx context.Context, _ string) error { close(started); <-ctx.Done(); return ctx.Err() }})
			if err := s.Start(context.Background()); err != nil {
				t.Fatal(err)
			}
			defer s.Stop()
			if err := s.SetEnabled(false); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			result := make(chan service.AudioTestResult, 1)
			go func() { result <- s.TestAudio(ctx, "tone") }()
			select {
			case <-started:
			case <-time.After(time.Second):
				t.Fatal("not started")
			}
			if stopService {
				s.Stop()
			} else {
				cancel()
			}
			select {
			case got := <-result:
				if got.Outcome != "cancelled" {
					t.Fatalf("result=%+v", got)
				}
			case <-time.After(time.Second):
				t.Fatal("not cancelled")
			}
			if s.Diagnostics().AudioTestActive {
				t.Fatal("test still active")
			}
		})
	}
}
func TestDiagnosticsPreservesSubtitlePreferenceWhenVisualsGated(t *testing.T) {
	s := service.NewEngineerService(nil)
	s.SetSubtitlesEnabled(true)
	s.SetVisualPresentationEnabled(false)
	d := s.Diagnostics()
	if d.Status.RecentMessages == nil {
		t.Fatal("diagnostics must serialize recentMessages as an array")
	}
	if !d.SubtitlesPreference || d.VisualPresentationEnabled || d.Status.SubtitlesEnabled {
		t.Fatalf("diagnostics=%+v", d)
	}
}
