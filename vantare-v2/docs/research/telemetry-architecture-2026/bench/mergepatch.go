//go:build researchbench

package bench

import (
	"bytes"
	"encoding/json"
)

// GenerateMergePatch produces an RFC 7396 merge-patch that turns `previous`
// into `next`. The repository only ships the *apply* side
// (internal/app/telemetrytransport/merge_patch.go); this is the minimal
// generator needed to price the delta, and it follows the same semantics:
// arrays and scalars are replaced atomically, objects are recursed, keys that
// disappear become null.
func GenerateMergePatch(previous, next json.RawMessage) json.RawMessage {
	var previousObject, nextObject map[string]json.RawMessage
	prevIsObject := json.Unmarshal(previous, &previousObject) == nil
	nextIsObject := json.Unmarshal(next, &nextObject) == nil
	if !prevIsObject || !nextIsObject {
		if bytes.Equal(previous, next) {
			return nil
		}
		return append(json.RawMessage(nil), next...)
	}

	patch := make(map[string]json.RawMessage, len(nextObject))
	for key, nextValue := range nextObject {
		previousValue, existed := previousObject[key]
		if existed && bytes.Equal(previousValue, nextValue) {
			continue
		}
		if !existed {
			patch[key] = append(json.RawMessage(nil), nextValue...)
			continue
		}
		nested := GenerateMergePatch(previousValue, nextValue)
		if nested == nil {
			continue
		}
		patch[key] = nested
	}
	for key := range previousObject {
		if _, still := nextObject[key]; !still {
			patch[key] = json.RawMessage("null")
		}
	}
	if len(patch) == 0 {
		return nil
	}
	encoded, err := json.Marshal(patch)
	if err != nil {
		panic(err)
	}
	return encoded
}
