package telemetryanalysis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"unicode"
)

const (
	HistoricalSchemaVersion = 1
	LMUDuckDBParserID       = "lmu-duckdb"
	LMUDuckDBParserVersion  = "1"
	MaxLMUDuckDBPageRows    = 16384

	maxHistoricalChannels = 1024
	maxHistoricalColumns  = 64
	maxHistoricalMetadata = 512
	maxHistoricalNameLen  = 256
)

var (
	ErrInvalidHistoricalCatalog = errors.New("invalid historical telemetry catalog")
	ErrInvalidHistoricalPage    = errors.New("invalid historical telemetry page")
	ErrHistoricalTimestampOrder = errors.New("historical telemetry timestamp order violation")
	ErrInvalidHistoricalLaps    = errors.New("invalid historical lap boundaries")
	ErrHistoricalSource         = errors.New("historical telemetry source error")
	ErrHistoricalNotInspected   = errors.New("historical telemetry source not inspected")
)

// Quality is independent from a scalar value: zero, false and an empty string
// can all be present values.
type Quality string

const (
	QualityValid   Quality = "valid"
	QualityStale   Quality = "stale"
	QualityMissing Quality = "missing"
	QualityInvalid Quality = "invalid"
	QualityUnknown Quality = "unknown"
)

type ScalarKind string

const (
	ScalarUnknown ScalarKind = "unknown"
	ScalarNumber  ScalarKind = "number"
	ScalarInteger ScalarKind = "integer"
	ScalarBoolean ScalarKind = "boolean"
	ScalarText    ScalarKind = "text"
)

type HistoricalScalar struct {
	Kind    ScalarKind `json:"kind"`
	Number  float64    `json:"number,omitempty"`
	Integer int64      `json:"integer,omitempty"`
	Boolean bool       `json:"boolean,omitempty"`
	Text    string     `json:"text,omitempty"`
}

type HistoricalValue struct {
	Column  string           `json:"column"`
	Present bool             `json:"present"`
	Quality Quality          `json:"quality"`
	Scalar  HistoricalScalar `json:"scalar"`
}

type SamplingKind string

const (
	SamplingContinuousImplicitFrequency SamplingKind = "continuous_implicit_frequency"
	SamplingEventTimestamped            SamplingKind = "event_timestamped"
)

type TimeOrigin string

const (
	// TimeOriginUnknown means the source table does not declare how its
	// frequency-derived relative axis aligns with event timestamps.
	TimeOriginUnknown         TimeOrigin = "unknown"
	TimeOriginSourceTimestamp TimeOrigin = "source_timestamp"
)

type HistoricalSampling struct {
	Kind        SamplingKind `json:"kind"`
	FrequencyHz int          `json:"frequency_hz,omitempty"`
	Origin      TimeOrigin   `json:"origin"`
}

type HistoricalUnit struct {
	Symbol  string  `json:"symbol,omitempty"`
	Quality Quality `json:"quality"`
}

type HistoricalColumn struct {
	Name string     `json:"name"`
	Type ScalarKind `json:"type"`
}

type HistoricalProvenance struct {
	Source            ManifestSource `json:"source"`
	Parser            ParserRef      `json:"parser"`
	SchemaFingerprint string         `json:"schema_fingerprint"`
}

type ChannelProvenance struct {
	SourceTable string         `json:"source_table"`
	Parser      ParserRef      `json:"parser"`
	Sampling    SamplingKind   `json:"sampling"`
	TimeOrigin  TimeOrigin     `json:"time_origin"`
	Source      ManifestSource `json:"source"`
}

type HistoricalMetadata struct {
	Key       string  `json:"key"`
	Sensitive bool    `json:"sensitive"`
	Present   bool    `json:"present"`
	Value     string  `json:"value,omitempty"`
	Quality   Quality `json:"quality"`
}

type HistoricalChannel struct {
	ID         string             `json:"id"`
	Order      int                `json:"order"`
	SourceName string             `json:"source_name"`
	Sampling   HistoricalSampling `json:"sampling"`
	Unit       HistoricalUnit     `json:"unit"`
	Columns    []HistoricalColumn `json:"columns"`
	Capability Quality            `json:"capability"`
	Provenance ChannelProvenance  `json:"provenance"`
}

