package telemetrytransport

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/energy"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/identity"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// overlayBenchHistorySamples is the canonical steady-state depth of both
// derived histories: derive.MaxControlsHistory and derive.MaxSelfDeltaHistory
// are both 120, a depth a live session reaches within seconds.
const overlayBenchHistorySamples = 120

// BenchmarkOverlayPullTransportPull attributes the pull-transport phase of the
// host: what one acknowledged Overlay window costs per delivery once the
// projections already exist. It is the phase between
// runtimeBatchSink.WriteBatch and the WebView, and it runs once per HTTP pull
// (the frontend paces at ACTIVE_PULL_DELAY_MS = 16, so roughly once per
// canonical tick per open window).
//
// Each iteration publishes fresh projections and then pulls, but only the pull
// is timed: producing and marshalling the projection is a different phase and
// already has its own benchmark (BenchmarkOverlayProjectionAndMarshal* in
// projection/overlay). What is timed here is Hub.ReplayStatus/ReplaySnapshot
// (clone plus json.Marshal of the envelope), Publisher.Replay* (clone), the
// bytes.Equal change filter and the two further copies the transport makes for
// session.last and for the retained pending response.
//
// Each grid size runs three comparable variants — dual, v1-only and v2-only —
// so the share attributable to each contract is read at a fixed vehicle count
// instead of across sizes.
//
// Fixture honesty: the payloads use the real overlay.PayloadV1 and
// overlayv2.UpdateV2 wire types with a full grid, every field present and both
// derived histories at their steady-state depth, so field count, quality
// strings and JSON shape match production. The values are generated, not
// captured from LMU: the *_bytes metrics are a representative size, not
// evidence from a real session. They are deliberately heavier than the ISA-372
// research fixtures (55.757 B at 20 vehicles, 269.573 B at 104) because this
// one leaves no field missing and carries both 120-sample histories, roughly
// 25 KiB extra at any grid size. Treat it as an upper bound on the shape.
//
// 104 vehicles runs v2-only, and only that: v1 crosses the hard 256 KiB
// MaxPayloadBytes ceiling there and the Hub refuses it, so no dual or v1-only
// measurement exists at that size. That ceiling is recorded in ADR 0008 and
// owned by the v1 retirement (#894); it is reported, not worked around.
func BenchmarkOverlayPullTransportPull(b *testing.B) {
	cases := []struct {
		vehicles int
		variants []overlayPullVariant
	}{
		{vehicles: 1, variants: []overlayPullVariant{pullDual, pullV1Only, pullV2Only}},
		{vehicles: 20, variants: []overlayPullVariant{pullDual, pullV1Only, pullV2Only}},
		{vehicles: 44, variants: []overlayPullVariant{pullDual, pullV1Only, pullV2Only}},
		// v1 exceeds the transport ceiling at 104; only v2 can be measured.
		{vehicles: 104, variants: []overlayPullVariant{pullV2Only}},
	}
	for _, testCase := range cases {
		for _, variant := range testCase.variants {
			b.Run(fmt.Sprintf("vehicles=%d/%s", testCase.vehicles, variant), func(b *testing.B) {
				benchmarkOverlayPullTransportPull(b, testCase.vehicles, variant)
			})
		}
	}
}

// overlayPullVariant selects which contracts a run publishes, so the cost of
// each can be compared at one grid size.
type overlayPullVariant string

const (
	pullDual   overlayPullVariant = "dual"
	pullV1Only overlayPullVariant = "v1-only"
	pullV2Only overlayPullVariant = "v2-only"
)

func (variant overlayPullVariant) includesV1() bool { return variant != pullV2Only }
func (variant overlayPullVariant) includesV2() bool { return variant != pullV1Only }

