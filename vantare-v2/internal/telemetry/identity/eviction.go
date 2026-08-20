// Package identity owns bounded canonical identity lifecycle policies.
package identity

import (
	"cmp"
	"slices"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	schemaidentity "github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
)

const DefaultHistoryLimit = 512

// EvictionEntry describes one retained identity for deterministic LRU choice.
type EvictionEntry struct {
	Vehicle  schemaidentity.VehicleID
	LastSeen schema.Cursor
	Active   bool
}

// OldestUnseen returns up to count inactive identities in least-recently-seen
// order. Active identities are never selected.
func OldestUnseen(entries []EvictionEntry, count int) []schemaidentity.VehicleID {
	if count <= 0 {
		return nil
	}
	candidates := slices.Clone(entries)
	slices.SortFunc(candidates, func(left, right EvictionEntry) int {
		if left.Active != right.Active {
			if left.Active {
				return 1
			}
			return -1
		}
		if order := cmp.Compare(left.LastSeen.Epoch, right.LastSeen.Epoch); order != 0 {
			return order
		}
		if order := cmp.Compare(left.LastSeen.Sequence, right.LastSeen.Sequence); order != 0 {
			return order
		}
		return cmp.Compare(left.Vehicle, right.Vehicle)
	})
	result := make([]schemaidentity.VehicleID, 0, count)
	for _, entry := range candidates {
		if entry.Active {
			break
		}
		result = append(result, entry.Vehicle)
		if len(result) == count {
			break
		}
	}
	return result
}