type HistoricalLap struct {
	Number       int64    `json:"number"`
	StartSeconds float64  `json:"start_seconds"`
	EndSeconds   *float64 `json:"end_seconds,omitempty"`
	Boundary     Quality  `json:"boundary_quality"`
	Validity     Quality  `json:"validity"`
}

type HistoricalSession struct {
	SchemaVersion int                  `json:"schema_version"`
	ID            string               `json:"id"`
	Provenance    HistoricalProvenance `json:"provenance"`
	Metadata      []HistoricalMetadata `json:"metadata"`
	Laps          []HistoricalLap      `json:"laps"`
	Channels      []HistoricalChannel  `json:"channels"`
}

type HistoricalSample struct {
	Index               int64             `json:"index"`
	RelativeTimeSeconds float64           `json:"relative_time_seconds,omitempty"`
	TimestampSeconds    *float64          `json:"timestamp_seconds,omitempty"`
	Values              []HistoricalValue `json:"values"`
}

type HistoricalPage struct {
	ChannelID string             `json:"channel_id"`
	Start     int64              `json:"start"`
	Sampling  HistoricalSampling `json:"sampling"`
	Samples   []HistoricalSample `json:"samples"`
}

type LMUDuckDBColumn struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type LMUDuckDBChannel struct {
	Name        string            `json:"name"`
	FrequencyHz int               `json:"frequency_hz,omitempty"`
	Unit        string            `json:"unit,omitempty"`
	Columns     []LMUDuckDBColumn `json:"columns"`
}

// LMUDuckDBCatalog contains schema only. It deliberately excludes metadata
// values when Present is false, and always excludes sample rows, so a
// sanitized characterization can be versioned.
type LMUDuckDBCatalog struct {
	Metadata   []LMUDuckDBMetadata `json:"metadata"`
	Continuous []LMUDuckDBChannel  `json:"continuous"`
	Events     []LMUDuckDBChannel  `json:"events"`
}

type LMUDuckDBMetadata struct {
	Key     string  `json:"key"`
	Present bool    `json:"present,omitempty"`
	Value   string  `json:"value,omitempty"`
	Quality Quality `json:"quality,omitempty"`
}

type LMUDuckDBValue struct {
	Kind    ScalarKind
	Number  float64
	Integer int64
	Boolean bool
	Text    string
	Null    bool
	Quality Quality
}

type LMUDuckDBRow struct {
	TimestampSeconds *float64
	Values           []LMUDuckDBValue
}

// LMUDuckDBReader is the narrow boundary for a future concrete DuckDB
// implementation. The historical model remains independent from database/sql,
// CGO, the DuckDB CLI and the live Telemetry Core.
type LMUDuckDBReader interface {
	Catalog(context.Context) (LMUDuckDBCatalog, error)
	ReadRows(context.Context, string, int64, int) ([]LMUDuckDBRow, error)
}

type LMUDuckDBParser struct {
	manifest    Manifest
	reader      LMUDuckDBReader
	maxPageRows int
	mu          sync.RWMutex
	channels    map[string]HistoricalChannel
}

func NewLMUDuckDBParser(manifest Manifest, reader LMUDuckDBReader, maxPageRows int) (*LMUDuckDBParser, error) {
	if reader == nil || maxPageRows <= 0 || maxPageRows > MaxLMUDuckDBPageRows {
		return nil, ErrInvalidHistoricalPage
	}
	if _, err := ParseLMUDuckDBCatalog(manifest, LMUDuckDBCatalog{}); err != nil {
		return nil, err
	}
	return &LMUDuckDBParser{manifest: manifest, reader: reader, maxPageRows: maxPageRows}, nil
}

func (p *LMUDuckDBParser) Inspect(ctx context.Context) (HistoricalSession, error) {
	if err := ctx.Err(); err != nil {
		return HistoricalSession{}, err
	}
	catalog, err := p.reader.Catalog(ctx)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return HistoricalSession{}, ctxErr
		}
		return HistoricalSession{}, ErrHistoricalSource
	}
	session, err := ParseLMUDuckDBCatalog(p.manifest, catalog)
	if err != nil {
		return HistoricalSession{}, err
	}
	channels := make(map[string]HistoricalChannel, len(session.Channels))
	for _, channel := range session.Channels {
		channels[channel.ID] = cloneHistoricalChannel(channel)
	}
	p.mu.Lock()
	p.channels = channels
	p.mu.Unlock()
	return session, nil
}

