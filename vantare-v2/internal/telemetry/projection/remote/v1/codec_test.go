package v1

import (
	"bytes"
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGoldenDecodeEncodeIsByteStable(t *testing.T) {
	for _, name := range []string{"active.golden.json", "minimal.golden.json"} {
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(filepath.Join("testdata", name))
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := Decode(raw)
			if err != nil {
				t.Fatalf("Decode(golden) error = %v", err)
			}
			first, err := Encode(decoded)
			if err != nil {
				t.Fatalf("Encode(decoded) error = %v", err)
			}
			secondDecoded, err := Decode(first)
			if err != nil {
				t.Fatalf("Decode(encoded) error = %v", err)
			}
			second, err := Encode(secondDecoded)
			if err != nil {
				t.Fatalf("second Encode() error = %v", err)
			}
			if !bytes.Equal(first, second) {
				t.Fatalf("round trip is not byte stable\nfirst:  %s\nsecond: %s", first, second)
			}
		})
	}
}

func TestDecodeRejectsMalformedOrIncompatibleJSON(t *testing.T) {
	update := mustProject(t, representativeSnapshot(t))
	valid, err := Encode(update)
	if err != nil {
		t.Fatal(err)
	}
	encodedSession, err := json.Marshal(update.Session)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		raw  []byte
		err  error
	}{
		{name: "unknown top-level field", raw: bytes.Replace(valid, []byte("{"), []byte(`{"unknown":true,`), 1), err: ErrInvalidJSON},
		{name: "unknown nested field", raw: bytes.Replace(valid, []byte(`"session":{`), []byte(`"session":{"unknown":true,`), 1), err: ErrInvalidJSON},
		{name: "known field in wrong object", raw: bytes.Replace(valid, []byte(`"session":{`), []byte(`"session":{"version":1,`), 1), err: ErrInvalidJSON},
		{name: "duplicate envelope field", raw: bytes.Replace(valid, []byte("{"), []byte(`{"version":1,`), 1), err: ErrInvalidJSON},
		{name: "duplicate qvalue field", raw: bytes.Replace(valid, []byte(`"speedMps":{"q":"fresh",`), []byte(`"speedMps":{"q":"fresh","q":"fresh",`), 1), err: ErrInvalidJSON},
		{name: "case variant", raw: bytes.Replace(valid, []byte(`"version":1`), []byte(`"Version":1`), 1), err: ErrInvalidJSON},
		{name: "null qvalue value", raw: bytes.Replace(valid, []byte(`"v":72.25`), []byte(`"v":null`), 1), err: ErrInvalidJSON},
		{name: "null required object", raw: bytes.Replace(valid, append([]byte(`"session":`), encodedSession...), []byte(`"session":null`), 1), err: ErrInvalidJSON},
		{name: "missing version", raw: bytes.Replace(valid, []byte(`"version":1,`), nil, 1), err: ErrUnsupportedVersion},
		{name: "missing kind", raw: bytes.Replace(valid, []byte(`"kind":"full",`), nil, 1), err: ErrUnsupportedKind},
		{name: "missing canonical version", raw: bytes.Replace(valid, []byte(`"canonicalVersion":1,`), nil, 1), err: ErrUnsupportedCanonicalVersion},
		{name: "missing epoch", raw: bytes.Replace(valid, []byte(`"streamEpoch":7,`), nil, 1), err: ErrInvalidUpdate},
		{name: "missing revision", raw: bytes.Replace(valid, []byte(`"revision":42,`), nil, 1), err: ErrInvalidUpdate},
		{name: "missing session id", raw: bytes.Replace(valid, []byte(`"sessionId":"remote-session-1",`), nil, 1), err: ErrInvalidUpdate},
		{name: "missing captured at", raw: bytes.Replace(valid, []byte(`"capturedAt":"2026-08-27T02:03:04.567Z",`), nil, 1), err: ErrInvalidUpdate},
		{name: "nan", raw: bytes.Replace(valid, []byte(`"v":72.25`), []byte(`"v":NaN`), 1), err: ErrInvalidJSON},
		{name: "positive infinity", raw: bytes.Replace(valid, []byte(`"v":72.25`), []byte(`"v":Infinity`), 1), err: ErrInvalidJSON},
		{name: "float overflow", raw: bytes.Replace(valid, []byte(`"v":72.25`), []byte(`"v":1e10000`), 1), err: ErrInvalidJSON},
		{name: "trailing value", raw: append(append([]byte(nil), valid...), []byte(` {}`)...), err: ErrInvalidJSON},
		{name: "truncated", raw: valid[:len(valid)-1], err: ErrInvalidJSON},
		{name: "empty", raw: nil, err: ErrInvalidJSON},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, gotErr := Decode(tt.raw)
			if !errors.Is(gotErr, tt.err) {
				t.Fatalf("Decode() error = %v, want %v", gotErr, tt.err)
			}
		})
	}
}

