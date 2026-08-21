package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
	"github.com/vantare/overlays/v2/internal/engineer/projectioninput"
	"github.com/vantare/overlays/v2/internal/engineer/service"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/spatial"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

type firstSpotterResolveGate struct {
	once    sync.Once
	started chan struct{}
	release chan struct{}
	done    chan error
}

func (gate *firstSpotterResolveGate) ResolvePresentationCached(ctx context.Context, _ audio.PresentationRequest) (string, error) {
	wait := false
	gate.once.Do(func() {
		wait = true
		close(gate.started)
	})
	if !wait {
		return "", nil
	}
	select {
	case <-gate.release:
		return "cached.wav", nil
	case <-ctx.Done():
		if gate.done != nil {
			gate.done <- ctx.Err()
		}
		return "", ctx.Err()
	}
}

type immediateAudioPlayer struct{}

func (immediateAudioPlayer) PlayContext(context.Context, string) error { return nil }

func TestCanonicalPresentationIsIdenticalForWailsAndSSEFanout(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	if err := svc.SetLocale("it"); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	sse, unsubscribe := svc.Subscribe()
	defer unsubscribe()
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}

	var streamed service.EngineerNotification
	select {
	case streamed = <-sse:
	case <-time.After(time.Second):
		t.Fatal("SSE subscription did not receive canonical presentation")
	}
	if streamed.Version != presentation.ContractVersionV1 || streamed.Locale != "it" ||
		streamed.Role != "spotter" || streamed.Channel != "spotter" || streamed.VoiceText == "" ||
		streamed.Text == streamed.TextKey || streamed.VoiceText == streamed.TextKey {
		t.Fatalf("streamed presentation = %+v", streamed)
	}

	deadline := time.Now().Add(time.Second)
	var emitted service.EngineerNotification
	for time.Now().Before(deadline) {
		for _, event := range emitter.Events() {
			if event["name"] != "engineer:notification" {
				continue
			}
			candidate, ok := event["data"].(service.EngineerNotification)
			if ok && candidate.ID == streamed.ID {
				emitted = candidate
				break
			}
		}
		if emitted.ID != "" {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if !reflect.DeepEqual(emitted, streamed) {
		t.Fatalf("Wails = %+v, SSE = %+v", emitted, streamed)
	}
	wailsJSON, err := json.Marshal(emitted)
	if err != nil {
		t.Fatal(err)
	}
	sseJSON, err := json.Marshal(streamed)
	if err != nil {
		t.Fatal(err)
	}
	if string(wailsJSON) != string(sseJSON) {
		t.Fatalf("Wails JSON %s != SSE JSON %s", wailsJSON, sseJSON)
	}
}

func TestEngineerServiceConsumesCanonicalObservationWithoutOwningSource(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	if status := svc.Status(); !status.Connected || status.Source != "telemetry-core" {
		t.Fatalf("status = %+v, want connected canonical source", status)
	}

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		for _, notification := range svc.RecentNotifications() {
			if notification.TextKey == "spotter.car_left" {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("canonical observation did not reach Spotter notification queue")
}

func TestRadioSpotterDoesNotDuplicateLegacyProjection(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	notifications, unsubscribe := svc.Subscribe()
	defer unsubscribe()
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	select {
	case notification := <-notifications:
		if notification.TextKey != "spotter.car_left" || notification.Source != "telemetry-core" {
			t.Fatalf("notification = %+v", notification)
		}
	case <-time.After(time.Second):
		t.Fatal("radio Spotter did not publish")
	}
	select {
	case duplicate := <-notifications:
		t.Fatalf("legacy Spotter also published: %+v", duplicate)
	case <-time.After(50 * time.Millisecond):
	}
	if samples := svc.Health().RadioDelivery.Samples; samples != 1 {
		t.Fatalf("radio started samples = %d, want 1", samples)
	}
}

func TestRadioSpotterRevalidatesAfterCacheResolveBeforeStarted(t *testing.T) {
	gate := &firstSpotterResolveGate{started: make(chan struct{}), release: make(chan struct{})}
	svc := service.NewEngineerService(&mockEmitter{})
	svc.SetAudioResolver(gate)
	svc.SetAudioPlayer(immediateAudioPlayer{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	notifications, unsubscribe := svc.Subscribe()
	defer unsubscribe()

	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	select {
	case <-gate.started:
	case <-time.After(time.Second):
		t.Fatal("car-left cache lookup did not block")
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8, -2.8)); err != nil {
		t.Fatal(err)
	}
	close(gate.release)

	select {
	case notification := <-notifications:
		if notification.TextKey != "spotter.three_wide" {
			t.Fatalf("obsolete notification reached started: %+v", notification)
		}
	case <-time.After(time.Second):
		t.Fatal("current three-wide notification was not delivered")
	}
	if samples := svc.Health().RadioDelivery.Samples; samples != 1 {
		t.Fatalf("started samples = %d, want only current three-wide", samples)
	}
}

func TestRadioSpotterCapabilityLossCancelsSelectedDelivery(t *testing.T) {
	gate := &firstSpotterResolveGate{
		started: make(chan struct{}), release: make(chan struct{}), done: make(chan error, 1),
	}
	svc := service.NewEngineerService(&mockEmitter{})
	svc.SetAudioResolver(gate)
	svc.SetAudioPlayer(immediateAudioPlayer{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	select {
	case <-gate.started:
	case <-time.After(time.Second):
		t.Fatal("Spotter cache lookup did not block")
	}

	lost := canonicalSpotterObservationAt(t, 1, 2, 2.8)
	manifest, err := engineerprojection.NewManifest([]engineerprojection.Capability{
		{ID: engineerprojection.CapabilitySession, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityStandings, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityControls, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityPit, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityFuel, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityGaps, State: engineerprojection.CapabilitySupported},
	})
	if err != nil {
		t.Fatal(err)
	}
	lost.Manifest = manifest
	if err := svc.ConsumeObservation(lost); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-gate.done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cache cancellation = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("capability loss did not cancel selected Spotter delivery")
	}
}

func TestRadioSpotterSameEpochIdentityChangeAfterStartedDoesNotClear(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	svc.SetAudioPlayer(immediateAudioPlayer{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	notifications, unsubscribe := svc.Subscribe()
	defer unsubscribe()

	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	select {
	case notification := <-notifications:
		if notification.TextKey != "spotter.car_left" {
			t.Fatalf("antecedent notification = %+v", notification)
		}
	case <-time.After(time.Second):
		t.Fatal("communicated antecedent was not delivered")
	}

	invalid := canonicalSpotterObservationAt(t, 1, 2)
	invalid.Context.Identity.Session = "session-b"
	if err := svc.ConsumeObservation(invalid); !errors.Is(err, engineerprojection.ErrProjectionIdentityChange) {
		t.Fatalf("same-epoch identity change error = %v", err)
	}
	recovered := canonicalSpotterObservationAt(t, 2, 3)
	recovered.Context.Identity.Session = "session-b"
	if err := svc.ConsumeObservation(recovered); err != nil {
		t.Fatal(err)
	}
	select {
	case notification := <-notifications:
		t.Fatalf("previous identity authorized notification: %+v", notification)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestLegacySpotterRollbackIsExclusiveAndPreStartOnly(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	if err := svc.SetLegacySpotterRollback(true); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	if err := svc.SetLegacySpotterRollback(false); !errors.Is(err, service.ErrLegacySpotterRunning) {
		t.Fatalf("running rollback change error = %v", err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		for _, notification := range svc.RecentNotifications() {
			if notification.TextKey == "spotter.car_left" {
				if samples := svc.Health().RadioDelivery.Samples; samples != 0 {
					t.Fatalf("radio producer ran during legacy rollback: %d samples", samples)
				}
				return
			}
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("legacy rollback did not publish Spotter notification")
}

func TestLegacyFamiliesRollbackIsExclusivePreStartAndVisibleInHealth(t *testing.T) {
	newPath := service.NewEngineerService(nil)
	if got := newPath.Health().ActiveFamilies; got != 5 {
		t.Fatalf("new family count = %d, want 5", got)
	}

	legacyPath := service.NewEngineerService(nil)
	if err := legacyPath.SetLegacyFamiliesRollback(true); err != nil {
		t.Fatal(err)
	}
	if got := legacyPath.Health().ActiveFamilies; got != 0 {
		t.Fatalf("legacy rollback family count = %d, want 0", got)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := legacyPath.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer legacyPath.Stop()
	if err := legacyPath.SetLegacyFamiliesRollback(false); !errors.Is(err, service.ErrLegacyFamiliesRunning) {
		t.Fatalf("running rollback change error = %v", err)
	}
	if err := legacyPath.ConsumeObservation(canonicalSpotterObservation(t, 1)); err != nil {
		t.Fatal(err)
	}
	if samples := legacyPath.Health().RadioDelivery.Samples; samples != 0 {
		t.Fatalf("radio family engine delivered during legacy rollback: %d samples", samples)
	}
}

func TestFamilyEngineRejectsIncompleteCanonicalIdentityLikeSpotter(t *testing.T) {
	svc := service.NewEngineerService(nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()

	incomplete := canonicalObservationAt(t, 1, 1, 1, 100, 100)
	incomplete.Context.Identity.Driver = ""
	if err := svc.ConsumeObservation(incomplete); !errors.Is(err, projectioninput.ErrObservationNotReady) {
		t.Fatalf("incomplete identity error = %v, want ErrObservationNotReady", err)
	}
	if svc.Status().Connected {
		t.Fatal("incomplete identity connected the family runtime")
	}
}

func TestFamilyCapabilityLossCancelsSelectedAndReseedsState(t *testing.T) {
	gate := &firstSpotterResolveGate{started: make(chan struct{}), release: make(chan struct{}), done: make(chan error, 1)}
	svc := service.NewEngineerService(nil)
	if err := svc.SetSpotterEnabled(false); err != nil {
		t.Fatal(err)
	}
	svc.SetAudioResolver(gate)
	svc.SetAudioPlayer(immediateAudioPlayer{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	notifications, unsubscribe := svc.Subscribe()
	defer unsubscribe()

	if err := svc.ConsumeObservation(canonicalObservationAt(t, 1, 1, 0, 100, 100)); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeObservation(canonicalObservationAt(t, 1, 2, 1, 90, 100)); err != nil {
		t.Fatal(err)
	}
	select {
	case <-gate.started:
	case <-time.After(time.Second):
		t.Fatal("lap message was not selected before capability loss")
	}

	lost := canonicalObservationAt(t, 1, 3, 3, 80, 100)
	manifest := lost.Manifest.Entries()
	for index := range manifest {
		if manifest[index].ID == engineerprojection.CapabilityStandings {
			manifest[index].State = engineerprojection.CapabilityUnsupported
		}
	}
	var err error
	lost.Manifest, err = engineerprojection.NewManifest(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeObservation(lost); err != nil && !errors.Is(err, projectioninput.ErrObservationNotReady) {
		t.Fatal(err)
	}
	select {
	case err := <-gate.done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("selected family cancellation = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("capability loss did not cancel selected family message")
	}
	close(gate.release)
	if err := svc.ConsumeObservation(canonicalObservationAt(t, 1, 4, 4, 70, 100)); err != nil {
		t.Fatal(err)
	}
	select {
	case notification := <-notifications:
		t.Fatalf("state was not reseeded after capability recovery: %+v", notification)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestFamilyEngineRejectsFreshFuelWhenManifestSaysUnsupported(t *testing.T) {
	svc := service.NewEngineerService(nil)
	if err := svc.SetSpotterEnabled(false); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	notifications, unsubscribe := svc.Subscribe()
	defer unsubscribe()

	unsupported := canonicalObservationAt(t, 1, 1, 1, 0.5, 100)
	manifest := unsupported.Manifest.Entries()
	for index := range manifest {
		if manifest[index].ID == engineerprojection.CapabilityFuel {
			manifest[index].State = engineerprojection.CapabilityUnsupported
		}
	}
	var err error
	unsupported.Manifest, err = engineerprojection.NewManifest(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeObservation(unsupported); err != nil {
		t.Fatal(err)
	}
	deadline := time.After(50 * time.Millisecond)
	for {
		select {
		case notification := <-notifications:
			if strings.HasPrefix(notification.TextKey, "fuel.") {
				t.Fatalf("unsupported fuel capability authorized %+v", notification)
			}
		case <-deadline:
			return
		}
	}
}

func TestFuelLapFieldLossResetsConsumptionBeforeRecovery(t *testing.T) {
	svc := service.NewEngineerService(nil)
	if err := svc.SetSpotterEnabled(false); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer svc.Stop()
	notifications, unsubscribe := svc.Subscribe()
	defer unsubscribe()
	for _, observation := range []engineerprojection.ObservationSnapshotV1{
		canonicalObservationAt(t, 1, 1, 1, 100, 100),
		canonicalObservationAt(t, 1, 2, 2, 90, 100),
		canonicalObservationAt(t, 1, 3, -1, 70, 100),
		canonicalObservationAt(t, 1, 4, -1, 50, 100),
		canonicalObservationAt(t, 1, 5, 4, 20, 100),
	} {
		if err := svc.ConsumeObservation(observation); err != nil {
			t.Fatal(err)
		}
	}
	deadline := time.After(100 * time.Millisecond)
	for {
		select {
		case notification := <-notifications:
			if strings.HasPrefix(notification.TextKey, "fuel.laps_remaining_") || notification.TextKey == "fuel.for_pit_now" {
				t.Fatalf("missing lap field contaminated consumption state: %+v", notification)
			}
		case <-deadline:
			return
		}
	}
}

func TestSpotterToggleDoesNotResetOrDisableFamilies(t *testing.T) {
	for _, toggle := range []string{"setting", "output"} {
		for _, legacyFamilies := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s_legacy_families_%t", toggle, legacyFamilies), func(t *testing.T) {
				svc := service.NewEngineerService(nil)
				if err := svc.SetLegacyFamiliesRollback(legacyFamilies); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				if err := svc.Start(ctx); err != nil {
					t.Fatal(err)
				}
				defer svc.Stop()
				notifications, unsubscribe := svc.Subscribe()
				defer unsubscribe()
				if err := svc.ConsumeObservation(canonicalObservationAt(t, 1, 1, 0, 100, 100)); err != nil {
					t.Fatal(err)
				}
				if toggle == "setting" {
					if err := svc.SetSpotterEnabled(false); err != nil {
						t.Fatal(err)
					}
				} else if err := svc.SetOutputMode("spotter", "disabled"); err != nil {
					t.Fatal(err)
				}
				if err := svc.ConsumeObservation(canonicalObservationAt(t, 1, 2, 1, 90, 100)); err != nil {
					t.Fatal(err)
				}
				waitForIntent(t, notifications, "laps.lap_completed")
			})
		}
	}
}

func TestLegacyRollbackMatrixDeliversSpotterAndFamiliesExclusively(t *testing.T) {
	for _, legacySpotter := range []bool{false, true} {
		for _, legacyFamilies := range []bool{false, true} {
			name := fmt.Sprintf("spotter_%t_families_%t", legacySpotter, legacyFamilies)
			t.Run(name, func(t *testing.T) {
				svc := service.NewEngineerService(nil)
				if err := svc.SetLegacySpotterRollback(legacySpotter); err != nil {
					t.Fatal(err)
				}
				if err := svc.SetLegacyFamiliesRollback(legacyFamilies); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				if err := svc.Start(ctx); err != nil {
					t.Fatal(err)
				}
				defer svc.Stop()
				notifications, unsubscribe := svc.Subscribe()
				defer unsubscribe()
				if err := svc.ConsumeObservation(canonicalObservationAt(t, 1, 1, 0, 100, 100)); err != nil {
					t.Fatal(err)
				}
				if err := svc.ConsumeObservation(canonicalObservationAt(t, 1, 2, 1, 90, 100)); err != nil {
					t.Fatal(err)
				}
				waitForIntent(t, notifications, "laps.lap_completed")
				if err := svc.ConsumeObservation(canonicalObservationAt(t, 1, 3, 1, 90, 100, 2.8)); err != nil {
					t.Fatal(err)
				}
				waitForIntent(t, notifications, "spotter.car_left")
				assertNoIntentFor(t, notifications, 50*time.Millisecond, "laps.lap_completed", "spotter.car_left")
				counts := map[string]int{}
				for _, notification := range svc.RecentNotifications() {
					counts[notification.TextKey]++
				}
				if counts["laps.lap_completed"] != 1 || counts["spotter.car_left"] != 1 {
					t.Fatalf("rollback matrix duplicated or lost real delivery: %v", counts)
				}
			})
		}
	}
}

func waitForIntent(t *testing.T, notifications <-chan service.EngineerNotification, intent string) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		select {
		case notification := <-notifications:
			if notification.TextKey == intent {
				return
			}
		case <-deadline:
			t.Fatalf("notification %s was not delivered", intent)
		}
	}
}

func assertNoIntentFor(t *testing.T, notifications <-chan service.EngineerNotification, duration time.Duration, intents ...string) {
	t.Helper()
	forbidden := make(map[string]struct{}, len(intents))
	for _, intent := range intents {
		forbidden[intent] = struct{}{}
	}
	deadline := time.After(duration)
	for {
		select {
		case notification := <-notifications:
			if _, found := forbidden[notification.TextKey]; found {
				t.Fatalf("unexpected duplicate notification: %+v", notification)
			}
		case <-deadline:
			return
		}
	}
}

func TestEngineerServiceResetsAtEpochBoundaryAndFactsFailClosed(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 1, 2.8)); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservation(t, 2, -2.8)); err != nil {
		t.Fatal(err)
	}
	beforeBoundary := svc.Status().PresentationLifecycle

	fact := engineerprojection.FactEnvelopeV1{
		Metadata: projection.Metadata{Epoch: 2},
		Fact: engineerprojection.FactV1{
			Sequence: 1,
			Kind:     engineerprojection.FactConnectionLost,
		},
	}
	if err := svc.ConsumeFact(fact); err != nil {
		t.Fatal(err)
	}
	if svc.Status().Connected {
		t.Fatal("connection-lost fact must disconnect Engineer")
	}
	if got := svc.Status().PresentationLifecycle; got != beforeBoundary+1 {
		t.Fatalf("presentation lifecycle = %d, want %d after connection boundary", got, beforeBoundary+1)
	}
	if err := svc.ConsumeFact(fact); err == nil {
		t.Fatal("duplicate fact cursor must fail closed")
	}
	fact.Fact.Sequence = telemetrycore.FactSequence(3)
	if err := svc.ConsumeFact(fact); !errors.Is(err, engineerprojection.ErrFactResyncRequired) {
		t.Fatalf("fact gap error = %v, want ErrFactResyncRequired", err)
	}
}

func TestEngineerServiceSourceStatusDisconnectsAndRequiresFreshLiveObservation(t *testing.T) {
	emitter := &mockEmitter{}
	svc := service.NewEngineerService(emitter)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive}); err != nil {
		t.Fatal(err)
	}
	eventsAfterFirstLive := len(emitter.Events())
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 1}); err != nil {
		t.Fatal(err)
	}
	if got := len(emitter.Events()); got != eventsAfterFirstLive {
		t.Fatalf("unchanged source state emitted duplicate status: got %d events, want %d", got, eventsAfterFirstLive)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 2, 2.8)); err != nil {
		t.Fatal(err)
	}
	if !svc.Status().Connected {
		t.Fatal("fresh live observation did not connect Engineer")
	}
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceStale, ReconnectAttempt: 1}); err != nil {
		t.Fatal(err)
	}
	if svc.Status().Connected {
		t.Fatal("stale canonical source left Engineer connected")
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 1, -2.8)); !errors.Is(err, service.ErrCanonicalSourceUnavailable) {
		t.Fatalf("observation while stale error = %v", err)
	}
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 1}); err != nil {
		t.Fatal(err)
	}
	if svc.Status().Connected {
		t.Fatal("live status alone must not reconnect Engineer")
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 2, 2.8)); !errors.Is(err, service.ErrCanonicalObservationNotFresh) {
		t.Fatalf("same reconnect observation error = %v, want not-fresh", err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 1, -2.8)); !errors.Is(err, service.ErrCanonicalObservationNotFresh) {
		t.Fatalf("stale reconnect observation error = %v, want not-fresh", err)
	}
	if svc.Status().Connected {
		t.Fatal("stale or same observation reconnected Engineer")
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 3, -2.8)); err != nil {
		t.Fatal(err)
	}
	if !svc.Status().Connected {
		t.Fatal("fresh observation after recovery did not reconnect Engineer")
	}
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceStale, ReconnectAttempt: 2}); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 2}); err != nil {
		t.Fatal(err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 2, 1, 2.8)); err != nil {
		t.Fatalf("new epoch after recovery error = %v", err)
	}
	if !svc.Status().Connected {
		t.Fatal("new epoch after recovery did not reconnect Engineer")
	}
}