func (p *LMUDuckDBParser) ReadPage(
	ctx context.Context,
	channelID string,
	start int64,
	limit int,
) (HistoricalPage, error) {
	if err := ctx.Err(); err != nil {
		return HistoricalPage{}, err
	}
	if limit <= 0 || limit > p.maxPageRows || start < 0 {
		return HistoricalPage{}, ErrInvalidHistoricalPage
	}
	p.mu.RLock()
	if p.channels == nil {
		p.mu.RUnlock()
		return HistoricalPage{}, ErrHistoricalNotInspected
	}
	channel, ok := p.channels[channelID]
	p.mu.RUnlock()
	if !ok {
		return HistoricalPage{}, ErrInvalidHistoricalPage
	}
	sourceStart := start
	sourceLimit := limit
	includePredecessor := channel.Sampling.Kind == SamplingEventTimestamped && start > 0
	if includePredecessor {
		sourceStart--
		sourceLimit++
	}
	rows, err := p.reader.ReadRows(ctx, channel.SourceName, sourceStart, sourceLimit)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return HistoricalPage{}, ctxErr
		}
		return HistoricalPage{}, ErrHistoricalSource
	}
	if err := ctx.Err(); err != nil {
		return HistoricalPage{}, err
	}
	if len(rows) > sourceLimit {
		return HistoricalPage{}, ErrInvalidHistoricalPage
	}
	page, err := NormalizeLMUDuckDBPage(channel, sourceStart, rows)
	if err != nil {
		return HistoricalPage{}, err
	}
	page.Start = start
	if includePredecessor && len(page.Samples) > 0 {
		page.Samples = page.Samples[1:]
	}
	return page, nil
}

func cloneHistoricalChannel(channel HistoricalChannel) HistoricalChannel {
	channel.Columns = append([]HistoricalColumn(nil), channel.Columns...)
	return channel
}

func ParseLMUDuckDBCatalog(manifest Manifest, catalog LMUDuckDBCatalog) (HistoricalSession, error) {
	if err := ValidateManifest(manifest); err != nil ||
		manifest.Source.Kind != SourceLMU ||
		manifest.Source.Format != LMUDuckDBParserID ||
		manifest.Parser != (ParserRef{ID: LMUDuckDBParserID, Version: LMUDuckDBParserVersion}) {
		return HistoricalSession{}, fmt.Errorf("%w: manifest", ErrInvalidHistoricalCatalog)
	}
	if err := validateLMUDuckDBCatalog(catalog); err != nil {
		return HistoricalSession{}, err
	}

	fingerprint, err := fingerprintLMUDuckDBCatalog(catalog)
	if err != nil {
		return HistoricalSession{}, fmt.Errorf("%w: fingerprint", ErrInvalidHistoricalCatalog)
	}
	session := HistoricalSession{
		SchemaVersion: HistoricalSchemaVersion,
		ID:            manifest.DedupeKey,
		Provenance: HistoricalProvenance{
			Source: manifest.Source, Parser: manifest.Parser, SchemaFingerprint: fingerprint,
		},
		Metadata: make([]HistoricalMetadata, 0, len(catalog.Metadata)),
		Channels: make([]HistoricalChannel, 0, len(catalog.Continuous)+len(catalog.Events)),
	}
	for _, source := range catalog.Metadata {
		quality := source.Quality
		present := source.Present
		value := source.Value
		if !present {
			value = ""
			switch quality {
			case QualityMissing, QualityInvalid:
			default:
				quality = QualityUnknown
			}
		} else if quality == "" {
			quality = QualityValid
		} else if quality == QualityMissing || quality == QualityInvalid {
			present = false
			value = ""
		}
		session.Metadata = append(session.Metadata, HistoricalMetadata{
			Key: source.Key, Sensitive: sensitiveMetadataKey(source.Key),
			Present: present, Value: value, Quality: quality,
		})
	}
	for _, source := range catalog.Continuous {
		session.Channels = append(session.Channels, historicalChannel(
			len(session.Channels), source, manifest, SamplingContinuousImplicitFrequency,
		))
	}
	for _, source := range catalog.Events {
		session.Channels = append(session.Channels, historicalChannel(
			len(session.Channels), source, manifest, SamplingEventTimestamped,
		))
	}
	return session, nil
}

