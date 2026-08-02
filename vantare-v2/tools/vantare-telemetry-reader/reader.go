package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/vantare/overlays/v2/tools/vantare-telemetry-reader/internal/protocol"
)

const maxPageRows = 16_384

var (
	errArtifactChanged = errors.New("artifact evidence changed")
	errInvalidRequest  = errors.New("invalid reader request")
)

type duckDBReader struct {
	db       *sql.DB
	artifact protocol.ArtifactRequest
	catalog  protocol.Catalog
}

func openReader(ctx context.Context, artifact protocol.ArtifactRequest) (*duckDBReader, error) {
	if err := validateArtifactPath(artifact); err != nil {
		return nil, err
	}
	before, err := inspectArtifact(artifact.Path)
	if err != nil || before.Size != artifact.Size || before.SHA256 != artifact.SHA256 {
		return nil, errArtifactChanged
	}
	extensionDirectory := filepath.Join(filepath.Dir(artifact.Path), "extensions")
	tempDirectory := filepath.Join(filepath.Dir(artifact.Path), "temp")
	for _, directory := range []string{extensionDirectory, tempDirectory} {
		if err := os.Mkdir(directory, 0o700); err != nil && !errors.Is(err, os.ErrExist) {
			return nil, errInvalidRequest
		}
		if err := os.Chmod(directory, 0o700); err != nil {
			return nil, errInvalidRequest
		}
	}
	db, err := sql.Open("duckdb", artifact.Path+"?access_mode=read_only")
	if err != nil {
		return nil, errInvalidRequest
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	reader := &duckDBReader{db: db, artifact: artifact}
	if err := reader.prepare(ctx, extensionDirectory, tempDirectory); err != nil {
		db.Close()
		return nil, err
	}
	catalog, err := reader.readCatalog(ctx)
	if err != nil {
		db.Close()
		return nil, err
	}
	reader.catalog = catalog
	return reader, nil
}

func (reader *duckDBReader) Close() error { return reader.db.Close() }

func (reader *duckDBReader) prepare(ctx context.Context, extensionDirectory, tempDirectory string) error {
	settings := []struct {
		query string
		value any
	}{
		{`SET extension_directory = ?`, extensionDirectory},
		{`SET temp_directory = ?`, tempDirectory},
		{`SET threads = 2`, nil},
		{`SET memory_limit = '256MB'`, nil},
		{`SET max_temp_directory_size = '64MB'`, nil},
		{`SET autoinstall_known_extensions = false`, nil},
		{`SET autoload_known_extensions = false`, nil},
		{`SET allow_community_extensions = false`, nil},
		{`SET enable_external_access = false`, nil},
		{`SET lock_configuration = true`, nil},
	}
	for _, setting := range settings {
		var err error
		if setting.value == nil {
			_, err = reader.db.ExecContext(ctx, setting.query)
		} else {
			_, err = reader.db.ExecContext(ctx, setting.query, setting.value)
		}
		if err != nil {
			return errInvalidRequest
		}
	}
	return nil
}

func (reader *duckDBReader) Catalog(ctx context.Context) (protocol.Catalog, error) {
	if err := reader.revalidate(ctx); err != nil {
		return protocol.Catalog{}, err
	}
	return reader.catalog, nil
}

func (reader *duckDBReader) ReadRows(ctx context.Context, sourceTable string, start int64, limit int) ([]protocol.Row, error) {
	batch, err := reader.ReadBatch(ctx, sourceTable, start, limit)
	if err != nil {
		return nil, err
	}
	return batchToRows(batch), nil
}

// ReadBatch materializes DuckDB rows directly into column vectors. Avoiding an
// intermediate object per scalar keeps the isolated helper within the measured
// TA-03B paging envelope without weakening the process boundary.
func (reader *duckDBReader) ReadBatch(ctx context.Context, sourceTable string, start int64, limit int) (protocol.RowBatch, error) {
	if start < 0 || limit <= 0 || limit > maxPageRows || int64(limit) > math.MaxInt64-start {
		return protocol.RowBatch{}, errInvalidRequest
	}
	channel, event, ok := findChannel(reader.catalog, sourceTable)
	if !ok {
		return protocol.RowBatch{}, errInvalidRequest
	}
	if err := reader.revalidate(ctx); err != nil {
		return protocol.RowBatch{}, err
	}
	columns := channel.Columns
	valueColumns := columns
	if event {
		valueColumns = columns[1:]
	}
	selectColumns := make([]string, len(columns))
	for index, column := range columns {
		selectColumns[index] = quoteIdentifier(column.Name)
	}
	var query string
	var queryArgs []any
	if event {
		query = "SELECT " + strings.Join(selectColumns, ", ") + " FROM " + quoteIdentifier(channel.Name) +
			" ORDER BY " + quoteIdentifier("ts") + ", rowid LIMIT ? OFFSET ?"
		queryArgs = []any{limit, start}
	} else {
		// A rowid range preserves the canonical physical sample order while
		// allowing DuckDB to skip earlier row groups. LIMIT/OFFSET with an
		// ORDER BY rowid sorts and scans the prefix again for every page.
		query = "SELECT " + strings.Join(selectColumns, ", ") + " FROM " + quoteIdentifier(channel.Name) +
			" WHERE rowid >= ? AND rowid < ? ORDER BY rowid"
		queryArgs = []any{start, start + int64(limit)}
	}
	rows, err := reader.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return protocol.RowBatch{}, errInvalidRequest
	}
	defer rows.Close()
	batch := protocol.RowBatch{Columns: make([]protocol.ColumnVector, len(valueColumns))}
	if event {
		batch.TimestampSeconds = make([]float64, 0, limit)
	}
	for index, column := range valueColumns {
		batch.Columns[index] = newColumnVector(column.Type, limit)
	}
	destinations := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for index := range destinations {
		pointers[index] = &destinations[index]
	}
	for rows.Next() {
		for index := range destinations {
			destinations[index] = nil
		}
		if err := rows.Scan(pointers...); err != nil {
			return protocol.RowBatch{}, errInvalidRequest
		}
		valueOffset := 0
		if event {
			timestamp, ok := asFloat64(destinations[0])
			if !ok {
				return protocol.RowBatch{}, errInvalidRequest
			}
			batch.TimestampSeconds = append(batch.TimestampSeconds, timestamp)
			valueOffset = 1
		}
		for index, column := range valueColumns {
			if err := appendScalar(&batch.Columns[index], scalarValue(destinations[index+valueOffset], column.Type), batch.RowCount); err != nil {
				return protocol.RowBatch{}, err
			}
		}
		batch.RowCount++
		if batch.RowCount > limit {
			return protocol.RowBatch{}, errInvalidRequest
		}
	}
	if err := rows.Err(); err != nil {
		return protocol.RowBatch{}, errInvalidRequest
	}
	if err := reader.revalidate(ctx); err != nil {
		return protocol.RowBatch{}, err
	}
	return batch, nil
}

