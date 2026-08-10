package packaging

import (
	"bytes"
	"encoding/json"
	"sort"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

// Packages are ordered deterministically before they are hashed, so exporting
// the same plans twice produces byte-identical files and an unchanged
// checksum. Order is a property of the format, not of map iteration.

func sortWireBundles(bundles []wireBundle) {
	sort.SliceStable(bundles, func(left, right int) bool {
		if bundles[left].PlanID != bundles[right].PlanID {
			return bundles[left].PlanID < bundles[right].PlanID
		}
		return bundles[left].VariantID < bundles[right].VariantID
	})
}

// sortRawRevisions orders by encoded bytes. The content is what is hashed, so
// ordering by it needs no interpretation and cannot disagree with itself.
func sortRawRevisions(revisions []json.RawMessage) {
	sort.SliceStable(revisions, func(left, right int) bool {
		return bytes.Compare(revisions[left], revisions[right]) < 0
	})
}

func sortBundles[T any](bundles []Bundle[T]) {
	sort.SliceStable(bundles, func(left, right int) bool {
		if bundles[left].PlanID != bundles[right].PlanID {
			return bundles[left].PlanID < bundles[right].PlanID
		}
		return bundles[left].VariantID < bundles[right].VariantID
	})
}

// sortRevisions presents revisions oldest first, which is the order a person
// reads a history in. Ties fall back to identity so it never wobbles.
func sortRevisions[T any](revisions []contract.PlanRevision[T]) {
	sort.SliceStable(revisions, func(left, right int) bool {
		first, second := revisions[left].Metadata(), revisions[right].Metadata()
		if !first.CreatedAt.Equal(second.CreatedAt) {
			return first.CreatedAt.Before(second.CreatedAt)
		}
		return first.RevisionID < second.RevisionID
	})
}
