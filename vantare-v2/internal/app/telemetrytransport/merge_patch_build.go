package telemetrytransport

import (
	"bytes"
	"encoding/json"
)

// BuildMergePatch returns the RFC 7396 patch that turns previous into next.
//
// It is the inverse of ApplyMergePatch and obeys the same rule: objects are
// recursed into, everything else is replaced whole. That rule is what decides
// whether a patch is worth sending, because a payload that keeps its bulk in an
// array cannot be patched cheaply — one changed element replaces the array.
//
// The patch is only ever a size optimisation. PublishSnapshot re-applies it and
// compares the result against the full frame, so a patch that failed to
// describe the change is dropped rather than delivered.
func BuildMergePatch(previous, next json.RawMessage) (json.RawMessage, error) {
	if !json.Valid(previous) || !json.Valid(next) {
		return nil, ErrInvalidPayload
	}

	var previousObject, nextObject map[string]json.RawMessage
	if json.Unmarshal(previous, &previousObject) != nil || json.Unmarshal(next, &nextObject) != nil {
		// Not both objects: nothing to describe incrementally.
		return append(json.RawMessage{}, next...), nil
	}

	patch := make(map[string]json.RawMessage)
	for key, nextValue := range nextObject {
		previousValue, existed := previousObject[key]
		if existed && semanticJSONEqual(previousValue, nextValue) {
			continue
		}
		if existed && isJSONObject(previousValue) && isJSONObject(nextValue) {
			nested, err := BuildMergePatch(previousValue, nextValue)
			if err != nil {
				return nil, err
			}
			patch[key] = nested
			continue
		}
		patch[key] = append(json.RawMessage{}, nextValue...)
	}
	// A key that disappeared is removed by an explicit null.
	for key := range previousObject {
		if _, present := nextObject[key]; !present {
			patch[key] = json.RawMessage("null")
		}
	}

	encoded, err := json.Marshal(patch)
	if err != nil {
		return nil, ErrInvalidPayload
	}
	return encoded, nil
}

func isJSONObject(value json.RawMessage) bool {
	trimmed := bytes.TrimSpace(value)
	return len(trimmed) > 0 && trimmed[0] == '{'
}
