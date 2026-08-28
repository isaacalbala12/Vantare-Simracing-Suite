//go:build production

package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestStartCPUProfileProductionIsANoopEvenWithEnvironment is the release
// guard: setting every diagnostic variable, including the warm-up delay, must
// neither start a profiler nor create a file in a build made with
// `-tags production`. The delay is covered explicitly because a postponed
// capture must stay absent in release too, not merely be deferred.
func TestStartCPUProfileProductionIsANoopEvenWithEnvironment(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cpu.pprof")
	t.Setenv("VANTARE_CPU_PROFILE_PATH", path)
	t.Setenv("VANTARE_CPU_PROFILE_DURATION", "30s")
	t.Setenv("VANTARE_CPU_PROFILE_DELAY", "30s")

	stop := startCPUProfile()
	if stop == nil {
		t.Fatal("production startCPUProfile() returned a nil stop function")
	}
	stop()
	stop()

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("production build created a profile file: stat error = %v", err)
	}
}