func historicalChannel(order int, source LMUDuckDBChannel, manifest Manifest, sampling SamplingKind) HistoricalChannel {
	origin := TimeOriginUnknown
	sourceColumns := source.Columns
	if sampling == SamplingEventTimestamped {
		origin = TimeOriginSourceTimestamp
		sourceColumns = source.Columns[1:]
	}
	columns := make([]HistoricalColumn, len(sourceColumns))
	capability := QualityValid
	for index, column := range sourceColumns {
		columns[index] = HistoricalColumn{Name: column.Name, Type: duckDBScalarKind(column.Type)}
		if columns[index].Type == ScalarUnknown {
			capability = QualityUnknown
		}
	}
	unit := HistoricalUnit{Symbol: source.Unit, Quality: QualityValid}
	if strings.TrimSpace(source.Unit) == "" {
		unit = HistoricalUnit{Quality: QualityUnknown}
	}
	frequency := 0
	if sampling == SamplingContinuousImplicitFrequency {
		frequency = source.FrequencyHz
	}
	return HistoricalChannel{
		ID:         historicalChannelID(sampling, source.Name),
		Order:      order,
		SourceName: source.Name,
		Sampling: HistoricalSampling{
			Kind: sampling, FrequencyHz: frequency, Origin: origin,
		},
		Unit: unit, Columns: columns, Capability: capability,
		Provenance: ChannelProvenance{
			SourceTable: source.Name, Parser: manifest.Parser,
			Sampling: sampling, TimeOrigin: origin, Source: manifest.Source,
		},
	}
}

func NormalizeLMUDuckDBPage(channel HistoricalChannel, start int64, rows []LMUDuckDBRow) (HistoricalPage, error) {
	if start < 0 || channel.ID == "" || len(channel.Columns) == 0 {
		return HistoricalPage{}, ErrInvalidHistoricalPage
	}
	if int64(len(rows)) > math.MaxInt64-start {
		return HistoricalPage{}, ErrInvalidHistoricalPage
	}
	if channel.Sampling.Kind == SamplingContinuousImplicitFrequency && channel.Sampling.FrequencyHz <= 0 {
		return HistoricalPage{}, ErrInvalidHistoricalPage
	}
	if channel.Sampling.Kind != SamplingContinuousImplicitFrequency &&
		channel.Sampling.Kind != SamplingEventTimestamped {
		return HistoricalPage{}, ErrInvalidHistoricalPage
	}

	page := HistoricalPage{
		ChannelID: channel.ID, Start: start, Sampling: channel.Sampling,
		Samples: make([]HistoricalSample, 0, len(rows)),
	}
	values := make([]HistoricalValue, len(rows)*len(channel.Columns))
	var previousTimestamp float64
	hasPreviousTimestamp := false
	for rowIndex, row := range rows {
		if len(row.Values) != len(channel.Columns) {
			return HistoricalPage{}, ErrInvalidHistoricalPage
		}
		sample := HistoricalSample{Index: start + int64(rowIndex)}
		switch channel.Sampling.Kind {
		case SamplingContinuousImplicitFrequency:
			if row.TimestampSeconds != nil {
				return HistoricalPage{}, ErrInvalidHistoricalPage
			}
			sample.RelativeTimeSeconds = float64(sample.Index) / float64(channel.Sampling.FrequencyHz)
		case SamplingEventTimestamped:
			if row.TimestampSeconds == nil || math.IsNaN(*row.TimestampSeconds) || math.IsInf(*row.TimestampSeconds, 0) {
				return HistoricalPage{}, ErrInvalidHistoricalPage
			}
			if hasPreviousTimestamp && *row.TimestampSeconds < previousTimestamp {
				return HistoricalPage{}, ErrHistoricalTimestampOrder
			}
			timestamp := *row.TimestampSeconds
			sample.TimestampSeconds = &timestamp
			previousTimestamp = timestamp
			hasPreviousTimestamp = true
		}
		valueOffset := rowIndex * len(channel.Columns)
		sample.Values = values[valueOffset : valueOffset+len(channel.Columns)]
		for valueIndex, source := range row.Values {
			sample.Values[valueIndex] = normalizeHistoricalValue(channel.Columns[valueIndex], source)
		}
		page.Samples = append(page.Samples, sample)
	}
	return page, nil
}

