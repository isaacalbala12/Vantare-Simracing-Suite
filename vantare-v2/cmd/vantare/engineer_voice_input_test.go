package main

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/engineer/commands"
	"github.com/vantare/overlays/v2/internal/engineer/ptt"
	"github.com/vantare/overlays/v2/internal/engineer/voiceinput"
)

type compositionReader struct {
	read chan struct{}
	once sync.Once
}

func (reader *compositionReader) Read(context.Context, ptt.Binding) (ptt.DeviceSample, error) {
	reader.once.Do(func() { close(reader.read) })
	return ptt.DeviceSample{Connected: true, Focused: true}, nil
}

type unavailableCompositionHost struct{ started chan struct{} }

func (host *unavailableCompositionHost) Start(context.Context) error {
	close(host.started)
	return voiceinput.ErrHostUnavailable
}
func (*unavailableCompositionHost) Begin(context.Context, voiceinput.Capture) error {
	return voiceinput.ErrHostUnavailable
}
func (*unavailableCompositionHost) Finish(context.Context, voiceinput.Capture) ([]byte, error) {
	return nil, voiceinput.ErrHostUnavailable
}
func (*unavailableCompositionHost) Cancel(context.Context, voiceinput.Capture) error { return nil }
func (*unavailableCompositionHost) Stop(context.Context) error                       { return nil }
func (*unavailableCompositionHost) WakeEvents() <-chan string                        { return nil }

type discardVoicePublisher struct{}

func (discardVoicePublisher) PublishVoiceTurn(context.Context, commands.Turn, commands.Locale) error {
	return nil
}

func compositionDependencies(readerFactory func() ptt.Reader, hostFactory func() voiceinput.Host) engineerVoiceInputDependencies {
	return engineerVoiceInputDependencies{
		readerFactory: readerFactory,
		hostFactory:   hostFactory,
		queryPort:     voiceinput.UnavailableQueryPort{},
		publisher:     discardVoicePublisher{},
		lifecycle: func() commands.DialogueLifecycle {
			return commands.DialogueLifecycle{SessionID: "test", DriverID: "driver", SourceID: "telemetry-core", Epoch: 1}
		},
	}
}

func TestComposeEngineerVoiceInputOffConstructsNothing(t *testing.T) {
	readerCalls, hostCalls := 0, 0
	runtime, err := composeEngineerVoiceInput(false, app.DefaultAppSettings(), commands.LocaleSpanish, compositionDependencies(
		func() ptt.Reader { readerCalls++; return &compositionReader{read: make(chan struct{})} },
		func() voiceinput.Host { hostCalls++; return &unavailableCompositionHost{started: make(chan struct{})} },
	))
	if err != nil || runtime != nil || readerCalls != 0 || hostCalls != 0 {
		t.Fatalf("disabled composition = runtime %v, err %v, factories %d/%d", runtime, err, readerCalls, hostCalls)
	}
}

func TestComposeEngineerVoiceInputRejectsConfiguredF24ConflictBeforeFactories(t *testing.T) {
	settings := app.DefaultAppSettings()
	settings.Hotkeys["toggleOverlay"] = "ctrl+f24"
	readerCalls, hostCalls := 0, 0
	runtime, err := composeEngineerVoiceInput(true, settings, commands.LocaleSpanish, compositionDependencies(
		func() ptt.Reader { readerCalls++; return &compositionReader{read: make(chan struct{})} },
		func() voiceinput.Host { hostCalls++; return &unavailableCompositionHost{started: make(chan struct{})} },
	))
	if runtime != nil || !errors.Is(err, errEngineerVoiceBindingConflict) {
		t.Fatalf("conflicting composition = runtime %v, err %v", runtime, err)
	}
	if readerCalls != 0 || hostCalls != 0 {
		t.Fatalf("conflict constructed factories: %d/%d", readerCalls, hostCalls)
	}
}

func TestComposeEngineerVoiceInputRejectsLauncherProfileF24Conflict(t *testing.T) {
	settings := app.DefaultAppSettings()
	settings.LauncherProfiles = append(settings.LauncherProfiles, app.LaunchProfile{Hotkey: "alt+f24"})
	runtime, err := composeEngineerVoiceInput(true, settings, commands.LocaleSpanish, compositionDependencies(
		func() ptt.Reader { t.Fatal("conflict constructed reader"); return nil },
		func() voiceinput.Host { t.Fatal("conflict constructed host"); return nil },
	))
	if runtime != nil || !errors.Is(err, errEngineerVoiceBindingConflict) {
		t.Fatalf("conflicting profile composition = runtime %v, err %v", runtime, err)
	}
}

func TestComposeEngineerVoiceInputPollsPTTWhenBackendIsUnavailable(t *testing.T) {
	reader := &compositionReader{read: make(chan struct{})}
	host := &unavailableCompositionHost{started: make(chan struct{})}
	runtime, err := composeEngineerVoiceInput(true, app.DefaultAppSettings(), commands.LocaleSpanish, compositionDependencies(
		func() ptt.Reader { return reader }, func() voiceinput.Host { return host },
	))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := runtime.Start(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case <-reader.read:
	case <-time.After(time.Second):
		t.Fatal("composed PTT adapter was not polled")
	}
	select {
	case <-host.started:
	case <-time.After(time.Second):
		t.Fatal("unavailable host was not probed")
	}
	if health := runtime.Health(); health.State != voiceinput.StateUnavailable || !health.Enabled {
		t.Fatalf("health = %+v", health)
	}
	if err := runtime.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
}
