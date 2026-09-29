package telemetryprocess

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"testing"
)

type shortWriter struct{ bytes.Buffer }

func (writer *shortWriter) Write(data []byte) (int, error) {
	return writer.Buffer.Write(data[:min(2, len(data))])
}

type shortReader struct{ *bytes.Reader }

func (reader shortReader) Read(data []byte) (int, error) {
	return reader.Reader.Read(data[:min(2, len(data))])
}

func TestWireFrameConformsToRustV1(t *testing.T) {
	for kind := KindHandshake; kind <= KindOverlayReply; kind++ {
		frame := Frame{Kind: kind, Payload: []byte{0, 1, 255}}
		if kind == KindStop {
			frame.Payload = nil
		}
		// Fixed protocol bytes: length u32 LE, version u16 LE, kind u16 LE.
		want := []byte{byte(len(frame.Payload)), 0, 0, 0, 1, 0, byte(kind), 0}
		want = append(want, frame.Payload...)
		var writer shortWriter
		if err := WriteFrame(&writer, frame); err != nil {
			t.Fatalf("kind %d write: %v", kind, err)
		}
		if !bytes.Equal(writer.Bytes(), want) {
			t.Fatalf("kind %d wire = %v, want %v", kind, writer.Bytes(), want)
		}
		decoded, err := DecodeFrame(want)
		if err != nil || decoded.Kind != frame.Kind || !bytes.Equal(decoded.Payload, frame.Payload) {
			t.Fatalf("kind %d decode = (%v, %v)", kind, decoded, err)
		}
		streamed, err := ReadFrame(shortReader{bytes.NewReader(want)})
		if err != nil || streamed.Kind != frame.Kind || !bytes.Equal(streamed.Payload, frame.Payload) {
			t.Fatalf("kind %d stream = (%v, %v)", kind, streamed, err)
		}
	}
}

func TestFrameRejectsOversizedControlBeforePayloadRead(t *testing.T) {
	for _, test := range []struct {
		kind FrameKind
		max  int
	}{
		{KindHandshake, 81},
		{KindConfiguration, MaxConfigurationPayload},
		{KindConfigurationAck, 256},
		{KindFact, MaxEngineerFactPayload},
		{KindFactAck, 128},
		{KindResyncRequired, 128},
		{KindStatus, 256},
		{KindStop, 0},
		{KindFactReplayRequest, 128},
		{KindOverlayCommand, 1024},
		{KindOverlayReply, 160 * 1024},
	} {
		header := make([]byte, FrameHeaderSize)
		binary.LittleEndian.PutUint32(header[:4], uint32(test.max+1))
		binary.LittleEndian.PutUint16(header[4:6], FrameVersion)
		binary.LittleEndian.PutUint16(header[6:8], uint16(test.kind))
		if _, err := ReadFrame(bytes.NewReader(header)); !errors.Is(err, ErrPayloadTooLarge) {
			t.Fatalf("kind %d stream: %v", test.kind, err)
		}
		if _, err := DecodeFrame(header); !errors.Is(err, ErrPayloadTooLarge) {
			t.Fatalf("kind %d decode: %v", test.kind, err)
		}
		if err := WriteFrame(io.Discard, Frame{Kind: test.kind, Payload: make([]byte, test.max+1)}); !errors.Is(err, ErrPayloadTooLarge) {
			t.Fatalf("kind %d write: %v", test.kind, err)
		}
	}
}

func TestFrameRejectsMalformedInput(t *testing.T) {
	valid := []byte{1, 0, 0, 0, 1, 0, 1, 0, 7}
	tests := []struct {
		name  string
		input []byte
		want  error
	}{
		{"short header", valid[:7], ErrIncompleteHeader},
		{"short payload", valid[:8], ErrIncompletePayload},
		{"trailing", append(bytes.Clone(valid), 0), ErrTrailingFrameBytes},
		{"unknown kind", replaceHeader(valid, 6, 0), ErrUnknownKind},
		{"wrong version", replaceHeader(valid, 4, 2), ErrUnsupportedVersion},
		{"too large", replaceLength(valid, MaxFramePayload+1), ErrPayloadTooLarge},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := DecodeFrame(test.input); !errors.Is(err, test.want) {
				t.Fatalf("decode error = %v, want %v", err, test.want)
			}
			if test.want != ErrTrailingFrameBytes {
				if _, err := ReadFrame(bytes.NewReader(test.input)); !errors.Is(err, test.want) {
					t.Fatalf("stream error = %v, want %v", err, test.want)
				}
			}
		})
	}
}

func TestFrameEnforcesExactLimitAndRejectsBadWriter(t *testing.T) {
	max := make([]byte, MaxFramePayload)
	var writer bytes.Buffer
	if err := WriteFrame(&writer, Frame{Kind: KindSnapshot, Payload: max}); err != nil {
		t.Fatal(err)
	}
	if _, err := DecodeFrame(writer.Bytes()); err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(io.Discard, Frame{Kind: KindSnapshot, Payload: make([]byte, MaxFramePayload+1)}); !errors.Is(err, ErrPayloadTooLarge) {
		t.Fatalf("oversize write = %v", err)
	}
	if err := WriteFrame(io.Discard, Frame{Kind: 0}); !errors.Is(err, ErrUnknownKind) {
		t.Fatalf("unknown kind write = %v", err)
	}
	if err := WriteFrame(zeroWriter{}, Frame{Kind: KindStop}); !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("zero progress write = %v", err)
	}
}

type zeroWriter struct{}

func (zeroWriter) Write([]byte) (int, error) { return 0, nil }

func replaceHeader(input []byte, offset int, value uint16) []byte {
	result := bytes.Clone(input)
	binary.LittleEndian.PutUint16(result[offset:offset+2], value)
	return result
}

func replaceLength(input []byte, value int) []byte {
	result := bytes.Clone(input)
	binary.LittleEndian.PutUint32(result[:4], uint32(value))
	return result
}
