package catalog

import (
	"bytes"
	"os"
	"sort"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestValidateLedgerRejectsBrokenInvariants(t *testing.T) {
	t.Parallel()

	valid := Definition{
		ID:     1,
		Key:    "controls.throttle",
		Domain: schema.DomainControls,
		Unit:   schema.UnitRatio,
		Range:  schema.ClosedRange(0, 1),
	}

	tests := []struct {
		name       string
		active     []Definition
		tombstones []Tombstone
	}{
		{name: "duplicate active id", active: []Definition{valid, {ID: valid.ID, Key: "controls.brake", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "duplicate key", active: []Definition{valid, {ID: 2, Key: valid.Key, Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "retired id reused", active: []Definition{valid}, tombstones: []Tombstone{{ID: valid.ID, Key: "retired.signal", Reason: "contract retired"}}},
		{name: "duplicate retired id", tombstones: []Tombstone{{ID: 9, Key: "retired.one", Reason: "retired"}, {ID: 9, Key: "retired.two", Reason: "retired"}}},
		{name: "unknown id", active: []Definition{{ID: SignalIDUnknown, Key: "controls.throttle", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid domain", active: []Definition{{ID: 2, Key: "bad.domain", Domain: schema.Domain(255), Unit: schema.UnitRatio, Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid unit", active: []Definition{{ID: 2, Key: "bad.unit", Domain: schema.DomainControls, Unit: schema.Unit(255), Range: schema.ClosedRange(0, 1)}}},
		{name: "invalid range", active: []Definition{{ID: 2, Key: "bad.range", Domain: schema.DomainControls, Unit: schema.UnitRatio, Range: schema.ClosedRange(1, 0)}}},
		{name: "empty tombstone reason", tombstones: []Tombstone{{ID: 9, Key: "retired.one"}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateLedger(tt.active, tt.tombstones); err == nil {
				t.Fatal("validateLedger() error = nil, want invariant failure")
			}
		})
	}
}

func TestCatalogIsValidAndOrdered(t *testing.T) {
	t.Parallel()

	if err := Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	definitions := All()
	if !sort.SliceIsSorted(definitions, func(i, j int) bool { return definitions[i].ID < definitions[j].ID }) {
		t.Fatal("catalog definitions are not ordered by stable ID")
	}
	for _, definition := range definitions {
		got, ok := ByID(definition.ID)
		if !ok || got != definition {
			t.Fatalf("ByID(%d) = (%+v, %v), want %+v", definition.ID, got, ok, definition)
		}
	}
}

func TestMarkdownGoldenIsDeterministic(t *testing.T) {
	t.Parallel()

	first := Markdown()
	second := Markdown()
	if first != second {
		t.Fatal("Markdown() changed between identical calls")
	}

	want, err := os.ReadFile("testdata/signal-catalog.golden.md")
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}
	want = bytes.ReplaceAll(want, []byte("\r\n"), []byte("\n"))
	if !bytes.Equal([]byte(first), want) {
		t.Fatalf("catalog golden mismatch\n--- got ---\n%s\n--- want ---\n%s", first, want)
	}
}
