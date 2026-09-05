package telemetrytransport

import (
	"encoding/json"
	"fmt"
	"strconv"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

// BenchmarkOverlayPullTransportPull attributes the pull-transport phase of the
// host: what one acknowledged Overlay window costs per delivery once the
// projections already exist. It is the phase between
// runtimeBatchSink.WriteBatch and the WebView, and it runs once per HTTP pull
// (the frontend paces at ACTIVE_PULL_DELAY_MS = 16, so roughly once per
// canonical tick per open window).
//
// Each iteration publishes a fresh V2 snapshot and then pulls, but only the
// pull is timed: producing the projection is a different phase. What is timed
// here is Publisher.Replay* (clone), the bytes.Equal change filter and the
// two further copies the transport makes for session.last and for the
// retained pending response.
//
// Each grid size runs V2-only: the pull no longer receives, retains or
// delivers V1, so there are no dual or v1-only variants to compare.
//
// Fixture honesty: the payload uses the real overlayv2.UpdateV2 wire type
// with a full grid, every field present and relative rows at full depth, so
// field count, quality strings and JSON shape match production. The values
// are generated, not captured from LMU: the v2_bytes metric is a
// representative size, not evidence from a real session.
func BenchmarkOverlayPullTransportPull(b *testing.B) {
	for _, vehicles := range []int{1, 20, 44, 104} {
		b.Run(fmt.Sprintf("vehicles=%d/v2-only", vehicles), func(b *testing.B) {
			benchmarkOverlayPullTransportPull(b, vehicles)
		})
	}
}

func benchmarkOverlayPullTransportPull(b *testing.B, vehicles int) {
	b.Helper()
	const sender = "overlay-window"
	const sessionID = "bench-session"

	registry, err := NewPublisherRegistry(PublisherConfig{Product: ProductOverlayV2})
	if err != nil {
		b.Fatal(err)
	}
	transport := NewOverlayPullTransport(registry)

	updateV2 := benchmarkOverlayUpdateV2(vehicles)
	v2Bytes := benchmarkOverlayV2Bytes(b, updateV2)

	publish := func(sequence uint64) {
		publisher, active := registry.Lookup(ProductOverlayV2)
		if !active {
			b.Fatal("overlay v2 publisher inactive while benchmark consumer is active")
		}
		updateV2.DeliveryRevision = sequence
		if err := publisher.PublishSnapshot(sequence, updateV2); err != nil {
			b.Fatal(err)
		}
	}

	// The first pull registers the v2 consumer but may deliver nothing: the
	// publisher only becomes active once that consumer exists. Publish the
	// first revision afterwards and confirm the follow-up pull delivers it.
	// The ACK used below always comes from a real delivered response.
	if _, _, err := transport.Pull(sender, OverlayPullRequest{SessionID: sessionID, Ack: 0}); err != nil {
		b.Fatal(err)
	}
	publish(1)
	first, deliver, err := transport.Pull(sender, OverlayPullRequest{SessionID: sessionID, Ack: 0})
	if err != nil || !deliver {
		b.Fatalf("warm-up pull deliver=%v err=%v", deliver, err)
	}
	assertBenchSnapshotV2(b, first)
	ack := first.Delivery
	sequence := uint64(1)

	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		// Publishing is the previous phase and is excluded from the timing so
		// this benchmark attributes the pull transport alone.
		b.StopTimer()
		sequence++
		publish(sequence)
		b.StartTimer()

		response, deliver, err := transport.Pull(sender, OverlayPullRequest{
			SessionID: sessionID,
			Ack:       ack,
		})
		if err != nil {
			b.Fatal(err)
		}
		if !deliver {
			b.Fatal("pull produced no delivery for a newly published snapshot")
		}
		assertBenchSnapshotV2(b, response)
		ack = response.Delivery
	}
	b.StopTimer()

	b.ReportMetric(float64(v2Bytes), "v2_bytes")
}

