package telemetrytransport

import (
	"errors"
	"strings"
	"testing"
)

// padPayload builds a JSON object payload of exactly size bytes:
// {"pad":"..."} costs 10 bytes of framing, so n pad bytes give 10+n.
func padPayload(size int) map[string]any {
	if size < 10 {
		panic("payload size must cover the object framing")
	}
	return map[string]any{"pad": strings.Repeat("x", size-10)}
}

func TestOverlayV2DefaultLimitIs72KiB(t *testing.T) {
	t.Parallel()

	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	publisher, release, err := registry.RegisterConsumer(ProductOverlayV2)
	if err != nil {
		t.Fatalf("RegisterConsumer: %v", err)
	}
	defer release()
	if got := publisher.Metrics().MaxPayloadBytes; got != OverlayV2MaxPayloadBytes {
		t.Fatalf("overlay-v2 default limit = %d, want OverlayV2MaxPayloadBytes (%d)", got, OverlayV2MaxPayloadBytes)
	}
	if OverlayV2MaxPayloadBytes != 72*1024 {
		t.Fatalf("OverlayV2MaxPayloadBytes = %d, want %d", OverlayV2MaxPayloadBytes, 72*1024)
	}
}

func TestOverlayV2AcceptsUpTo72KiBAndRejectsBeyond(t *testing.T) {
	t.Parallel()

	registry := mustPublisherRegistry(t, PublisherConfig{Product: ProductOverlayV2})
	publisher, release, err := registry.RegisterConsumer(ProductOverlayV2)
	if err != nil {
		t.Fatalf("RegisterConsumer: %v", err)
	}
	defer release()
	if err := publisher.PublishSnapshot(1, padPayload(72*1024)); err != nil {
		t.Fatalf("72 KiB overlay-v2 snapshot must be accepted: %v", err)
	}
	if err := publisher.PublishSnapshot(2, padPayload(72*1024+1)); !errors.Is(err, ErrPayloadTooLarge) {
		t.Fatalf("72 KiB+1 overlay-v2 snapshot must be rejected with ErrPayloadTooLarge, got %v", err)
	}
}

func TestGenericTransportLimitRemains256KiB(t *testing.T) {
	t.Parallel()

	if MaxPayloadBytes != 256*1024 {
		t.Fatalf("generic transport MaxPayloadBytes = %d, want %d", MaxPayloadBytes, 256*1024)
	}
	if DefaultMaxPayloadBytes != 256*1024 {
		t.Fatalf("generic transport DefaultMaxPayloadBytes = %d, want %d", DefaultMaxPayloadBytes, 256*1024)
	}
}
