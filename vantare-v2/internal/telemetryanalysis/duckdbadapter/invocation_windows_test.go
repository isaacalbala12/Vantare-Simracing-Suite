//go:build windows

package duckdbadapter

import "testing"

func TestVCRuntimeIsAvailableForDuckDBRuntime(t *testing.T) {
	if err := checkVCRuntime(); err != nil {
		t.Fatalf("Visual C++ runtime prerequisite: %v", err)
	}
}
