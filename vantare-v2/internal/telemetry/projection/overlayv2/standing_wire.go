package overlayv2

import (
	"bytes"
	"encoding/json"
	"fmt"
)

type standingRowJSON StandingRowV2

// MarshalJSON shares the declared scalar quality with the three timing cells.
// This changes only their wire representation, never precision or provenance.
func (row StandingRowV2) MarshalJSON() ([]byte, error) {
	if row.Quality.Q == "" {
		return json.Marshal(struct {
			standingRowJSON
			Quality *StandingQualityV2 `json:"q,omitempty"`
		}{standingRowJSON: standingRowJSON(row)})
	}
	quality := row.Quality
	quality.Gap = qualityOverride(row.GapSeconds.Q, quality.Q)
	quality.BestLap = qualityOverride(row.BestLapSeconds.Q, quality.Q)
	quality.LastLap = qualityOverride(row.LastLapSeconds.Q, quality.Q)
	return json.Marshal(struct {
		standingRowJSON
		Quality StandingWireQualityV2 `json:"q"`
		Gap     float64               `json:"gap"`
		BestLap float64               `json:"bestLap"`
		LastLap float64               `json:"lastLap"`
	}{standingRowJSON: standingRowJSON(row), Quality: standingWireQuality(quality), Gap: row.GapSeconds.V, BestLap: row.BestLapSeconds.V, LastLap: row.LastLapSeconds.V})
}

func qualityOverride(quality, base Quality) Quality {
	if quality == base {
		return ""
	}
	return quality
}

// UnmarshalJSON accepts both legacy quality-bearing objects and compact scalar
// timings. The in-process row always exposes QValue cells to consumers.
func (row *StandingRowV2) UnmarshalJSON(data []byte) error {
	var decoded struct {
		standingRowJSON
		Gap     json.RawMessage `json:"gap"`
		BestLap json.RawMessage `json:"bestLap"`
		LastLap json.RawMessage `json:"lastLap"`
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	for legacy, compact := range map[string]string{"quality": "q", "classGap": "cg", "classGapLaps": "cl", "classRef": "cr", "interval": "i", "intervalLaps": "il"} {
		if value, ok := fields[legacy]; ok {
			if _, duplicate := fields[compact]; duplicate {
				return fmt.Errorf("duplicate standing field %s", legacy)
			}
			fields[compact] = value
			delete(fields, legacy)
		}
	}
	normalized, err := json.Marshal(fields)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(normalized, &decoded); err != nil {
		return err
	}
	result := StandingRowV2(decoded.standingRowJSON)
	for _, cell := range []struct {
		name     string
		raw      json.RawMessage
		override Quality
		target   *QValue[float64]
	}{
		{"gap", decoded.Gap, result.Quality.Gap, &result.GapSeconds},
		{"bestLap", decoded.BestLap, result.Quality.BestLap, &result.BestLapSeconds},
		{"lastLap", decoded.LastLap, result.Quality.LastLap, &result.LastLapSeconds},
	} {
		value, err := decodeStandingTiming(cell.raw, cell.override, result.Quality.Q)
		if err != nil {
			return fmt.Errorf("standing %s: %w", cell.name, err)
		}
		*cell.target = value
	}
	result.Quality.Gap, result.Quality.BestLap, result.Quality.LastLap = "", "", ""
	*row = result
	return nil
}

func decodeStandingTiming(raw json.RawMessage, override, base Quality) (QValue[float64], error) {
	var value QValue[float64]
	raw = bytes.TrimSpace(raw)
	if len(raw) > 0 && raw[0] == '{' {
		if err := json.Unmarshal(raw, &value); err != nil {
			return value, err
		}
		switch value.Q {
		case QualityFresh, QualityStale, QualityMissing, QualityInvalid:
		default:
			return value, fmt.Errorf("invalid timing quality")
		}
		if override != "" && override != value.Q {
			return value, fmt.Errorf("conflicting timing quality")
		}
		if value.Q == QualityMissing && value.V != 0 {
			return value, fmt.Errorf("missing timing has a value")
		}
		return value, nil
	}
	quality := override
	if quality == "" {
		quality = base
	}
	switch quality {
	case QualityFresh, QualityStale, QualityMissing, QualityInvalid:
	default:
		return value, fmt.Errorf("missing or invalid scalar quality")
	}
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return value, fmt.Errorf("missing numeric timing")
	}
	if err := json.Unmarshal(raw, &value.V); err != nil {
		return value, err
	}
	value.Q = quality
	if quality == QualityMissing && value.V != 0 {
		return value, fmt.Errorf("missing timing has a value")
	}
	return value, nil
}

