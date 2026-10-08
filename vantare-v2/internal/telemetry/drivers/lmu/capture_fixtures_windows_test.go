//go:build windows

package lmu

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestCaptureLMUTemporalOptIn collects a bounded, correlated SHM/REST sequence.
// The sanitizer is shared by all frames so aliases remain stable across time.
// LMU_CAPTURE_REST_BODIES=1 also saves only the two endpoints' admitted inputs,
// with source text removed and slot aliases shared with the SHM capture.
// Output is diagnostic until parity and performance pass on a real >=46-car corpus.
func TestCaptureLMUTemporalOptIn(t *testing.T) {
	if os.Getenv("LMU_CAPTURE_TEMPORAL") != "1" {
		t.Skip("set LMU_CAPTURE_TEMPORAL=1 with LMU on track")
	}
	out := strings.TrimSpace(os.Getenv("LMU_CAPTURE_OUT"))
	if out == "" {
		t.Fatal("set LMU_CAPTURE_OUT to a new directory")
	}
	samples := 8
	captureBodies := os.Getenv("LMU_CAPTURE_REST_BODIES") == "1"
	if requested := strings.TrimSpace(os.Getenv("LMU_CAPTURE_SAMPLES")); requested != "" {
		count, err := strconv.Atoi(requested)
		if err != nil || count < 8 || count > 240 {
			t.Fatalf("LMU_CAPTURE_SAMPLES must be 8..240, got %q", requested)
		}
		samples = count
	}
	evidence, err := readLMUBuildEvidence()
	if err != nil {
		t.Fatalf("read build: %v", err)
	}
	sanitizer, err := newDiagnosticFrameSanitizer(evidence)
	if err != nil {
		t.Fatalf("diagnostic build: %v", err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), time.Duration(samples)*2*time.Second+10*time.Second)
	defer cancel()
	live, err := CaptureSanitizedSharedMemory(ctx)
	if err != nil {
		t.Fatalf("live session: %v", err)
	}
	clear(live.payload)
	reader, err := openSharedMemory()
	if err != nil {
		t.Fatalf("open mapping: %v", err)
	}
	defer func() {
		if err := reader.Close(); err != nil {
			t.Errorf("close mapping: %v", err)
		}
	}()
	input := make([]byte, ObjectOutSize)
	scratch := make([]byte, ObjectOutSize)
	defer clear(input)
	defer clear(scratch)
	type sample struct {
		Index          int    `json:"index"`
		AtUTC          string `json:"atUtc"`
		SourceMS       int64  `json:"sourceMs"`
		Vehicles       int    `json:"vehicles"`
		SharedFile     string `json:"sharedFile"`
		SharedSHA      string `json:"sharedSha256"`
		RESTFile       string `json:"restFile"`
		RESTSHA        string `json:"restSha256"`
		RESTBodiesFile string `json:"restBodiesFile,omitempty"`
		RESTBodiesSHA  string `json:"restBodiesSha256,omitempty"`
	}
	manifest := struct {
		Build   string   `json:"build"`
		Samples []sample `json:"samples"`
	}{Build: evidence.FileVersion}
	type pair struct {
		shared, rest DiagnosticCaptureArtifact
		bodies       []byte
	}
	pairs := make([]pair, 0, samples)
	var previous time.Duration
	var vehicleCount int
	for index := range samples {
		if index > 0 {
			timer := time.NewTimer(750 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				t.Fatalf("capture deadline: %v", ctx.Err())
			case <-timer.C:
			}
		}
		if err := readStable(ctx, reader, input, scratch, defaultStableComparisons); err != nil {
			t.Fatalf("stable frame %d: %v", index, err)
		}
		shared, err := buildSharedMemoryDiagnosticArtifact(input, time.Now().Round(0).UTC(), sanitizer)
		if err != nil {
			t.Fatalf("sanitize frame %d: %v", index, err)
		}
		observation, err := parseDiagnosticSharedMemoryArtifact(shared)
		if err != nil {
			t.Fatalf("parse frame %d: %v", index, err)
		}
		current, ok := observation.SourceTime.Value()
		if !ok || (index > 0 && current <= previous) {
			t.Fatalf("source clock did not advance at frame %d", index)
		}
		previous = current
		vehicles, ok := observation.VehicleCount.Value()
		player, playerOK := observation.PlayerPresent.Value()
		if !ok || !playerOK || !player || vehicles < 1 || (index > 0 && int(vehicles) != vehicleCount) {
			t.Fatalf("live grid changed or player absent at frame %d", index)
		}
		vehicleCount = int(vehicles)
		rest, err := CaptureSanitizedREST(ctx, shared)
		if err != nil {
			t.Fatalf("correlated REST frame %d: %v", index, err)
		}
		var bodies []byte
		if captureBodies {
			bodies, err = captureSanitizedRESTBodies(ctx, sanitizer)
			if err != nil {
				t.Fatalf("sanitize REST endpoint bodies %d: %v", index, err)
			}
		}
		pairs = append(pairs, pair{shared: shared, rest: rest, bodies: bodies})
		entry := sample{
			Index: index, AtUTC: shared.CapturedAtUTC().Format(time.RFC3339Nano),
			SourceMS: current.Milliseconds(), Vehicles: int(vehicles),
			SharedFile: fmt.Sprintf("%03d-shm.bin", index), SharedSHA: shared.SHA256(),
			RESTFile: fmt.Sprintf("%03d-rest.json", index), RESTSHA: rest.SHA256(),
		}
		if captureBodies {
			entry.RESTBodiesFile = fmt.Sprintf("%03d-rest-bodies.json", index)
			entry.RESTBodiesSHA = fmt.Sprintf("%x", sha256.Sum256(bodies))
		}
		manifest.Samples = append(manifest.Samples, entry)
	}
	if err := os.Mkdir(out, 0o700); err != nil {
		t.Fatalf("create new output directory: %v", err)
	}
	for index, item := range pairs {
		entry := manifest.Samples[index]
		if err := WriteSanitizedCapturePair(filepath.Join(out, entry.SharedFile), item.shared, filepath.Join(out, entry.RESTFile), item.rest); err != nil {
			t.Fatalf("write sanitized pair %d: %v", index, err)
		}
		if entry.RESTBodiesFile != "" {
			if err := os.WriteFile(filepath.Join(out, entry.RESTBodiesFile), item.bodies, 0o600); err != nil {
				t.Fatalf("write sanitized REST bodies %d: %v", index, err)
			}
		}
		clear(item.shared.payload)
		clear(item.rest.payload)
		clear(item.bodies)
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}
	if err := os.WriteFile(filepath.Join(out, "manifest.json"), append(data, '\n'), 0o600); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
	t.Logf("captured %d sanitized correlated samples, build=%s vehicles=%d, source_time=%d..%dms", len(pairs), evidence.FileVersion, vehicleCount, manifest.Samples[0].SourceMS, manifest.Samples[len(pairs)-1].SourceMS)
}