func TestValidateAcceptsIndependentDeltaQualities(t *testing.T) {
	base := mustProject(t, representativeSnapshot(t))
	tests := []struct {
		name    string
		seconds QValue[float64]
	}{
		{name: "missing seconds with fresh reference", seconds: QValue[float64]{Quality: QualityMissing}},
		{name: "invalid seconds with fresh reference", seconds: QValue[float64]{Quality: QualityInvalid}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			candidate := base
			candidate.Player.DeltaSeconds = tt.seconds
			if candidate.Player.DeltaReference.Quality != QualityFresh {
				t.Fatalf("fixture delta reference quality = %q, want %q", candidate.Player.DeltaReference.Quality, QualityFresh)
			}
			if err := Validate(candidate); err != nil {
				t.Fatalf("Validate() error = %v", err)
			}
		})
	}
}

func TestCodecAppliesTheSamePayloadLimit(t *testing.T) {
	encoded, err := Encode(mustProject(t, representativeSnapshot(t)))
	if err != nil {
		t.Fatal(err)
	}
	exact := append([]byte(nil), encoded...)
	exact = append(exact, bytes.Repeat([]byte(" "), MaxPayloadBytesV1-len(exact))...)
	if _, err := Decode(exact); err != nil {
		t.Fatalf("Decode(exact limit) error = %v", err)
	}
	if _, err := Decode(append(exact, ' ')); !errors.Is(err, ErrPayloadTooLarge) {
		t.Fatalf("Decode(over limit) error = %v, want %v", err, ErrPayloadTooLarge)
	}

	update := mustProject(t, representativeSnapshot(t))
	large := strings.Repeat("x", MaxPayloadBytesV1)
	update.Session.Track = QValue[string]{Quality: QualityFresh, Value: &large}
	if _, err := Encode(update); !errors.Is(err, ErrPayloadTooLarge) {
		t.Fatalf("Encode(over limit) error = %v, want %v", err, ErrPayloadTooLarge)
	}
}

func TestValidateRejectsInvalidEnvelopeAndStructure(t *testing.T) {
	base := mustProject(t, representativeSnapshot(t))
	tests := []struct {
		name   string
		mutate func(*RemoteCanonicalUpdateV1)
		err    error
	}{
		{name: "version", mutate: func(v *RemoteCanonicalUpdateV1) { v.Version = 2 }, err: ErrUnsupportedVersion},
		{name: "kind", mutate: func(v *RemoteCanonicalUpdateV1) { v.Kind = "delta" }, err: ErrUnsupportedKind},
		{name: "canonical", mutate: func(v *RemoteCanonicalUpdateV1) { v.CanonicalVersion = 2 }, err: ErrUnsupportedCanonicalVersion},
		{name: "epoch", mutate: func(v *RemoteCanonicalUpdateV1) { v.StreamEpoch = 0 }, err: ErrInvalidUpdate},
		{name: "revision", mutate: func(v *RemoteCanonicalUpdateV1) { v.Revision = 0 }, err: ErrInvalidUpdate},
		{name: "session id", mutate: func(v *RemoteCanonicalUpdateV1) { v.SessionID = "" }, err: ErrInvalidUpdate},
		{name: "captured at", mutate: func(v *RemoteCanonicalUpdateV1) { v.CapturedAt = "2026-08-27T02:03:04+02:00" }, err: ErrInvalidUpdate},
		{name: "nil vehicles", mutate: func(v *RemoteCanonicalUpdateV1) { v.Vehicles = nil }, err: ErrInvalidUpdate},
		{name: "too many vehicles", mutate: func(v *RemoteCanonicalUpdateV1) { v.Vehicles = append(v.Vehicles, make([]VehicleV1, MaxVehiclesV1)...) }, err: ErrInvalidUpdate},
		{name: "duplicate vehicle", mutate: func(v *RemoteCanonicalUpdateV1) { v.Vehicles = append(v.Vehicles, v.Vehicles[0]) }, err: ErrDuplicateVehicle},
		{name: "player absent from grid", mutate: func(v *RemoteCanonicalUpdateV1) { v.Player.VehicleID = "not-in-grid" }, err: ErrInvalidUpdate},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			candidate := base
			candidate.Vehicles = append([]VehicleV1(nil), base.Vehicles...)
			tt.mutate(&candidate)
			if err := Validate(candidate); !errors.Is(err, tt.err) {
				t.Fatalf("Validate() error = %v, want %v", err, tt.err)
			}
		})
	}
}

