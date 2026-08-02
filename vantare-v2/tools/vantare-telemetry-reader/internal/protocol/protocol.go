package protocol

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
)

const (
	ProtocolVersion     = 1
	HelperVersion       = "1"
	DuckDBVersion       = "v1.5.5"
	SchemaVersion       = 1
	MaxInputFrameBytes  = 64 * 1024
	MaxOutputFrameBytes = 64 * 1024 * 1024
)

var (
	ErrFrameTooLarge       = errors.New("telemetry reader frame exceeds limit")
	ErrInvalidFrame        = errors.New("invalid telemetry reader frame")
	ErrUnknownOperation    = errors.New("unsupported telemetry reader operation")
	ErrIncompatibleRuntime = errors.New("incompatible telemetry reader runtime")
)

type Operation string

const (
	OperationHandshake Operation = "handshake"
	OperationCatalog   Operation = "catalog"
	OperationReadRows  Operation = "read_rows"
	OperationEvidence  Operation = "evidence"
)

type ArtifactRequest struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type ReadRowsRequest struct {
	SourceTable string `json:"source_table"`
	Start       int64  `json:"start"`
	Limit       int    `json:"limit"`
}

type HandshakeRequest struct {
	HelperVersion string `json:"helper_version"`
	DuckDBVersion string `json:"duckdb_version"`
	SchemaVersion int    `json:"schema_version"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
}

type Request struct {
	ProtocolVersion int               `json:"protocol_version"`
	RequestID       string            `json:"request_id"`
	Operation       Operation         `json:"operation"`
	Handshake       *HandshakeRequest `json:"handshake,omitempty"`
	Artifact        *ArtifactRequest  `json:"artifact,omitempty"`
	ReadRows        *ReadRowsRequest  `json:"read_rows,omitempty"`
}

type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type Channel struct {
	Name        string   `json:"name"`
	FrequencyHz int      `json:"frequency_hz,omitempty"`
	Unit        string   `json:"unit,omitempty"`
	Columns     []Column `json:"columns"`
}

type Metadata struct {
	Key     string `json:"key"`
	Present bool   `json:"present,omitempty"`
	Value   string `json:"value,omitempty"`
	Quality string `json:"quality,omitempty"`
}

type Catalog struct {
	Metadata   []Metadata `json:"metadata"`
	Continuous []Channel  `json:"continuous"`
	Events     []Channel  `json:"events"`
}

type Scalar struct {
	Kind     string  `json:"kind"`
	Number   float64 `json:"number,omitempty"`
	Integer  int64   `json:"integer,omitempty"`
	Boolean  bool    `json:"boolean,omitempty"`
	Text     string  `json:"text,omitempty"`
	Null     bool    `json:"null,omitempty"`
	Quality  string  `json:"quality"`
	DuckType string  `json:"duckdb_type,omitempty"`
}

type Row struct {
	TimestampSeconds *float64 `json:"timestamp_seconds,omitempty"`
	Values           []Scalar `json:"values"`
}

type QualityOverride struct {
	Index   int    `json:"index"`
	Quality string `json:"quality"`
}

// ColumnVector keeps the IPC typed without repeating one JSON object per
// scalar. Exactly one value array is populated according to Kind.
type ColumnVector struct {
	Kind             string            `json:"kind"`
	Numbers          []float64         `json:"numbers,omitempty"`
	Integers         []int64           `json:"integers,omitempty"`
	Booleans         []bool            `json:"booleans,omitempty"`
	Texts            []string          `json:"texts,omitempty"`
	NullIndexes      []int             `json:"null_indexes,omitempty"`
	QualityOverrides []QualityOverride `json:"quality_overrides,omitempty"`
	DuckType         string            `json:"duckdb_type,omitempty"`
}

type RowBatch struct {
	RowCount         int            `json:"row_count"`
	TimestampSeconds []float64      `json:"timestamp_seconds,omitempty"`
	Columns          []ColumnVector `json:"columns"`
}

type Evidence struct {
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type HandshakeResponse struct {
	HelperVersion       string      `json:"helper_version"`
	DuckDBVersion       string      `json:"duckdb_version"`
	SchemaVersion       int         `json:"schema_version"`
	OS                  string      `json:"os"`
	Arch                string      `json:"arch"`
	SupportedOperations []Operation `json:"supported_operations"`
}

type Response struct {
	ProtocolVersion int                `json:"protocol_version"`
	RequestID       string             `json:"request_id,omitempty"`
	Operation       Operation          `json:"operation,omitempty"`
	OK              bool               `json:"ok"`
	Handshake       *HandshakeResponse `json:"handshake,omitempty"`
	Catalog         *Catalog           `json:"catalog,omitempty"`
	BatchPayload    string             `json:"batch_payload,omitempty"`
	Evidence        *Evidence          `json:"evidence,omitempty"`
	ErrorCode       string             `json:"error_code,omitempty"`
}

type Runtime struct {
	ProtocolVersion int
	HelperVersion   string
	DuckDBVersion   string
	SchemaVersion   int
	OS              string
	Arch            string
}

func DecodeRequest(reader io.Reader) (Request, error) {
	data, err := io.ReadAll(io.LimitReader(reader, MaxInputFrameBytes+2))
	if err != nil {
		return Request{}, ErrInvalidFrame
	}
	if len(data) > MaxInputFrameBytes+1 {
		return Request{}, ErrFrameTooLarge
	}
	if len(data) == 0 || data[len(data)-1] != '\n' {
		return Request{}, ErrInvalidFrame
	}
	frame := bytes.TrimSuffix(data, []byte{'\n'})
	if len(frame) > MaxInputFrameBytes || bytes.ContainsRune(frame, '\n') {
		return Request{}, ErrFrameTooLarge
	}
	decoder := json.NewDecoder(bytes.NewReader(frame))
	decoder.DisallowUnknownFields()
	var request Request
	if err := decoder.Decode(&request); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return Request{}, ErrInvalidFrame
	}
	if request.RequestID == "" || request.Operation == "" {
		return Request{}, ErrInvalidFrame
	}
	switch request.Operation {
	case OperationHandshake:
		if request.Handshake == nil || request.Artifact != nil || request.ReadRows != nil {
			return Request{}, ErrInvalidFrame
		}
	case OperationCatalog, OperationEvidence:
		if request.Handshake == nil || request.Artifact == nil || request.ReadRows != nil {
			return Request{}, ErrInvalidFrame
		}
	case OperationReadRows:
		if request.Handshake == nil || request.Artifact == nil || request.ReadRows == nil {
			return Request{}, ErrInvalidFrame
		}
	default:
		return Request{}, ErrUnknownOperation
	}
	return request, nil
}

func ValidateHandshake(protocolVersion int, request HandshakeRequest, runtime Runtime) error {
	if protocolVersion != runtime.ProtocolVersion ||
		request.HelperVersion != runtime.HelperVersion ||
		request.DuckDBVersion != runtime.DuckDBVersion ||
		request.SchemaVersion != runtime.SchemaVersion ||
		request.OS != runtime.OS ||
		request.Arch != runtime.Arch {
		return ErrIncompatibleRuntime
	}
	return nil
}

func EncodeResponse(writer io.Writer, response Response) error {
	frame, err := json.Marshal(response)
	if err != nil {
		return ErrInvalidFrame
	}
	if len(frame) > MaxOutputFrameBytes {
		return ErrFrameTooLarge
	}
	frame = append(frame, '\n')
	if _, err := writer.Write(frame); err != nil {
		return err
	}
	return nil
}