// TestCaptureLMUFixturesOptIn is a collection tool, not an assertion of
// compatibility: it never fails on unknown digests. It captures the sanitized
// Shared Memory frame and its REST overlap for one game state so their SHA-256
// digests can be pinned in supportedLMUVersions.
//
// Usage (LMU open, in the requested state):
//
//	LMU_CAPTURE_FIXTURES=1 LMU_CAPTURE_STATE=menu|track \
//	  [LMU_CAPTURE_OUT=<dir>] go test ./internal/telemetry/drivers/lmu \
//	  -run TestCaptureLMUFixturesOptIn -count=1 -v
//
// Only sanitized artifacts are produced; raw payloads never reach the log.
func TestCaptureLMUFixturesOptIn(t *testing.T) {
	if os.Getenv("LMU_CAPTURE_FIXTURES") != "1" {
		t.Skip("set LMU_CAPTURE_FIXTURES=1 with LMU open to capture sanitized fixtures")
	}
	state := strings.TrimSpace(strings.ToLower(os.Getenv("LMU_CAPTURE_STATE")))
	var wantPlayer bool
	switch state {
	case "menu":
		wantPlayer = false
	case "track":
		wantPlayer = true
	default:
		t.Fatalf("set LMU_CAPTURE_STATE to menu or track (got %q)", state)
	}

	evidence, err := readLMUBuildEvidence()
	if err != nil {
		t.Fatalf("read LMU build evidence: %v", err)
	}
	t.Logf("build file=%q product=%q", evidence.FileVersion, evidence.ProductVersion)

	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	shared, err := CaptureSanitizedSharedMemory(ctx)
	if err != nil {
		t.Fatalf("capture sanitized shared memory: %v", err)
	}
	t.Logf("STATE=%s SHARED_MEMORY sha256=%s summary=%q", state, shared.SHA256(), shared.Summary())

	// The summary is the closed, sanitized description of the frame; it is the
	// only signal available to confirm the game really is in the asked state.
	if got := strings.Contains(shared.Summary(), "player=true"); got != wantPlayer {
		t.Fatalf("captured frame does not match state %q: summary=%q", state, shared.Summary())
	}

	rest, err := CaptureSanitizedREST(ctx, shared)
	if err != nil {
		t.Fatalf("capture sanitized REST: %v", err)
	}
	t.Logf("STATE=%s REST sha256=%s summary=%q", state, rest.SHA256(), rest.Summary())

	out := strings.TrimSpace(os.Getenv("LMU_CAPTURE_OUT"))
	if out == "" {
		return
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatalf("create capture directory: %v", err)
	}
	// The pinned digests are the digests of these persisted files, not of a
	// live capture: the REST document embeds wall-clock timestamps, so only a
	// stored fixture has a stable SHA-256. Naming mirrors the 1.4 fixtures.
	sharedPath := filepath.Join(out, "lmu-"+evidence.FileVersion+"-"+state+"-fixture.bin")
	restPath := filepath.Join(out, "lmu-"+evidence.FileVersion+"-rest-"+state+"-fixture.json")
	if err := WriteSanitizedCapture(sharedPath, shared); err != nil {
		t.Fatalf("write shared memory capture: %v", err)
	}
	if err := WriteSanitizedCapture(restPath, rest); err != nil {
		t.Fatalf("write REST capture: %v", err)
	}
	t.Logf("STATE=%s wrote sanitized artifacts to %s", state, out)
}
