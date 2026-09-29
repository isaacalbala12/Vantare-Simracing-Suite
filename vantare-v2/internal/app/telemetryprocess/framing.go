// Package telemetryprocess contains the host side of the versioned telemetry child protocol.
// The child is not started by this package yet.
package telemetryprocess

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	FrameVersion    uint16 = 1
	FrameHeaderSize        = 8
	MaxFramePayload        = 8 << 20
)

type FrameKind uint16

const (
	KindHandshake FrameKind = iota + 1
	KindConfiguration
	KindConfigurationAck
	KindSnapshot
	KindFact
	KindFactAck
	KindResyncRequired
	KindStatus
	KindStop
	KindFactReplayRequest
	KindOverlayCommand
	KindOverlayReply
)

var (
	ErrIncompleteHeader   = errors.New("telemetry IPC incomplete header")
	ErrIncompletePayload  = errors.New("telemetry IPC incomplete payload")
	ErrPayloadTooLarge    = errors.New("telemetry IPC payload too large")
	ErrUnsupportedVersion = errors.New("telemetry IPC unsupported version")
	ErrUnknownKind        = errors.New("telemetry IPC unknown kind")
	ErrTrailingFrameBytes = errors.New("telemetry IPC trailing frame bytes")
)

type Frame struct {
	Kind    FrameKind
	Payload []byte
}

func validKind(kind FrameKind) bool {
	return kind >= KindHandshake && kind <= KindOverlayReply
}

func maxKindPayload(kind FrameKind) int {
	switch kind {
	case KindHandshake:
		return 16 + 1 + 64
	case KindConfiguration:
		return MaxConfigurationPayload
	case KindConfigurationAck, KindStatus:
		return 256
	case KindSnapshot:
		return MaxFramePayload
	case KindFact:
		return MaxEngineerFactPayload
	case KindFactAck, KindResyncRequired, KindFactReplayRequest:
		return 128
	case KindOverlayCommand:
		return 1024
	case KindOverlayReply:
		return 160 * 1024
	case KindStop:
		return 0
	default:
		return 0
	}
}

func parseHeader(header []byte) (FrameKind, int, error) {
	length := int(binary.LittleEndian.Uint32(header[:4]))
	if length > MaxFramePayload {
		return 0, 0, ErrPayloadTooLarge
	}
	if binary.LittleEndian.Uint16(header[4:6]) != FrameVersion {
		return 0, 0, ErrUnsupportedVersion
	}
	kind := FrameKind(binary.LittleEndian.Uint16(header[6:8]))
	if !validKind(kind) {
		return 0, 0, ErrUnknownKind
	}
	if length > maxKindPayload(kind) {
		return 0, 0, ErrPayloadTooLarge
	}
	return kind, length, nil
}

// DecodeFrame accepts exactly one complete frame. Its payload aliases input.
func DecodeFrame(input []byte) (Frame, error) {
	if len(input) < FrameHeaderSize {
		return Frame{}, ErrIncompleteHeader
	}
	kind, length, err := parseHeader(input)
	if err != nil {
		return Frame{}, err
	}
	if len(input) < FrameHeaderSize+length {
		return Frame{}, ErrIncompletePayload
	}
	if len(input) > FrameHeaderSize+length {
		return Frame{}, ErrTrailingFrameBytes
	}
	return Frame{Kind: kind, Payload: input[FrameHeaderSize:]}, nil
}

// ReadFrame reads one frame from a stream. The caller owns transport deadlines.
func ReadFrame(reader io.Reader) (Frame, error) {
	var header [FrameHeaderSize]byte
	if _, err := io.ReadFull(reader, header[:]); err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return Frame{}, ErrIncompleteHeader
		}
		return Frame{}, fmt.Errorf("read telemetry IPC header: %w", err)
	}
	kind, length, err := parseHeader(header[:])
	if err != nil {
		return Frame{}, err
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(reader, payload); err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return Frame{}, ErrIncompletePayload
		}
		return Frame{}, fmt.Errorf("read telemetry IPC payload: %w", err)
	}
	return Frame{Kind: kind, Payload: payload}, nil
}

func WriteFrame(writer io.Writer, frame Frame) error {
	if !validKind(frame.Kind) {
		return ErrUnknownKind
	}
	if len(frame.Payload) > maxKindPayload(frame.Kind) {
		return ErrPayloadTooLarge
	}
	var header [FrameHeaderSize]byte
	binary.LittleEndian.PutUint32(header[:4], uint32(len(frame.Payload)))
	binary.LittleEndian.PutUint16(header[4:6], FrameVersion)
	binary.LittleEndian.PutUint16(header[6:8], uint16(frame.Kind))
	if err := writeFull(writer, header[:]); err != nil {
		return fmt.Errorf("write telemetry IPC header: %w", err)
	}
	if err := writeFull(writer, frame.Payload); err != nil {
		return fmt.Errorf("write telemetry IPC payload: %w", err)
	}
	return nil
}

func writeFull(writer io.Writer, data []byte) error {
	for len(data) > 0 {
		count, err := writer.Write(data)
		if count < 0 || count > len(data) {
			return io.ErrShortWrite
		}
		data = data[count:]
		if err != nil {
			return err
		}
		if count == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}
