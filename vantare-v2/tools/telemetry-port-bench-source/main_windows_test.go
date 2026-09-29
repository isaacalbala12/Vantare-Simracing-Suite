//go:build windows

package main

import (
	"bytes"
	"compress/flate"
	"testing"
)

func TestUnpackFrameRequiresExactDecodedSize(t *testing.T) {
	compress := func(t *testing.T, data []byte) []byte {
		t.Helper()
		var packed bytes.Buffer
		writer, err := flate.NewWriter(&packed, flate.BestSpeed)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(data); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		return packed.Bytes()
	}
	frame := bytes.Repeat([]byte{0x5a}, 32)
	for _, test := range []struct {
		name      string
		data      []byte
		wantError bool
	}{
		{name: "exact", data: compress(t, frame)},
		{name: "short decoded frame", data: compress(t, frame[:31]), wantError: true},
		{name: "extra decoded byte", data: compress(t, append(bytes.Clone(frame), 0)), wantError: true},
		{name: "invalid compressed stream", data: []byte{0xff}, wantError: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			decoded := make([]byte, len(frame))
			err := unpackFrame(test.data, decoded)
			if (err != nil) != test.wantError {
				t.Fatalf("unpackFrame error = %v, wantError = %v", err, test.wantError)
			}
			if err == nil && !bytes.Equal(decoded, frame) {
				t.Fatal("decoded frame differs from audited input")
			}
		})
	}
}
