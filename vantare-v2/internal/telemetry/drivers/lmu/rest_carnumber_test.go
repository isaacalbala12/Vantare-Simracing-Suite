package lmu

import (
	"net/http"
	"testing"
	"time"
)

// ISA-1072 RED: the LMU REST reader must stop discarding the real carNumber.
// The live /rest/watch/standings endpoint provides slotID, carNumber and
// vehicleName per row; the canonical flow keeps the number as a string so
// "007" never becomes 7.
func TestRESTStandingsDecodesCarNumberGridPreservingLeadingZeros(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[` +
				`{"slotID":5,"player":true,"position":3,"lapsCompleted":8,"pitstops":1,"carNumber":"007","vehicleName":"Team A"},` +
				`{"slotID":6,"player":false,"position":4,"lapsCompleted":8,"pitstops":0,"carNumber":"91","vehicleName":"Team B"},` +
				`{"slotID":7,"player":false,"position":5,"lapsCompleted":7,"pitstops":2,"carNumber":"50","vehicleName":"Team C"}` +
				`]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(200, 0).UTC()
	observation, complete := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
	if !complete || observation.REST.Status != RESTStatusLive {
		t.Fatalf("observation = %#v complete=%v", observation, complete)
	}
	numbers := observation.REST.CarNumbers
	if len(numbers) != 3 {
		t.Fatalf("car numbers = %#v, want 3 entries", numbers)
	}
	want := map[int32]restCarNumber{
		5: {Slot: 5, Number: "007", Vehicle: "Team A"},
		6: {Slot: 6, Number: "91", Vehicle: "Team B"},
		7: {Slot: 7, Number: "50", Vehicle: "Team C"},
	}
	for _, entry := range numbers {
		expected, ok := want[entry.Slot]
		if !ok {
			t.Fatalf("unexpected slot %d in %#v", entry.Slot, numbers)
		}
		if entry != expected {
			t.Fatalf("slot %d = %#v, want %#v", entry.Slot, entry, expected)
		}
	}
}

// ISA-1072 RED: carNumber validation preserves short numeric strings exactly
// (including leading zeros) and drops everything else instead of inventing a
// value from another field.
func TestRESTCarNumberValidation(t *testing.T) {
	t.Parallel()

	valid := map[string]string{
		"007":  "007",
		"46":   "46",
		"7":    "7",
		" 91 ": "91",
	}
	for raw, want := range valid {
		if got, ok := normalizeRESTCarNumber(raw); !ok || got != want {
			t.Fatalf("normalizeRESTCarNumber(%q) = (%q,%v), want (%q,true)", raw, got, ok, want)
		}
	}
	invalid := []string{"", "   ", "12345", "7A", "A7", "-1", "4.5", "N°7", "4\x007"}
	for _, raw := range invalid {
		if got, ok := normalizeRESTCarNumber(raw); ok {
			t.Fatalf("normalizeRESTCarNumber(%q) = (%q,true), want rejected", raw, got)
		}
	}
}

// ISA-1072 RED: rows without a usable number never contribute an identity,
// and an invalid row never poisons the valid ones from the same poll.
func TestRESTStandingsSkipsRowsWithoutUsableCarNumber(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[` +
				`{"slotID":5,"player":true,"position":1,"lapsCompleted":2,"pitstops":0,"carNumber":"007","vehicleName":"Team A"},` +
				`{"slotID":6,"player":false,"position":2,"lapsCompleted":2,"pitstops":0,"carNumber":"","vehicleName":"Team B"},` +
				`{"slotID":7,"player":false,"position":3,"lapsCompleted":2,"pitstops":0,"carNumber":"7A","vehicleName":"Team C"},` +
				`{"slotID":-1,"player":false,"position":4,"lapsCompleted":2,"pitstops":0,"carNumber":"50","vehicleName":"Team D"}` +
				`]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(200, 0).UTC()
	observation, _ := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
	numbers := observation.REST.CarNumbers
	if len(numbers) != 1 || numbers[0] != (restCarNumber{Slot: 5, Number: "007", Vehicle: "Team A"}) {
		t.Fatalf("car numbers = %#v, want only slot 5 with 007", numbers)
	}
}

