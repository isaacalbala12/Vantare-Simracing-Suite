package duckdbadapter

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

const (
	handshakeTimeout = 5 * time.Second
	catalogTimeout   = 15 * time.Second
	pageTimeout      = 30 * time.Second
)

var ErrInvalidReader = errors.New("invalid telemetry analysis reader")

// Reader is the concrete, process-isolated LMU DuckDB adapter. It receives
// only a private staged copy; the original user path never crosses this
// boundary or the helper IPC protocol.
type Reader struct {
	runtime          Runtime
	artifactEvidence telemetryanalysis.HistoricalArtifactEvidence
	stagedEvidence   telemetryanalysis.HistoricalArtifactEvidence
	request          artifactRequest
	mu               sync.Mutex
	session          *readerSession
	closed           bool
}

func NewReader(
	runtime Runtime,
	artifact telemetryanalysis.AuthorizedHistoricalArtifact,
	staged telemetryanalysis.StagedHistoricalArtifact,
) (*Reader, error) {
	authorized := artifact.Evidence()
	stagedPath := staged.Path()
	stagedDirectory := staged.Directory()
	stagedEvidence := staged.Evidence()
	if !filepath.IsAbs(stagedPath) || filepath.Clean(stagedPath) != stagedPath ||
		filepath.Base(stagedPath) != "session.duckdb" || filepath.Dir(stagedPath) != stagedDirectory ||
		authorized.ContentSHA256 == "" || authorized.ContentSHA256 != stagedEvidence.ContentSHA256 ||
		authorized.Metadata.Size < 0 || authorized.Metadata.Size != stagedEvidence.Metadata.Size {
		return nil, ErrInvalidReader
	}
	info, err := os.Lstat(stagedPath)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() != stagedEvidence.Metadata.Size {
		return nil, ErrInvalidReader
	}
	return &Reader{
		runtime:          runtime,
		artifactEvidence: authorized,
		stagedEvidence:   stagedEvidence,
		request: artifactRequest{
			Path: stagedPath, Size: stagedEvidence.Metadata.Size, SHA256: stagedEvidence.ContentSHA256,
		},
	}, nil
}

func (reader *Reader) Handshake(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, handshakeTimeout)
	defer cancel()
	answer, err := reader.do(ctx, request{Operation: operationHandshake})
	if err != nil {
		return err
	}
	if answer.Handshake == nil || !validHandshake(*answer.Handshake) {
		return ErrProtocol
	}
	return nil
}

func (reader *Reader) ArtifactEvidence(ctx context.Context) (telemetryanalysis.HistoricalArtifactEvidence, error) {
	ctx, cancel := context.WithTimeout(ctx, catalogTimeout)
	defer cancel()
	answer, err := reader.do(ctx, request{Operation: operationEvidence, Artifact: &reader.request})
	if err != nil {
		return telemetryanalysis.HistoricalArtifactEvidence{}, err
	}
	if answer.Evidence == nil || answer.Catalog != nil || answer.BatchPayload != "" ||
		answer.Evidence.Size != reader.stagedEvidence.Metadata.Size || answer.Evidence.SHA256 != reader.stagedEvidence.ContentSHA256 {
		return telemetryanalysis.HistoricalArtifactEvidence{}, ErrArtifactChanged
	}
	return reader.artifactEvidence, nil
}

func (reader *Reader) Catalog(ctx context.Context) (telemetryanalysis.LMUDuckDBCatalog, error) {
	ctx, cancel := context.WithTimeout(ctx, catalogTimeout)
	defer cancel()
	answer, err := reader.do(ctx, request{Operation: operationCatalog, Artifact: &reader.request})
	if err != nil {
		return telemetryanalysis.LMUDuckDBCatalog{}, err
	}
	if answer.Catalog == nil || answer.Evidence != nil || answer.BatchPayload != "" {
		return telemetryanalysis.LMUDuckDBCatalog{}, ErrProtocol
	}
	return mapCatalog(*answer.Catalog), nil
}

func (reader *Reader) ReadRows(ctx context.Context, sourceTable string, start int64, limit int) ([]telemetryanalysis.LMUDuckDBRow, error) {
	if sourceTable == "" || start < 0 || limit <= 0 || limit > telemetryanalysis.MaxLMUDuckDBPageRows {
		return nil, telemetryanalysis.ErrInvalidHistoricalPage
	}
	ctx, cancel := context.WithTimeout(ctx, pageTimeout)
	defer cancel()
	answer, err := reader.do(ctx, request{
		Operation: operationReadRows,
		Artifact:  &reader.request,
		ReadRows:  &readRowsRequest{SourceTable: sourceTable, Start: start, Limit: limit},
	})
	if err != nil {
		return nil, err
	}
	if answer.Catalog != nil || answer.Evidence != nil || answer.BatchPayload == "" {
		return nil, ErrProtocol
	}
	batch, err := decodeRowBatch(answer.BatchPayload)
	if err != nil || batch.RowCount > limit {
		return nil, ErrProtocol
	}
	return mapBatch(batch)
}

func (reader *Reader) do(ctx context.Context, frameRequest request) (response, error) {
	reader.mu.Lock()
	defer reader.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return response{}, err
	}
	if reader.closed {
		return response{}, ErrRuntimeUnavailable
	}
	if reader.session == nil {
		session, err := startReaderSession(reader.runtime.Trust, reader.request)
		if err != nil {
			return response{}, err
		}
		reader.session = session
	}
	answer, err := reader.session.roundTrip(ctx, frameRequest)
	if reader.session.closed {
		reader.session = nil
	}
	return answer, err
}

