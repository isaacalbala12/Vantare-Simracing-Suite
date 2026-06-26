package license

import (
	"runtime"
	"testing"
)

func TestFingerprintNotEmpty(t *testing.T) {
	fp, err := MachineFingerprint()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fp == "" {
		t.Fatal("fingerprint must not be empty")
	}
	if runtime.GOOS == "windows" && len(fp) < 8 {
		t.Fatalf("windows fingerprint too short: %s", fp)
	}
}

func TestFingerprintStable(t *testing.T) {
	a, err := MachineFingerprint()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, err := MachineFingerprint()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a != b {
		t.Fatalf("fingerprint must be stable across calls: %s vs %s", a, b)
	}
}

func TestHashFingerprintShape(t *testing.T) {
	got := hashFingerprint("hello")
	if len(got) != 64 {
		t.Fatalf("expected 64 hex chars, got %d", len(got))
	}
}
