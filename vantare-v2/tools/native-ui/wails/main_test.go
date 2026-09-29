//go:build windows

package main

import (
	"errors"
	"testing"
)

func TestLoopbackEndpoint(t *testing.T) {
	tests := []struct {
		url   string
		valid bool
	}{
		{"http://127.0.0.1:54681/telemetry/overlay-v2/projection", true},
		{"http://[::1]:54681/telemetry/overlay-v2/projection", true},
		{"https://127.0.0.1:54681/telemetry/overlay-v2/projection", false},
		{"http://example.com:54681/telemetry/overlay-v2/projection", false},
		{"http://127.0.0.1:54681/other", false},
		{"http://127.0.0.1:54681/telemetry/overlay-v2/projection?x=1", false},
		{"http://127.0.0.1/telemetry/overlay-v2/projection", false},
	}
	for _, test := range tests {
		t.Run(test.url, func(t *testing.T) {
			_, err := loopbackEndpoint(test.url)
			if test.valid && err != nil {
				t.Fatalf("valid loopback endpoint: %v", err)
			}
			if !test.valid && !errors.Is(err, errInvalidEndpoint) {
				t.Fatalf("invalid endpoint: got %v", err)
			}
		})
	}
}
