package catalog

import (
	"bytes"
	"context"
	"crypto/ed25519"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	PayloadVersionV1 = "strategy.catalog.payload.v1"
	maxCatalogBytes  = 4 << 20
)

// FixtureSignedV1 is the reviewed, TEST-key-signed default while publication
// remains behind Isaac's explicit gate. Normal builds perform no network I/O.
//
//go:embed testdata/catalog_fixture_signed.json
var FixtureSignedV1 []byte

func FixtureTrustedKeys() map[string]ed25519.PublicKey {
	decoded, err := hex.DecodeString("79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664")
	if err != nil {
		return map[string]ed25519.PublicKey{}
	}
	return map[string]ed25519.PublicKey{"2026-08-a": ed25519.PublicKey(decoded)}
}

type ReferenceProvenanceV1 struct {
	Kind        string `json:"kind"`
	Environment string `json:"environment"`
}

type SampleV1 struct {
	SemanticBundles int `json:"semanticBundles"`
	Contributors    int `json:"contributors"`
	Sessions        int `json:"sessions"`
}

type QualityV1 struct {
	ValidSessions   int     `json:"validSessions"`
	InvalidSessions int     `json:"invalidSessions"`
	SampleSessions  int     `json:"sampleSessions"`
	ValidRatio      float64 `json:"validRatio"`
}

type MetricV1 struct {
	MedianPerLap float64 `json:"medianPerLap"`
	RangeLower   float64 `json:"rangeLower"`
	RangeUpper   float64 `json:"rangeUpper"`
	SampleLaps   int     `json:"sampleLaps"`
}

type PresenceV1 struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason"`
}

type PitV1 struct {
	Count                  int     `json:"count"`
	TypicalDurationSeconds float64 `json:"typicalDurationSeconds"`
}

type ReferenceProfileV1 struct {
	TargetContractVersion string                `json:"targetContractVersion"`
	Provenance            ReferenceProvenanceV1 `json:"provenance"`
	Sample                SampleV1              `json:"sample"`
	Quality               QualityV1             `json:"quality"`
	Fuel                  *MetricV1             `json:"fuel,omitempty"`
	VirtualEnergy         *MetricV1             `json:"virtualEnergy,omitempty"`
	Pace                  *PresenceV1           `json:"pace,omitempty"`
	StintPaceCurve        *PresenceV1           `json:"stintPaceCurve,omitempty"`
	Pit                   *PitV1                `json:"pit,omitempty"`
}

type ObservedStrategyV1 struct {
	StintCount int      `json:"stintCount"`
	PitLaps    []int    `json:"pitLaps"`
	Compounds  []string `json:"compounds"`
}

type ScoreV1 struct {
	Available              bool    `json:"available"`
	NormalizedTotalSeconds float64 `json:"normalizedTotalSeconds"`
	Feasible               bool    `json:"feasible"`
	RankingPassed          bool    `json:"rankingPassed"`
	Reason                 string  `json:"reason,omitempty"`
	Basis                  string  `json:"basis"`
}

type StrategyV1 struct {
	Rank           int                   `json:"rank"`
	ClusterDigest  string                `json:"clusterDigest"`
	Representative ObservedStrategyV1    `json:"representative"`
	Provenance     ReferenceProvenanceV1 `json:"provenance"`
	Sample         SampleV1              `json:"sample"`
	Quality        QualityV1             `json:"quality"`
	Score          ScoreV1               `json:"score"`
}

type CombinationV1 struct {
	CombinationID    string              `json:"combinationId"`
	ReferenceProfile *ReferenceProfileV1 `json:"referenceProfile,omitempty"`
	Strategies       []StrategyV1        `json:"strategies"`
}

type SourceV1 struct {
	SummaryContractVersion string `json:"summaryContractVersion"`
	SummaryDigest          string `json:"summaryDigest"`
	EngineVersion          string `json:"engineVersion"`
	EngineSourceHash       string `json:"engineSourceHash"`
	MinimumCohort          int    `json:"minimumCohort"`
}

type PayloadV1 struct {
	ContractVersion string          `json:"contractVersion"`
	Source          SourceV1        `json:"source"`
	Combinations    []CombinationV1 `json:"combinations"`
}

