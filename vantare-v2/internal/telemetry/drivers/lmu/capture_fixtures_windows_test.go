//go:build windows

package lmu

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

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
