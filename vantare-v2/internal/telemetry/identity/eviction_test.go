package identity

import (
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	schemaidentity "github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

func TestOldestUnseenIsDeterministicAndNeverEvictsActive(t *testing.T) {
	t.Parallel()
	entries := []EvictionEntry{
		{Vehicle: "active", LastSeen: schema.Cursor{Epoch: 1, Sequence: 1}, Active: true},
		{Vehicle: "newer", LastSeen: schema.Cursor{Epoch: 1, Sequence: 3}},
		{Vehicle: "older-b", LastSeen: schema.Cursor{Epoch: 1, Sequence: 2}},
		{Vehicle: "older-a", LastSeen: schema.Cursor{Epoch: 1, Sequence: 2}},
	}
	want := []schemaidentity.VehicleID{"older-a", "older-b", "newer"}
	if got := OldestUnseen(entries, 3); !reflect.DeepEqual(got, want) {
		t.Fatalf("OldestUnseen() = %v, want %v", got, want)
	}
}