type WarningCode string

const (
	WarningInvalidSignature WarningCode = "invalid_signature"
	WarningUnknownEpoch     WarningCode = "unknown_epoch"
	WarningRollback         WarningCode = "rollback"
	WarningExpired          WarningCode = "expired"
	WarningSchema           WarningCode = "schema_incompatible"
	WarningUnavailable      WarningCode = "unavailable"
)

type ResultSource string

const (
	SourceCandidate ResultSource = "candidate"
	SourceCache     ResultSource = "cache"
	SourceEmpty     ResultSource = "empty"
)

type ConsumerResult struct {
	Catalog PayloadV1    `json:"catalog"`
	Source  ResultSource `json:"source"`
	Warning WarningCode  `json:"warning,omitempty"`
}

type httpDoer interface {
	Do(*http.Request) (*http.Response, error)
}

type ConsumerOptions struct {
	StatePath   string
	URL         string
	Fixture     []byte
	HTTPClient  httpDoer
	TrustedKeys map[string]ed25519.PublicKey
	MinEpoch    string
	MinVersion  uint64
	SeenEpoch   string
	SeenVersion uint64
	Now         func() time.Time
}

type Consumer struct {
	options   ConsumerOptions
	candidate []byte
}

type consumerState struct {
	SeenEpoch   string          `json:"seenEpoch"`
	SeenVersion uint64          `json:"seenVersion"`
	Cache       json.RawMessage `json:"cache,omitempty"`
}

func NewConsumer(options ConsumerOptions) *Consumer {
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.HTTPClient == nil {
		options.HTTPClient = http.DefaultClient
	}
	return &Consumer{options: options}
}

func (consumer *Consumer) Load(ctx context.Context) (ConsumerResult, error) {
	if consumer == nil || strings.TrimSpace(consumer.options.StatePath) == "" {
		return ConsumerResult{}, fmt.Errorf("catalog consumer state path is required")
	}
	state, err := consumer.readState()
	if err != nil {
		return ConsumerResult{}, err
	}
	if state.SeenEpoch == "" {
		state.SeenEpoch = consumer.options.SeenEpoch
		state.SeenVersion = consumer.options.SeenVersion
	}
	candidate, fetchWarning := consumer.readCandidate(ctx)
	if fetchWarning == "" {
		signed, payload, verifyErr := consumer.verify(candidate, state, consumer.options.Now().UTC())
		if verifyErr == nil {
			state.SeenEpoch = signed.Envelope.KeyEpoch
			state.SeenVersion = signed.Envelope.Version
			state.Cache = append(json.RawMessage(nil), candidate...)
			if err := consumer.writeState(state); err != nil {
				return ConsumerResult{}, err
			}
			return ConsumerResult{Catalog: payload, Source: SourceCandidate}, nil
		}
		fetchWarning = warningFor(verifyErr)
	}
	if len(state.Cache) != 0 {
		_, cached, cacheErr := consumer.verify(state.Cache, state, consumer.options.Now().UTC())
		if cacheErr == nil {
			return ConsumerResult{Catalog: cached, Source: SourceCache, Warning: fetchWarning}, nil
		}
	}
	return ConsumerResult{Catalog: PayloadV1{Combinations: []CombinationV1{}}, Source: SourceEmpty, Warning: fetchWarning}, nil
}

func (consumer *Consumer) readCandidate(ctx context.Context) ([]byte, WarningCode) {
	if consumer.candidate != nil {
		return append([]byte(nil), consumer.candidate...), ""
	}
	if strings.TrimSpace(consumer.options.URL) == "" {
		if len(consumer.options.Fixture) == 0 {
			return nil, WarningUnavailable
		}
		return append([]byte(nil), consumer.options.Fixture...), ""
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, consumer.options.URL, nil)
	if err != nil {
		return nil, WarningUnavailable
	}
	response, err := consumer.options.HTTPClient.Do(request)
	if err != nil {
		return nil, WarningUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, WarningUnavailable
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxCatalogBytes+1))
	if err != nil || len(data) > maxCatalogBytes {
		return nil, WarningUnavailable
	}
	return data, ""
}