func TestValidateRejectsIncoherentQualitiesAndImpossibleNumbers(t *testing.T) {
	base := mustProject(t, representativeSnapshot(t))
	zero := 0.0
	tests := []struct {
		name   string
		mutate func(*RemoteCanonicalUpdateV1)
		err    error
	}{
		{name: "fresh without value", mutate: func(v *RemoteCanonicalUpdateV1) { v.Player.SpeedMPS = QValue[float64]{Quality: QualityFresh} }, err: ErrInvalidQuality},
		{name: "missing with value", mutate: func(v *RemoteCanonicalUpdateV1) {
			v.Player.SpeedMPS = QValue[float64]{Quality: QualityMissing, Value: &zero}
		}, err: ErrInvalidQuality},
		{name: "invalid with value", mutate: func(v *RemoteCanonicalUpdateV1) {
			v.Player.SpeedMPS = QValue[float64]{Quality: QualityInvalid, Value: &zero}
		}, err: ErrInvalidQuality},
		{name: "unknown quality", mutate: func(v *RemoteCanonicalUpdateV1) { v.Player.SpeedMPS.Quality = "unknown" }, err: ErrInvalidQuality},
		{name: "nan", mutate: func(v *RemoteCanonicalUpdateV1) { value := math.NaN(); v.Player.SpeedMPS.Value = &value }, err: ErrInvalidValue},
		{name: "infinity", mutate: func(v *RemoteCanonicalUpdateV1) { value := math.Inf(1); v.Player.RPM.Value = &value }, err: ErrInvalidValue},
		{name: "negative speed", mutate: func(v *RemoteCanonicalUpdateV1) { value := -1.0; v.Player.SpeedMPS.Value = &value }, err: ErrInvalidValue},
		{name: "ratio above one", mutate: func(v *RemoteCanonicalUpdateV1) { value := 1.01; v.Player.Throttle.Value = &value }, err: ErrInvalidValue},
		{name: "fuel above capacity", mutate: func(v *RemoteCanonicalUpdateV1) { value := 101.0; v.Player.FuelRemainingLiters.Value = &value }, err: ErrInvalidValue},
		{name: "dent severity overflow", mutate: func(v *RemoteCanonicalUpdateV1) {
			dents := append([]uint16(nil), (*v.Player.Damage.Dents.Value)...)
			dents[0] = 256
			v.Player.Damage.Dents.Value = &dents
		}, err: ErrInvalidValue},
		{name: "negative penalty", mutate: func(v *RemoteCanonicalUpdateV1) { value := int32(-1); v.Vehicles[0].PenaltyCount.Value = &value }, err: ErrInvalidValue},
		{name: "bad sector", mutate: func(v *RemoteCanonicalUpdateV1) { value := uint8(4); v.Vehicles[0].Sector.Value = &value }, err: ErrInvalidValue},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			candidate := base
			candidate.Vehicles = append([]VehicleV1(nil), base.Vehicles...)
			tt.mutate(&candidate)
			if _, err := Encode(candidate); !errors.Is(err, tt.err) {
				t.Fatalf("Encode() error = %v, want %v", err, tt.err)
			}
		})
	}
}
