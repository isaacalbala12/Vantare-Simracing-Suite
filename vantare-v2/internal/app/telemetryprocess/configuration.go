package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

const MaxConfigurationPayload = 64 << 10

var ErrInvalidConfiguration = errors.New("telemetry IPC configuration is invalid")

type ConsumersV1 struct {
	OverlayV2 bool `json:"overlayV2"`
	Engineer  bool `json:"engineer"`
	Strategy  bool `json:"strategy"`
}

type CadenceV1 struct {
	FastNS         int64 `json:"fastNs"`
	MidNS          int64 `json:"midNs"`
	SlowNS         int64 `json:"slowNs"`
	SpotterNS      int64 `json:"spotterNs"`
	SessionNS      int64 `json:"sessionNs"`
	RelativeNS     int64 `json:"relativeNs"`
	StandingsNS    int64 `json:"standingsNs"`
	FuelNS         int64 `json:"fuelNs"`
	DirtyCeilingNS int64 `json:"dirtyCeilingNs"`
}

type PreferencesV1 struct {
	Speed          overlayv2.SpeedUnit       `json:"speed"`
	Temperature    overlayv2.TemperatureUnit `json:"temperature"`
	Pressure       overlayv2.PressureUnit    `json:"pressure"`
	Fuel           overlayv2.FuelUnit        `json:"fuel"`
	DeltaReference string                    `json:"deltaReference"`
}

type CapabilitySourceV1 struct {
	DescriptorCapabilities []string `json:"descriptorCapabilities"`
	// Modes is the driver's declaration when ResolveModesFromEvidence is set.
	// Older configurations carry already resolved modes for replay compatibility.
	Modes                    overlayv2.CapabilityModesV2 `json:"modes"`
	Performance              overlayv2.PerformanceV2     `json:"performance"`
	ResolveModesFromEvidence bool                        `json:"resolveModesFromEvidence,omitempty"`
}

type ConfigurationV1 struct {
	Revision    uint64             `json:"revision"`
	Consumers   ConsumersV1        `json:"consumers"`
	Cadence     CadenceV1          `json:"cadence"`
	Preferences PreferencesV1      `json:"preferences"`
	Source      CapabilitySourceV1 `json:"source"`
}

// EncodeConfiguration sends one complete, revisioned policy. The child ACKs
// only after applying it at a batch boundary; sending is not an ACK.
func EncodeConfiguration(configuration ConfigurationV1) (Frame, error) {
	if configuration.Revision == 0 || !validPreferences(configuration.Preferences) || !validCadence(configuration.Cadence) {
		return Frame{}, ErrInvalidConfiguration
	}
	if configuration.Source.Modes.Spatial == nil {
		configuration.Source.Modes.Spatial = []string{}
	}
	if configuration.Source.Modes.Delta == nil {
		configuration.Source.Modes.Delta = []string{}
	}
	if configuration.Source.Performance.WidgetHz == nil {
		configuration.Source.Performance.WidgetHz = map[string]json.RawMessage{}
	}
	payload, err := json.Marshal(configuration)
	if err != nil {
		return Frame{}, fmt.Errorf("%w: marshal: %v", ErrInvalidConfiguration, err)
	}
	if len(payload) > MaxConfigurationPayload {
		return Frame{}, ErrPayloadTooLarge
	}
	return Frame{Kind: KindConfiguration, Payload: payload}, nil
}

func validCadence(value CadenceV1) bool {
	return value.FastNS >= 0 && value.MidNS >= 0 && value.SlowNS >= 0 && value.SpotterNS >= 0 && value.SessionNS >= 0 && value.RelativeNS >= 0 && value.StandingsNS >= 0 && value.FuelNS >= 0 && value.DirtyCeilingNS >= 0
}

func validPreferences(value PreferencesV1) bool {
	return (value.Speed == overlayv2.SpeedUnitMPS || value.Speed == overlayv2.SpeedUnitKPH || value.Speed == overlayv2.SpeedUnitMPH) &&
		(value.Temperature == overlayv2.TemperatureUnitCelsius || value.Temperature == overlayv2.TemperatureUnitFahrenheit) &&
		(value.Pressure == overlayv2.PressureUnitKPA || value.Pressure == overlayv2.PressureUnitPSI) &&
		(value.Fuel == overlayv2.FuelUnitLiters || value.Fuel == overlayv2.FuelUnitGallonsUS) &&
		(value.DeltaReference == overlayv2.DeltaReferencePersonalBest || value.DeltaReference == overlayv2.DeltaReferenceSessionBest || value.DeltaReference == overlayv2.DeltaReferencePreviousLap)
}

type ConfigurationAckV1 struct {
	Revision     uint64 `json:"revision"`
	Epoch        uint64 `json:"epoch"`
	Sequence     uint64 `json:"sequence"`
	FactStream   uint64 `json:"factStream"`
	FactSequence uint64 `json:"factSequence"`
}

func DecodeConfigurationAck(frame Frame) (ConfigurationAckV1, error) {
	if frame.Kind != KindConfigurationAck || len(frame.Payload) > 256 {
		return ConfigurationAckV1{}, ErrInvalidConfiguration
	}
	decoder := json.NewDecoder(bytes.NewReader(frame.Payload))
	decoder.DisallowUnknownFields()
	var ack ConfigurationAckV1
	if err := decoder.Decode(&ack); err != nil {
		return ConfigurationAckV1{}, fmt.Errorf("%w: ack: %v", ErrInvalidConfiguration, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return ConfigurationAckV1{}, ErrInvalidConfiguration
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(frame.Payload, &fields); err != nil {
		return ConfigurationAckV1{}, ErrInvalidConfiguration
	}
	if sequence, ok := fields["factSequence"]; !ok || string(sequence) == "null" {
		return ConfigurationAckV1{}, ErrInvalidConfiguration
	}
	if ack.Revision == 0 || ack.Epoch == 0 || ack.Sequence == 0 || ack.FactStream == 0 {
		return ConfigurationAckV1{}, ErrInvalidConfiguration
	}
	return ack, nil
}
