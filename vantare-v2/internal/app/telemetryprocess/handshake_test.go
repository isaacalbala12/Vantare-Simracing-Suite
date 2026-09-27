package telemetryprocess

import (
	"errors"
	"testing"
)

func TestHandshakeRequiresExactInstanceAndBuild(t *testing.T) {
	nonce := [16]byte{1, 2, 3}
	payload := append(nonce[:], byte(len("0.1.0")))
	payload = append(payload, "0.1.0"...)
	valid := Frame{Kind: KindHandshake, Payload: payload}
	if err := verifyHandshake(valid, nonce, "0.1.0"); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name    string
		frame   Frame
		nonce   [16]byte
		version string
	}{
		{"wrong kind", Frame{Kind: KindStatus, Payload: payload}, nonce, "0.1.0"},
		{"wrong nonce", valid, [16]byte{}, "0.1.0"},
		{"wrong version", valid, nonce, "0.2.0"},
		{"truncated", Frame{Kind: KindHandshake, Payload: payload[:len(payload)-1]}, nonce, "0.1.0"},
		{"trailing", Frame{Kind: KindHandshake, Payload: append(append([]byte{}, payload...), 0)}, nonce, "0.1.0"},
		{"oversize version", valid, nonce, string(make([]byte, maxHelperVersionLength+1))},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := verifyHandshake(test.frame, test.nonce, test.version); !errors.Is(err, ErrInvalidHandshake) {
				t.Fatalf("handshake error = %v", err)
			}
		})
	}
}