func benchmarkOverlayPullTransportPull(b *testing.B, vehicles int, variant overlayPullVariant) {
	b.Helper()
	const sender = "overlay-window"
	const sessionID = "bench-session"

	hub := NewHub(HubConfig{Product: ProductOverlay})
	if err := hub.PublishStatus(mustStatus(b, 1, StatusPayload{State: "live"})); err != nil {
		b.Fatal(err)
	}
	registry, err := NewPublisherRegistry(PublisherConfig{Product: ProductOverlayV2})
	if err != nil {
		b.Fatal(err)
	}
	transport := NewOverlayPullTransport(hub, registry)

	payloadV1 := benchmarkOverlayPayloadV1(vehicles)
	updateV2 := benchmarkOverlayUpdateV2(vehicles)

	var v1Bytes, v2Bytes int
	if variant.includesV1() {
		v1Bytes = benchmarkOverlayV1Bytes(b, payloadV1)
		if v1Bytes == 0 {
			b.Fatalf("v1 exceeds the transport ceiling at %d vehicles; run this size as %s only",
				vehicles, pullV2Only)
		}
	}
	if variant.includesV2() {
		v2Bytes = benchmarkOverlayV2Bytes(b, updateV2)
	}

	publish := func(sequence uint64) {
		if variant.includesV1() {
			frame, err := NewOverlayFull(benchmarkOverlayMetadata(sequence), 1, payloadV1)
			if err != nil {
				b.Fatal(err)
			}
			if err := hub.PublishSnapshot(frame, nil); err != nil {
				b.Fatal(err)
			}
		}
		if !variant.includesV2() {
			return
		}
		publisher, active := registry.Lookup(ProductOverlayV2)
		if !active {
			return
		}
		updateV2.DeliveryRevision = sequence
		if err := publisher.PublishSnapshot(sequence, updateV2); err != nil {
			b.Fatal(err)
		}
	}

	// The first pull registers the v2 consumer, so the publisher only becomes
	// active from the second sequence onwards. Warm both sides before timing.
	publish(1)
	if _, _, err := transport.Pull(sender, OverlayPullRequest{SessionID: sessionID, Ack: 0}); err != nil {
		b.Fatal(err)
	}
	publish(2)
	first, deliver, err := transport.Pull(sender, OverlayPullRequest{SessionID: sessionID, Ack: 1})
	if err != nil || !deliver {
		b.Fatalf("warm-up pull deliver=%v err=%v", deliver, err)
	}
	ack := first.Delivery
	sequence := uint64(2)

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
		ack = response.Delivery
	}
	b.StopTimer()

	b.ReportMetric(float64(v1Bytes), "v1_bytes")
	b.ReportMetric(float64(v2Bytes), "v2_bytes")
}

// benchmarkOverlayV1Bytes reports the encoded v1 payload size, or zero when the
// grid crosses the transport ceiling, which the caller turns into a skipped
// variant. Any other error fails the benchmark so a genuine regression is never
// silently reported as "too large".
func benchmarkOverlayV1Bytes(b *testing.B, payload overlay.PayloadV1) int {
	b.Helper()
	frame, err := NewOverlayFull(benchmarkOverlayMetadata(1), 1, payload)
	if errors.Is(err, ErrPayloadTooLarge) {
		return 0
	}
	if err != nil {
		b.Fatal(err)
	}
	return len(frame.Payload)
}

func benchmarkOverlayV2Bytes(b *testing.B, update overlayv2.UpdateV2) int {
	b.Helper()
	encoded, err := json.Marshal(update)
	if err != nil {
		b.Fatal(err)
	}
	return len(encoded)
}

func benchmarkOverlayMetadata(sequence uint64) projection.Metadata {
	return projection.Metadata{
		CanonicalVersion:  schema.CanonicalVersionV1,
		ProjectionVersion: overlay.VersionV1,
		Epoch:             1,
		Sequence:          schema.Sequence(sequence),
		CapturedAt:        "2026-08-28T10:00:00.123456789Z",
	}
}

func benchmarkOverlayField[T comparable](value T) projection.Field[T] {
	return projection.Field[T]{
		Present:    true,
		Value:      value,
		Provenance: projection.ProvenanceObserved,
		Freshness:  projection.FreshnessFresh,
	}
}

