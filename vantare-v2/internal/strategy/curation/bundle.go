package curation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// ContractVersion para CurationBundle v1 (allowlist cerrada ADR 0009 §5).
const ContractVersionV1 ContractVersion = "curationbundle.v1"

type ContractVersion string

// EpochQuantized es una fecha cuantizada (semana ISO YYYY-Www), sin fecha absoluta.
type EpochQuantized string

var epochPattern = regexp.MustCompile(`^\d{4}-W\d{2}$`)

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
	if strings.TrimSpace(b.Admin.UploadID) == "" {
		return fmt.Errorf("admin.uploadId required")
	}
	if strings.TrimSpace(b.Admin.DeleteHash) == "" {
		return fmt.Errorf("admin.deleteHash required")
	}
	if b.Payload.ContractVersion != ContractVersionV1 {
		return fmt.Errorf("unsupported contractVersion %q", b.Payload.ContractVersion)
	}
	if strings.TrimSpace(b.Payload.BundleID) == "" || len(b.Payload.BundleID) > 128 {
		return fmt.Errorf("payload.bundleId required 1-128")
	}
	if strings.TrimSpace(b.Payload.CombinationID) == "" {
		return fmt.Errorf("payload.combinationId required")
	}
	if !b.Payload.Epoch.Valid() {
		return fmt.Errorf("payload.epoch must be YYYY-Www")
	}
	if len(b.Payload.StintAggregates) == 0 {
		return fmt.Errorf("payload.stintAggregates required")
	}
	for _, s := range b.Payload.StintAggregates {
		if s.Laps <= 0 {
			return fmt.Errorf("stint laps must be >0")
		}
	}
	return nil
}

// StrictDecode rechaza campos desconocidos (additionalProperties=false).
func StrictDecode(data []byte) (CurationBundleV1, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var b CurationBundleV1
	if err := dec.Decode(&b); err != nil {
		return CurationBundleV1{}, fmt.Errorf("strict decode bundle: %w", err)
	}
	if err := b.Validate(); err != nil {
		return CurationBundleV1{}, err
	}
	if err := denylistCheck(data); err != nil {
		return CurationBundleV1{}, err
	}
	return b, nil
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
