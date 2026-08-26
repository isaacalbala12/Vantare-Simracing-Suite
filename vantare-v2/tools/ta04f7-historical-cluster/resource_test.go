package main

import (
	"context"
	"errors"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"strings"
	"testing"
)

type countingHistoricalParser struct {
	historicalParser
	reads int
}

func (p *countingHistoricalParser) ReadPage(ctx context.Context, id string, start int64, limit int) (telemetryanalysis.HistoricalPage, error) {
	p.reads++
	return p.historicalParser.ReadPage(ctx, id, start, limit)
}

func TestPageBudgetRejectsBeforeReaderCallback(t *testing.T) {
	p := &countingHistoricalParser{historicalParser: buildSyntheticParser(0, syntheticSpec{1, 2, []float64{0, 0}}, syntheticNone, 100)}
	b := &productionBackend{logicalBudget: newLogicalBudgetV1(maxPageLogicalBytes - 1)}
	got, err := b.materialize(context.Background(), p)
	if !errors.Is(err, errLogicalCap) {
		t.Fatalf("err=%v class=%s reads=%d", err, got.Class, p.reads)
	}
	if p.reads != 0 {
		t.Fatalf("reads=%d", p.reads)
	}
	if b.logicalBudget.account.Live != 0 {
		t.Fatalf("live=%d", b.logicalBudget.account.Live)
	}
}

func TestLogicalBudgetRejectsBeforeReserve(t *testing.T) {
	b := newLogicalBudgetV1(7)
	if err := b.reserve(8); err == nil || b.account.Live != 0 {
		t.Fatalf("allocated on failure %+v", b)
	}
	if err := b.reserve(7); err != nil || b.account.Live != 7 {
		t.Fatal(err)
	}
	b.release(7)
	if b.account.Live != 0 {
		t.Fatal("not released")
	}
}

func TestCollectorGrowthAccountsOldAndNewBeforeAllocation(t *testing.T) {
	b := newLogicalBudgetV1(logicalLimit)
	var owned uint64
	v, err := b.growFloats(nil, &owned)
	if err != nil || b.account.Live != owned {
		t.Fatalf("first live=%d owned=%d err=%v", b.account.Live, owned, err)
	}
	calls := 0
	b.allocFloat = func(n, c int) []float64 { calls++; return make([]float64, n, c) }
	b.limit = b.account.Live + uint64((cap(v)+pageSize)*8+24) - 1
	if _, err = b.growFloats(v, &owned); !errors.Is(err, errLogicalCap) {
		t.Fatalf("err=%v", err)
	}
	if calls != 0 || b.account.Live != owned {
		t.Fatalf("calls=%d live=%d owned=%d", calls, b.account.Live, owned)
	}
	b.limit++
	v, err = b.growFloats(v, &owned)
	if err != nil || calls != 1 || b.account.Live != owned || cap(v) != 2*pageSize {
		t.Fatalf("calls=%d live=%d owned=%d cap=%d err=%v", calls, b.account.Live, owned, cap(v), err)
	}
}