func TestEngineerServiceReconnectAttemptAdvanceRequiresObservationAfterBoundary(t *testing.T) {
	svc := service.NewEngineerService(&mockEmitter{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	defer svc.Stop()

	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 7}); err != nil {
		t.Fatal(err)
	}
	snapshot := canonicalSpotterObservationAt(t, 1, 2, 2.8)
	if err := svc.ConsumeObservation(snapshot); err != nil {
		t.Fatal(err)
	}
	if !svc.Status().Connected {
		t.Fatal("initial live snapshot did not connect Engineer")
	}

	if err := svc.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive, ReconnectAttempt: 8}); err != nil {
		t.Fatal(err)
	}
	if svc.Status().Connected {
		t.Fatal("advanced reconnect attempt with live state did not create a boundary")
	}
	if err := svc.ConsumeObservation(snapshot); !errors.Is(err, service.ErrCanonicalObservationNotFresh) {
		t.Fatalf("same snapshot after reconnect attempt error = %v, want not-fresh", err)
	}
	if err := svc.ConsumeObservation(canonicalSpotterObservationAt(t, 1, 3, -2.8)); err != nil {
		t.Fatalf("newer snapshot after reconnect attempt error = %v", err)
	}
	if !svc.Status().Connected {
		t.Fatal("newer snapshot after reconnect attempt did not reconnect Engineer")
	}
}

