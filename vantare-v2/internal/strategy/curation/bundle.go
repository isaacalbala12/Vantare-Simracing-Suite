package curation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
)

// ContractVersion para CurationBundle v1 (allowlist cerrada ADR 0009 §5).
const ContractVersionV1 ContractVersion = "curationbundle.v1"

type ContractVersion string

// EpochQuantized es una fecha cuantizada (semana ISO YYYY-Www), sin fecha absoluta.
type EpochQuantized string

var epochPattern = regexp.MustCompile(`^\d{4}-W\d{2}$`)
var identifierPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._:-]*$`)

func (e EpochQuantized) Valid() bool { return epochPattern.MatchString(string(e)) }

func QuantizeEpoch(t time.Time) EpochQuantized {
	y, w := t.ISOWeek()
	return EpochQuantized(fmt.Sprintf("%04d-W%02d", y, w))
}

// AdminEnvelope es el identificador administrativo SEPARADO del payload analítico
// (ADR 0009 §5). Viaja separado para borrado/cuota sin mezclar con el payload.
type AdminEnvelope struct {
	UploadID   string `json:"uploadId"`
	DeleteHash string `json:"deleteHash"`
}

// BundlePayload es la allowlist cerrada (additionalProperties=false conceptual).
// Solo contiene: identidad de combinación desde catálogo interno, agregados de
// stint/pit, curvas derivadas cuantizadas, estrategias observadas y calidad de canal.
// Sin telemetría cruda, nombres, SteamID ni rutas. Fechas solo cuantizadas.
type BundlePayload struct {
	ContractVersion    ContractVersion       `json:"contractVersion"`
	BundleID           string                `json:"bundleId"`
	CombinationID      string                `json:"combinationId"`
	Epoch              EpochQuantized        `json:"epoch"`
	StintAggregates    []StintAggregate      `json:"stintAggregates"`
	PitAggregates      *PitAggregates        `json:"pitAggregates,omitempty"`
	ObservedStrategies []ObservedStrategyRef `json:"observedStrategies"`
	ChannelQuality     ChannelQuality        `json:"channelQuality"`
}

type StintAggregate struct {
	StintNumber   int     `json:"stintNumber"`
	Laps          int     `json:"laps"`
	AvgFuelPerLap float64 `json:"avgFuelPerLap"`
	AvgVEPerLap   float64 `json:"avgVEPerLap"`
}

type PitAggregates struct {
	Count              int      `json:"count"`
	AvgDurationSeconds float64  `json:"avgDurationSeconds"`
	FuelRateLPerS      *float64 `json:"fuelRateLPerS,omitempty"`
	VERatePPerS        *float64 `json:"veRatePPerS,omitempty"`
}

type ObservedStrategyRef struct {
	StintCount int      `json:"stintCount"`
	PitLaps    []int    `json:"pitLaps"`
	Compounds  []string `json:"compounds"`
}

type ChannelQuality struct {
	ValidSessions   int `json:"validSessions"`
	InvalidSessions int `json:"invalidSessions"`
}

// CurationBundleV1 es el bundle completo con envelope administrativo separado.
type CurationBundleV1 struct {
	Admin   AdminEnvelope `json:"admin"`
	Payload BundlePayload `json:"payload"`
}

func (b CurationBundleV1) Validate() error {
	if !validIdentifier(b.Admin.UploadID, 128) {
		return fmt.Errorf("admin.uploadId must be a normalized identifier of 1-128 characters")
	}
	if strings.TrimSpace(b.Admin.DeleteHash) == "" || len(b.Admin.DeleteHash) > 256 {
		return fmt.Errorf("admin.deleteHash required 1-256")
	}
	if b.Payload.ContractVersion != ContractVersionV1 {
		return fmt.Errorf("unsupported contractVersion %q", b.Payload.ContractVersion)
	}
	if !validIdentifier(b.Payload.BundleID, 128) {
		return fmt.Errorf("payload.bundleId must be a normalized identifier of 1-128 characters")
	}
	if !validIdentifier(b.Payload.CombinationID, 128) {
		return fmt.Errorf("payload.combinationId must be a normalized identifier of 1-128 characters")
	}
	if !b.Payload.Epoch.Valid() {
		return fmt.Errorf("payload.epoch must be YYYY-Www")
	}
	if len(b.Payload.StintAggregates) == 0 || len(b.Payload.StintAggregates) > 256 {
		return fmt.Errorf("payload.stintAggregates required 1-256")
	}
	seenStints := make(map[int]bool, len(b.Payload.StintAggregates))
	totalLaps := 0
	for _, s := range b.Payload.StintAggregates {
		if s.StintNumber <= 0 || seenStints[s.StintNumber] {
			return fmt.Errorf("stint numbers must be positive and unique")
		}
		seenStints[s.StintNumber] = true
		if s.Laps <= 0 || s.Laps > 100000 {
			return fmt.Errorf("stint laps must be in 1-100000")
		}
		totalLaps += s.Laps
		if totalLaps > 100000 {
			return fmt.Errorf("total stint laps must not exceed 100000")
		}
		if !finiteNonNegative(s.AvgFuelPerLap) || !finiteNonNegative(s.AvgVEPerLap) {
			return fmt.Errorf("stint consumption must be finite and non-negative")
		}
	}
	if b.Payload.PitAggregates != nil {
		p := b.Payload.PitAggregates
		if p.Count < 0 || p.Count > 1000000 || !finiteNonNegative(p.AvgDurationSeconds) {
			return fmt.Errorf("pit aggregates count and duration must be finite and non-negative")
		}
		if p.Count > 0 && p.AvgDurationSeconds <= 0 {
			return fmt.Errorf("pit average duration must be positive when count is positive")
		}
		if p.FuelRateLPerS != nil && (!finiteNonNegative(*p.FuelRateLPerS) || *p.FuelRateLPerS <= 0) {
			return fmt.Errorf("pit fuel rate must be positive and finite")
		}
		if p.VERatePPerS != nil && (!finiteNonNegative(*p.VERatePPerS) || *p.VERatePPerS <= 0) {
			return fmt.Errorf("pit VE rate must be positive and finite")
		}
	}
	if len(b.Payload.ObservedStrategies) > 256 {
		return fmt.Errorf("payload.observedStrategies exceeds 256")
	}
	for _, strategy := range b.Payload.ObservedStrategies {
		if strategy.StintCount <= 0 || strategy.StintCount > 256 || len(strategy.PitLaps) != strategy.StintCount-1 {
			return fmt.Errorf("observed strategy stint and pit counts are inconsistent")
		}
		if len(strategy.Compounds) > strategy.StintCount {
			return fmt.Errorf("observed strategy compounds cannot exceed stint count")
		}
		if !sort.IntsAreSorted(strategy.PitLaps) {
			return fmt.Errorf("observed strategy pit laps must be sorted")
		}
		for index, lap := range strategy.PitLaps {
			if lap <= 0 || lap > 100000 || (index > 0 && lap == strategy.PitLaps[index-1]) {
				return fmt.Errorf("observed strategy pit laps must be positive and unique")
			}
		}
		for _, compound := range strategy.Compounds {
			if !validIdentifier(compound, 64) {
				return fmt.Errorf("observed strategy compound must be a normalized identifier")
			}
		}
	}
	if b.Payload.ChannelQuality.ValidSessions < 0 || b.Payload.ChannelQuality.ValidSessions > 1000000 ||
		b.Payload.ChannelQuality.InvalidSessions < 0 || b.Payload.ChannelQuality.InvalidSessions > 1000000 ||
		b.Payload.ChannelQuality.ValidSessions+b.Payload.ChannelQuality.InvalidSessions == 0 {
		return fmt.Errorf("channel quality requires a positive non-negative sample")
	}
	return nil
}

// StrictDecode rechaza campos desconocidos (additionalProperties=false).
func StrictDecode(data []byte) (CurationBundleV1, error) {
	if err := rejectDuplicateJSONKeys(data); err != nil {
		return CurationBundleV1{}, fmt.Errorf("strict decode bundle: %w", err)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var b CurationBundleV1
	if err := dec.Decode(&b); err != nil {
		return CurationBundleV1{}, fmt.Errorf("strict decode bundle: %w", err)
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return CurationBundleV1{}, fmt.Errorf("strict decode bundle: trailing JSON value")
		}
		return CurationBundleV1{}, fmt.Errorf("strict decode bundle trailing data: %w", err)
	}
	if err := b.Validate(); err != nil {
		return CurationBundleV1{}, err
	}
	if err := denylistCheck(data); err != nil {
		return CurationBundleV1{}, err
	}
	return b, nil
}

func rejectDuplicateJSONKeys(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	if err := scanUniqueJSONValue(dec); err != nil {
		return err
	}
	if _, err := dec.Token(); err != io.EOF {
		if err == nil {
			return fmt.Errorf("trailing JSON value")
		}
		return fmt.Errorf("trailing JSON data: %w", err)
	}
	return nil
}

func scanUniqueJSONValue(dec *json.Decoder) error {
	token, err := dec.Token()
	if err != nil {
		return fmt.Errorf("read JSON token: %w", err)
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delimiter {
	case '{':
		seen := make(map[string]bool)
		for dec.More() {
			keyToken, err := dec.Token()
			if err != nil {
				return fmt.Errorf("read JSON object key: %w", err)
			}
			key, ok := keyToken.(string)
			if !ok {
				return fmt.Errorf("JSON object key is not a string")
			}
			if seen[key] {
				return fmt.Errorf("duplicate JSON field %q", key)
			}
			seen[key] = true
			if err := scanUniqueJSONValue(dec); err != nil {
				return err
			}
		}
	case '[':
		for dec.More() {
			if err := scanUniqueJSONValue(dec); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unexpected JSON delimiter %q", delimiter)
	}
	closing, err := dec.Token()
	if err != nil {
		return fmt.Errorf("read JSON closing delimiter: %w", err)
	}
	want := json.Delim('}')
	if delimiter == '[' {
		want = ']'
	}
	if closing != want {
		return fmt.Errorf("unexpected JSON closing delimiter %q", closing)
	}
	return nil
}

func validIdentifier(value string, maxLength int) bool {
	return len(value) > 0 && len(value) <= maxLength && identifierPattern.MatchString(value)
}

func finiteNonNegative(value float64) bool {
	return value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

// denylist de PII/canarios (test de denylist según ADR 0009 §5).
var denylistPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)steamid`),
	regexp.MustCompile(`(?i)steam_id`),
	regexp.MustCompile(`(?i)telemetria.*cruda`),
	regexp.MustCompile(`(?i)raw.*telemetry`),
	regexp.MustCompile(`(?i)driverName`),
	regexp.MustCompile(`(?i)userpath`),
	regexp.MustCompile(`(?i)Users\\`),
	regexp.MustCompile(`(?i)@example\.com`),
	regexp.MustCompile(`\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}`), // fecha absoluta no cuantizada
}

func denylistCheck(data []byte) error {
	s := string(data)
	for _, re := range denylistPatterns {
		if re.MatchString(s) {
			return fmt.Errorf("bundle denylist violated: pattern %q matched", re.String())
		}
	}
	return nil
}

// MarshalStrict serializa el payload sin campos extra (allowlist).
func (b CurationBundleV1) MarshalStrict() ([]byte, error) {
	if err := b.Validate(); err != nil {
		return nil, err
	}
	return json.Marshal(b)
}
