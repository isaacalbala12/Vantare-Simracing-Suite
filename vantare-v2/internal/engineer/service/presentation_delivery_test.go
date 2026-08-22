package service

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/delivery"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
	"github.com/vantare/overlays/v2/internal/tts"
)

type presentationAckRecorder struct {
	states []delivery.State
}

type observingPresentationResolver struct {
	request audio.PresentationRequest
}

type silentPresentationPlayer struct{}

func (silentPresentationPlayer) PlayContext(context.Context, string) error { return nil }

type recordingPresentationPlayer struct {
	paths []string
}

func (player *recordingPresentationPlayer) PlayContext(_ context.Context, path string) error {
	player.paths = append(player.paths, path)
	return nil
}

func (resolver *observingPresentationResolver) ResolvePresentationCached(_ context.Context, request audio.PresentationRequest) (string, error) {
	resolver.request = request
	return "", nil
}

func (recorder *presentationAckRecorder) Acknowledge(state delivery.State, _ delivery.Reason) error {
	recorder.states = append(recorder.states, state)
	return nil
}

func TestProductDeliveryRejectsPresentationBeforeStarted(t *testing.T) {
	resolver, err := presentation.NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	service := NewEngineerService(nil)
	reporter := &presentationAckRecorder{}
	decision := messagepolicy.Decision{
		Version: messagepolicy.ContractVersionV1, CandidateID: "candidate", Family: messagepolicy.FamilyLaps,
		Intent: "future.intent", Priority: messagepolicy.PriorityInformation, CreatedAtMS: 100, ExpiresAtMS: 200,
	}
	port := productDeliveryPort{service: service, presentationResolver: resolver, locale: presentation.LocaleSpanish}
	err = port.Deliver(context.Background(), delivery.Request{Version: delivery.ContractVersionV1, DeliveryID: "delivery", Decision: decision}, reporter)
	if !errors.Is(err, presentation.ErrUnsupportedIntent) {
		t.Fatalf("Deliver() error = %v, want unsupported intent", err)
	}
	if len(reporter.states) != 0 {
		t.Fatalf("invalid presentation acknowledged states = %v", reporter.states)
	}
	if notifications := service.RecentNotifications(); len(notifications) != 0 {
		t.Fatalf("invalid presentation published notifications = %+v", notifications)
	}
}

func TestEngineerLocaleIsValidatedBeforeStart(t *testing.T) {
	service := NewEngineerService(nil)
	if got := service.Locale(); got != presentation.LocaleSpanish {
		t.Fatalf("default locale = %q, want es", got)
	}
	if err := service.SetLocale("fr"); !errors.Is(err, presentation.ErrUnsupportedLocale) {
		t.Fatalf("SetLocale(fr) error = %v", err)
	}
	if err := service.SetLocale("en"); err != nil {
		t.Fatal(err)
	}
	if err := service.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer service.Stop()
	if err := service.SetLocale("it"); !errors.Is(err, ErrPresentationLocaleRunning) {
		t.Fatalf("SetLocale while running error = %v", err)
	}
}