// Close terminates the bounded helper session and releases all locked runtime
// handles. It is safe to call more than once.
func (reader *Reader) Close() error {
	reader.mu.Lock()
	defer reader.mu.Unlock()
	if reader.closed {
		return nil
	}
	reader.closed = true
	if reader.session == nil {
		return nil
	}
	err := reader.session.close()
	reader.session = nil
	return err
}

func mapCatalog(source wireCatalog) telemetryanalysis.LMUDuckDBCatalog {
	catalog := telemetryanalysis.LMUDuckDBCatalog{
		Metadata:   make([]telemetryanalysis.LMUDuckDBMetadata, len(source.Metadata)),
		Continuous: mapChannels(source.Continuous),
		Events:     mapChannels(source.Events),
	}
	for index, metadata := range source.Metadata {
		catalog.Metadata[index] = telemetryanalysis.LMUDuckDBMetadata{
			Key: metadata.Key, Present: metadata.Present, Value: metadata.Value, Quality: telemetryanalysis.Quality(metadata.Quality),
		}
	}
	return catalog
}

func mapChannels(source []wireChannel) []telemetryanalysis.LMUDuckDBChannel {
	channels := make([]telemetryanalysis.LMUDuckDBChannel, len(source))
	for index, channel := range source {
		channels[index] = telemetryanalysis.LMUDuckDBChannel{
			Name: channel.Name, FrequencyHz: channel.FrequencyHz, Unit: channel.Unit,
			Columns: make([]telemetryanalysis.LMUDuckDBColumn, len(channel.Columns)),
		}
		for columnIndex, column := range channel.Columns {
			channels[index].Columns[columnIndex] = telemetryanalysis.LMUDuckDBColumn{Name: column.Name, Type: column.Type}
		}
	}
	return channels
}

func mapBatch(batch wireRowBatch) ([]telemetryanalysis.LMUDuckDBRow, error) {
	if batch.RowCount < 0 || batch.RowCount > telemetryanalysis.MaxLMUDuckDBPageRows ||
		len(batch.TimestampSeconds) != 0 && len(batch.TimestampSeconds) != batch.RowCount {
		return nil, ErrProtocol
	}
	rows := make([]telemetryanalysis.LMUDuckDBRow, batch.RowCount)
	values := make([]telemetryanalysis.LMUDuckDBValue, batch.RowCount*len(batch.Columns))
	for rowIndex := range rows {
		start := rowIndex * len(batch.Columns)
		rows[rowIndex].Values = values[start : start+len(batch.Columns)]
		if len(batch.TimestampSeconds) != 0 {
			timestamp := batch.TimestampSeconds[rowIndex]
			rows[rowIndex].TimestampSeconds = &timestamp
		}
	}
	for columnIndex, vector := range batch.Columns {
		if !validVectorLength(vector, batch.RowCount) {
			return nil, ErrProtocol
		}
		nulls := make([]bool, batch.RowCount)
		for _, index := range vector.NullIndexes {
			if index < 0 || index >= batch.RowCount {
				return nil, ErrProtocol
			}
			if nulls[index] {
				return nil, ErrProtocol
			}
			nulls[index] = true
		}
		qualities := make([]telemetryanalysis.Quality, batch.RowCount)
		qualitySet := make([]bool, batch.RowCount)
		for _, override := range vector.QualityOverrides {
			quality := telemetryanalysis.Quality(override.Quality)
			if override.Index < 0 || override.Index >= batch.RowCount || !validWireQuality(quality) {
				return nil, ErrProtocol
			}
			if qualitySet[override.Index] {
				return nil, ErrProtocol
			}
			qualities[override.Index] = quality
			qualitySet[override.Index] = true
		}
		for rowIndex := range rows {
			value := telemetryanalysis.LMUDuckDBValue{Kind: telemetryanalysis.ScalarKind(vector.Kind), Quality: telemetryanalysis.QualityValid}
			switch vector.Kind {
			case "number":
				value.Number = vector.Numbers[rowIndex]
			case "integer":
				value.Integer = vector.Integers[rowIndex]
			case "boolean":
				value.Boolean = vector.Booleans[rowIndex]
			case "text":
				value.Text = vector.Texts[rowIndex]
			case "unknown":
			default:
				return nil, ErrProtocol
			}
			if nulls[rowIndex] {
				value.Null = true
				value.Quality = telemetryanalysis.QualityMissing
			}
			if qualitySet[rowIndex] {
				value.Quality = qualities[rowIndex]
			}
			rows[rowIndex].Values[columnIndex] = value
		}
	}
	return rows, nil
}

func validVectorLength(vector wireColumnVector, rows int) bool {
	lengths := []int{len(vector.Numbers), len(vector.Integers), len(vector.Booleans), len(vector.Texts)}
	for index, length := range lengths {
		want := 0
		if index == 0 && vector.Kind == "number" || index == 1 && vector.Kind == "integer" ||
			index == 2 && vector.Kind == "boolean" || index == 3 && vector.Kind == "text" {
			want = rows
		}
		if length != want {
			return false
		}
	}
	return vector.Kind == "number" || vector.Kind == "integer" || vector.Kind == "boolean" || vector.Kind == "text" || vector.Kind == "unknown"
}

func validWireQuality(quality telemetryanalysis.Quality) bool {
	switch quality {
	case telemetryanalysis.QualityValid, telemetryanalysis.QualityStale, telemetryanalysis.QualityMissing,
		telemetryanalysis.QualityInvalid, telemetryanalysis.QualityUnknown:
		return true
	default:
		return false
	}
}

func (reader *Reader) String() string {
	return fmt.Sprintf("LMU DuckDB reader (%s)", reader.stagedEvidence.ContentSHA256[:12])
}

var _ telemetryanalysis.LMUDuckDBReader = (*Reader)(nil)
