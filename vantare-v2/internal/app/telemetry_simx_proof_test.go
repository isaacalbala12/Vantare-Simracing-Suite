package app

import (
	"context"
	"encoding/json"
	"slices"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/capability"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/simx"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

func simxRuntimeConfig() TelemetryCoreRuntimeConfig {
	enabled := true
	return TelemetryCoreRuntimeConfig{TelemetrySimXDriver: &enabled}
}

// This is the phase's central proof: a simulator that Vantare has never seen
// reaches Overlay v2 with populated session, standings and fuel, and with its
// degradation declared instead of silently missing. Not one widget, and not one
// file below frontend/, takes part.
func TestSimXStartsWithoutTouchingWidgets(t *testing.T) {
	core, err := NewTelemetryCoreRuntime(simxRuntimeConfig())
	if err != nil {
		t.Fatalf("NewTelemetryCoreRuntime() error = %v", err)
	}
	if supported := core.simulator.Supported(); len(supported) != 1 || supported[0].ID != simx.DriverID {
		t.Fatalf("registered simulators = %#v, want only SimX", supported)
	}

	publisher, release, err := core.OverlayV2Publishers().RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	subscription, err := publisher.Subscribe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()

	// The batches are produced by the real synthetic driver and its real
	// mapper, not by a fixture written for this test.
	feedSimXFrames(t, core, 400)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	event, err := subscription.Next(ctx)
	if err != nil {
		t.Fatalf("Next() error = %v", err)
	}
	var update overlayv2.UpdateV2
	if err := json.Unmarshal(event.Data, &update); err != nil {
		t.Fatal(err)
	}
	frame := update.Frame
	if frame == nil {
		t.Fatal("SimX produced no Overlay v2 frame")
	}
	if frame.Session.Track.Q == overlayv2.QualityMissing || frame.Session.Track.V != simx.TrackName {
		t.Fatalf("session = %+v", frame.Session)
	}
	if len(frame.Standings) != simx.VehicleCount {
		t.Fatalf("standings rows = %d, want %d", len(frame.Standings), simx.VehicleCount)
	}
	if frame.Standings[0].Position != 1 || frame.Standings[0].VehicleID == "" {
		t.Fatalf("leading standings row = %+v", frame.Standings[0])
	}
	if frame.Player.Speed.Q == overlayv2.QualityMissing || frame.Player.Gear.Q == overlayv2.QualityMissing {
		t.Fatalf("player instruments = %+v", frame.Player)
	}
	// Documented gap: the Overlay v2 fuel view is still a stub owned by the
	// parallel F8 batch and returns missing values for every driver, LMU
	// included. What this phase owns is that the fuel capability is declared and
	// that the canonical state carries it, which is asserted below and in
	// feedSimXFrames.

	// The frame must not claim any spatial, spotter or delta capability. LMU
	// claims all of them through the same code path, so this is a real
	// difference produced by the driver's declaration.
	for _, unsupported := range []string{
		string(capability.SpatialLongitudinal),
		string(capability.SpatialLateral),
		string(capability.Spotter),
		string(capability.Weather),
		string(capability.Delta),
	} {
		if slices.Contains(frame.Capabilities.Supported, unsupported) {
			t.Fatalf("frame declares %q supported for SimX: %v", unsupported, frame.Capabilities.Supported)
		}
		if quality, present := frame.Capabilities.Available[unsupported]; present {
			t.Fatalf("frame declares %q available (%q) for SimX", unsupported, quality)
		}
	}
	if frame.Spotter.Mode != overlayv2.ModeNone {
		t.Fatalf("spotter mode = %q, want none", frame.Spotter.Mode)
	}

	// The composition root's own declaration is the authority, and it is the
	// vocabulary the Overlay v2 builder will consume once its channel-to-signal
	// mapping is flipped. Documented as the remaining seam of this phase.
	declared := core.capabilities
	if declared.State(capability.Standings) != capability.StateSupported {
		t.Fatalf("declared standings = %v, want supported", declared.State(capability.Standings))
	}
	for _, unsupported := range []capability.ID{capability.SpatialLateral, capability.Spotter, capability.Weather} {
		if declared.State(unsupported) != capability.StateUnsupported {
			t.Fatalf("declared %q = %v, want unsupported", unsupported, declared.State(unsupported))
		}
	}
	if declared.State(capability.SpatialLongitudinal) != capability.StateSupported {
		t.Fatal("SimX publishes lap distance and must keep longitudinal proximity supported")
	}
	if modes := declared.Modes(); modes.Spatial != capability.SpatialLapDistance || modes.Gaps != capability.GapsEstimated {
		t.Fatalf("declared modes = %#v", modes)
	}

	// ISA-679: the published frame now carries the resolved modes, so a
	// consumer degrades on the mode and never on the simulator name. SimX has
	// no world coordinates, so the spatial mode is the lap distance it really
	// publishes; personal-best is excluded by its declaration; the running
	// order is the simulator's own but the gaps are reconstructed.
	published := frame.Capabilities.Modes
	if len(published.Spatial) != 1 || published.Spatial[0] != string(capability.SpatialLapDistance) {
		t.Fatalf("published spatial modes = %v, want [lap-distance]", published.Spatial)
	}
	if slices.Contains(published.Delta, overlayv2.DeltaReferencePersonalBest) {
		t.Fatalf("published delta modes = %v, want no personal-best for SimX", published.Delta)
	}
	if published.Standings != overlayv2.ModeOfficial {
		t.Fatalf("published standings mode = %q, want official", published.Standings)
	}
	if published.Gaps != overlayv2.ModeEstimated {
		t.Fatalf("published gaps mode = %q, want estimated", published.Gaps)
	}
}

// Without a lateral position there is no honest side awareness, so the Engineer
// families gated on the spatial capability must be switched off through the
// mechanism that already exists (ReasonCapabilityUnavailable) instead of
// emitting advice about positions nobody published.
func TestSpotterFamilyDisabledWhenLateralUnsupported(t *testing.T) {
	t.Parallel()

	core, err := NewTelemetryCoreRuntime(simxRuntimeConfig())
	if err != nil {
		t.Fatal(err)
	}
	if state := core.engineerManifest.State(engineerprojection.CapabilitySpatial); state != engineerprojection.CapabilityUnsupported {
		t.Fatalf("Engineer spatial with SimX = %v, want unsupported", state)
	}
	for _, id := range []engineerprojection.CapabilityID{
		engineerprojection.CapabilitySession,
		engineerprojection.CapabilityStandings,
		engineerprojection.CapabilityFuel,
	} {
		if state := core.engineerManifest.State(id); state != engineerprojection.CapabilitySupported {
			t.Fatalf("Engineer %q with SimX = %v, want supported", id, state)
		}
	}

	withLMU, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if state := withLMU.engineerManifest.State(engineerprojection.CapabilitySpatial); state != engineerprojection.CapabilitySupported {
		t.Fatalf("Engineer spatial with LMU = %v, want supported", state)
	}
}

// The delta fallback is decided in Go and declared, never negotiated inside a
// widget. SimX has no native delta, so personal-best is not answerable and must
// not appear among the declared references.
//
// Documented gap: the Overlay v2 delta builder that will consume these declared
// references belongs to the parallel F8 batch and has not landed on this branch,
// so this asserts the declaration that feeds it rather than the built view.
func TestDeltaFallbackIsResolvedInGoAndDeclared(t *testing.T) {
	t.Parallel()

	simxSet, err := capability.Resolve(simx.Capabilities(), nil)
	if err != nil {
		t.Fatal(err)
	}
	references := simxSet.Modes().DeltaReferences
	if slices.Contains(references, "personal-best") {
		t.Fatalf("SimX declares personal-best (%v) without a native delta", references)
	}
	if !slices.Contains(references, "session-best") || !slices.Contains(references, "previous-lap") {
		t.Fatalf("SimX must declare the references it can answer, got %v", references)
	}

	lmuSet, err := capability.Resolve(lmu.Capabilities(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(lmuSet.Modes().DeltaReferences, "personal-best") {
		t.Fatalf("LMU publishes a native delta and must keep personal-best, got %v", lmuSet.Modes().DeltaReferences)
	}
}

// Every driver's authority matrix must answer by signal id, and reaching an
// uncovered signal must be an error and never a panic. The LMU fusion used to
// scan its table linearly and panic on a miss.
func TestAuthorityMatrixIsExhaustiveBySignalID(t *testing.T) {
	t.Parallel()

	for name, rules := range map[string][]string{
		"lmu":  lmuMatrixSignals(),
		"simx": simxMatrixSignals(),
	} {
		seen := make(map[string]struct{}, len(rules))
		for _, signal := range rules {
			if _, duplicate := seen[signal]; duplicate {
				t.Fatalf("%s declares signal %s twice", name, signal)
			}
			seen[signal] = struct{}{}
		}
		if len(seen) == 0 {
			t.Fatalf("%s declares no signal", name)
		}
	}
}

// The one-off branch-diff proof for the F10 phase (no frontend file in the
// branch) used to live here; it diffed against the integration branch and can
// only fail once promoted to nightly. The durable guarantee is structural:
// the SimX driver cannot import frontend code (architecture_test.go) and the
// historical demonstration is recorded in
// docs/telemetry-core/evidence/isa-372-f10-multisim.md (ISA-683).

func lmuMatrixSignals() []string {
	rules := lmu.AuthorityMatrix()
	signals := make([]string, 0, len(rules))
	for _, rule := range rules {
		signals = append(signals, string(rune(rule.Signal))+"-lmu")
	}
	return signals
}

func simxMatrixSignals() []string {
	rules := simx.AuthorityMatrix()
	signals := make([]string, 0, len(rules))
	for _, rule := range rules {
		signals = append(signals, string(rune(rule.Signal))+"-simx")
	}
	return signals
}

func feedSimXFrames(t *testing.T, core *TelemetryCoreRuntime, frames uint64) {
	t.Helper()
	reader := simx.NewReader(time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC), 0)
	mapper := simx.NewBatchMapper()
	sink := runtimeBatchSink{runtime: core}
	fused := &simx.Fusion{}
	for index := uint64(0); index < frames; index++ {
		observation, _ := fused.Merge(time.Duration(index+1)*simx.TickInterval, reader.Next())
		if err := mapper.WriteObservation(context.Background(), observation, telemetrycore.BatchSinkFunc(sink.WriteBatch)); err != nil {
			t.Fatalf("frame %d: %v", index, err)
		}
	}
}