func normalizeHistoricalValue(column HistoricalColumn, source LMUDuckDBValue) HistoricalValue {
	value := HistoricalValue{Column: column.Name, Scalar: HistoricalScalar{Kind: column.Type}}
	if source.Null || source.Quality == QualityMissing {
		value.Quality = QualityMissing
		return value
	}
	if source.Quality == QualityInvalid || !validSourceScalar(source) ||
		(column.Type != ScalarUnknown && source.Kind != column.Type) {
		value.Quality = QualityInvalid
		return value
	}
	value.Present = true
	value.Scalar = HistoricalScalar{
		Kind: source.Kind, Number: source.Number, Integer: source.Integer,
		Boolean: source.Boolean, Text: source.Text,
	}
	switch source.Quality {
	case "", QualityValid:
		value.Quality = QualityValid
	case QualityStale, QualityUnknown:
		value.Quality = source.Quality
	default:
		value.Present = false
		value.Scalar = HistoricalScalar{Kind: column.Type}
		value.Quality = QualityInvalid
	}
	return value
}

func validSourceScalar(value LMUDuckDBValue) bool {
	switch value.Kind {
	case ScalarNumber:
		return !math.IsNaN(value.Number) && !math.IsInf(value.Number, 0)
	case ScalarInteger, ScalarBoolean, ScalarText:
		return true
	default:
		return false
	}
}

// BuildHistoricalLaps converts only the observed "Lap" boundary event. It does
// not infer whether a lap is valid, complete, an in-lap or an out-lap.
func BuildHistoricalLaps(channel HistoricalChannel, samples []HistoricalSample) ([]HistoricalLap, error) {
	if channel.SourceName != "Lap" || channel.Sampling.Kind != SamplingEventTimestamped ||
		len(channel.Columns) != 1 || channel.Columns[0].Type != ScalarInteger {
		return nil, ErrInvalidHistoricalLaps
	}
	laps := make([]HistoricalLap, len(samples))
	for index, sample := range samples {
		if sample.TimestampSeconds == nil || len(sample.Values) != 1 ||
			!sample.Values[0].Present || sample.Values[0].Quality != QualityValid ||
			sample.Values[0].Scalar.Kind != ScalarInteger ||
			math.IsNaN(*sample.TimestampSeconds) || math.IsInf(*sample.TimestampSeconds, 0) ||
			(index > 0 && *sample.TimestampSeconds < laps[index-1].StartSeconds) {
			return nil, ErrInvalidHistoricalLaps
		}
		number := sample.Values[0].Scalar.Integer
		if index > 0 && number <= laps[index-1].Number {
			return nil, ErrInvalidHistoricalLaps
		}
		laps[index] = HistoricalLap{
			Number: number, StartSeconds: *sample.TimestampSeconds,
			Boundary: QualityValid, Validity: QualityUnknown,
		}
		if index > 0 {
			end := *sample.TimestampSeconds
			laps[index-1].EndSeconds = &end
		}
	}
	return laps, nil
}

func validateLMUDuckDBCatalog(catalog LMUDuckDBCatalog) error {
	if len(catalog.Metadata) > maxHistoricalMetadata ||
		len(catalog.Continuous)+len(catalog.Events) > maxHistoricalChannels {
		return ErrInvalidHistoricalCatalog
	}
	names := make(map[string]struct{}, len(catalog.Continuous)+len(catalog.Events))
	metadata := make(map[string]struct{}, len(catalog.Metadata))
	for _, field := range catalog.Metadata {
		if !validHistoricalName(field.Key) || !validHistoricalUnit(field.Value) ||
			(field.Quality != "" && field.Quality != QualityValid &&
				field.Quality != QualityStale && field.Quality != QualityMissing &&
				field.Quality != QualityInvalid && field.Quality != QualityUnknown) {
			return ErrInvalidHistoricalCatalog
		}
		key := strings.ToLower(field.Key)
		if _, duplicate := metadata[key]; duplicate {
			return ErrInvalidHistoricalCatalog
		}
		metadata[key] = struct{}{}
	}
	for _, channel := range catalog.Continuous {
		if err := validateLMUDuckDBChannel(channel, SamplingContinuousImplicitFrequency, names); err != nil {
			return err
		}
	}
	for _, channel := range catalog.Events {
		if err := validateLMUDuckDBChannel(channel, SamplingEventTimestamped, names); err != nil {
			return err
		}
	}
	return nil
}

