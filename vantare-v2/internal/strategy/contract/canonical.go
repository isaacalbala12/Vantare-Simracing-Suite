package contract

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"io"
	"math"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	HashAlgorithmV1            = "sha256:strategy-c14n-v1"
	MaxCanonicalJSONBytes      = 4 << 20
	MaxCanonicalOutputBytes    = 16 << 20
	MaxCanonicalDepth          = 64
	MaxCanonicalContainerItems = 1 << 20
	maxSafeJSONInteger         = 9_007_199_254_740_991
)

const (
	canonicalNull byte = iota
	canonicalFalse
	canonicalTrue
	canonicalNumber
	canonicalString
	canonicalArray
	canonicalObject
)

// CanonicalizeAndHashJSONV1 parses JSON strictly, rejects duplicate keys and
// unsafe numbers, then encodes a versioned binary form that does not depend on
// JSON escaping, object insertion order or decimal formatting.
func CanonicalizeAndHashJSONV1(document []byte) ([]byte, string, error) {
	value, err := parseCanonicalJSONV1(document)
	if err != nil {
		return nil, "", err
	}
	canonical, err := encodeCanonicalValueV1(value)
	if err != nil {
		return nil, "", err
	}
	digest := sha256.Sum256(canonical)
	return canonical, hex.EncodeToString(digest[:]), nil
}

func EncodeCanonicalHex(value []byte) string { return hex.EncodeToString(value) }

func parseCanonicalJSONV1(document []byte) (interface{}, error) {
	if len(document) == 0 || len(document) > MaxCanonicalJSONBytes {
		return nil, contractError(ErrorInvalidDocument, "", "JSON size is outside strategy contract limits")
	}
	if !utf8.Valid(document) {
		return nil, contractError(ErrorInvalidDocument, "", "JSON must be valid UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.UseNumber()
	value, err := parseCanonicalJSONValue(decoder, 0)
	if err != nil {
		return nil, err
	}
	if _, err := decoder.Token(); err != io.EOF {
		if err == nil {
			return nil, contractError(ErrorInvalidDocument, "", "JSON contains trailing data")
		}
		return nil, wrapContractError(ErrorInvalidDocument, "", "decode trailing JSON", err)
	}
	return value, nil
}

func parseCanonicalJSONValue(decoder *json.Decoder, depth int) (interface{}, error) {
	if depth > MaxCanonicalDepth {
		return nil, contractError(ErrorInvalidDocument, "", "JSON exceeds strategy contract depth limit")
	}
	token, err := decoder.Token()
	if err != nil {
		return nil, wrapContractError(ErrorInvalidDocument, "", "decode JSON value", err)
	}
	delimiter, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		switch value := token.(type) {
		case nil, bool:
			return value, nil
		case string:
			if err := validateCanonicalString(value); err != nil {
				return nil, err
			}
			return value, nil
		case json.Number:
			parsed, err := value.Float64()
			if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
				return nil, wrapContractError(ErrorInvalidDocument, "number", "number is not finite float64", err)
			}
			if math.Trunc(parsed) == parsed && math.Abs(parsed) > maxSafeJSONInteger {
				return nil, contractError(ErrorInvalidDocument, "number", "integer exceeds the shared safe range")
			}
			if parsed == 0 {
				parsed = 0 // Normalize negative zero.
			}
			return parsed, nil
		default:
			return nil, contractError(ErrorInvalidDocument, "", "unsupported JSON token")
		}
	}

	switch delimiter {
	case '[':
		values := make([]interface{}, 0)
		for decoder.More() {
			if len(values) >= MaxCanonicalContainerItems {
				return nil, contractError(ErrorInvalidDocument, "", "array exceeds strategy contract item limit")
			}
			value, err := parseCanonicalJSONValue(decoder, depth+1)
			if err != nil {
				return nil, err
			}
			values = append(values, value)
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim(']') {
			return nil, wrapContractError(ErrorInvalidDocument, "", "close JSON array", err)
		}
		return values, nil
	case '{':
		values := make(map[string]interface{})
		for decoder.More() {
			if len(values) >= MaxCanonicalContainerItems {
				return nil, contractError(ErrorInvalidDocument, "", "object exceeds strategy contract item limit")
			}
			keyToken, err := decoder.Token()
			if err != nil {
				return nil, wrapContractError(ErrorInvalidDocument, "", "decode JSON object key", err)
			}
			key, ok := keyToken.(string)
			if !ok {
				return nil, contractError(ErrorInvalidDocument, "", "JSON object key must be a string")
			}
			if err := validateCanonicalString(key); err != nil {
				return nil, err
			}
			if _, duplicate := values[key]; duplicate {
				return nil, contractError(ErrorInvalidDocument, key, "duplicate JSON object key")
			}
			value, err := parseCanonicalJSONValue(decoder, depth+1)
			if err != nil {
				return nil, err
			}
			values[key] = value
		}
		end, err := decoder.Token()
		if err != nil || end != json.Delim('}') {
			return nil, wrapContractError(ErrorInvalidDocument, "", "close JSON object", err)
		}
		return values, nil
	default:
		return nil, contractError(ErrorInvalidDocument, "", "unexpected JSON delimiter")
	}
}

func encodeCanonicalValueV1(value interface{}) ([]byte, error) {
	encoder := canonicalEncoder{buffer: bytes.NewBuffer(nil)}
	if err := encoder.writeValue(value); err != nil {
		return nil, err
	}
	return encoder.buffer.Bytes(), nil
}

type canonicalEncoder struct {
	buffer *bytes.Buffer
}

func (encoder canonicalEncoder) writeValue(value interface{}) error {
	switch typed := value.(type) {
	case nil:
		return encoder.write([]byte{canonicalNull})
	case bool:
		if typed {
			return encoder.write([]byte{canonicalTrue})
		}
		return encoder.write([]byte{canonicalFalse})
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return contractError(ErrorInvalidDocument, "number", "number is not finite")
		}
		if math.Trunc(typed) == typed && math.Abs(typed) > maxSafeJSONInteger {
			return contractError(ErrorInvalidDocument, "number", "integer exceeds the shared safe range")
		}
		if typed == 0 {
			typed = 0
		}
		data := make([]byte, 9)
		data[0] = canonicalNumber
		binary.BigEndian.PutUint64(data[1:], math.Float64bits(typed))
		return encoder.write(data)
	case string:
		return encoder.writeString(typed)
	case []interface{}:
		if len(typed) > MaxCanonicalContainerItems {
			return contractError(ErrorInvalidDocument, "", "array exceeds strategy contract item limit")
		}
		if err := encoder.writeCount(canonicalArray, len(typed)); err != nil {
			return err
		}
		for _, item := range typed {
			if err := encoder.writeValue(item); err != nil {
				return err
			}
		}
		return nil
	case map[string]interface{}:
		if len(typed) > MaxCanonicalContainerItems {
			return contractError(ErrorInvalidDocument, "", "object exceeds strategy contract item limit")
		}
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(left, right int) bool {
			return bytes.Compare([]byte(keys[left]), []byte(keys[right])) < 0
		})
		if err := encoder.writeCount(canonicalObject, len(keys)); err != nil {
			return err
		}
		for _, key := range keys {
			if err := encoder.writeString(key); err != nil {
				return err
			}
			if err := encoder.writeValue(typed[key]); err != nil {
				return err
			}
		}
		return nil
	default:
		return contractError(ErrorInvalidDocument, "", "unsupported canonical JSON value")
	}
}