// ISA-1072: an absent/null slotID is not slot 0. A row without an explicit
// slot never contributes, while slot 0 with a usable number does.
func TestRESTStandingsDistinguishesAbsentSlotFromSlotZero(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[` +
				`{"slotID":0,"player":true,"position":1,"lapsCompleted":2,"pitstops":0,"carNumber":"007","vehicleName":"Team A"},` +
				`{"player":false,"position":2,"lapsCompleted":2,"pitstops":0,"carNumber":"91","vehicleName":"Team B"},` +
				`{"slotID":null,"player":false,"position":3,"lapsCompleted":2,"pitstops":0,"carNumber":"50","vehicleName":"Team C"}` +
				`]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(200, 0).UTC()
	observation, _ := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
	numbers := observation.REST.CarNumbers
	if len(numbers) != 1 || numbers[0] != (restCarNumber{Slot: 0, Number: "007", Vehicle: "Team A"}) {
		t.Fatalf("car numbers = %#v, want only slot 0 with 007", numbers)
	}
}

// ISA-1072: duplicates are counted before numbers are validated, so a slot
// claimed twice stays ambiguous even when only one row carries a usable
// number. Unambiguous slots are unaffected.
func TestRESTStandingsDuplicateSlotWithInvalidNumberStaysAmbiguous(t *testing.T) {
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case standingsEndpoint:
			_, _ = w.Write([]byte(`[` +
				`{"slotID":5,"player":true,"position":1,"lapsCompleted":2,"pitstops":0,"carNumber":"007","vehicleName":"Team A"},` +
				`{"slotID":5,"player":false,"position":2,"lapsCompleted":2,"pitstops":0,"carNumber":"ZZ","vehicleName":"Team A"},` +
				`{"slotID":6,"player":false,"position":3,"lapsCompleted":2,"pitstops":0,"carNumber":"91","vehicleName":"Team B"}` +
				`]`))
		case sessionInfoEndpoint:
			_, _ = w.Write([]byte(`{"trackName":"Test Circuit","session":"RACE1","numberOfVehicles":21,"currentEventTime":42}`))
		default:
			http.NotFound(w, request)
		}
	})
	defer server.Close()

	now := time.Unix(200, 0).UTC()
	observation, _ := pollREST(t.Context(), testRESTConfig(server, now), &restCache{})
	numbers := observation.REST.CarNumbers
	if len(numbers) != 1 || numbers[0] != (restCarNumber{Slot: 6, Number: "91", Vehicle: "Team B"}) {
		t.Fatalf("car numbers = %#v, want only slot 6 with 91", numbers)
	}
}

// ISA-1072 RED: numbers share the existing REST TTL. Once the grid is stale
// the snapshot carries no numbers rather than a stale identity that could
// belong to a reused slot.
func TestRESTCarNumbersExpireWithTTL(t *testing.T) {
	failing := false
	server := newRESTServer(t, func(w http.ResponseWriter, request *http.Request) {
		if failing {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		if request.URL.Path == standingsEndpoint {
			_, _ = w.Write([]byte(`[{"slotID":5,"player":true,"position":1,"lapsCompleted":2,"pitstops":0,"carNumber":"007","vehicleName":"Team A"}]`))
			return
		}
		_, _ = w.Write([]byte(`{"trackName":"Old Track","session":"PRACTICE1","numberOfVehicles":4,"currentEventTime":10}`))
	})
	defer server.Close()

	firstTime := time.Unix(200, 0).UTC()
	cfg := testRESTConfig(server, firstTime)
	cache := &restCache{}
	first, _ := pollREST(t.Context(), cfg, cache)
	if len(first.REST.CarNumbers) != 1 {
		t.Fatalf("first car numbers = %#v, want one entry", first.REST.CarNumbers)
	}
	failing = true
	cfg.now = func() time.Time { return firstTime.Add(cfg.ttl + time.Nanosecond) }
	cfg.elapsed = func() time.Duration { return cfg.ttl + time.Nanosecond }
	second, _ := pollREST(t.Context(), cfg, cache)
	if len(second.REST.CarNumbers) != 0 {
		t.Fatalf("stale car numbers = %#v, want none", second.REST.CarNumbers)
	}
}