func benchmarkOverlayPayloadV1(vehicles int) overlay.PayloadV1 {
	rows := make([]overlay.VehicleV1, vehicles)
	for index := range rows {
		suffix := strconv.Itoa(index)
		rows[index] = overlay.VehicleV1{
			ID:               identity.VehicleID("lmu-slot-" + suffix + "-generation-1"),
			Name:             benchmarkOverlayField(vehicle.VehicleName("Vantare Hypercar " + suffix)),
			LapNumber:        benchmarkOverlayField(session.LapNumber(index%60 + 1)),
			Gear:             benchmarkOverlayField(vehicle.Gear(index%8 + 1)),
			EngineRPM:        benchmarkOverlayField(vehicle.EngineRPM(7200.5 + float64(index))),
			Speed:            benchmarkOverlayField(61.125 + float64(index)),
			Throttle:         benchmarkOverlayField(schema.Ratio(0.625)),
			Brake:            benchmarkOverlayField(schema.Ratio(0.125)),
			Clutch:           benchmarkOverlayField(schema.Ratio(0)),
			Position:         benchmarkOverlayField(standings.Position(index + 1)),
			CompletedLaps:    benchmarkOverlayField(standings.CompletedLaps(index % 60)),
			InPit:            benchmarkOverlayField(pit.InPit(index%17 == 0)),
			PitStopCount:     benchmarkOverlayField(pit.StopCount(index % 4)),
			DriverName:       benchmarkOverlayField(identity.DriverName("Driver Number " + suffix)),
			VehicleClass:     benchmarkOverlayField(standings.VehicleClass("HYPERCAR")),
			Sector:           benchmarkOverlayField(standings.Sector(index%3 + 1)),
			LapDistance:      benchmarkOverlayField(standings.LapDistance(137.25 * float64(index+1))),
			BestLapTime:      benchmarkOverlayField(standings.LapTime(203.4567 + float64(index))),
			LastLapTime:      benchmarkOverlayField(standings.LapTime(204.1234 + float64(index))),
			EstimatedLapTime: benchmarkOverlayField(standings.LapTime(203.9876 + float64(index))),
			PenaltyCount:     benchmarkOverlayField(standings.PenaltyCount(index % 3)),
			TimeBehindLeader: benchmarkOverlayField(standings.TimeGap(1.5 * float64(index))),
			LapsBehindLeader: benchmarkOverlayField(standings.LapGap(index / 25)),
			TimeBehindNext:   benchmarkOverlayField(standings.TimeGap(1.25)),
			LapsBehindNext:   benchmarkOverlayField(standings.LapGap(0)),
			FuelLiters:       benchmarkOverlayField(energy.FuelAmount(64.125)),
			FuelCapacity:     benchmarkOverlayField(energy.FuelCapacity(105)),
			RelativeTimeGap:  benchmarkOverlayField(standings.RelativeTime(-2.75)),
			RelativeLapDelta: benchmarkOverlayField(standings.RelativeLaps(0)),
			GroundPosition: benchmarkOverlayField(overlay.GroundPositionV1{
				XCentimetres: int32(index * 1375),
				ZCentimetres: int32(index * -2075),
			}),
		}
	}

	controls := make([]overlay.ControlSampleV1, overlayBenchHistorySamples)
	deltas := make([]overlay.DeltaSampleV1, overlayBenchHistorySamples)
	for index := range controls {
		controls[index] = overlay.ControlSampleV1{
			Epoch:     1,
			Sequence:  schema.Sequence(index + 1),
			VehicleID: "lmu-slot-0-generation-1",
			Throttle:  schema.Ratio(0.5),
			Brake:     schema.Ratio(0.25),
			Clutch:    schema.Ratio(0),
		}
		deltas[index] = overlay.DeltaSampleV1{
			Epoch:             1,
			Sequence:          schema.Sequence(index + 1),
			CapturedAtMillis:  1756377600000 + int64(index)*100,
			SourceTimeSeconds: 1234.5 + float64(index)/10,
			LapDistanceMeters: standings.LapDistance(37.5 * float64(index)),
			DeltaSeconds:      session.DeltaSeconds(-0.3125),
		}
	}

	return overlay.PayloadV1{
		Capabilities: []overlay.Capability{
			overlay.CapabilitySession, overlay.CapabilityStandings, overlay.CapabilityControls,
			overlay.CapabilityHistory, overlay.CapabilityPit, overlay.CapabilitySpatial,
		},
		TrackName:   benchmarkOverlayField("Circuit de la Sarthe"),
		SessionType: benchmarkOverlayField("race"),
		Player:      "lmu-slot-0-generation-1",
		Vehicles:    rows,
		History: overlay.ControlHistoryV1{
			Present:    true,
			Provenance: projection.ProvenanceDerived,
			Freshness:  projection.FreshnessFresh,
			Samples:    controls,
		},
		EndTime:                 benchmarkOverlayField(session.EndTime(86400)),
		Remaining:               benchmarkOverlayField(session.RemainingTime(3600.5)),
		MaximumLaps:             benchmarkOverlayField(session.MaximumLaps(0)),
		PlayerDelta:             benchmarkOverlayField(session.DeltaSeconds(-0.3125)),
		PlayerDeltaPersonalBest: benchmarkOverlayField(session.DeltaSeconds(-0.5)),
		PlayerDeltaSessionBest:  benchmarkOverlayField(session.DeltaSeconds(0.25)),
		PlayerDeltaPreviousLap:  benchmarkOverlayField(session.DeltaSeconds(-0.125)),
		DeltaReference:          benchmarkOverlayField("best-completed-player-lap"),
		DeltaHistory: overlay.DeltaHistoryV1{
			Present:    true,
			Provenance: projection.ProvenanceDerived,
			Freshness:  projection.FreshnessFresh,
			Samples:    deltas,
		},
	}
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
