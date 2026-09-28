package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

func TestConfigurationGoFrameOracle(t *testing.T) {
	rafCap := 40
	configuration := ConfigurationV1{
		Revision:    7,
		Consumers:   ConsumersV1{OverlayV2: true, Engineer: true, Strategy: false},
		Cadence:     CadenceV1{FastNS: 50_000_000, MidNS: 100_000_000, SlowNS: 250_000_000, SpotterNS: 100_000_000, SessionNS: 250_000_000, DirtyCeilingNS: 1_000_000_000},
		Preferences: PreferencesV1{Speed: overlayv2.SpeedUnitKPH, Temperature: overlayv2.TemperatureUnitCelsius, Pressure: overlayv2.PressureUnitKPA, Fuel: overlayv2.FuelUnitLiters, DeltaReference: overlayv2.DeltaReferencePersonalBest},
		Source: CapabilitySourceV1{
			DescriptorCapabilities: []string{"shared-memory", "rest"},
			Modes:                  overlayv2.CapabilityModesV2{Spatial: []string{"xyz"}, Delta: []string{"personal-best"}, Standings: overlayv2.ModeOfficial, Gaps: overlayv2.ModeReconstructed},
			Performance:            overlayv2.PerformanceV2{Level: 3, Mode: overlayv2.PerformanceModeManual, Effects: overlayv2.PerformanceEffectsNoBlur, RafCap: &rafCap, WidgetHz: map[string]json.RawMessage{"pedals": []byte("40")}, SourceHz: 60},
		},
	}
	frame, err := EncodeConfiguration(configuration)
	if err != nil {
		t.Fatal(err)
	}
	var writer bytes.Buffer
	if err := WriteFrame(&writer, frame); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "configuration-frame-go-v1.bin")
	if os.Getenv("VANTARE_IPC_ORACLE_UPDATE") == "1" {
		if err := os.WriteFile(path, writer.Bytes(), 0644); err != nil {
			t.Fatal(err)
		}
	}
	golden, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(writer.Bytes(), golden) {
		t.Fatal("Go configuration frame differs from pinned Rust oracle")
	}
	if _, err := EncodeConfiguration(ConfigurationV1{}); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatalf("zero configuration error = %v", err)
	}
	configuration.Cadence.FastNS = -1
	if _, err := EncodeConfiguration(configuration); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatalf("negative cadence error = %v", err)
	}
	configuration.Cadence.FastNS = 0
	configuration.Source.Modes.Spatial = nil
	configuration.Source.Modes.Delta = nil
	configuration.Source.Performance.WidgetHz = nil
	emptySource, err := EncodeConfiguration(configuration)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range [][]byte{[]byte(`"spatial":[]`), []byte(`"delta":[]`), []byte(`"widgetHz":{}`)} {
		if !bytes.Contains(emptySource.Payload, want) {
			t.Fatalf("missing normalized wire field %s", want)
		}
	}
	large, err := json.Marshal(strings.Repeat("x", MaxConfigurationPayload))
	if err != nil {
		t.Fatal(err)
	}
	configuration.Source.Performance.WidgetHz = map[string]json.RawMessage{"large": large}
	if _, err := EncodeConfiguration(configuration); !errors.Is(err, ErrPayloadTooLarge) {
		t.Fatalf("oversized configuration error = %v", err)
	}
}

func TestConfigurationAckRejectsIncompleteOrUnknown(t *testing.T) {
	encoded, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", "configuration-ack-frame-rust-v1.bin"))
	if err != nil {
		t.Fatal(err)
	}
	rustFrame, err := DecodeFrame(encoded)
	if err != nil {
		t.Fatal(err)
	}
	rustAck, err := DecodeConfigurationAck(rustFrame)
	if err != nil || rustAck != (ConfigurationAckV1{Revision: 7, Epoch: 1, Sequence: 42}) {
		t.Fatalf("Rust ack = (%+v, %v)", rustAck, err)
	}
	valid := Frame{Kind: KindConfigurationAck, Payload: []byte(`{"revision":7,"epoch":1,"sequence":42}`)}
	ack, err := DecodeConfigurationAck(valid)
	if err != nil || ack.Revision != 7 || ack.Sequence != 42 {
		t.Fatalf("ack = (%+v, %v)", ack, err)
	}
	for _, frame := range []Frame{
		{Kind: KindStatus, Payload: valid.Payload},
		{Kind: KindConfigurationAck, Payload: []byte(`{"revision":0,"epoch":1,"sequence":42}`)},
		{Kind: KindConfigurationAck, Payload: []byte(`{"revision":7,"epoch":1,"sequence":42,"unknown":1}`)},
		{Kind: KindConfigurationAck, Payload: []byte(`{"revision":7,"epoch":1,"sequence":42} trailing`)},
	} {
		if _, err := DecodeConfigurationAck(frame); !errors.Is(err, ErrInvalidConfiguration) {
			t.Fatalf("invalid ack error = %v", err)
		}
	}
}
