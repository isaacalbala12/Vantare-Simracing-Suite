package lmu

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	overlayprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

type runtimeProjectionResult struct {
	projection overlayprojection.SnapshotV1
	final      envelope.Snapshot[derive.FinalState]
	facts      []envelope.Fact[telemetrycore.SessionFact]
	run        identity.RunIdentity
}

type runtimeIntegrationGoldenV1 struct {
	SchemaVersion                int                   `json:"schemaVersion"`
	SimulatorBuild               string                `json:"simulatorBuild"`
	MenuFixtureSHA256            string                `json:"menuFixtureSha256"`
	TrackFixtureSHA256           string                `json:"trackFixtureSha256"`
	TrackOverlayProjectionSHA256 string                `json:"trackOverlayProjectionSha256"`
	DeterministicRuns            int                   `json:"deterministicRuns"`
	TrackVehicleCount            int                   `json:"trackVehicleCount"`
	TrackPlayerPresent           bool                  `json:"trackPlayerPresent"`
	DeltaTraceSHA256             string                `json:"deltaTraceSha256"`
	InPitTransition              runtimeEvidenceGateV1 `json:"inPitTransition"`
	DisconnectReconnect          runtimeEvidenceGateV1 `json:"disconnectReconnect"`
}

type runtimeEvidenceGateV1 struct {
	Status                       string                        `json:"status"`
	SyntheticSubstitutionAllowed bool                          `json:"syntheticSubstitutionAllowed"`
	Frames                       []runtimeFrameEvidenceV1      `json:"frames,omitempty"`
	Events                       []runtimeConnectionEvidenceV1 `json:"events,omitempty"`
}

type runtimeFrameEvidenceV1 struct {
	Role              string  `json:"role"`
	File              string  `json:"file"`
	SHA256            string  `json:"sha256"`
	SourceTimeSeconds float64 `json:"sourceTimeSeconds"`
	VehicleCount      int     `json:"vehicleCount"`
	PlayerPresent     bool    `json:"playerPresent"`
	PlayerInPit       bool    `json:"playerInPit"`
}

type runtimeConnectionEvidenceV1 struct {
	State       string `json:"state"`
	FrameSHA256 string `json:"frameSha256,omitempty"`
	FailureCode string `json:"failureCode,omitempty"`
}

type runtimeFrameManifestV1 struct {
	Schema            string  `json:"schema"`
	Build             string  `json:"build"`
	Role              string  `json:"role"`
	SHA256            string  `json:"sha256"`
	Sanitization      string  `json:"sanitization"`
	SourceTimeSeconds float64 `json:"sourceTimeSeconds"`
	VehicleCount      int     `json:"vehicleCount"`
	PlayerPresent     bool    `json:"playerPresent"`
	PlayerInPit       bool    `json:"playerInPit"`
}

func decodeStrictJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("unexpected trailing JSON value")
		}
		return err
	}
	return nil
}

func TestRuntimeEvidenceJSONRejectsUnknownAndTrailingFields(t *testing.T) {
	tests := []struct {
		name string
		data string
		out  any
	}{
		{
			name: "manifest unknown field",
			data: `{"schema":"vantare.lmu-shared-memory-evidence.v1","build":"1.4.0.0","role":"in-pit-observed","sha256":"abc","sanitization":"zero-rebuilt-allowlist","sourceTimeSeconds":1,"vehicleCount":1,"playerPresent":true,"playerInPit":true,"driverName":"forbidden"}`,
			out:  &runtimeFrameManifestV1{},
		},
		{
			name: "disconnect payload",
			data: `{"state":"disconnected","failureCode":"build-evidence-unavailable","payload":{"driver":"forbidden"}}`,
			out:  &runtimeConnectionEvidenceV1{},
		},
		{
			name: "trailing value",
			data: `{"state":"disconnected","failureCode":"build-evidence-unavailable"} {}`,
			out:  &runtimeConnectionEvidenceV1{},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := decodeStrictJSON([]byte(test.data), test.out); err == nil {
				t.Fatal("strict JSON decoder accepted forbidden evidence data")
			}
		})
	}
}

