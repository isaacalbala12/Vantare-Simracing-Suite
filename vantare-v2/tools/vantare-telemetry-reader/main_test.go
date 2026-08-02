package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/tools/vantare-telemetry-reader/internal/protocol"
)

func TestServeHandshake(t *testing.T) {
	input := `{"protocol_version":1,"request_id":"req-1","operation":"handshake","handshake":{"helper_version":"1","duckdb_version":"v1.5.5","schema_version":1,"os":"windows","arch":"amd64"}}` + "\n"
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := serve(context.Background(), strings.NewReader(input), &stdout, &stderr, func() (protocol.Runtime, error) {
		return compatibleRuntime(), nil
	})
	if err != nil {
		t.Fatalf("serve() error = %v", err)
	}
	if stderr.Len() != 0 {
		t.Fatalf("stderr = %q, want empty", stderr.String())
	}
	if got := stdout.String(); !strings.Contains(got, `"ok":true`) || !strings.Contains(got, `"duckdb_version":"v1.5.5"`) {
		t.Fatalf("stdout = %q", got)
	}
}

func TestServeRejectsIncompatibleHandshakeBeforeRuntimeWork(t *testing.T) {
	input := `{"protocol_version":1,"request_id":"req-1","operation":"handshake","handshake":{"helper_version":"2","duckdb_version":"v1.5.5","schema_version":1,"os":"windows","arch":"amd64"}}` + "\n"
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := serve(context.Background(), strings.NewReader(input), &stdout, &stderr, func() (protocol.Runtime, error) {
		return compatibleRuntime(), nil
	})
	if err != nil {
		t.Fatalf("serve() error = %v", err)
	}
	if !strings.Contains(stdout.String(), `"error_code":"incompatible_runtime"`) {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.String() != "reader_error incompatible_runtime\n" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestServeSanitizesRuntimeFailure(t *testing.T) {
	input := `{"protocol_version":1,"request_id":"req-1","operation":"handshake","handshake":{"helper_version":"1","duckdb_version":"v1.5.5","schema_version":1,"os":"windows","arch":"amd64"}}` + "\n"
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	secret := errors.New(`C:\Users\private\duckdb.dll token=secret`)
	err := serve(context.Background(), strings.NewReader(input), &stdout, &stderr, func() (protocol.Runtime, error) {
		return protocol.Runtime{}, secret
	})
	if err != nil {
		t.Fatalf("serve() error = %v", err)
	}
	if strings.Contains(stdout.String(), "private") || strings.Contains(stderr.String(), "private") || strings.Contains(stderr.String(), "secret") {
		t.Fatalf("diagnostics leaked sensitive details: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
	if stderr.String() != "reader_error runtime_unavailable\n" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestServeProcessesMultipleFramesAndStopsAtEOF(t *testing.T) {
	frame := func(requestID string) string {
		return `{"protocol_version":1,"request_id":"` + requestID + `","operation":"handshake","handshake":{"helper_version":"1","duckdb_version":"v1.5.5","schema_version":1,"os":"windows","arch":"amd64"}}` + "\n"
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if err := serve(context.Background(), strings.NewReader(frame("req-1")+frame("req-2")), &stdout, &stderr, func() (protocol.Runtime, error) {
		return compatibleRuntime(), nil
	}); err != nil {
		t.Fatalf("serve() error = %v", err)
	}
	if bytes.Count(stdout.Bytes(), []byte{'\n'}) != 2 || stderr.Len() != 0 {
		t.Fatalf("stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}

func TestReaderErrorCodePreservesOversizedResponse(t *testing.T) {
	if got := readerErrorCode(protocol.ErrFrameTooLarge); got != "frame_too_large" {
		t.Fatalf("readerErrorCode() = %q, want frame_too_large", got)
	}
}

func compatibleRuntime() protocol.Runtime {
	return protocol.Runtime{
		ProtocolVersion: protocol.ProtocolVersion,
		HelperVersion:   protocol.HelperVersion,
		DuckDBVersion:   protocol.DuckDBVersion,
		SchemaVersion:   protocol.SchemaVersion,
		OS:              "windows",
		Arch:            "amd64",
	}
}
