package duckdbadapter

import "sort"

type operation string

const (
	operationHandshake operation = "handshake"
	operationCatalog   operation = "catalog"
	operationReadRows  operation = "read_rows"
	operationEvidence  operation = "evidence"
)

type artifactRequest struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type readRowsRequest struct {
	SourceTable string `json:"source_table"`
	Start       int64  `json:"start"`
	Limit       int    `json:"limit"`
}

type handshakeRequest struct {
	HelperVersion string `json:"helper_version"`
	DuckDBVersion string `json:"duckdb_version"`
	SchemaVersion int    `json:"schema_version"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
}

type request struct {
	ProtocolVersion int               `json:"protocol_version"`
	RequestID       string            `json:"request_id"`
	Operation       operation         `json:"operation"`
	Handshake       *handshakeRequest `json:"handshake,omitempty"`
	Artifact        *artifactRequest  `json:"artifact,omitempty"`
	ReadRows        *readRowsRequest  `json:"read_rows,omitempty"`
}

type wireColumn struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type wireChannel struct {
	Name        string       `json:"name"`
	FrequencyHz int          `json:"frequency_hz,omitempty"`
	Unit        string       `json:"unit,omitempty"`
	Columns     []wireColumn `json:"columns"`
}

type wireMetadata struct {
	Key     string `json:"key"`
	Present bool   `json:"present,omitempty"`
	Value   string `json:"value,omitempty"`
	Quality string `json:"quality,omitempty"`
}

type wireCatalog struct {
	Metadata   []wireMetadata `json:"metadata"`
	Continuous []wireChannel  `json:"continuous"`
	Events     []wireChannel  `json:"events"`
}

type wireQualityOverride struct {
	Index   int    `json:"index"`
	Quality string `json:"quality"`
}

type wireColumnVector struct {
	Kind             string                `json:"kind"`
	Numbers          []float64             `json:"numbers,omitempty"`
	Integers         []int64               `json:"integers,omitempty"`
	Booleans         []bool                `json:"booleans,omitempty"`
	Texts            []string              `json:"texts,omitempty"`
	NullIndexes      []int                 `json:"null_indexes,omitempty"`
	QualityOverrides []wireQualityOverride `json:"quality_overrides,omitempty"`
	DuckType         string                `json:"duckdb_type,omitempty"`
}

type wireRowBatch struct {
	RowCount         int                `json:"row_count"`
	TimestampSeconds []float64          `json:"timestamp_seconds,omitempty"`
	Columns          []wireColumnVector `json:"columns"`
}

type wireEvidence struct {
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type handshakeResponse struct {
	HelperVersion       string      `json:"helper_version"`
	DuckDBVersion       string      `json:"duckdb_version"`
	SchemaVersion       int         `json:"schema_version"`
	OS                  string      `json:"os"`
	Arch                string      `json:"arch"`
	SupportedOperations []operation `json:"supported_operations"`
}

type response struct {
	ProtocolVersion int                `json:"protocol_version"`
	RequestID       string             `json:"request_id"`
	Operation       operation          `json:"operation"`
	OK              bool               `json:"ok"`
	Handshake       *handshakeResponse `json:"handshake,omitempty"`
	Catalog         *wireCatalog       `json:"catalog,omitempty"`
	BatchPayload    string             `json:"batch_payload,omitempty"`
	Evidence        *wireEvidence      `json:"evidence,omitempty"`
	ErrorCode       string             `json:"error_code,omitempty"`
}

func expectedHandshakeRequest() *handshakeRequest {
	return &handshakeRequest{HelperVersion: HelperVersion, DuckDBVersion: DuckDBVersion, SchemaVersion: SchemaVersion, OS: "windows", Arch: "amd64"}
}

func supportedOperations() []operation {
	operations := []operation{operationCatalog, operationEvidence, operationHandshake, operationReadRows}
	sort.Slice(operations, func(i, j int) bool { return operations[i] < operations[j] })
	return operations
}

func equalOperations(first, second []operation) bool {
	if len(first) != len(second) {
		return false
	}
	for index := range first {
		if first[index] != second[index] {
			return false
		}
	}
	return true
}