// WireQualityV2 is a lossless wire spelling: f=fresh, s=stale, m=missing,
// i=invalid. Unknown spellings are rejected, never inferred.
type WireQualityV2 string

const (
	WireFresh   WireQualityV2 = "f"
	WireStale   WireQualityV2 = "s"
	WireMissing WireQualityV2 = "m"
	WireInvalid WireQualityV2 = "i"
)

// StandingWireQualityV2 shares a base quality with explicit field overrides.
// g/b/l are gap, bestLap and lastLap. Other field names retain their spelling.
type StandingWireQualityV2 struct {
	Q             WireQualityV2 `json:"q"`
	Gap           WireQualityV2 `json:"g,omitempty"`
	BestLap       WireQualityV2 `json:"b,omitempty"`
	LastLap       WireQualityV2 `json:"l,omitempty"`
	Position      WireQualityV2 `json:"position,omitempty"`
	ClassPosition WireQualityV2 `json:"classPosition,omitempty"`
	Pit           WireQualityV2 `json:"pit,omitempty"`
	Laps          WireQualityV2 `json:"laps,omitempty"`
	GapLaps       WireQualityV2 `json:"gapLaps,omitempty"`
	ClassGap      WireQualityV2 `json:"classGap,omitempty"`
	ClassGapLaps  WireQualityV2 `json:"classGapLaps,omitempty"`
	Interval      WireQualityV2 `json:"interval,omitempty"`
	IntervalLaps  WireQualityV2 `json:"intervalLaps,omitempty"`
}

func wireQuality(value Quality) WireQualityV2 {
	switch value {
	case QualityFresh:
		return WireFresh
	case QualityStale:
		return WireStale
	case QualityMissing:
		return WireMissing
	case QualityInvalid:
		return WireInvalid
	default:
		return WireQualityV2(value)
	}
}

func standingWireQuality(value StandingQualityV2) StandingWireQualityV2 {
	return StandingWireQualityV2{
		Q: wireQuality(value.Q), Gap: wireQuality(value.Gap), BestLap: wireQuality(value.BestLap), LastLap: wireQuality(value.LastLap),
		Position: wireQuality(value.Position), ClassPosition: wireQuality(value.ClassPosition), Pit: wireQuality(value.Pit), Laps: wireQuality(value.Laps), GapLaps: wireQuality(value.GapLaps),
		ClassGap: wireQuality(value.ClassGap), ClassGapLaps: wireQuality(value.ClassGapLaps), Interval: wireQuality(value.Interval), IntervalLaps: wireQuality(value.IntervalLaps),
	}
}

// UnmarshalJSON accepts legacy words and compact codes with no unknown default.
func (quality *StandingQualityV2) UnmarshalJSON(data []byte) error {
	var fields map[string]string
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	var value StandingQualityV2
	targets := map[string]*Quality{"q": &value.Q, "gap": &value.Gap, "bestLap": &value.BestLap, "lastLap": &value.LastLap, "position": &value.Position, "classPosition": &value.ClassPosition, "pit": &value.Pit, "laps": &value.Laps, "gapLaps": &value.GapLaps, "classGap": &value.ClassGap, "classGapLaps": &value.ClassGapLaps, "interval": &value.Interval, "intervalLaps": &value.IntervalLaps}
	for key, raw := range fields {
		if alias := map[string]string{"g": "gap", "b": "bestLap", "l": "lastLap"}[key]; alias != "" {
			key = alias
		}
		target, ok := targets[key]
		if !ok || *target != "" {
			return fmt.Errorf("unknown or duplicate standing quality %s", key)
		}
		switch raw {
		case "f", "fresh":
			*target = QualityFresh
		case "s", "stale":
			*target = QualityStale
		case "m", "missing":
			*target = QualityMissing
		case "i", "invalid":
			*target = QualityInvalid
		default:
			return fmt.Errorf("unknown standing quality %q", raw)
		}
	}
	if value.Q == "" {
		return fmt.Errorf("missing standing base quality")
	}
	*quality = value
	return nil
}
