package lmu

import (
	"net/http"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/vehicle"
)

// ISA-1072 RED: fusion joins the REST car numbers onto the SHM grid by slot
// plus matching vehicle identity. Grid order and identity are untouched; only
// the new number field is overlaid.
func TestFusionJoinsCarNumberBySlotAndVehicle(t *testing.T) {
	wall := time.Unix(910, 0).UTC()
	shared := sharedObservation(wall, "track")
	shared.PlayerPresent = observed(true)
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
		{SourceID: 6, Player: observed(false), VehicleName: observed(vehicle.VehicleName("Team B"))},
		{SourceID: 7, Player: observed(false), VehicleName: observed(vehicle.VehicleName("Team C"))},
	}
	rest := restObservation(wall, 0, "track")
	rest.REST.CarNumbers = []restCarNumber{
		{Slot: 5, Number: "007", Vehicle: "Team A"},
		{Slot: 6, Number: "91", Vehicle: "Team B"},
		{Slot: 7, Number: "50", Vehicle: "Team C"},
	}
	rest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}

	got := (&Fusion{}).Merge(wall, 0, shared, rest)
	if len(got.Vehicles) != 3 || got.Vehicles[0].SourceID != 5 || got.Vehicles[1].SourceID != 6 || got.Vehicles[2].SourceID != 7 {
		t.Fatalf("grid identity/order changed: %#v", got.Vehicles)
	}
	assertFieldValue(t, got.Vehicles[0].CarNumber, standings.CarNumber("007"))
	assertFieldValue(t, got.Vehicles[1].CarNumber, standings.CarNumber("91"))
	assertFieldValue(t, got.Vehicles[2].CarNumber, standings.CarNumber("50"))
}

// ISA-1072 RED: when the REST vehicle identity no longer matches the SHM row
// on the same slot (reused slot, lagging REST), no number is published for
// that row instead of a wrong one. Matching rows are unaffected.
func TestFusionDropsCarNumberOnVehicleMismatch(t *testing.T) {
	wall := time.Unix(911, 0).UTC()
	shared := sharedObservation(wall, "track")
	shared.PlayerPresent = observed(true)
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
		{SourceID: 6, Player: observed(false), VehicleName: observed(vehicle.VehicleName("Team B"))},
	}
	rest := restObservation(wall, 0, "track")
	rest.REST.CarNumbers = []restCarNumber{
		{Slot: 5, Number: "007", Vehicle: "Team A"},
		{Slot: 6, Number: "91", Vehicle: "Team Lagging Behind"},
	}
	rest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}

	got := (&Fusion{}).Merge(wall, 0, shared, rest)
	assertFieldValue(t, got.Vehicles[0].CarNumber, standings.CarNumber("007"))
	if _, present := got.Vehicles[1].CarNumber.Value(); present {
		t.Fatalf("mismatched slot published a number: %#v", got.Vehicles[1].CarNumber)
	}
}

// ISA-1072: an entry without vehicle identity cannot join. The guard is
// slot plus matching vehicle identity, never slot alone.
func TestFusionRejectsCarNumberWithoutVehicleIdentity(t *testing.T) {
	wall := time.Unix(915, 0).UTC()
	shared := sharedObservation(wall, "track")
	shared.PlayerPresent = observed(true)
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	rest := restObservation(wall, 0, "track")
	rest.REST.CarNumbers = []restCarNumber{{Slot: 5, Number: "007", Vehicle: ""}}
	rest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}

	got := (&Fusion{}).Merge(wall, 0, shared, rest)
	if _, present := got.Vehicles[0].CarNumber.Value(); present {
		t.Fatalf("identity-free entry published a number: %#v", got.Vehicles[0].CarNumber)
	}
}

