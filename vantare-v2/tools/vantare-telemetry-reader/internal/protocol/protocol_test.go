package protocol

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestDecodeRequest(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr error
	}{
		{
			name:  "compatible handshake",
			input: `{"protocol_version":1,"request_id":"req-1","operation":"handshake","handshake":{"helper_version":"1","duckdb_version":"v1.5.5","schema_version":1,"os":"windows","arch":"amd64"}}` + "\n",
		},
		{
			name:    "unknown operation",
			input:   `{"protocol_version":1,"request_id":"req-1","operation":"query"}` + "\n",
			wantErr: ErrUnknownOperation,
		},
		{
			name:    "unknown field",
			input:   `{"protocol_version":1,"request_id":"req-1","operation":"handshake","sql":"select 1"}` + "\n",
			wantErr: ErrInvalidFrame,
		},
		{
			name:    "missing request id",
			input:   `{"protocol_version":1,"operation":"handshake"}` + "\n",
			wantErr: ErrInvalidFrame,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := DecodeRequest(strings.NewReader(test.input))
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("DecodeRequest() error = %v, want %v", err, test.wantErr)
			}
		})
	}
}

func TestDecodeRequestRejectsTrailingJSONValue(t *testing.T) {
	frame := `{"protocol_version":1,"request_id":"req-1","operation":"handshake","handshake":{"helper_version":"1","duckdb_version":"v1.5.5","schema_version":1,"os":"windows","arch":"amd64"}} {}` + "\n"
	if _, err := DecodeRequest(strings.NewReader(frame)); !errors.Is(err, ErrInvalidFrame) {
		t.Fatalf("DecodeRequest() error = %v, want ErrInvalidFrame", err)
	}
}

func TestDecodeRequestRejectsOversizedFrame(t *testing.T) {
	input := bytes.Repeat([]byte{'x'}, MaxInputFrameBytes+1)
	input = append(input, '\n')
	if _, err := DecodeRequest(bytes.NewReader(input)); !errors.Is(err, ErrFrameTooLarge) {
		t.Fatalf("DecodeRequest() error = %v, want ErrFrameTooLarge", err)
	}
}

func FuzzDecodeRequest(f *testing.F) {
	f.Add([]byte(`{"protocol_version":1,"request_id":"req-1","operation":"handshake","handshake":{"helper_version":"1","duckdb_version":"v1.5.5","schema_version":1,"os":"windows","arch":"amd64"}}` + "\n"))
	f.Add([]byte{})
	f.Fuzz(func(t *testing.T, frame []byte) {
		_, _ = DecodeRequest(bytes.NewReader(frame))
	})
}

func TestValidateHandshake(t *testing.T) {
	runtime := Runtime{
		ProtocolVersion: ProtocolVersion,
		HelperVersion:   HelperVersion,
		DuckDBVersion:   DuckDBVersion,
		SchemaVersion:   SchemaVersion,
		OS:              "windows",
		Arch:            "amd64",
	}
	tests := []struct {
		name    string
		change  func(*HandshakeRequest)
		wantErr error
	}{
		{name: "compatible"},
		{name: "protocol mismatch", change: func(request *HandshakeRequest) {}, wantErr: ErrIncompatibleRuntime},
		{name: "helper mismatch", change: func(request *HandshakeRequest) { request.HelperVersion = "2" }, wantErr: ErrIncompatibleRuntime},
		{name: "duckdb mismatch", change: func(request *HandshakeRequest) { request.DuckDBVersion = "v1.5.4" }, wantErr: ErrIncompatibleRuntime},
		{name: "schema mismatch", change: func(request *HandshakeRequest) { request.SchemaVersion++ }, wantErr: ErrIncompatibleRuntime},
		{name: "os mismatch", change: func(request *HandshakeRequest) { request.OS = "linux" }, wantErr: ErrIncompatibleRuntime},
		{name: "arch mismatch", change: func(request *HandshakeRequest) { request.Arch = "arm64" }, wantErr: ErrIncompatibleRuntime},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := HandshakeRequest{
				HelperVersion: HelperVersion,
				DuckDBVersion: DuckDBVersion,
				SchemaVersion: SchemaVersion,
				OS:            "windows",
				Arch:          "amd64",
			}
			protocolVersion := ProtocolVersion
			if test.name == "protocol mismatch" {
				protocolVersion++
			} else if test.change != nil {
				test.change(&request)
			}
			err := ValidateHandshake(protocolVersion, request, runtime)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("ValidateHandshake() error = %v, want %v", err, test.wantErr)
			}
		})
	}
}

func TestEncodeResponseIsSingleBoundedFrame(t *testing.T) {
	var output bytes.Buffer
	response := Response{
		ProtocolVersion: ProtocolVersion,
		RequestID:       "req-1",
		Operation:       OperationHandshake,
		OK:              true,
		Handshake: &HandshakeResponse{
			HelperVersion:       HelperVersion,
			DuckDBVersion:       DuckDBVersion,
			SchemaVersion:       SchemaVersion,
			OS:                  "windows",
			Arch:                "amd64",
			SupportedOperations: []Operation{OperationHandshake},
		},
	}
	if err := EncodeResponse(&output, response); err != nil {
		t.Fatalf("EncodeResponse() error = %v", err)
	}
	if bytes.Count(output.Bytes(), []byte{'\n'}) != 1 || output.Bytes()[output.Len()-1] != '\n' {
		t.Fatalf("response is not one newline-delimited frame: %q", output.Bytes())
	}
	var decoded Response
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &decoded); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !decoded.OK || decoded.RequestID != response.RequestID {
		t.Fatalf("decoded response = %+v", decoded)
	}
}