func (encoder canonicalEncoder) writeString(value string) error {
	if err := validateCanonicalString(value); err != nil {
		return err
	}
	data := []byte(value)
	if uint64(len(data)) > math.MaxUint32 {
		return contractError(ErrorInvalidDocument, "", "string exceeds canonical uint32 length")
	}
	header := make([]byte, 5)
	header[0] = canonicalString
	binary.BigEndian.PutUint32(header[1:], uint32(len(data)))
	if err := encoder.write(header); err != nil {
		return err
	}
	return encoder.write(data)
}

func validateCanonicalString(value string) error {
	// encoding/json replaces lone UTF-16 surrogates with U+FFFD while
	// JavaScript preserves them. Rejecting U+FFFD keeps both runtimes on the
	// same Unicode-scalar domain instead of allowing hash collisions.
	if !utf8.ValidString(value) || strings.ContainsRune(value, utf8.RuneError) {
		return contractError(ErrorInvalidDocument, "", "string contains an unsupported Unicode replacement or surrogate value")
	}
	return nil
}

func (encoder canonicalEncoder) writeCount(tag byte, count int) error {
	if count < 0 || uint64(count) > math.MaxUint32 {
		return contractError(ErrorInvalidDocument, "", "container exceeds canonical uint32 count")
	}
	header := make([]byte, 5)
	header[0] = tag
	binary.BigEndian.PutUint32(header[1:], uint32(count))
	return encoder.write(header)
}

func (encoder canonicalEncoder) write(data []byte) error {
	if encoder.buffer.Len()+len(data) > MaxCanonicalOutputBytes {
		return contractError(ErrorInvalidDocument, "", "canonical output exceeds strategy contract limit")
	}
	_, err := encoder.buffer.Write(data)
	return err
}