func TestSetLocaleBeforeStartRealignsAudioConfigAndRouter(t *testing.T) {
	config, err := audio.DefaultAudioConfigForLocale("es")
	if err != nil {
		t.Fatal(err)
	}
	cacheDir := t.TempDir()
	router := audio.NewAudioRouter(config, nil, cacheDir)
	service := NewEngineerService(nil)
	service.SetAudioConfig(config)
	service.SetAudioRouter(router)

	if err := service.SetLocale("it"); err != nil {
		t.Fatal(err)
	}
	if service.Locale() != presentation.LocaleItalian ||
		service.audioConfig.Lang(audio.ChannelSpotter) != "it" ||
		service.audioConfig.Lang(audio.ChannelEngineer) != "it" {
		t.Fatalf("locale/config drifted: presentation=%s spotter=%s engineer=%s",
			service.Locale(), service.audioConfig.Lang(audio.ChannelSpotter), service.audioConfig.Lang(audio.ChannelEngineer))
	}

	want := filepath.Join(cacheDir, "it", "if_sara", messagepolicy.IntentSpotterCarLeft+".mp3")
	if err := os.MkdirAll(filepath.Dir(want), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(want, []byte("cached"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := router.ResolvePresentationCached(context.Background(), audio.PresentationRequest{
		Locale: presentation.LocaleItalian, VoiceText: "Auto a sinistra",
		Channel: audio.ChannelSpotter, LegacyIntent: messagepolicy.IntentSpotterCarLeft,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("pre-Start locale audio path = %q, want %q", got, want)
	}
}

func TestProductDeliveryPropagatesCanonicalLocaleAndVoiceToInjectedResolver(t *testing.T) {
	presentationResolver, err := presentation.NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	audioResolver := &observingPresentationResolver{}
	reporter := &presentationAckRecorder{}
	decision := messagepolicy.Decision{
		Version: messagepolicy.ContractVersionV1, CandidateID: "candidate", Family: messagepolicy.FamilySpotter,
		Intent: messagepolicy.IntentSpotterCarLeft, Priority: messagepolicy.PrioritySpotter, CreatedAtMS: 100, ExpiresAtMS: 200,
	}
	port := productDeliveryPort{
		service: NewEngineerService(nil), player: silentPresentationPlayer{}, resolver: audioResolver,
		presentationResolver: presentationResolver, locale: presentation.LocaleItalian,
	}
	if err := port.Deliver(context.Background(), delivery.Request{Version: delivery.ContractVersionV1, DeliveryID: "delivery", Decision: decision}, reporter); err != nil {
		t.Fatal(err)
	}
	if audioResolver.request.Locale != presentation.LocaleItalian || audioResolver.request.VoiceText != "Auto a sinistra" ||
		audioResolver.request.LegacyIntent != messagepolicy.IntentSpotterCarLeft || audioResolver.request.Channel != audio.ChannelSpotter {
		t.Fatalf("audio request = %+v", audioResolver.request)
	}
}

func TestProductDeliveryKeepsSpanishVisualOnlyWhenSpotterAudioIsEnglish(t *testing.T) {
	presentationResolver, err := presentation.NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	cache, err := tts.NewCache(root, "kokoro")
	if err != nil {
		t.Fatal(err)
	}
	config := audio.DefaultAudioConfig() // Spotter is deliberately English.
	englishFallback := filepath.Join(root, "en", config.Voice(audio.ChannelSpotter), messagepolicy.IntentSpotterCarLeft+".mp3")
	if err := os.MkdirAll(filepath.Dir(englishFallback), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(englishFallback, []byte("wrong-language"), 0o600); err != nil {
		t.Fatal(err)
	}
	service := NewEngineerService(nil)
	player := &recordingPresentationPlayer{}
	reporter := &presentationAckRecorder{}
	decision := messagepolicy.Decision{
		Version: messagepolicy.ContractVersionV1, CandidateID: "candidate", Family: messagepolicy.FamilySpotter,
		Intent: messagepolicy.IntentSpotterCarLeft, Priority: messagepolicy.PrioritySpotter, CreatedAtMS: 100, ExpiresAtMS: 200,
	}
	port := productDeliveryPort{
		service: service, player: player, router: audio.NewCacheOnlyAudioRouter(config, cache),
		presentationResolver: presentationResolver, locale: presentation.LocaleSpanish,
	}
	if err := port.Deliver(context.Background(), delivery.Request{Version: delivery.ContractVersionV1, DeliveryID: "delivery", Decision: decision}, reporter); err != nil {
		t.Fatal(err)
	}
	if len(player.paths) != 0 {
		t.Fatalf("mismatched locale played audio: %v", player.paths)
	}
	notifications := service.RecentNotifications()
	if len(notifications) != 1 || notifications[0].Locale != "es" || notifications[0].Text != "Coche a la izquierda" {
		t.Fatalf("visual presentation = %+v", notifications)
	}
}