func newColumnVector(duckType string, capacity int) protocol.ColumnVector {
	vector := protocol.ColumnVector{Kind: "unknown", DuckType: duckType}
	switch strings.ToUpper(duckType) {
	case "FLOAT", "DOUBLE", "REAL":
		vector.Kind = "number"
		vector.Numbers = make([]float64, 0, capacity)
	case "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "UTINYINT", "USMALLINT", "UINTEGER":
		vector.Kind = "integer"
		vector.Integers = make([]int64, 0, capacity)
	case "BOOLEAN":
		vector.Kind = "boolean"
		vector.Booleans = make([]bool, 0, capacity)
	case "VARCHAR":
		vector.Kind = "text"
		vector.Texts = make([]string, 0, capacity)
	}
	return vector
}

func appendScalar(vector *protocol.ColumnVector, scalar protocol.Scalar, rowIndex int) error {
	if scalar.Null {
		vector.NullIndexes = append(vector.NullIndexes, rowIndex)
	}
	if !scalar.Null && scalar.Kind != vector.Kind {
		return errInvalidRequest
	}
	switch vector.Kind {
	case "number":
		vector.Numbers = append(vector.Numbers, scalar.Number)
	case "integer":
		vector.Integers = append(vector.Integers, scalar.Integer)
	case "boolean":
		vector.Booleans = append(vector.Booleans, scalar.Boolean)
	case "text":
		vector.Texts = append(vector.Texts, scalar.Text)
	case "unknown":
	default:
		return errInvalidRequest
	}
	if scalar.Quality != "valid" && !scalar.Null {
		vector.QualityOverrides = append(vector.QualityOverrides, protocol.QualityOverride{Index: rowIndex, Quality: scalar.Quality})
	}
	return nil
}