type runtimeDeltaSampleV1 struct {
	Version           int     `json:"version"`
	SampleIndex       int     `json:"sample_index"`
	ElapsedOffsetNS   int64   `json:"elapsed_offset_ns"`
	SourceTimeNS      int64   `json:"source_time_ns"`
	LapNumber         int64   `json:"lap_number"`
	LapDistanceMeters float64 `json:"lap_distance_m"`
	SpeedMPS          float64 `json:"speed_mps"`
	InPit             bool    `json:"in_pit"`
	Quality           string  `json:"quality"`
}

type runtimeDeltaGoldenV1 struct {
	Version                 int    `json:"version"`
	TraceSHA256             string `json:"trace_sha256"`
	SampleCount             int    `json:"sample_count"`
	SampleFrequencyHz       int    `json:"sample_frequency_hz"`
	WrapSampleIndices       []int  `json:"wrap_sample_indices"`
	CompletedComparableLaps int    `json:"completed_comparable_laps"`
	FirstLapDurationNS      int64  `json:"first_lap_duration_ns"`
	SecondLapDurationNS     int64  `json:"second_lap_duration_ns"`
	SecondLapExpectedSign   string `json:"second_lap_expected_sign"`
	SampleUncertaintyNS     int64  `json:"sample_uncertainty_ns"`
}

type runtimeProjectionSink struct {
	reducer     *telemetrycore.Reducer
	coordinator *telemetrycore.SessionCoordinator
	pipeline    *derive.Pipeline
	results     chan runtimeProjectionResult
}

