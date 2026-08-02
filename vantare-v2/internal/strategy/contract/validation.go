package contract

import (
	"bytes"
	"encoding/json"
	"io"
	"regexp"
	"sort"
	"time"
)

func requireJSONObjectFields(value interface{}, prefix string, required, optional []string) (map[string]interface{}, error) {
	object, ok := value.(map[string]interface{})
	if !ok {
		return nil, contractError(ErrorInvalidDocument, prefix, "must be an object")
	}
	allowed := make(map[string]struct{}, len(required)+len(optional))
	for _, field := range required {
		allowed[field] = struct{}{}
		if _, exists := object[field]; !exists {
			return nil, contractError(ErrorInvalidDocument, fieldPath(prefix, field), "is required")
		}
	}
	for _, field := range optional {
		allowed[field] = struct{}{}
	}
	fields := make([]string, 0, len(object))
	for field := range object {
		fields = append(fields, field)
	}
	sort.Strings(fields)
	for _, field := range fields {
		if _, exists := allowed[field]; !exists {
			return nil, contractError(ErrorInvalidDocument, fieldPath(prefix, field), "is not part of this contract version")
		}
	}
	return object, nil
}

func fieldPath(prefix, field string) string {
	if prefix == "" {
		return field
	}
	return prefix + "." + field
}

var (
	lowercaseSHA256Pattern    = regexp.MustCompile(`^[0-9a-f]{64}$`)
	canonicalTimestampPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$`)
)

func validateContentHash(field, value string) error {
	if !lowercaseSHA256Pattern.MatchString(value) {
		return contractError(ErrorInvalidDocument, field, "must be an exact lowercase SHA-256 hexadecimal digest")
	}
	return nil
}

func parseCanonicalTimestamp(field, value string) (time.Time, error) {
	if !canonicalTimestampPattern.MatchString(value) {
		return time.Time{}, contractError(ErrorInvalidDocument, field, "must be a canonical RFC3339 UTC timestamp with millisecond precision")
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil || formatCanonicalTimestamp(parsed) != value {
		return time.Time{}, wrapContractError(ErrorInvalidDocument, field, "must be a valid canonical RFC3339 UTC timestamp", err)
	}
	return parsed, nil
}

func formatCanonicalTimestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func validateCanonicalTimestamp(field string, value time.Time) error {
	if value.IsZero() {
		return contractError(ErrorInvalidDocument, field, "timestamp is required")
	}
	if value.Location() != time.UTC || value.Nanosecond()%int(time.Millisecond) != 0 {
		return contractError(ErrorInvalidDocument, field, "timestamp must use canonical UTC millisecond precision")
	}
	_, err := parseCanonicalTimestamp(field, formatCanonicalTimestamp(value))
	return err
}

func decodeStrictJSON(document []byte, destination interface{}) (interface{}, error) {
	parsed, err := parseCanonicalJSONV1(document)
	if err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return nil, wrapContractError(ErrorInvalidDocument, "", "decode strict strategy document", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, contractError(ErrorInvalidDocument, "", "strategy document contains trailing data")
	}
	return parsed, nil
}

func requireParsedTimestamp(document interface{}, field string, optional bool) error {
	object, ok := document.(map[string]interface{})
	if !ok {
		return contractError(ErrorInvalidDocument, "", "strategy document must be an object")
	}
	value, exists := object[field]
	if !exists && optional {
		return nil
	}
	text, ok := value.(string)
	if !ok {
		return contractError(ErrorInvalidDocument, field, "timestamp must be a string")
	}
	_, err := parseCanonicalTimestamp(field, text)
	return err
}

func requireParsedNestedTimestamp(document interface{}, objectField, timestampField string) error {
	object, ok := document.(map[string]interface{})
	if !ok {
		return contractError(ErrorInvalidDocument, "", "strategy document must be an object")
	}
	nested, ok := object[objectField].(map[string]interface{})
	if !ok {
		return contractError(ErrorInvalidDocument, objectField, "must be an object")
	}
	value, ok := nested[timestampField].(string)
	path := fieldPath(objectField, timestampField)
	if !ok {
		return contractError(ErrorInvalidDocument, path, "timestamp must be a string")
	}
	_, err := parseCanonicalTimestamp(path, value)
	return err
}

func requireParsedProvenanceTimestamp(document interface{}) error {
	object, ok := document.(map[string]interface{})
	if !ok {
		return contractError(ErrorInvalidDocument, "", "strategy document must be an object")
	}
	value, exists := object["provenance"]
	if !exists {
		return nil
	}
	provenance, ok := value.(map[string]interface{})
	if !ok {
		return contractError(ErrorInvalidDocument, "provenance", "must be an object")
	}
	observedAt, exists := provenance["observedAt"]
	if !exists {
		return nil
	}
	text, ok := observedAt.(string)
	if !ok {
		return contractError(ErrorInvalidDocument, "provenance.observedAt", "timestamp must be a string")
	}
	_, err := parseCanonicalTimestamp("provenance.observedAt", text)
	return err
}