func validateLMUDuckDBChannel(channel LMUDuckDBChannel, sampling SamplingKind, names map[string]struct{}) error {
	if !validHistoricalName(channel.Name) || len(channel.Columns) == 0 ||
		len(channel.Columns) > maxHistoricalColumns || !validHistoricalUnit(channel.Unit) {
		return ErrInvalidHistoricalCatalog
	}
	name := strings.ToLower(channel.Name)
	if _, duplicate := names[name]; duplicate {
		return ErrInvalidHistoricalCatalog
	}
	names[name] = struct{}{}
	columns := make(map[string]struct{}, len(channel.Columns))
	for _, column := range channel.Columns {
		if !validHistoricalName(column.Name) || !validHistoricalName(column.Type) {
			return ErrInvalidHistoricalCatalog
		}
		name := strings.ToLower(column.Name)
		if _, duplicate := columns[name]; duplicate {
			return ErrInvalidHistoricalCatalog
		}
		columns[name] = struct{}{}
	}
	switch sampling {
	case SamplingContinuousImplicitFrequency:
		if channel.FrequencyHz <= 0 {
			return ErrInvalidHistoricalCatalog
		}
		for _, column := range channel.Columns {
			if strings.EqualFold(column.Name, "ts") {
				return ErrInvalidHistoricalCatalog
			}
		}
	case SamplingEventTimestamped:
		if channel.FrequencyHz != 0 || len(channel.Columns) < 2 ||
			channel.Columns[0].Name != "ts" || !strings.EqualFold(channel.Columns[0].Type, "DOUBLE") {
			return ErrInvalidHistoricalCatalog
		}
	default:
		return ErrInvalidHistoricalCatalog
	}
	return nil
}

func fingerprintLMUDuckDBCatalog(catalog LMUDuckDBCatalog) (string, error) {
	metadataKeys := make([]string, len(catalog.Metadata))
	for index, field := range catalog.Metadata {
		metadataKeys[index] = field.Key
	}
	canonical := struct {
		MetadataKeys []string           `json:"metadata_keys"`
		Continuous   []LMUDuckDBChannel `json:"continuous"`
		Events       []LMUDuckDBChannel `json:"events"`
	}{
		MetadataKeys: metadataKeys,
		Continuous:   append([]LMUDuckDBChannel(nil), catalog.Continuous...),
		Events:       append([]LMUDuckDBChannel(nil), catalog.Events...),
	}
	sort.Strings(canonical.MetadataKeys)
	sort.Slice(canonical.Continuous, func(i, j int) bool {
		return canonical.Continuous[i].Name < canonical.Continuous[j].Name
	})
	sort.Slice(canonical.Events, func(i, j int) bool {
		return canonical.Events[i].Name < canonical.Events[j].Name
	})
	encoded, err := json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func historicalChannelID(sampling SamplingKind, name string) string {
	sum := sha256.Sum256([]byte(string(sampling) + "\x00" + name))
	return "lmu-duckdb/" + hex.EncodeToString(sum[:8])
}

func duckDBScalarKind(dataType string) ScalarKind {
	switch strings.ToUpper(dataType) {
	case "FLOAT", "DOUBLE", "REAL":
		return ScalarNumber
	case "TINYINT", "SMALLINT", "INTEGER", "BIGINT",
		"UTINYINT", "USMALLINT", "UINTEGER":
		return ScalarInteger
	case "BOOLEAN":
		return ScalarBoolean
	case "VARCHAR":
		return ScalarText
	default:
		return ScalarUnknown
	}
}

func sensitiveMetadataKey(key string) bool {
	switch strings.ToLower(key) {
	case "carclass", "carname", "sessiontype", "tracklayout", "trackname",
		"version", "weatherconditions":
		return false
	default:
		return true
	}
}

func validHistoricalName(value string) bool {
	if value == "" || len(value) > maxHistoricalNameLen {
		return false
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return false
		}
	}
	return true
}

func validHistoricalUnit(value string) bool {
	if len(value) > maxHistoricalNameLen {
		return false
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return false
		}
	}
	return true
}