func (sink *runtimeProjectionSink) WriteBatch(ctx context.Context, batch telemetrycore.Batch) error {
	observed, err := sink.reducer.Apply(batch)
	if err != nil {
		return err
	}
	facts := &runtimeFactSink{}
	if err := sink.coordinator.Apply(ctx, observed, facts); err != nil {
		return err
	}
	final, err := sink.pipeline.Apply(ctx, observed)
	if err != nil {
		return err
	}
	projection, err := overlayprojection.ProjectV1(final)
	if err != nil {
		return err
	}
	result := runtimeProjectionResult{
		projection: projection,
		final:      final,
		facts:      append([]envelope.Fact[telemetrycore.SessionFact](nil), facts.values...),
		run:        observed.Header().Identity,
	}
	select {
	case sink.results <- result:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestSingleLMU14RuntimeFeedsEngineerAndKeepsDistantTrafficSilent(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..", "testdata")
	frame, err := os.ReadFile(filepath.Join(root, "lmu-1.4-track-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	golden := readRuntimeIntegrationGolden(t)
	assertSHA256Hex(t, frame, golden.TrackFixtureSHA256, "track fixture")

	result, opens := runSingleLMU14Frame(t, frame)
	if opens != 1 {
		t.Fatalf("LMU_Data opens = %d, want exactly one", opens)
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
	observation, err := engineerprojection.ProjectObservationV1(result.final, manifest)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service := engineerservice.NewEngineerService(nil)
	service.Start(ctx)
	defer service.Stop()
	notifications, unsubscribe := service.Subscribe()
	defer unsubscribe()
	if err := service.ConsumeSourceStatus(engineerprojection.SourceStatusV1{State: engineerprojection.SourceLive}); err != nil {
		t.Fatal(err)
	}
	if err := service.ConsumeObservation(observation); err != nil {
		t.Fatal(err)
	}
	for _, fact := range result.facts {
		projected, err := engineerprojection.ProjectFactV1(fact)
		if err != nil {
			t.Fatal(err)
		}
		if err := service.ConsumeFact(projected); err != nil {
			t.Fatal(err)
		}
	}
	if status := service.Status(); !status.Connected || status.Source != "telemetry-core" || status.LastError != "" {
		t.Fatalf("Engineer status = %#v", status)
	}
	timer := time.NewTimer(250 * time.Millisecond)
	defer timer.Stop()
	for {
		select {
		case notification := <-notifications:
			if notification.Category == "spotter" {
				t.Fatalf("distant real LMU traffic produced false Spotter notification: %#v", notification)
			}
		case <-timer.C:
			return
		}
	}
}

type runtimeFactSink struct {
	values []envelope.Fact[telemetrycore.SessionFact]
}

func (sink *runtimeFactSink) WriteFacts(_ context.Context, values []envelope.Fact[telemetrycore.SessionFact]) error {
	sink.values = append(sink.values, values...)
	return nil
}

func TestSingleLMU14RuntimeReachesOverlayProjectionDeterministically(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..", "testdata")
	frame, err := os.ReadFile(filepath.Join(root, "lmu-1.4-track-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	golden := readRuntimeIntegrationGolden(t)
	if golden.SchemaVersion != 1 || golden.SimulatorBuild != diagnosticLMUVersion || golden.DeterministicRuns != 20 {
		t.Fatalf("runtime golden metadata = %#v", golden)
	}
	assertSHA256Hex(t, frame, golden.TrackFixtureSHA256, "track fixture")
	menu, err := os.ReadFile(filepath.Join(root, "lmu-1.4-menu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	assertSHA256Hex(t, menu, golden.MenuFixtureSHA256, "menu fixture")

	var first []byte
	for run := range golden.DeterministicRuns {
		result, opens := runSingleLMU14Frame(t, frame)
		if opens != 1 {
			t.Fatalf("run %d opened LMU_Data %d times, want exactly one", run, opens)
		}
		if len(result.projection.Vehicles) != golden.TrackVehicleCount || (result.projection.Player != "") != golden.TrackPlayerPresent {
			t.Fatalf("run %d projection vehicles=%d player=%q", run, len(result.projection.Vehicles), result.projection.Player)
		}
		if len(result.facts) != 1 || result.facts[0].Value().Kind != telemetrycore.FactSessionStarted {
			t.Fatalf("run %d facts = %#v, want one session-started fact", run, result.facts)
		}

		encoded, err := json.Marshal(result.projection)
		if err != nil {
			t.Fatal(err)
		}
		if run == 0 {
			first = encoded
			continue
		}
		if !bytes.Equal(encoded, first) {
			t.Fatalf("run %d projection differs from run 0", run)
		}
	}
	assertSHA256Hex(t, first, golden.TrackOverlayProjectionSHA256, "track Overlay projection")
	deltaTrace, err := os.ReadFile(filepath.Join("..", "..", "derive", "testdata", "lmu-1.4-self-delta-trace-v1.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	assertSHA256Hex(t, deltaTrace, golden.DeltaTraceSHA256, "real delta trace")
	for name, entry := range map[string]struct {
		gate       runtimeEvidenceGateV1
		wantStatus string
	}{
		"in-pit transition": {
			gate: golden.InPitTransition, wantStatus: "real-lmu-1.4-sanitized-sequence",
		},
		"disconnect/reconnect": {
			gate: golden.DisconnectReconnect, wantStatus: "real-recorded-status-sequence",
		},
	} {
		if entry.gate.Status != entry.wantStatus || entry.gate.SyntheticSubstitutionAllowed {
			t.Fatalf("%s evidence gate = %#v, want status %q and no synthetic substitution", name, entry.gate, entry.wantStatus)
		}
	}
}

func TestRealLMU14PitAndReconnectEvidenceReplays(t *testing.T) {
	golden := readRuntimeIntegrationGolden(t)
	root := filepath.Join("..", "..", "..", "..", "testdata")
	if len(golden.InPitTransition.Frames) != 3 {
		t.Fatalf("in-pit transition frames = %d, want 3", len(golden.InPitTransition.Frames))
	}

	received := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	fusion := &Fusion{}
	mapper := NewBatchMapper()
	downstream := &runtimeProjectionSink{
		reducer: telemetrycore.NewReducer(),
		coordinator: telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{
			Now: func() time.Time { return received },
		}),
		pipeline: derive.NewPipeline(derive.Config{}),
		results:  make(chan runtimeProjectionResult, 4),
	}

	wantPit := []bool{false, true, false}
	var first runtimeProjectionResult
	for index, evidence := range golden.InPitTransition.Frames {
		observation := readRealEvidenceFrame(t, root, evidence, received.Add(time.Duration(index)*time.Second))
		fused := fusion.Merge(observation.ReceivedUTC, time.Duration(index)*time.Second, observation)
		result := writeRuntimeObservation(t, mapper, downstream, fused)
		assertProjectedPlayerInPit(t, result.projection, wantPit[index])
		if index == 0 {
			first = result
			continue
		}
		if result.run.Session != first.run.Session || result.projection.Epoch != first.projection.Epoch {
			t.Fatalf("in-pit transition changed session/epoch at frame %d: first=%+v/%d got=%+v/%d", index, first.run, first.projection.Epoch, result.run, result.projection.Epoch)
		}
		assertSameVehicleIDs(t, first.projection.Vehicles, result.projection.Vehicles)
	}

	events := golden.DisconnectReconnect.Events
	if len(events) != 3 || events[0].State != "connected" || events[1].State != "disconnected" || events[2].State != "reconnected" {
		t.Fatalf("disconnect/reconnect events = %#v", events)
	}
	if events[0].FrameSHA256 == "" || events[1].FrameSHA256 != "" || events[1].FailureCode != "build-evidence-unavailable" || events[2].FrameSHA256 == "" {
		t.Fatalf("disconnect/reconnect payload contract = %#v", events)
	}
	if len(golden.DisconnectReconnect.Frames) != 2 ||
		golden.DisconnectReconnect.Frames[0].SHA256 != events[0].FrameSHA256 ||
		golden.DisconnectReconnect.Frames[1].SHA256 != events[2].FrameSHA256 {
		t.Fatalf("disconnect/reconnect frame references do not match events")
	}

	before := readRealEvidenceFrame(t, root, golden.DisconnectReconnect.Frames[0], received.Add(10*time.Second))
	after := readRealEvidenceFrame(t, root, golden.DisconnectReconnect.Frames[1], received.Add(11*time.Second))
	if beforeTime, _ := before.SourceTime.Value(); beforeTime <= 0 {
		t.Fatalf("connected source time = %v", beforeTime)
	} else if afterTime, _ := after.SourceTime.Value(); afterTime >= beforeTime {
		t.Fatalf("reconnected source time = %v, want reset below %v", afterTime, beforeTime)
	}

	reconnectFusion := &Fusion{}
	reconnectMapper := NewBatchMapper()
	reconnectDownstream := &runtimeProjectionSink{
		reducer: telemetrycore.NewReducer(),
		coordinator: telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{
			Now: func() time.Time { return received },
		}),
		pipeline: derive.NewPipeline(derive.Config{}),
		results:  make(chan runtimeProjectionResult, 2),
	}
	beforeResult := writeRuntimeObservation(t, reconnectMapper, reconnectDownstream,
		reconnectFusion.Merge(before.ReceivedUTC, 10*time.Second, before))
	afterResult := writeRuntimeObservation(t, reconnectMapper, reconnectDownstream,
		reconnectFusion.Merge(after.ReceivedUTC, 11*time.Second, after))
	if afterResult.run.Session == beforeResult.run.Session || afterResult.projection.Epoch != beforeResult.projection.Epoch+1 {
		t.Fatalf("reconnect session/epoch = %+v/%d, want one new epoch after %+v/%d", afterResult.run, afterResult.projection.Epoch, beforeResult.run, beforeResult.projection.Epoch)
	}
	assertSameVehicleIDs(t, beforeResult.projection.Vehicles, afterResult.projection.Vehicles)
}

func readRealEvidenceFrame(t testing.TB, root string, evidence runtimeFrameEvidenceV1, received time.Time) Observation {
	t.Helper()
	path := filepath.Join(root, evidence.File)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	manifestData, err := os.ReadFile(path[:len(path)-len(filepath.Ext(path))] + ".json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest runtimeFrameManifestV1
	if err := decodeStrictJSON(manifestData, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Schema != "vantare.lmu-shared-memory-evidence.v1" ||
		manifest.Build != diagnosticLMUVersion || manifest.Sanitization != "zero-rebuilt-allowlist" ||
		(runtimeFrameEvidenceV1{
			Role: manifest.Role, File: evidence.File, SHA256: manifest.SHA256,
			SourceTimeSeconds: manifest.SourceTimeSeconds, VehicleCount: manifest.VehicleCount,
			PlayerPresent: manifest.PlayerPresent, PlayerInPit: manifest.PlayerInPit,
		}) != evidence {
		t.Fatalf("%s manifest does not match closed golden evidence: %#v", evidence.Role, manifest)
	}
	assertSHA256Hex(t, data, evidence.SHA256, evidence.Role)
	observation, err := parseWithBuild(data, received, BuildEvidence{
		FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	sourceTime, sourceTimePresent := observation.SourceTime.Value()
	wantSourceTime := time.Duration(evidence.SourceTimeSeconds * float64(time.Second))
	sourceTimeDelta := sourceTime - wantSourceTime
	if sourceTimeDelta < 0 {
		sourceTimeDelta = -sourceTimeDelta
	}
	playerPresent, playerPresenceKnown := observation.PlayerPresent.Value()
	player, playerFound := findPlayerVehicle(observation)
	inPit, inPitPresent := player.InPit.Value()
	if !sourceTimePresent || sourceTimeDelta > time.Microsecond ||
		len(observation.Vehicles) != evidence.VehicleCount || !playerPresenceKnown ||
		playerPresent != evidence.PlayerPresent || !playerFound || !inPitPresent || bool(inPit) != evidence.PlayerInPit {
		t.Fatalf("%s metadata mismatch: source=%v/%v vehicles=%d player=%v/%v found=%v inPit=%v/%v", evidence.Role, sourceTime, sourceTimePresent, len(observation.Vehicles), playerPresent, playerPresenceKnown, playerFound, inPit, inPitPresent)
	}
	return observation
}

func findPlayerVehicle(observation Observation) (VehicleObservation, bool) {
	for _, current := range observation.Vehicles {
		if player, present := current.Player.Value(); present && player {
			return current, true
		}
	}
	return VehicleObservation{}, false
}

func assertProjectedPlayerInPit(t testing.TB, projection overlayprojection.SnapshotV1, want bool) {
	t.Helper()
	for _, current := range projection.Vehicles {
		if current.ID != projection.Player {
			continue
		}
		if !current.InPit.Present || bool(current.InPit.Value) != want {
			t.Fatalf("player InPit = %+v, want %v", current.InPit, want)
		}
		return
	}
	t.Fatalf("projection player %q not found", projection.Player)
}

func TestLMU14MenuCannotBecomeAnInventedLivePayload(t *testing.T) {
	frame, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-1.4-menu-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	received := time.Date(2026, 7, 31, 18, 0, 0, 0, time.UTC)
	parsed, err := parseWithBuild(frame, received, BuildEvidence{
		FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	fused := (&Fusion{}).Merge(received, 0, parsed)
	player, playerKnown := fused.PlayerPresent.Value()
	if len(fused.Vehicles) != 0 || !playerKnown || player {
		t.Fatalf("menu observation vehicles=%d player=%v known=%v", len(fused.Vehicles), player, playerKnown)
	}
	called := false
	err = NewBatchMapper().WriteObservation(t.Context(), fused, telemetrycore.BatchSinkFunc(func(context.Context, telemetrycore.Batch) error {
		called = true
		return nil
	}))
	if !errors.Is(err, ErrInvalidSessionIdentity) || called {
		t.Fatalf("menu mapper error=%v downstreamCalled=%v", err, called)
	}
}

// TestLMU14CanonicalTransitions starts from the real, sanitized LMU 1.4 track
// frame and then applies controlled canonical transitions. These contract tests
// complement the real pit and reconnect recordings declared in the golden gates.
func TestLMU14CanonicalTransitionsPreserveOwnershipAndResetState(t *testing.T) {
	frame, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "testdata", "lmu-1.4-track-fixture.bin"))
	if err != nil {
		t.Fatal(err)
	}
	received := time.Date(2026, 7, 31, 18, 0, 0, 0, time.UTC)
	parsed, err := parseWithBuild(frame, received, BuildEvidence{
		FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	base := (&Fusion{}).Merge(received, 0, parsed)
	if len(base.Vehicles) < 3 {
		t.Fatalf("real track fixture has %d vehicles, want at least 3", len(base.Vehicles))
	}

	playerIndex := -1
	for index, current := range base.Vehicles {
		if player, present := current.Player.Value(); present && player {
			playerIndex = index
			break
		}
	}
	if playerIndex < 0 {
		t.Fatal("real track fixture has no player row")
	}
	omittedIndex := (playerIndex + 1) % len(base.Vehicles)
	newPlayerIndex := (playerIndex + 2) % len(base.Vehicles)
	omittedSlot := base.Vehicles[omittedIndex].SourceID
	newPlayerSlot := base.Vehicles[newPlayerIndex].SourceID

	downstream := &runtimeProjectionSink{
		reducer: telemetrycore.NewReducer(),
		coordinator: telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{
			Now: func() time.Time { return received },
		}),
		pipeline: derive.NewPipeline(derive.Config{}),
		results:  make(chan runtimeProjectionResult, 8),
	}
	mapper := NewBatchMapper()
	first := writeRuntimeObservation(t, mapper, downstream, base)

	reordered := cloneRuntimeObservation(base)
	for left, right := 0, len(reordered.Vehicles)-1; left < right; left, right = left+1, right-1 {
		reordered.Vehicles[left], reordered.Vehicles[right] = reordered.Vehicles[right], reordered.Vehicles[left]
	}
	advanceRuntimeObservation(&reordered, received.Add(time.Second), time.Second, ClockContinuous)
	second := writeRuntimeObservation(t, mapper, downstream, reordered)
	assertSameVehicleIDs(t, first.projection.Vehicles, second.projection.Vehicles)

	omitted := cloneRuntimeObservation(base)
	omitted.Vehicles = append(omitted.Vehicles[:omittedIndex], omitted.Vehicles[omittedIndex+1:]...)
	omitted.VehicleCount = observed(schema.Count(len(omitted.Vehicles)))
	advanceRuntimeObservation(&omitted, received.Add(2*time.Second), 2*time.Second, ClockContinuous)
	writeRuntimeObservation(t, mapper, downstream, omitted)

	reappeared := cloneRuntimeObservation(base)
	advanceRuntimeObservation(&reappeared, received.Add(3*time.Second), 3*time.Second, ClockContinuous)
	reappearedResult := writeRuntimeObservation(t, mapper, downstream, reappeared)
	assertProjectionHasVehicle(t, reappearedResult.projection, string(vehicleID(omittedSlot, 1)))

	reset := cloneRuntimeObservation(base)
	advanceRuntimeObservation(&reset, received.Add(4*time.Second), 100*time.Millisecond, ClockReset)
	resetResult := writeRuntimeObservation(t, mapper, downstream, reset)
	if resetResult.projection.Epoch <= reappearedResult.projection.Epoch || resetResult.run.Session == reappearedResult.run.Session {
		t.Fatalf("session reset epoch/session = %d/%q, want epoch > %d and session != %q", resetResult.projection.Epoch, resetResult.run.Session, reappearedResult.projection.Epoch, reappearedResult.run.Session)
	}
	assertProjectionHasVehicle(t, resetResult.projection, string(vehicleID(omittedSlot, 1)))

	playerChanged := cloneRuntimeObservation(reset)
	for index := range playerChanged.Vehicles {
		playerChanged.Vehicles[index].Player = observed(index == newPlayerIndex)
	}
	advanceRuntimeObservation(&playerChanged, received.Add(5*time.Second), 200*time.Millisecond, ClockContinuous)
	playerChangedResult := writeRuntimeObservation(t, mapper, downstream, playerChanged)
	wantPlayer := vehicleID(newPlayerSlot, 1)
	if playerChangedResult.projection.Player != wantPlayer || playerChangedResult.run.Vehicle != wantPlayer ||
		playerChangedResult.run.Session != resetResult.run.Session || playerChangedResult.projection.Epoch != resetResult.projection.Epoch {
		t.Fatalf("player change projection player=%q run=%+v epoch=%d, want player=%q same session=%q and epoch=%d", playerChangedResult.projection.Player, playerChangedResult.run, playerChangedResult.projection.Epoch, wantPlayer, resetResult.run.Session, resetResult.projection.Epoch)
	}
}

func TestRealLMU14DeltaTraceCrossesCanonicalRuntimeBeforeOverlay(t *testing.T) {
	root := filepath.Join("..", "..", "derive", "testdata")
	trace, err := os.ReadFile(filepath.Join(root, "lmu-1.4-self-delta-trace-v1.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	goldenData, err := os.ReadFile(filepath.Join(root, "lmu-1.4-self-delta-trace-v1.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden runtimeDeltaGoldenV1
	if err := decodeStrictJSON(goldenData, &golden); err != nil {
		t.Fatal(err)
	}
	assertSHA256Hex(t, trace, golden.TraceSHA256, "real delta trace")
	if len(golden.WrapSampleIndices) < 3 {
		t.Fatalf("real trace wraps = %v, want at least three", golden.WrapSampleIndices)
	}

	received := time.Date(2026, 7, 31, 18, 0, 0, 0, time.UTC)
	downstream := &runtimeProjectionSink{
		reducer: telemetrycore.NewReducer(),
		coordinator: telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{
			Now: func() time.Time { return received },
		}),
		pipeline: derive.NewPipeline(derive.Config{}),
		results:  make(chan runtimeProjectionResult, 1),
	}
	mapper := NewBatchMapper()
	scanner := bufio.NewScanner(bytes.NewReader(trace))
	index := 0
	deltaAfterReference := false
	var firstDelta overlayprojection.SnapshotV1
	for scanner.Scan() {
		var sample runtimeDeltaSampleV1
		if err := decodeStrictJSON(scanner.Bytes(), &sample); err != nil {
			t.Fatal(err)
		}
		if sample.Version != 1 || sample.SampleIndex != index || sample.Quality != "fresh" {
			t.Fatalf("invalid real delta sample %d: %+v", index, sample)
		}
		observation := Observation{
			Source:        SourceCanonical,
			ReceivedUTC:   received.Add(time.Duration(sample.ElapsedOffsetNS)),
			Compatibility: CompatibilityKnown,
			SourceTime:    observed(time.Duration(sample.SourceTimeNS)),
			TrackName:     observed("sanitized-track"),
			SessionType:   observed(session.TypeRace),
			VehicleCount:  observed(schema.Count(1)),
			PlayerPresent: observed(true),
			LapNumber:     observed(session.LapNumber(sample.LapNumber)),
			SpeedMPS:      observed(sample.SpeedMPS),
			InPit:         observed(pit.InPit(sample.InPit)),
			Vehicles: []VehicleObservation{{
				SourceID:    7,
				Player:      observed(true),
				LapNumber:   observed(session.LapNumber(sample.LapNumber)),
				LapDistance: observed(standings.LapDistance(sample.LapDistanceMeters)),
				SpeedMPS:    observed(sample.SpeedMPS),
				InPit:       observed(pit.InPit(sample.InPit)),
			}},
		}
		projected := writeRuntimeObservation(t, mapper, downstream, observation).projection
		if index < golden.WrapSampleIndices[1] && projected.PlayerDelta.Present {
			t.Fatalf("sample %d exposed delta before the first completed reference lap", index)
		}
		if index >= golden.WrapSampleIndices[1] && index < golden.WrapSampleIndices[2] && projected.PlayerDelta.Present {
			if !deltaAfterReference {
				firstDelta = projected
			}
			deltaAfterReference = true
		}
		index++
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if index != golden.SampleCount || !deltaAfterReference {
		t.Fatalf("real trace samples=%d/%d deltaAfterReference=%v", index, golden.SampleCount, deltaAfterReference)
	}
	encoded, err := json.MarshalIndent(firstDelta, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(filepath.Join("..", "..", "projection", "overlay", "testdata", "lmu-1.4-delta-overlay-v1.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(append(encoded, '\n'), want) {
		t.Fatalf("full-chain real delta Overlay v1 golden changed\n--- got ---\n%s\n--- want ---\n%s", encoded, want)
	}
}

func runSingleLMU14Frame(t testing.TB, frame []byte) (runtimeProjectionResult, int) {
	t.Helper()
	reader := &testReader{data: frame}
	manual := &manualTicker{ticks: make(chan time.Time)}
	opens := 0
	driver := newDriver(config{
		open: func() (memoryReader, error) {
			opens++
			return reader, nil
		},
		now:       func() time.Time { return time.Date(2026, 7, 31, 18, 0, 0, 0, time.UTC) },
		elapsed:   func() time.Duration { return 0 },
		newTicker: func(time.Duration) ticker { return manual },
		build: func() (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}, nil
		},
		rest: nil,
	})
	downstream := &runtimeProjectionSink{
		reducer: telemetrycore.NewReducer(),
		coordinator: telemetrycore.NewSessionCoordinator(telemetrycore.SessionCoordinatorConfig{
			Now: func() time.Time { return time.Date(2026, 7, 31, 18, 0, 0, 0, time.UTC) },
		}),
		pipeline: derive.NewPipeline(derive.Config{}),
		results:  make(chan runtimeProjectionResult, 1),
	}
	sink, err := NewObservationBatchSink(NewBatchMapper(), downstream)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- driver.Run(ctx, sink) }()
	var result runtimeProjectionResult
	select {
	case result = <-downstream.results:
	case err := <-done:
		cancel()
		t.Fatalf("LMU runtime stopped before projection: %v", err)
	case <-time.After(2 * time.Second):
		cancel()
		t.Fatal("LMU runtime did not publish an Overlay projection")
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Driver.Run() error = %v", err)
	}
	if reader.closes != 1 || manual.stops != 1 {
		t.Fatalf("teardown closes=%d tickerStops=%d, want 1/1", reader.closes, manual.stops)
	}
	if driver.RuntimeSnapshot().State != drivercontract.StateStopping {
		t.Fatalf("runtime after cancellation = %s, want stopping", driver.RuntimeSnapshot().State)
	}
	return result, opens
}

func writeRuntimeObservation(t testing.TB, mapper *BatchMapper, sink *runtimeProjectionSink, observation Observation) runtimeProjectionResult {
	t.Helper()
	if err := mapper.WriteObservation(context.Background(), observation, sink); err != nil {
		t.Fatal(err)
	}
	select {
	case result := <-sink.results:
		return result
	default:
		t.Fatal("runtime pipeline produced no projection")
		return runtimeProjectionResult{}
	}
}

func cloneRuntimeObservation(input Observation) Observation {
	result := input
	result.Vehicles = append([]VehicleObservation(nil), input.Vehicles...)
	return result
}

func advanceRuntimeObservation(observation *Observation, received time.Time, sourceTime time.Duration, change ClockChange) {
	observation.ReceivedUTC = received
	observation.SourceTime = observed(sourceTime)
	observation.ClockChange = change
}

func assertSameVehicleIDs(t testing.TB, left, right []overlayprojection.VehicleV1) {
	t.Helper()
	leftIDs := make(map[string]struct{}, len(left))
	for _, current := range left {
		id := string(current.ID)
		if _, duplicate := leftIDs[id]; duplicate {
			t.Fatalf("left projection contains duplicate identity %q", id)
		}
		leftIDs[id] = struct{}{}
	}
	if len(leftIDs) != len(right) {
		t.Fatalf("vehicle counts differ: %d/%d", len(leftIDs), len(right))
	}
	rightIDs := make(map[string]struct{}, len(right))
	for _, current := range right {
		id := string(current.ID)
		if _, duplicate := rightIDs[id]; duplicate {
			t.Fatalf("right projection contains duplicate identity %q", id)
		}
		rightIDs[id] = struct{}{}
		if _, present := leftIDs[id]; !present {
			t.Fatalf("reordered projection invented identity %q", current.ID)
		}
	}
	if len(rightIDs) != len(leftIDs) {
		t.Fatalf("reordered projection lost identities: %d/%d", len(rightIDs), len(leftIDs))
	}
}

func assertProjectionHasVehicle(t testing.TB, projection overlayprojection.SnapshotV1, want string) {
	t.Helper()
	for _, current := range projection.Vehicles {
		if string(current.ID) == want {
			return
		}
	}
	t.Fatalf("projection does not contain vehicle %q", want)
}

func assertProjectionLacksVehicle(t testing.TB, projection overlayprojection.SnapshotV1, forbidden string) {
	t.Helper()
	for _, current := range projection.Vehicles {
		if string(current.ID) == forbidden {
			t.Fatalf("projection retained obsolete vehicle %q", forbidden)
		}
	}
}

func readRuntimeIntegrationGolden(t testing.TB) runtimeIntegrationGoldenV1 {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "menu_track_pit_disconnect_v1.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden runtimeIntegrationGoldenV1
	if err := decodeStrictJSON(data, &golden); err != nil {
		t.Fatal(err)
	}
	return golden
}

func assertSHA256Hex(t testing.TB, data []byte, want, label string) {
	t.Helper()
	if _, err := hex.DecodeString(want); err != nil || len(want) != sha256.Size*2 {
		t.Fatalf("%s golden SHA-256 is invalid: %q", label, want)
	}
	got := sha256.Sum256(data)
	if hex.EncodeToString(got[:]) != want {
		t.Fatalf("%s SHA-256 = %x, want %s", label, got, want)
	}
}