func batchToRows(batch protocol.RowBatch) []protocol.Row {
	rows := make([]protocol.Row, batch.RowCount)
	for rowIndex := range rows {
		rows[rowIndex].Values = make([]protocol.Scalar, len(batch.Columns))
		if len(batch.TimestampSeconds) != 0 {
			timestamp := batch.TimestampSeconds[rowIndex]
			rows[rowIndex].TimestampSeconds = &timestamp
		}
	}
	for columnIndex, vector := range batch.Columns {
		nulls := make(map[int]struct{}, len(vector.NullIndexes))
		for _, index := range vector.NullIndexes {
			nulls[index] = struct{}{}
		}
		for rowIndex := range rows {
			value := protocol.Scalar{Kind: vector.Kind, DuckType: vector.DuckType, Quality: "valid"}
			switch vector.Kind {
			case "number":
				value.Number = vector.Numbers[rowIndex]
			case "integer":
				value.Integer = vector.Integers[rowIndex]
			case "boolean":
				value.Boolean = vector.Booleans[rowIndex]
			case "text":
				value.Text = vector.Texts[rowIndex]
			}
			if _, null := nulls[rowIndex]; null {
				value.Null = true
				value.Quality = "missing"
			}
			rows[rowIndex].Values[columnIndex] = value
		}
	}
	return rows
}