// ISA-1072: ambiguity is counted, so a third entry for the same slot can
// never reactivate it.
func TestFusionDropsTripleDuplicateRESTSlot(t *testing.T) {
	wall := time.Unix(916, 0).UTC()
	shared := sharedObservation(wall, "track")
	shared.PlayerPresent = observed(true)
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	rest := restObservation(wall, 0, "track")
	rest.REST.CarNumbers = []restCarNumber{
		{Slot: 5, Number: "007", Vehicle: "Team A"},
		{Slot: 5, Number: "008", Vehicle: "Team A"},
		{Slot: 5, Number: "007", Vehicle: "Team A"},
	}
	rest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}

	got := (&Fusion{}).Merge(wall, 0, shared, rest)
	if _, present := got.Vehicles[0].CarNumber.Value(); present {
		t.Fatalf("triple-claimed slot published a number: %#v", got.Vehicles[0].CarNumber)
	}
}

// ISA-1072: session protection is a real boundary, not the name check. After
// a fresh SHM session change, the previous session's grid — still within its
// TTL and with the same vehicle label on the reused slot — publishes nothing
// until a grid polled at or after the boundary arrives.
func TestFusionSessionBoundaryDropsPreviousNumbers(t *testing.T) {
	wall := time.Unix(917, 0).UTC()
	var fusion Fusion

	sharedA := sharedObservation(wall, "Track A")
	sharedA.PlayerPresent = observed(true)
	sharedA.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	restA := restObservation(wall, 0, "Track A")
	restA.REST.CarNumbers = []restCarNumber{{Slot: 5, Number: "007", Vehicle: "Team A"}}
	restA.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}
	if got := fusion.Merge(wall, 0, sharedA, restA); len(got.Vehicles) != 1 {
		t.Fatalf("session A grid = %#v", got.Vehicles)
	} else {
		assertFieldValue(t, got.Vehicles[0].CarNumber, standings.CarNumber("007"))
	}

	sharedB := sharedObservation(wall.Add(time.Second), "Track B")
	sharedB.PlayerPresent = observed(true)
	sharedB.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	gotB := fusion.Merge(wall.Add(time.Second), time.Second, sharedB)
	if len(gotB.Vehicles) != 1 {
		t.Fatalf("session B grid = %#v", gotB.Vehicles)
	}
	if _, present := gotB.Vehicles[0].CarNumber.Value(); present {
		t.Fatalf("previous session number leaked across the boundary: %#v", gotB.Vehicles[0].CarNumber)
	}

	restB := restObservation(wall.Add(2*time.Second), 2*time.Second, "Track B")
	restB.REST.CarNumbers = []restCarNumber{{Slot: 5, Number: "007", Vehicle: "Team A"}}
	restB.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: time.Second, set: true}
	gotC := fusion.Merge(wall.Add(2*time.Second), 2*time.Second, sharedB, restB)
	if len(gotC.Vehicles) != 1 {
		t.Fatalf("session B re-polled grid = %#v", gotC.Vehicles)
	}
	assertFieldValue(t, gotC.Vehicles[0].CarNumber, standings.CarNumber("007"))
}

// ISA-1072: the floor also reuses the existing source-clock signal. A clock
// reset on the same track and type raises the boundary just like a signature
// change, so the old grid cannot publish afterwards.
func TestFusionClockResetDropsPreviousNumbers(t *testing.T) {
	wall := time.Unix(918, 0).UTC()
	var fusion Fusion

	sharedA := sharedObservation(wall, "Track A")
	sharedA.PlayerPresent = observed(true)
	sharedA.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	restA := restObservation(wall, 0, "Track A")
	restA.REST.CarNumbers = []restCarNumber{{Slot: 5, Number: "007", Vehicle: "Team A"}}
	restA.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}
	if got := fusion.Merge(wall, 0, sharedA, restA); len(got.Vehicles) != 1 {
		t.Fatalf("pre-reset grid = %#v", got.Vehicles)
	} else {
		assertFieldValue(t, got.Vehicles[0].CarNumber, standings.CarNumber("007"))
	}

	sharedB := sharedObservation(wall.Add(time.Second), "Track A")
	sharedB.PlayerPresent = observed(true)
	sharedB.ClockChange = ClockReset
	sharedB.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	gotB := fusion.Merge(wall.Add(time.Second), time.Second, sharedB)
	if len(gotB.Vehicles) != 1 {
		t.Fatalf("post-reset grid = %#v", gotB.Vehicles)
	}
	if _, present := gotB.Vehicles[0].CarNumber.Value(); present {
		t.Fatalf("pre-reset number leaked across the clock reset: %#v", gotB.Vehicles[0].CarNumber)
	}
}

