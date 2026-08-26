package main

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

type lifecycleBackend struct {
	phase     string
	calls     []string
	discoverN int
	mutate    bool
	ledger    Cleanup
}

func (b *lifecycleBackend) Preflight(context.Context, RunConfig) error {
	b.calls = append(b.calls, "preflight")
	if b.phase == "preflight" {
		return errors.New("private")
	}
	return nil
}
func (b *lifecycleBackend) Discover(context.Context) ([]InventoryItem, error) {
	b.calls = append(b.calls, "discover")
	b.discoverN++
	if b.phase == "discover" && b.discoverN == 1 {
		return nil, errors.New("private")
	}
	size := uint64(1)
	if b.mutate && b.discoverN == 2 {
		size = 2
	}
	return []InventoryItem{{ID: "opaque", Modified: time.Unix(1, 0), Size: size, Regular: true, WALAbsent: true, Stable: true}}, nil
}
func (b *lifecycleBackend) Process(context.Context, InventoryItem) (CandidateResult, error) {
	b.calls = append(b.calls, "open", "authorize", "stage", "handshake", "parse", "close", "cleanup_entry")
	if b.phase == "process" {
		return CandidateResult{}, errors.New("private")
	}
	return CandidateResult{Class: "insufficient_laps", SessionID: "session", GroupToken: "group", GroupOrdinal: 1}, nil
}
func (b *lifecycleBackend) Cleanup() error {
	b.calls = append(b.calls, "cleanup_root")
	if b.phase == "cleanup" {
		return errors.New("private")
	}
	return nil
}
func (b *lifecycleBackend) Ledger() Cleanup { return b.ledger }

func TestCoordinatorCleanupOnEveryPhaseAndNoPartialManifest(t *testing.T) {
	for _, phase := range []string{"preflight", "discover", "process", "cleanup"} {
		b := &lifecycleBackend{phase: phase}
		m, err := runExistingCore(context.Background(), RunConfig{ProtocolSHA: protocolSHA, RunnerSHA: "0123456789012345678901234567890123456789"}, b, [32]byte{})
		if err == nil || m.Outcome != "" {
			t.Fatalf("phase=%s m=%+v err=%v", phase, m, err)
		}
		if phase != "preflight" && b.calls[len(b.calls)-1] != "cleanup_root" {
			t.Fatalf("phase=%s calls=%v", phase, b.calls)
		}
	}
}
func TestCoordinatorInventoryMutationDominatesAndStableCompletes(t *testing.T) {
	b := &lifecycleBackend{mutate: true}
	m, err := runExistingCore(context.Background(), RunConfig{ProtocolSHA: protocolSHA, RunnerSHA: "0123456789012345678901234567890123456789"}, b, [32]byte{})
	if err == nil || m.Outcome != "" {
		t.Fatalf("mutation m=%+v err=%v", m, err)
	}
	b = &lifecycleBackend{}
	m, err = runExistingCore(context.Background(), RunConfig{ProtocolSHA: protocolSHA, RunnerSHA: "0123456789012345678901234567890123456789"}, b, [32]byte{})
	if err != nil || m.Outcome != "stop_insufficient" || !m.InventoryStable {
		t.Fatalf("stable m=%+v err=%v", m, err)
	}
}
func TestCoordinatorRejects513AndGlobalLapCapBeforeRetention(t *testing.T) {
	b := &lifecycleBackend{}
	bitems := make([]InventoryItem, 513)
	for i := range bitems {
		bitems[i] = InventoryItem{ID: fmt.Sprintf("x%d", i), Modified: time.Unix(int64(i), 0), Regular: true, WALAbsent: true, Stable: true}
	}
	too := &fixedBackend{lifecycleBackend: *b, items: bitems}
	if _, err := runExistingCore(context.Background(), RunConfig{}, too, [32]byte{}); err == nil {
		t.Fatal("513 accepted")
	}
	laps := &lapBackend{count: 3, laps: 7000}
	if _, err := runExistingCore(context.Background(), RunConfig{}, laps, [32]byte{}); err == nil {
		t.Fatal("global laps accepted")
	}
}
func TestGlobalLapCapIgnoresDuplicateAndInsufficient(t *testing.T) {
	b := &scriptedLapBackend{results: []CandidateResult{{Class: "accepted", SessionID: "same", GroupToken: "g", Laps: 20000, FailThreshold: 20000, Contributing: true, Centerline: circleLap(0, 0)}, {Class: "accepted", SessionID: "same", GroupToken: "g", Laps: 20000}, {Class: "insufficient_laps", SessionID: "low", GroupToken: "g", Laps: 1}}}
	if _, err := runExistingCore(context.Background(), RunConfig{ProtocolSHA: protocolSHA, RunnerSHA: "synthetic"}, b, [32]byte{}); err != nil {
		t.Fatal(err)
	}
}

type scriptedLapBackend struct {
	results []CandidateResult
	i       int
}

func (*scriptedLapBackend) Preflight(context.Context, RunConfig) error { return nil }
func (b *scriptedLapBackend) Discover(context.Context) ([]InventoryItem, error) {
	v := make([]InventoryItem, len(b.results))
	for i := range v {
		v[i] = InventoryItem{ID: fmt.Sprintf("s%d", i), Modified: time.Unix(int64(i), 0), Regular: true, WALAbsent: true, Stable: true}
	}
	return v, nil
}
func (b *scriptedLapBackend) Process(context.Context, InventoryItem) (CandidateResult, error) {
	r := b.results[b.i]
	b.i++
	return r, nil
}
func (*scriptedLapBackend) Cleanup() error  { return nil }
func (*scriptedLapBackend) Ledger() Cleanup { return Cleanup{} }

type fixedBackend struct {
	lifecycleBackend
	items []InventoryItem
}

func (b *fixedBackend) Discover(context.Context) ([]InventoryItem, error) { return b.items, nil }

type lapBackend struct{ count, laps int }

func (*lapBackend) Preflight(context.Context, RunConfig) error { return nil }
func (b *lapBackend) Discover(context.Context) ([]InventoryItem, error) {
	v := make([]InventoryItem, b.count)
	for i := range v {
		v[i] = InventoryItem{ID: fmt.Sprintf("c%d", i), Modified: time.Unix(int64(i), 0), Regular: true, WALAbsent: true, Stable: true}
	}
	return v, nil
}
func (b *lapBackend) Process(_ context.Context, x InventoryItem) (CandidateResult, error) {
	return CandidateResult{Class: "accepted", SessionID: x.ID, GroupToken: "group", GroupOrdinal: 1, Laps: b.laps, Contributing: true, Passing: true, Centerline: circleLap(0, 0)}, nil
}
func (*lapBackend) Cleanup() error  { return nil }
func (*lapBackend) Ledger() Cleanup { return Cleanup{} }
