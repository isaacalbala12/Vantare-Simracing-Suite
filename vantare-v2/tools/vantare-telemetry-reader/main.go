package main

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"

	_ "github.com/duckdb/duckdb-go/v2"
	"github.com/duckdb/duckdb-go/v2/mapping"

	"github.com/vantare/overlays/v2/tools/vantare-telemetry-reader/internal/protocol"
)

var errRuntimeUnavailable = errors.New("telemetry reader runtime unavailable")

func main() {
	if err := serve(context.Background(), os.Stdin, os.Stdout, os.Stderr, inspectRuntime); err != nil {
		os.Exit(1)
	}
}

func serve(
	ctx context.Context,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
	runtimeProvider func() (protocol.Runtime, error),
) error {
	reader := bufio.NewReaderSize(stdin, protocol.MaxInputFrameBytes+2)
	var runtimeInfo protocol.Runtime
	var runtimeErr error
	var runtimeLoaded bool
	var databaseReader *duckDBReader
	defer func() {
		if databaseReader != nil {
			_ = databaseReader.Close()
		}
	}()
	for {
		frame, err := reader.ReadSlice('\n')
		if err == io.EOF && len(frame) == 0 {
			return nil
		}
		if err != nil {
			fmt.Fprintln(stderr, "reader_error invalid_frame")
			return protocol.ErrInvalidFrame
		}
		if len(frame) > protocol.MaxInputFrameBytes+1 {
			fmt.Fprintln(stderr, "reader_error frame_too_large")
			return protocol.ErrFrameTooLarge
		}
		request, decodeErr := protocol.DecodeRequest(bytes.NewReader(append([]byte(nil), frame...)))
		if decodeErr != nil {
			code := protocolErrorCode(decodeErr)
			writeErrorResponse(stdout, request, code)
			fmt.Fprintf(stderr, "reader_error %s\n", code)
			continue
		}
		if !runtimeLoaded {
			runtimeInfo, runtimeErr = runtimeProvider()
			runtimeLoaded = true
		}
		if err := handleRequest(ctx, request, stdout, stderr, runtimeInfo, runtimeErr, &databaseReader); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return err
			}
			// Typed operation errors already produced a response. A later valid
			// request may still use this bounded reader session.
		}
	}
}

func handleRequest(
	ctx context.Context,
	request protocol.Request,
	stdout io.Writer,
	stderr io.Writer,
	runtimeInfo protocol.Runtime,
	runtimeErr error,
	reader **duckDBReader,
) error {
	if runtimeErr != nil {
		writeErrorResponse(stdout, request, "runtime_unavailable")
		fmt.Fprintln(stderr, "reader_error runtime_unavailable")
		return errRuntimeUnavailable
	}
	if err := protocol.ValidateHandshake(request.ProtocolVersion, *request.Handshake, runtimeInfo); err != nil {
		writeErrorResponse(stdout, request, "incompatible_runtime")
		fmt.Fprintln(stderr, "reader_error incompatible_runtime")
		return err
	}
	response := protocol.Response{
		ProtocolVersion: protocol.ProtocolVersion,
		RequestID:       request.RequestID,
		Operation:       request.Operation,
		OK:              true,
		Handshake: &protocol.HandshakeResponse{
			HelperVersion:       runtimeInfo.HelperVersion,
			DuckDBVersion:       runtimeInfo.DuckDBVersion,
			SchemaVersion:       runtimeInfo.SchemaVersion,
			OS:                  runtimeInfo.OS,
			Arch:                runtimeInfo.Arch,
			SupportedOperations: sortedOperations(),
		},
	}
	if request.Operation == protocol.OperationHandshake {
		return protocol.EncodeResponse(stdout, response)
	}
	if *reader == nil {
		opened, err := openReader(ctx, *request.Artifact)
		if err != nil {
			writeErrorResponse(stdout, request, readerErrorCode(err))
			fmt.Fprintf(stderr, "reader_error %s\n", readerErrorCode(err))
			return err
		}
		*reader = opened
	} else if (*reader).artifact != *request.Artifact {
		return writeOperationError(stdout, stderr, request, errInvalidRequest)
	}
	response.Handshake = nil
	switch request.Operation {
	case protocol.OperationCatalog:
		catalog, err := (*reader).Catalog(ctx)
		if err != nil {
			return writeOperationError(stdout, stderr, request, err)
		}
		response.Catalog = &catalog
	case protocol.OperationReadRows:
		batch, err := (*reader).ReadBatch(ctx, request.ReadRows.SourceTable, request.ReadRows.Start, request.ReadRows.Limit)
		if err != nil {
			return writeOperationError(stdout, stderr, request, err)
		}
		payload, err := protocol.EncodeRowBatch(batch)
		if err != nil {
			return writeOperationError(stdout, stderr, request, err)
		}
		response.BatchPayload = payload
	case protocol.OperationEvidence:
		if err := (*reader).revalidate(ctx); err != nil {
			return writeOperationError(stdout, stderr, request, err)
		}
		response.Evidence = &protocol.Evidence{Size: (*reader).artifact.Size, SHA256: (*reader).artifact.SHA256}
	default:
		return writeOperationError(stdout, stderr, request, protocol.ErrUnknownOperation)
	}
	if err := protocol.EncodeResponse(stdout, response); err != nil {
		return writeOperationError(stdout, stderr, request, err)
	}
	return nil
}

func writeOperationError(stdout, stderr io.Writer, request protocol.Request, err error) error {
	code := readerErrorCode(err)
	writeErrorResponse(stdout, request, code)
	fmt.Fprintf(stderr, "reader_error %s\n", code)
	return err
}

func readerErrorCode(err error) string {
	switch {
	case errors.Is(err, errArtifactChanged):
		return "artifact_changed"
	case errors.Is(err, context.Canceled):
		return "cancelled"
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.Is(err, protocol.ErrFrameTooLarge):
		return "frame_too_large"
	default:
		return "invalid_request"
	}
}

func inspectRuntime() (protocol.Runtime, error) {
	duckDBVersion := mapping.LibraryVersion()
	if duckDBVersion == "" {
		return protocol.Runtime{}, errRuntimeUnavailable
	}
	return protocol.Runtime{
		ProtocolVersion: protocol.ProtocolVersion,
		HelperVersion:   protocol.HelperVersion,
		DuckDBVersion:   duckDBVersion,
		SchemaVersion:   protocol.SchemaVersion,
		OS:              runtime.GOOS,
		Arch:            runtime.GOARCH,
	}, nil
}

func writeErrorResponse(writer io.Writer, request protocol.Request, code string) {
	_ = protocol.EncodeResponse(writer, protocol.Response{
		ProtocolVersion: protocol.ProtocolVersion,
		RequestID:       request.RequestID,
		Operation:       request.Operation,
		OK:              false,
		ErrorCode:       code,
	})
}

func protocolErrorCode(err error) string {
	switch {
	case errors.Is(err, protocol.ErrFrameTooLarge):
		return "frame_too_large"
	case errors.Is(err, protocol.ErrUnknownOperation):
		return "unknown_operation"
	default:
		return "invalid_frame"
	}
}
