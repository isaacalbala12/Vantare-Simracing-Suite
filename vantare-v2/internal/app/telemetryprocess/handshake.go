package telemetryprocess

import (
	"bytes"
	"errors"
)

const maxHelperVersionLength = 64

var ErrInvalidHandshake = errors.New("telemetry child handshake is invalid")

func verifyHandshake(frame Frame, nonce [16]byte, expectedVersion string) error {
	if frame.Kind != KindHandshake || len(expectedVersion) == 0 || len(expectedVersion) > maxHelperVersionLength {
		return ErrInvalidHandshake
	}
	payload := frame.Payload
	if len(payload) < len(nonce)+1 || !bytes.Equal(payload[:len(nonce)], nonce[:]) {
		return ErrInvalidHandshake
	}
	versionLength := int(payload[len(nonce)])
	if versionLength == 0 || versionLength > maxHelperVersionLength ||
		len(payload) != len(nonce)+1+versionLength ||
		string(payload[len(nonce)+1:]) != expectedVersion {
		return ErrInvalidHandshake
	}
	return nil
}