// ISA-1072 follow-up regression: the floor sees the request start, using
// real fetch stamps end to end. The standings request starts at 9.9s and is
// answered at 10.1s; the SHM boundary lands at 10s with the same slot and
// vehicle label. The old grid (start 9.9s) must not publish; a grid polled
// fully after the boundary must.
func TestFusionSessionFloorRejectsGridStartedBeforeBoundary(t *testing.T) {
	wall := time.Unix(940, 0).UTC()
	clock := &lockedClock{now: wall}
	clock.advance(9900 * time.Millisecond)
	client := doerFunc(func(request *http.Request) (*http.Response, error) {
		clock.advance(200 * time.Millisecond)
		if request.URL.Path == standingsEndpoint {
			return responseFor(request, http.StatusOK, `[{"slotID":5,"player":true,"position":1,"lapsCompleted":2,"pitstops":0,"carNumber":"007","vehicleName":"Team A"}]`), nil
		}
		return responseFor(request, http.StatusOK, `{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":4,"currentEventTime":10}`), nil
	})
	newPollConfig := func() *restConfig {
		return normalizeRESTConfig(&restConfig{
			baseURL: "http://127.0.0.1:6397",
			client:  client,
			now:     clock.current,
			elapsed: clock.currentElapsed,
		}, clock.current, clock.currentElapsed)
	}

	var fusion Fusion
	sharedA := sharedObservation(wall, "Track A")
	sharedA.PlayerPresent = observed(true)
	sharedA.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	fusion.Merge(wall, 9*time.Second, sharedA)

	oldPoll, _ := pollREST(t.Context(), newPollConfig(), &restCache{})
	if len(oldPoll.REST.CarNumbers) != 1 {
		t.Fatalf("old poll grid = %#v, want one entry", oldPoll.REST.CarNumbers)
	}
	sharedB := sharedObservation(wall.Add(10*time.Second), "Track B")
	sharedB.PlayerPresent = observed(true)
	sharedB.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	// The boundary merge lands first (floor at exactly 10s); the pre-boundary
	// poll merges afterwards at 10.2s — past its 10.1s answer, so only the
	// floor, never the future-guard, can reject its 9.9s grid.
	fusion.Merge(wall.Add(10*time.Second), 10*time.Second, sharedB)
	boundary := fusion.Merge(wall.Add(10200*time.Millisecond), 10200*time.Millisecond, oldPoll)
	if len(boundary.Vehicles) != 1 {
		t.Fatalf("boundary grid = %#v", boundary.Vehicles)
	}
	if _, present := boundary.Vehicles[0].CarNumber.Value(); present {
		t.Fatalf("grid requested before the boundary leaked across it: %#v", boundary.Vehicles[0].CarNumber)
	}

	clock.advance(800 * time.Millisecond)
	freshPoll, _ := pollREST(t.Context(), newPollConfig(), &restCache{})
	refreshed := fusion.Merge(clock.current(), clock.currentElapsed(), sharedB, freshPoll)
	if len(refreshed.Vehicles) != 1 {
		t.Fatalf("refreshed grid = %#v", refreshed.Vehicles)
	}
	assertFieldValue(t, refreshed.Vehicles[0].CarNumber, standings.CarNumber("007"))
}

