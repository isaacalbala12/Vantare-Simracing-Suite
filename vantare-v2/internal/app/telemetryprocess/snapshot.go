package telemetryprocess

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

const ProductOverlayV2 = "overlay-v2"

var ErrInvalidOverlaySnapshot = errors.New("telemetry IPC overlay snapshot is invalid")

// DecodeOverlaySnapshot validates one full product update from the Rust child.
// Framing and transport deadlines are owned by the caller.
func DecodeOverlaySnapshot(frame Frame) (overlayv2.UpdateV2, error) {
	if frame.Kind != KindSnapshot {
		return overlayv2.UpdateV2{}, ErrInvalidOverlaySnapshot
	}
	var payload struct {
		Product string          `json:"product"`
		Update  json.RawMessage `json:"update"`
	}
	decoder := json.NewDecoder(bytes.NewReader(frame.Payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return overlayv2.UpdateV2{}, fmt.Errorf("%w: envelope: %v", ErrInvalidOverlaySnapshot, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return overlayv2.UpdateV2{}, ErrInvalidOverlaySnapshot
	}
	if payload.Product != ProductOverlayV2 || len(payload.Update) == 0 {
		return overlayv2.UpdateV2{}, ErrInvalidOverlaySnapshot
	}
	var update overlayv2.UpdateV2
	decoder = json.NewDecoder(bytes.NewReader(payload.Update))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&update); err != nil {
		return overlayv2.UpdateV2{}, fmt.Errorf("%w: update: %v", ErrInvalidOverlaySnapshot, err)
	}
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return overlayv2.UpdateV2{}, ErrInvalidOverlaySnapshot
	}
	if update.Frame == nil || update.Frame.ContractVersion != overlayv2.ContractVersionV2 ||
		update.Frame.AlgorithmVersion != overlayv2.AlgorithmVersionV2 ||
		update.Frame.SectionBuildMask&^overlayv2.AllSectionsMask() != 0 ||
		!update.Source.State.Known() {
		return overlayv2.UpdateV2{}, ErrInvalidOverlaySnapshot
	}
	return update, nil
}
