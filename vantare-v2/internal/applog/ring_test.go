package applog

import (
	"testing"
	"time"
)

func TestRingKeepsInsertionOrder(t *testing.T) {
	ring := NewRing(4)
	for _, message := range []string{"a", "b", "c"} {
		ring.Append(LevelInfo, message, time.Now())
	}

	snapshot := ring.Snapshot()

	if len(snapshot) != 3 {
		t.Fatalf("snapshot = %d entries, want 3", len(snapshot))
	}
	for index, want := range []string{"a", "b", "c"} {
		if snapshot[index].Message != want {
			t.Fatalf("entry %d = %q, want %q", index, snapshot[index].Message, want)
		}
	}
}

func TestRingDropsOldestOnceFull(t *testing.T) {
	ring := NewRing(3)
	for _, message := range []string{"a", "b", "c", "d", "e"} {
		ring.Append(LevelInfo, message, time.Now())
	}

	snapshot := ring.Snapshot()

	if len(snapshot) != 3 {
		t.Fatalf("snapshot = %d entries, want the capacity 3", len(snapshot))
	}
	for index, want := range []string{"c", "d", "e"} {
		if snapshot[index].Message != want {
			t.Fatalf("entry %d = %q, want %q", index, snapshot[index].Message, want)
		}
	}
}

func TestRingSequenceKeepsRisingPastEviction(t *testing.T) {
	ring := NewRing(2)
	ring.Append(LevelInfo, "a", time.Now())
	ring.Append(LevelInfo, "b", time.Now())
	last := ring.Append(LevelInfo, "c", time.Now())

	if last.Seq != 3 {
		t.Fatalf("third entry seq = %d, want 3", last.Seq)
	}
	snapshot := ring.Snapshot()
	if snapshot[0].Seq != 2 || snapshot[1].Seq != 3 {
		t.Fatalf("snapshot seqs = %d,%d, want 2,3", snapshot[0].Seq, snapshot[1].Seq)
	}
}

func TestRingSnapshotIsACopy(t *testing.T) {
	ring := NewRing(4)
	ring.Append(LevelInfo, "original", time.Now())

	snapshot := ring.Snapshot()
	snapshot[0].Message = "mutated"

	if again := ring.Snapshot(); again[0].Message != "original" {
		t.Fatalf("ring entry = %q, want the caller's mutation not to reach it", again[0].Message)
	}
}

func TestNonPositiveCapacityFallsBackToDefault(t *testing.T) {
	ring := NewRing(0)
	for index := 0; index < DefaultCapacity+10; index++ {
		ring.Append(LevelInfo, "x", time.Now())
	}

	if got := len(ring.Snapshot()); got != DefaultCapacity {
		t.Fatalf("snapshot = %d entries, want DefaultCapacity %d", got, DefaultCapacity)
	}
}

func TestClassifyReadsTheConventionCallSitesAlreadyUse(t *testing.T) {
	cases := []struct {
		message string
		want    Level
	}{
		{"warning: diagnostics session storage is unavailable", LevelWarn},
		{"storage error: permission denied", LevelError},
		{"EngineerBridge: error decoding payload", LevelError},
		{"could not open profile: failed to read", LevelError},
		{"HTTP server: listening on 127.0.0.1:34115", LevelInfo},
		{"", LevelInfo},
	}
	for _, testCase := range cases {
		if got := classify(testCase.message); got != testCase.want {
			t.Errorf("classify(%q) = %q, want %q", testCase.message, got, testCase.want)
		}
	}
}

func TestValidLevelRejectsAnythingOutsideTheClosedSet(t *testing.T) {
	for _, level := range []Level{LevelInfo, LevelWarn, LevelError} {
		if !ValidLevel(level) {
			t.Errorf("ValidLevel(%q) = false, want true", level)
		}
	}
	for _, level := range []Level{"", "debug", "ERROR", "trace"} {
		if ValidLevel(level) {
			t.Errorf("ValidLevel(%q) = true, want false", level)
		}
	}
}