// ISA-1072: existing intent pinned — the SHM name match guards validity, not
// recency. A stale SHM row keeps its identity while the source is frozen, so
// a fresh REST grid still joins it.
func TestFusionStaleSHMNameStillJoinsFreshGrid(t *testing.T) {
	wall := time.Unix(941, 0).UTC()
	shared := sharedObservation(wall, "track")
	shared.PlayerPresent = observed(true)
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: fieldWithFreshness(vehicle.VehicleName("Team A"), schema.FreshnessStale)},
	}
	rest := restObservation(wall, 0, "track")
	rest.REST.CarNumbers = []restCarNumber{{Slot: 5, Number: "007", Vehicle: "Team A"}}
	rest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}

	got := (&Fusion{}).Merge(wall, 0, shared, rest)
	assertFieldValue(t, got.Vehicles[0].CarNumber, standings.CarNumber("007"))
}

// ISA-1072: without a REST grid every row keeps its number absent, and a
// vanished slot loses its number instead of retaining it.
func TestFusionCarNumberAbsentWithoutRESTGrid(t *testing.T) {
	wall := time.Unix(912, 0).UTC()
	shared := sharedObservation(wall, "track")
	shared.PlayerPresent = observed(true)
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	rest := restObservation(wall, 0, "track")

	got := (&Fusion{}).Merge(wall, 0, shared, rest)
	if _, present := got.Vehicles[0].CarNumber.Value(); present {
		t.Fatalf("number without REST grid: %#v", got.Vehicles[0].CarNumber)
	}
	if len(got.Vehicles) != 1 || got.Vehicles[0].SourceID != 5 {
		t.Fatalf("grid changed without REST: %#v", got.Vehicles)
	}
}

// ISA-1072 RED: a REST grid older than the REST TTL never reaches the grid,
// even when slot and vehicle still match.
func TestFusionDropsStaleCarNumbers(t *testing.T) {
	wall := time.Unix(913, 0).UTC()
	shared := sharedObservation(wall, "track")
	shared.PlayerPresent = observed(true)
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
	}
	rest := restObservation(wall, 0, "track")
	rest.REST.CarNumbers = []restCarNumber{{Slot: 5, Number: "007", Vehicle: "Team A"}}
	rest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}

	got := (&Fusion{}).Merge(wall, defaultRESTTTL+time.Nanosecond, shared, rest)
	if _, present := got.Vehicles[0].CarNumber.Value(); present {
		t.Fatalf("stale number published: %#v", got.Vehicles[0].CarNumber)
	}
}

// ISA-1072 RED: a slot claimed twice in one REST poll is ambiguous, so neither
// entry publishes a number. Unambiguous slots are unaffected.
func TestFusionDropsDuplicateRESTSlots(t *testing.T) {
	wall := time.Unix(914, 0).UTC()
	shared := sharedObservation(wall, "track")
	shared.PlayerPresent = observed(true)
	shared.Vehicles = []VehicleObservation{
		{SourceID: 5, Player: observed(true), VehicleName: observed(vehicle.VehicleName("Team A"))},
		{SourceID: 6, Player: observed(false), VehicleName: observed(vehicle.VehicleName("Team B"))},
	}
	rest := restObservation(wall, 0, "track")
	rest.REST.CarNumbers = []restCarNumber{
		{Slot: 5, Number: "007", Vehicle: "Team A"},
		{Slot: 5, Number: "008", Vehicle: "Team A"},
		{Slot: 6, Number: "91", Vehicle: "Team B"},
	}
	rest.REST.carNumbersUpdatedMono = monotonicStamp{elapsed: 0, set: true}

	got := (&Fusion{}).Merge(wall, 0, shared, rest)
	if _, present := got.Vehicles[0].CarNumber.Value(); present {
		t.Fatalf("duplicated slot published a number: %#v", got.Vehicles[0].CarNumber)
	}
	assertFieldValue(t, got.Vehicles[1].CarNumber, standings.CarNumber("91"))
}
