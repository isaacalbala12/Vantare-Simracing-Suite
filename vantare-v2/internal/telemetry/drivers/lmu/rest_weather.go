package lmu

import (
	"bytes"
	"encoding/json"
	"time"
)

// Each current-weather field owns its presence and validity. A malformed
// reading must not discard another reading from the same sessionInfo poll.
func parseRESTWeatherNumber[T ~float64](raw json.RawMessage, minimum, maximum float64, now time.Time, elapsed monotonicStamp) TimedField[T] {
	if len(bytes.TrimSpace(raw)) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		return timedMissingAt[T](now, elapsed)
	}
	var value float64
	if err := json.Unmarshal(raw, &value); err != nil || !finite(value) || value < minimum || value > maximum {
		return TimedField[T]{Field: invalid[T](), UpdatedUTC: now, updatedMono: elapsed}
	}
	return timedObservedAt(T(value), now, elapsed)
}