func assertBenchSnapshotV2(b *testing.B, response OverlayPullResponse) {
	b.Helper()
	want := PublisherEventName(ProductOverlayV2, PublisherEventSnapshot)
	for _, event := range response.Events {
		if event.Name == want {
			return
		}
	}
	b.Fatalf("response without %q: %#v", want, response)
}

func benchmarkOverlayV2Bytes(b *testing.B, update overlayv2.UpdateV2) int {
	b.Helper()
	encoded, err := json.Marshal(update)
	if err != nil {
		b.Fatal(err)
	}
	return len(encoded)
}

func benchmarkOverlayUpdateV2(vehicles int) overlayv2.UpdateV2 {
	standingRows := make([]overlayv2.StandingRowV2, vehicles)
	relativeRows := make([]overlayv2.RelativeRowV2, vehicles)
	for index := range standingRows {
		suffix := strconv.Itoa(index)
		id := "lmu-slot-" + suffix + "-generation-1"
		standingRows[index] = overlayv2.StandingRowV2{
			VehicleID:      id,
			Position:       int32(index + 1),
			ClassPosition:  int32(index%10 + 1),
			ClassID:        "HYPERCAR",
			DriverName:     "Driver Number " + suffix,
			CarNumber:      suffix,
			GapSeconds:     overlayv2.QValue[float64]{V: 1.5 * float64(index), Q: overlayv2.QualityFresh},
			GapLaps:        int32(index / 25),
			PitState:       "none",
			CompletedLaps:  int32(index % 60),
			LastLapSeconds: overlayv2.QValue[float64]{V: 204.1234 + float64(index), Q: overlayv2.QualityFresh},
			LapDistance:    overlayv2.QValue[float64]{V: 137.25 * float64(index+1), Q: overlayv2.QualityFresh},
			GroundPosition: overlayv2.QValue[overlayv2.GroundPositionV2]{
				V: overlayv2.GroundPositionV2{X: float64(index) * 13.75, Z: float64(index) * -20.75},
				Q: overlayv2.QualityFresh,
			},
		}
		relativeRows[index] = overlayv2.RelativeRowV2{
			VehicleID:   id,
			GapSeconds:  overlayv2.QValue[float64]{V: -2.75 + float64(index), Q: overlayv2.QualityFresh},
			Side:        "ahead",
			Authority:   overlayv2.AuthorityDerived,
			DisplayName: "Driver Number " + suffix,
			ClassID:     "HYPERCAR",
		}
	}
	return overlayv2.UpdateV2{
		DeliveryRevision: 1,
		Source: overlayv2.SourceStatusV2{
			State:          overlayv2.SourceStateV2("live"),
			LastFrameAgeMS: 16,
		},
		Frame: &overlayv2.FrameV2{
			ContractVersion:  1,
			AlgorithmVersion: 1,
			StreamEpoch:      1,
			SourceSequence:   1,
			SessionID:        "lmu-session-1",
			GeneratedAt:      "2026-08-28T10:00:00.123456789Z",
			Session: overlayv2.SessionV2{
				Track:            overlayv2.QValue[string]{V: "Circuit de la Sarthe", Q: overlayv2.QualityFresh},
				RemainingSeconds: overlayv2.QValue[float64]{V: 3600.5, Q: overlayv2.QualityFresh},
			},
			Player: overlayv2.PlayerInstrumentsV2{
				VehicleID: "lmu-slot-0-generation-1",
				Speed:     overlayv2.QValue[float64]{V: 61.125, Q: overlayv2.QualityFresh},
				RPM:       overlayv2.QValue[float64]{V: 7200.5, Q: overlayv2.QualityFresh},
				Gear:      overlayv2.QValue[int32]{V: 5, Q: overlayv2.QualityFresh},
				Throttle:  overlayv2.QValue[float64]{V: 0.625, Q: overlayv2.QualityFresh},
				Brake:     overlayv2.QValue[float64]{V: 0.125, Q: overlayv2.QualityFresh},
			},
			Standings: standingRows,
			Relative:  relativeRows,
		},
	}
}
