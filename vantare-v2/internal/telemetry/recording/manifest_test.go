package recording

import (
	"errors"
	"testing"
	"time"
)

func TestSessionManifestRejectsIncoherentStateAndWatermarks(t *testing.T) {
	t.Parallel()
	started := testStart()
	cursor1 := Cursor{Epoch: 1, Sequence: 1}
	cursor2 := Cursor{Epoch: 1, Sequence: 2}
	tests := []struct {
		name   string
		mutate func(*SessionManifest)
	}{
		{
			name: "reason on recording",
			mutate: func(manifest *SessionManifest) {
				manifest.IncompleteReason = IncompleteInterrupted
			},
		},
		{
			name: "ended on recording",
			mutate: func(manifest *SessionManifest) {
				manifest.EndedAtUTC = ptrTime(started.Add(time.Second))
			},
		},
		{
			name: "incomplete without end",
			mutate: func(manifest *SessionManifest) {
				manifest.IntegrityState = IntegrityIncomplete
				manifest.IncompleteReason = IncompleteInterrupted
			},
		},
		{
			name: "complete with reason",
			mutate: func(manifest *SessionManifest) {
				manifest.IntegrityState = IntegrityComplete
				manifest.EndedAtUTC = ptrTime(started.Add(time.Second))
				manifest.IncompleteReason = IncompleteInterrupted
			},
		},
		{
			name: "persisted ahead of committed",
			mutate: func(manifest *SessionManifest) {
				manifest.PersistedAcceptedCursor = cursor2
				manifest.CommittedCursor = cursor1
			},
		},
		{
			name: "complete with divergent cursors",
			mutate: func(manifest *SessionManifest) {
				manifest.IntegrityState = IntegrityComplete
				manifest.EndedAtUTC = ptrTime(started.Add(time.Second))
				manifest.PersistedAcceptedCursor = cursor1
				manifest.CommittedCursor = cursor2
			},
		},
		{
			name: "checkpoint before start",
			mutate: func(manifest *SessionManifest) {
				manifest.LastCheckpointAtUTC = ptrTime(started.Add(-time.Nanosecond))
			},
		},
		{
			name: "checkpoint after terminal end",
			mutate: func(manifest *SessionManifest) {
				manifest.IntegrityState = IntegrityComplete
				manifest.EndedAtUTC = ptrTime(started.Add(time.Second))
				manifest.LastCheckpointAtUTC = ptrTime(started.Add(2 * time.Second))
			},
		},
		{
			name: "unknown incomplete reason",
			mutate: func(manifest *SessionManifest) {
				manifest.IntegrityState = IntegrityIncomplete
				manifest.EndedAtUTC = ptrTime(started.Add(time.Second))
				manifest.IncompleteReason = "future-or-typo"
			},
		},
		{
			name: "mixed persisted cursor",
			mutate: func(manifest *SessionManifest) {
				manifest.PersistedAcceptedCursor = Cursor{Epoch: 1}
				manifest.CommittedCursor = cursor1
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			manifest := NewSessionManifest("session-local-1", "lmu", "test-build", started)
			test.mutate(&manifest)
			if err := manifest.Validate(); !errors.Is(err, ErrInvalidManifest) {
				t.Fatalf("Validate() error = %v, want invalid manifest", err)
			}
		})
	}
}

func TestSessionManifestAcceptsCoherentTerminalStates(t *testing.T) {
	t.Parallel()
	started := testStart()
	ended := started.Add(time.Second)
	cursor := Cursor{Epoch: 1, Sequence: 2}
	for _, state := range []IntegrityState{IntegrityComplete, IntegrityIncomplete} {
		manifest := NewSessionManifest("session-local-1", "lmu", "test-build", started)
		manifest.IntegrityState = state
		manifest.EndedAtUTC = &ended
		manifest.PersistedAcceptedCursor = cursor
		manifest.CommittedCursor = cursor
		manifest.LastCheckpointAtUTC = &ended
		if state == IntegrityIncomplete {
			manifest.IncompleteReason = IncompleteInterrupted
		}
		if err := manifest.Validate(); err != nil {
			t.Fatalf("Validate(%s) error = %v", state, err)
		}
	}
}

func ptrTime(value time.Time) *time.Time { return &value }