func (reader *duckDBReader) revalidate(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	info, err := os.Lstat(reader.artifact.Path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() != reader.artifact.Size {
		return errArtifactChanged
	}
	if _, err := os.Lstat(reader.artifact.Path + ".wal"); err == nil || !errors.Is(err, os.ErrNotExist) {
		return errArtifactChanged
	}
	return nil
}

func (reader *duckDBReader) readCatalog(ctx context.Context) (protocol.Catalog, error) {
	catalog := protocol.Catalog{}
	metadataRows, err := reader.db.QueryContext(ctx, `SELECT key, value FROM "metadata" ORDER BY lower(key), key`)
	if err != nil {
		return catalog, errInvalidRequest
	}
	for metadataRows.Next() {
		var key, value string
		if err := metadataRows.Scan(&key, &value); err != nil {
			metadataRows.Close()
			return catalog, errInvalidRequest
		}
		if !publicMetadata(key) {
			continue
		}
		item := protocol.Metadata{Key: key, Present: true, Value: value, Quality: "valid"}
		catalog.Metadata = append(catalog.Metadata, item)
		if len(catalog.Metadata) > 512 {
			metadataRows.Close()
			return catalog, errInvalidRequest
		}
	}
	if err := metadataRows.Err(); err != nil {
		metadataRows.Close()
		return catalog, errInvalidRequest
	}
	if err := metadataRows.Close(); err != nil {
		return catalog, errInvalidRequest
	}
	continuous, err := reader.channelList(ctx, `SELECT channelName, frequency, unit FROM "channelsList" ORDER BY lower(channelName), channelName`, false)
	if err != nil {
		return catalog, err
	}
	events, err := reader.channelList(ctx, `SELECT eventName, 0, unit FROM "eventsList" ORDER BY lower(eventName), eventName`, true)
	if err != nil {
		return catalog, err
	}
	catalog.Continuous, catalog.Events = continuous, events
	return catalog, nil
}

func (reader *duckDBReader) channelList(ctx context.Context, query string, event bool) ([]protocol.Channel, error) {
	rows, err := reader.db.QueryContext(ctx, query)
	if err != nil {
		return nil, errInvalidRequest
	}
	channels := make([]protocol.Channel, 0)
	for rows.Next() {
		var channel protocol.Channel
		if err := rows.Scan(&channel.Name, &channel.FrequencyHz, &channel.Unit); err != nil {
			rows.Close()
			return nil, errInvalidRequest
		}
		channels = append(channels, channel)
		if len(channels) > 1024 {
			rows.Close()
			return nil, errInvalidRequest
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, errInvalidRequest
	}
	if err := rows.Close(); err != nil {
		return nil, errInvalidRequest
	}
	for index := range channels {
		columns, err := reader.columns(ctx, channels[index].Name)
		if err != nil {
			return nil, err
		}
		if event && (len(columns) < 2 || !strings.EqualFold(columns[0].Name, "ts")) {
			return nil, errInvalidRequest
		}
		channels[index].Columns = columns
	}
	return channels, nil
}

func (reader *duckDBReader) columns(ctx context.Context, table string) ([]protocol.Column, error) {
	rows, err := reader.db.QueryContext(ctx, `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'main' AND table_name = ? ORDER BY ordinal_position`, table)
	if err != nil {
		return nil, errInvalidRequest
	}
	defer rows.Close()
	columns := make([]protocol.Column, 0)
	for rows.Next() {
		var column protocol.Column
		if err := rows.Scan(&column.Name, &column.Type); err != nil {
			return nil, errInvalidRequest
		}
		columns = append(columns, column)
		if len(columns) > 64 {
			return nil, errInvalidRequest
		}
	}
	if len(columns) == 0 || rows.Err() != nil {
		return nil, errInvalidRequest
	}
	return columns, nil
}

func inspectArtifact(path string) (protocol.Evidence, error) {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return protocol.Evidence{}, errArtifactChanged
	}
	if _, err := os.Lstat(path + ".wal"); err == nil || !errors.Is(err, os.ErrNotExist) {
		return protocol.Evidence{}, errArtifactChanged
	}
	file, err := os.Open(path)
	if err != nil {
		return protocol.Evidence{}, errArtifactChanged
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return protocol.Evidence{}, errArtifactChanged
	}
	return protocol.Evidence{Size: info.Size(), SHA256: hex.EncodeToString(hash.Sum(nil))}, nil
}

func validateArtifactPath(artifact protocol.ArtifactRequest) error {
	if !filepath.IsAbs(artifact.Path) || filepath.Base(artifact.Path) != "session.duckdb" || artifact.Size < 0 || len(artifact.SHA256) != 64 {
		return errInvalidRequest
	}
	if _, err := hex.DecodeString(artifact.SHA256); err != nil {
		return errInvalidRequest
	}
	return nil
}

func findChannel(catalog protocol.Catalog, name string) (protocol.Channel, bool, bool) {
	for _, channel := range catalog.Continuous {
		if channel.Name == name {
			return channel, false, true
		}
	}
	for _, channel := range catalog.Events {
		if channel.Name == name {
			return channel, true, true
		}
	}
	return protocol.Channel{}, false, false
}

func publicMetadata(key string) bool {
	switch strings.ToLower(key) {
	case "carclass", "carname", "sessiontype", "tracklayout", "trackname", "version", "weatherconditions":
		return true
	default:
		return false
	}
}

func scalarValue(value any, duckType string) protocol.Scalar {
	scalar := protocol.Scalar{Quality: "valid"}
	if value == nil {
		scalar.Kind = "unknown"
		scalar.Null = true
		scalar.Quality = "missing"
		return scalar
	}
	switch typed := value.(type) {
	case bool:
		scalar.Kind = "boolean"
		scalar.Boolean = typed
	case int8:
		scalar.Kind = "integer"
		scalar.Integer = int64(typed)
	case int16:
		scalar.Kind = "integer"
		scalar.Integer = int64(typed)
	case int32:
		scalar.Kind = "integer"
		scalar.Integer = int64(typed)
	case int64:
		scalar.Kind = "integer"
		scalar.Integer = typed
	case uint8:
		scalar.Kind = "integer"
		scalar.Integer = int64(typed)
	case uint16:
		scalar.Kind = "integer"
		scalar.Integer = int64(typed)
	case uint32:
		scalar.Kind = "integer"
		scalar.Integer = int64(typed)
	case float32:
		scalar.Kind = "number"
		scalar.Number = float64(typed)
	case float64:
		scalar.Kind = "number"
		scalar.Number = typed
	case string:
		scalar.Kind = "text"
		scalar.Text = typed
	case []byte:
		scalar.Kind = "text"
		scalar.Text = string(typed)
	default:
		scalar.Kind = "unknown"
		scalar.DuckType = duckType
		scalar.Quality = "unknown"
	}
	return scalar
}

func asFloat64(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	default:
		return 0, false
	}
}

func quoteIdentifier(value string) string { return `"` + strings.ReplaceAll(value, `"`, `""`) + `"` }

func sortedOperations() []protocol.Operation {
	operations := []protocol.Operation{protocol.OperationCatalog, protocol.OperationEvidence, protocol.OperationHandshake, protocol.OperationReadRows}
	sort.Slice(operations, func(i, j int) bool { return operations[i] < operations[j] })
	return operations
}
