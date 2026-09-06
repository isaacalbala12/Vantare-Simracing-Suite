package telemetrytransport

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

// Private, immutable encoded ownership; no simulator logic or tick-mask state.
// Comparing these fields against each consumer's confirmed frame also covers
// changes on source ticks skipped by latest-wins.
type overlaySections struct {
	revision uint64
	epoch    uint64
	session  string
	prefix   []byte
	fields   []overlaySection
}
type overlaySection struct {
	name string
	data []byte
}

func encodeOverlaySections(update overlayv2.UpdateV2) (*overlaySections, error) {
	if update.Frame == nil {
		return nil, nil
	}
	frame := update.Frame
	header, err := json.Marshal(struct {
		Revision uint64                   `json:"revision"`
		Source   overlayv2.SourceStatusV2 `json:"source"`
	}{update.DeliveryRevision, update.Source})
	if err != nil {
		return nil, fmt.Errorf("%w: overlay header: %v", ErrInvalidPayload, err)
	}
	parts := &overlaySections{revision: update.DeliveryRevision, epoch: frame.StreamEpoch, session: frame.SessionID, prefix: append(header[:len(header)-1], `,"frame":{`...)}
	// Match FrameV2's canonical field order. Parity tests over all golden sizes
	// fail if the contract gains a field without adding it here.
	values := []struct {
		name  string
		value any
	}{
		{"contract", frame.ContractVersion}, {"algorithm", frame.AlgorithmVersion},
		{"epoch", frame.StreamEpoch}, {"sequence", frame.SourceSequence},
		{"sectionMask", frame.SectionBuildMask}, {"sessionId", frame.SessionID},
		{"generatedAt", frame.GeneratedAt}, {"units", frame.Units},
		{"session", frame.Session}, {"player", frame.Player}, {"controls", frame.Controls},
		{"standings", frame.Standings}, {"relative", frame.Relative},
		{"relativeSettled", frame.RelativeSettled}, {"delta", frame.Delta},
		{"fuel", frame.Fuel}, {"spotter", frame.Spotter}, {"damage", frame.Damage},
		{"weather", frame.Weather}, {"capabilities", frame.Capabilities},
	}
	parts.fields = make([]overlaySection, len(values))
	for i, value := range values {
		data, err := json.Marshal(value.value)
		if err != nil {
			return nil, fmt.Errorf("%w: overlay section %s: %v", ErrInvalidPayload, value.name, err)
		}
		parts.fields[i] = overlaySection{value.name, data}
	}
	return parts, nil
}

func (parts *overlaySections) full() []byte { return parts.difference(nil) }

func (parts *overlaySections) difference(base *overlaySections) []byte {
	size := len(parts.prefix) + 2
	for i, field := range parts.fields {
		if base != nil && bytes.Equal(field.data, base.fields[i].data) {
			continue
		}
		size += len(field.name) + len(field.data) + 4
	}
	out := make([]byte, 0, size)
	out = append(out, parts.prefix...)
	comma := false
	for i, field := range parts.fields {
		if base != nil && bytes.Equal(field.data, base.fields[i].data) {
			continue
		}
		if comma {
			out = append(out, ',')
		}
		comma = true
		out = append(out, '"')
		out = append(out, field.name...)
		out = append(out, '"', ':')
		out = append(out, field.data...)
	}
	return append(out, '}', '}')
}
