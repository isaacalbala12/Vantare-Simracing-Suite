package app

import "sync"

// HubBlockerSnapshot is the frontend-owned suspend safety state for one Hub
// window generation. Received distinguishes a clean snapshot from no state.
type HubBlockerSnapshot struct {
	Generation    string
	StudioDirty   bool
	LauncherDraft bool
	OAuthPending  bool
	Other         []string
	Reasons       []string
}

func (s HubBlockerSnapshot) Blocked() bool {
	return s.StudioDirty || s.LauncherDraft || s.OAuthPending || len(s.Other) > 0 || len(s.Reasons) > 0
}

type HubBlockerRegistry struct {
	mu         sync.RWMutex
	generation string
	received   bool
	snapshot   HubBlockerSnapshot
}

func NewHubBlockerRegistry() *HubBlockerRegistry { return &HubBlockerRegistry{} }

func (r *HubBlockerRegistry) Expect(generation string) {
	r.mu.Lock()
	r.generation = generation
	r.received = false
	r.snapshot = HubBlockerSnapshot{Generation: generation}
	r.mu.Unlock()
}

// Update rejects a late snapshot from an older Hub window.
func (r *HubBlockerRegistry) Update(snapshot HubBlockerSnapshot) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if snapshot.Generation == "" || snapshot.Generation != r.generation {
		return false
	}
	r.snapshot = snapshot
	r.received = true
	return true
}

// CanSuspend is fail-closed until the expected window has pushed a snapshot.
func (r *HubBlockerRegistry) CanSuspend() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.received && !r.snapshot.Blocked()
}

func (r *HubBlockerRegistry) Snapshot() (HubBlockerSnapshot, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.snapshot, r.received
}