func TestGeometryPhaseCheckedComponents(t *testing.T) {
	laps := []OracleLap{{Start: 0, End: 6000}, {Start: 6000, End: 12000}}
	a, err := geometryPhaseBytes(12000, laps)
	b, err2 := geometryPhaseBytes(12001, laps)
	if err != nil || err2 != nil || b-a != 144 {
		t.Fatalf("a=%d b=%d %v %v", a, b, err, err2)
	}
	if _, err = geometryPhaseBytes(1, []OracleLap{{Start: 2, End: 1}}); !errors.Is(err, errLogicalCap) {
		t.Fatalf("overflow=%v", err)
	}
}
func TestBestEffortClearControlledBuffers(t *testing.T) {
	f := []float64{1, 2}
	e := []LapEvent{{Value: 3}}
	g := [][]GeoPoint{{{Lat: 4, Lon: 5}}}
	clearFloats(f)
	clearEvents(e)
	clearGeo(g)
	if f[0] != 0 || e[0].Value != 0 || g[0] != nil {
		t.Fatal("not cleared")
	}
}
func TestRetainedIdentifierBoundaries(t *testing.T) {
	if !validOpaque(strings.Repeat("a", 256), 256) || validOpaque(strings.Repeat("a", 257), 256) {
		t.Fatal("length boundary")
	}
	if validOpaque("a\nb", 256) || validOpaque(string([]byte{0xff}), 256) {
		t.Fatal("unsafe identifier")
	}
	if !validGroupToken(strings.Repeat("g", maxGroupTokenBytes)) || validGroupToken(strings.Repeat("g", maxGroupTokenBytes+1)) {
		t.Fatal("group boundary")
	}
}
func TestLogicalOwnershipFormulaExact(t *testing.T) {
	tests := []struct {
		name string
		got  uint64
		err  error
		want uint64
	}{
		{"string", mustLogical(logicalStringBytes(7)), nil, 23},
		{"slice", mustLogical(logicalSliceBytes(3, 8)), nil, 48},
		{"struct", mustLogical(logicalStructBytes(17)), nil, 49},
		{"map-entry", mustLogical(logicalMapEntryBytes(7, 1)), nil, 56},
	}
	for _, x := range tests {
		if x.got != x.want {
			t.Fatalf("%s=%d want%d", x.name, x.got, x.want)
		}
	}
	if _, e := logicalSliceBytes(^uint64(0), 2); !errors.Is(e, errLogicalCap) {
		t.Fatal("overflow")
	}
}
func mustLogical(n uint64, e error) uint64 {
	if e != nil {
		panic(e)
	}
	return n
}
func TestRunLogicalOwnershipReturnsToZero(t *testing.T) {
	b := newSyntheticBackend()
	if _, err := runExistingCore(context.Background(), RunConfig{ProtocolSHA: protocolSHA, RunnerSHA: "synthetic"}, b, [32]byte{}); err != nil {
		t.Fatal(err)
	}
	if b.logicalBudget == nil || b.logicalBudget.account.Live != 0 {
		t.Fatalf("budget=%+v", b.logicalBudget)
	}
}
func TestGroupAuxReservationExactAndAtomic(t *testing.T) {
	required, err := groupAuxMapBytes()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		limit uint64
		pass  bool
	}{{required, true}, {required - 1, false}} {
		if required != 153 {
			t.Fatalf("required=%d", required)
		}
		b := newLogicalBudgetV1(tc.limit)
		centers := map[int][][]Point{}
		refs := map[int]uint64{}
		unavailable := map[int]bool{}
		err = reserveGroupAux(b, 1, centers, refs, unavailable)
		if (err == nil) != tc.pass {
			t.Fatalf("limit=%d err=%v", tc.limit, err)
		}
		if !tc.pass && (len(centers) != 0 || len(refs) != 0 || len(unavailable) != 0) {
			t.Fatal("inserted before reserve")
		}
		if tc.pass && b.account.Live != required {
			t.Fatalf("live=%d required=%d", b.account.Live, required)
		}
		b.release(b.account.Live)
		if b.account.Live != 0 {
			t.Fatal("not released")
		}
	}
}
func TestGroupAuxCombined512AndOrdinalBytes(t *testing.T) {
	var required uint64
	for i := 0; i < 512; i++ {
		n, e := groupAuxMapBytes()
		if e != nil {
			t.Fatal(e)
		}
		required, _ = checkedAdd(required, n)
	}
	ord, e := logicalSliceBytes(512, logicalInt64)
	if e != nil {
		t.Fatal(e)
	}
	required, _ = checkedAdd(required, ord)
	want := uint64(512*153 + 24 + 512*8)
	if required != want {
		t.Fatalf("required=%d want=%d", required, want)
	}
	b := newLogicalBudgetV1(required)
	if e = b.reserve(required); e != nil {
		t.Fatal(e)
	}
	if e = b.reserve(1); !errors.Is(e, errLogicalCap) {
		t.Fatal("+1 accepted")
	}
	b.release(required)
	if b.account.Live != 0 {
		t.Fatal("live")
	}
}

func TestCanonicalInputBytesUsesIndependentChannelCardinalities(t *testing.T) {
	const maxValues = uint64(256 << 20 / 8)
	if got, err := canonicalInputBytes([]uint64{1, 1, maxValues - 4, 1, 1}); err != nil || got != 256<<20 {
		t.Fatalf("exact got=%d err=%v", got, err)
	}
	if _, err := canonicalInputBytes([]uint64{1, 1, maxValues - 3, 1, 1}); !errors.Is(err, errLogicalCap) {
		t.Fatalf("over cap accepted: %v", err)
	}
	if got, err := canonicalInputBytes([]uint64{10, 10, 100, 10, 10}); err != nil || got != 140*8 {
		t.Fatalf("multirate got=%d err=%v", got, err)
	}
}