func (consumer *Consumer) verify(raw []byte, state consumerState, now time.Time) (SignedCatalog, PayloadV1, error) {
	var signed SignedCatalog
	if err := strictDecode(raw, &signed); err != nil {
		return SignedCatalog{}, PayloadV1{}, fmt.Errorf("%w: signed catalog", ErrSchemaIncompatible)
	}
	if err := VerifySignedCatalog(VerificationInput{Signed: signed, TrustedKeys: consumer.options.TrustedKeys, MinEpoch: consumer.options.MinEpoch, MinVersion: consumer.options.MinVersion, SeenEpoch: state.SeenEpoch, SeenVersion: state.SeenVersion, Now: now}); err != nil {
		return SignedCatalog{}, PayloadV1{}, err
	}
	var payload PayloadV1
	if err := strictDecode(signed.Payload, &payload); err != nil || validatePayload(payload) != nil {
		return SignedCatalog{}, PayloadV1{}, fmt.Errorf("%w: payload", ErrSchemaIncompatible)
	}
	return signed, payload, nil
}

func validatePayload(payload PayloadV1) error {
	if payload.ContractVersion != PayloadVersionV1 || payload.Source.MinimumCohort < 3 || payload.Combinations == nil {
		return ErrSchemaIncompatible
	}
	seen := make(map[string]struct{}, len(payload.Combinations))
	for _, combination := range payload.Combinations {
		if strings.TrimSpace(combination.CombinationID) == "" {
			return ErrSchemaIncompatible
		}
		if _, duplicate := seen[combination.CombinationID]; duplicate {
			return ErrSchemaIncompatible
		}
		seen[combination.CombinationID] = struct{}{}
		if combination.ReferenceProfile != nil && (combination.ReferenceProfile.Provenance.Kind != "reference" || combination.ReferenceProfile.Sample.Contributors < 3) {
			return ErrSchemaIncompatible
		}
		for _, strategy := range combination.Strategies {
			if strategy.Provenance.Kind != "reference" || strategy.Sample.Contributors < 3 {
				return ErrSchemaIncompatible
			}
		}
	}
	return nil
}

func warningFor(err error) WarningCode {
	switch {
	case errors.Is(err, ErrInvalidSignature):
		return WarningInvalidSignature
	case errors.Is(err, ErrUnknownKeyEpoch):
		return WarningUnknownEpoch
	case errors.Is(err, ErrCatalogRollback):
		return WarningRollback
	case errors.Is(err, ErrCatalogExpired):
		return WarningExpired
	case errors.Is(err, ErrSchemaIncompatible):
		return WarningSchema
	default:
		return WarningUnavailable
	}
}

func (consumer *Consumer) readState() (consumerState, error) {
	data, err := os.ReadFile(consumer.options.StatePath)
	if errors.Is(err, os.ErrNotExist) {
		return consumerState{}, nil
	}
	if err != nil {
		return consumerState{}, fmt.Errorf("read catalog state: %w", err)
	}
	var state consumerState
	if err := strictDecode(data, &state); err != nil {
		return consumerState{}, fmt.Errorf("decode catalog state: %w", err)
	}
	return state, nil
}

func (consumer *Consumer) writeState(state consumerState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("encode catalog state: %w", err)
	}
	directory := filepath.Dir(consumer.options.StatePath)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create catalog state directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".strategy-catalog-*.tmp")
	if err != nil {
		return fmt.Errorf("create catalog state temporary: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return fmt.Errorf("protect catalog state temporary: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		temporary.Close()
		return fmt.Errorf("write catalog state temporary: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync catalog state temporary: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close catalog state temporary: %w", err)
	}
	if err := os.Rename(temporaryPath, consumer.options.StatePath); err != nil {
		return fmt.Errorf("replace catalog state: %w", err)
	}
	return nil
}

func strictDecode(data []byte, destination any) error {
	if len(data) == 0 || len(data) > maxCatalogBytes {
		return ErrSchemaIncompatible
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return ErrSchemaIncompatible
	}
	return nil
}
