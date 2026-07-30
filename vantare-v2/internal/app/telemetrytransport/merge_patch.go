package telemetrytransport

import (
	"bytes"
	"encoding/json"
	"sort"
)

// ApplyMergePatch applies RFC 7396 semantics without interpreting product
// fields. Arrays and scalars are replaced atomically.
func ApplyMergePatch(document, patch json.RawMessage) (json.RawMessage, error) {
	if !json.Valid(document) || !json.Valid(patch) {
		return nil, ErrInvalidPayload
	}
	return mergeRaw(document, patch)
}

func mergeRaw(document, patch json.RawMessage) (json.RawMessage, error) {
	var patchObject map[string]json.RawMessage
	if err := json.Unmarshal(patch, &patchObject); err != nil {
		return append(json.RawMessage{}, patch...), nil
	}

	documentObject := make(map[string]json.RawMessage)
	_ = json.Unmarshal(document, &documentObject)
	result := make(map[string]json.RawMessage, len(documentObject)+len(patchObject))
	for key, value := range documentObject {
		result[key] = append(json.RawMessage{}, value...)
	}
	for key, value := range patchObject {
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			delete(result, key)
			continue
		}
		merged, err := mergeRaw(result[key], value)
		if err != nil {
			return nil, err
		}
		result[key] = merged
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return nil, ErrInvalidPayload
	}
	return encoded, nil
}

func semanticJSONEqual(left, right json.RawMessage) bool {
	leftCanonical, leftErr := canonicalJSON(left)
	rightCanonical, rightErr := canonicalJSON(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftCanonical, rightCanonical)
}

func canonicalJSON(data json.RawMessage) ([]byte, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return nil, ErrInvalidPayload
	}
	switch trimmed[0] {
	case '{':
		var object map[string]json.RawMessage
		if err := json.Unmarshal(trimmed, &object); err != nil {
			return nil, ErrInvalidPayload
		}
		keys := make([]string, 0, len(object))
		for key := range object {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		var buffer bytes.Buffer
		buffer.WriteByte('{')
		for index, key := range keys {
			if index > 0 {
				buffer.WriteByte(',')
			}
			keyJSON, _ := json.Marshal(key)
			buffer.Write(keyJSON)
			buffer.WriteByte(':')
			value, err := canonicalJSON(object[key])
			if err != nil {
				return nil, err
			}
			buffer.Write(value)
		}
		buffer.WriteByte('}')
		return buffer.Bytes(), nil
	case '[':
		var array []json.RawMessage
		if err := json.Unmarshal(trimmed, &array); err != nil {
			return nil, ErrInvalidPayload
		}
		var buffer bytes.Buffer
		buffer.WriteByte('[')
		for index, item := range array {
			if index > 0 {
				buffer.WriteByte(',')
			}
			value, err := canonicalJSON(item)
			if err != nil {
				return nil, err
			}
			buffer.Write(value)
		}
		buffer.WriteByte(']')
		return buffer.Bytes(), nil
	default:
		if !json.Valid(trimmed) {
			return nil, ErrInvalidPayload
		}
		var buffer bytes.Buffer
		if err := json.Compact(&buffer, trimmed); err != nil {
			return nil, ErrInvalidPayload
		}
		return buffer.Bytes(), nil
	}
}