func canonicalSpotterObservation(t *testing.T, epoch uint64, rivalX ...float64) engineerprojection.ObservationSnapshotV1 {
	return canonicalSpotterObservationAt(t, epoch, 1, rivalX...)
}

func canonicalSpotterObservationAt(t *testing.T, epoch, sequence uint64, rivalX ...float64) engineerprojection.ObservationSnapshotV1 {
	return canonicalObservation(t, epoch, sequence, 1, 100, 100, false, rivalX...)
}

func canonicalObservationAt(t *testing.T, epoch, sequence uint64, lap int, fuel, capacity float64, rivalX ...float64) engineerprojection.ObservationSnapshotV1 {
	return canonicalObservation(t, epoch, sequence, lap, fuel, capacity, true, rivalX...)
}

func canonicalObservation(t *testing.T, epoch, sequence uint64, lap int, fuel, capacity float64, familySignals bool, rivalX ...float64) engineerprojection.ObservationSnapshotV1 {
	t.Helper()
	run := identity.RunIdentity{Event: "event", Session: "session", Vehicle: "player", Team: "team", Driver: "driver"}
	sourceTime := time.Duration(sequence) * time.Second
	clock := schema.NewClock(observedField(t, sourceTime), observedField(t, sourceTime), time.Now().UTC())
	header := envelope.Header{
		Source:   "canonical-service-test",
		Cursor:   schema.Cursor{Epoch: schema.Epoch(epoch), Sequence: schema.Sequence(sequence)},
		Clock:    clock,
		Identity: run,
	}
	orientation := spatial.Orientation{
		Row0: spatial.Vector3{X: 1},
		Row1: spatial.Vector3{Y: 1},
		Row2: spatial.Vector3{Z: 1},
	}
	player := telemetrycore.VehicleState{
		Identity:      run,
		Player:        observedField(t, true),
		Gear:          observedField(t, vehicle.Gear(4)),
		SpeedMPS:      observedField(t, 40.0),
		InPit:         observedField(t, pit.InPit(false)),
		WorldPosition: observedField(t, spatial.Position{X: 100, Z: 100}),
		LocalVelocity: observedField(t, spatial.LocalVelocity{Z: 40}),
		Orientation:   observedField(t, orientation),
	}
	if lap >= 0 {
		player.LapNumber = observedField(t, session.LapNumber(lap))
	}
	if familySignals {
		player.LastLapTime = observedField(t, standings.LapTime(90))
		player.Position = observedField(t, standings.Position(1))
		player.PenaltyCount = observedField(t, standings.PenaltyCount(0))
		player.TimeBehindNext = observedField(t, standings.TimeGap(2))
		player.TimeBehindLeader = observedField(t, standings.TimeGap(5))
		player.Fuel = observedField(t, energy.Fuel{Amount: energy.FuelAmount(fuel), Capacity: energy.FuelCapacity(capacity)})
	}
	vehicles := []telemetrycore.VehicleState{player}
	for index, offset := range rivalX {
		rival := player
		rival.Identity.Vehicle = identity.VehicleID(fmt.Sprintf("rival-%d", index))
		rival.Player = observedField(t, false)
		rival.WorldPosition = observedField(t, spatial.Position{X: 100 + offset, Z: 100})
		vehicles = append(vehicles, rival)
	}
	state := derive.FinalState{Observed: telemetrycore.ObservedState{
		SourceTime:    observedField(t, sourceTime),
		PlayerPresent: observedField(t, true),
		VehicleCount:  observedField(t, schema.Count(len(vehicles))),
		Vehicles:      vehicles,
	}}
	snapshot, err := envelope.NewSnapshot(header, state, func(value derive.FinalState) derive.FinalState {
		value.Observed.Vehicles = slices.Clone(value.Observed.Vehicles)
		return value
	})
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := engineerprojection.NewManifest([]engineerprojection.Capability{
		{ID: engineerprojection.CapabilitySession, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityStandings, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityControls, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityPit, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityFuel, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilityGaps, State: engineerprojection.CapabilitySupported},
		{ID: engineerprojection.CapabilitySpatial, State: engineerprojection.CapabilitySupported},
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := engineerprojection.ProjectObservationV1(snapshot, manifest)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func observedField[T comparable](t *testing.T, value T) schema.Field[T] {
	t.Helper()
	result, err := schema.NewField(value, schema.ProvenanceObserved, schema.FreshnessFresh)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
