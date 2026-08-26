package main

import (
	"context"
	"fmt"
	"time"
)

// syntheticShapeGroups mirrors the gate 3 topology: ordinals 1 and 37 each
// contribute one anisotropic recording of two laps, decided
// technical_go_local_shape_local_only, and the ordinals in between contribute a
// single lap recording, decided stop_insufficient.
const syntheticShapeGroups = 37

// syntheticShapeBackend never touches DuckDB.
type syntheticShapeBackend struct {
	items         []InventoryItem
	logicalBudget *logicalBudgetV1
}

func (b *syntheticShapeBackend) setLogicalBudget(x *logicalBudgetV1) { b.logicalBudget = x }

func newSyntheticShapeBackend() *syntheticShapeBackend {
	b := &syntheticShapeBackend{}
	for i := 0; i < syntheticShapeGroups; i++ {
		// ModifiedAt ascending fixes the canonical order, so candidate i owns
		// group ordinal i+1.
		b.items = append(b.items, InventoryItem{ID: fmt.Sprintf("shape-%d", i), Modified: time.Unix(int64(i), 0), Size: uint64(i + 1), Regular: true, WALAbsent: true, Stable: true})
	}
	return b
}

func (*syntheticShapeBackend) Preflight(context.Context, RunConfig) error { return nil }
func (b *syntheticShapeBackend) Discover(context.Context) ([]InventoryItem, error) {
	return append([]InventoryItem(nil), b.items...), nil
}
func (*syntheticShapeBackend) Cleanup() error  { return nil }
func (*syntheticShapeBackend) Ledger() Cleanup { return Cleanup{} }

func (b *syntheticShapeBackend) Process(ctx context.Context, item InventoryItem) (CandidateResult, error) {
	var idx int
	if _, e := fmt.Sscanf(item.ID, "shape-%d", &idx); e != nil || idx < 0 || idx >= syntheticShapeGroups {
		return CandidateResult{}, fmt.Errorf("candidate")
	}
	spec := syntheticSpec{idx + 1, 1, []float64{0}}
	if idx == 0 || idx == syntheticShapeGroups-1 {
		spec = syntheticSpec{idx + 1, 2, []float64{0, 0}}
	}
	return (&productionBackend{logicalBudget: b.logicalBudget}).materialize(ctx, buildSyntheticParser(idx, spec, syntheticNone, 60))
}
