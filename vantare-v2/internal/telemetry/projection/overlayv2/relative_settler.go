package overlayv2

import (
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

const relativeSettledHold = 7 * time.Second

// relativeSettler belongs to a CachedProjector, so its history is confined to
// one publishing session. Project supplies the monotonic clock; no timer or
// global mutable state is involved.
type relativeSettler struct {
	session      string
	epoch        uint64
	player       string
	accepted     []RelativeRowV2
	pending      []string
	pendingSince time.Time
}

func (settler *relativeSettler) project(final derive.FinalState, candidate []RelativeRowV2, header envelope.Header, now time.Time) []RelativeRowV2 {
	player := BuildPlayerInstruments(final, DefaultPreferencesV2()).VehicleID
	if player == "" {
		settler.reset()
		return []RelativeRowV2{}
	}
	session, epoch := string(header.Identity.Session), uint64(header.Cursor.Epoch)
	if settler.session != session || settler.epoch != epoch || settler.player != player || len(settler.accepted) == 0 {
		settler.session, settler.epoch, settler.player = session, epoch, player
		settler.accepted, settler.pending, settler.pendingSince = candidate, nil, time.Time{}
		return candidate
	}
	accepted, present := rehydrateSettledRows(final, settler.accepted)
	if !present {
		settler.accepted, settler.pending, settler.pendingSince = candidate, nil, time.Time{}
		return candidate
	}
	candidateIDs := relativeIDs(candidate)
	if sameRelativeIDs(relativeIDs(settler.accepted), candidateIDs) {
		settler.pending, settler.pendingSince = nil, time.Time{}
		settler.accepted = accepted
		return accepted
	}
	// The debounce is intentionally over the complete ordered window, not only
	// its set membership. Relative order can oscillate around a timing boundary;
	// publishing each oscillation is the row jump ISA-958 removes. While every
	// accepted ID is still observed, a different ordered candidate must remain
	// unchanged for the whole hold before it becomes visible.
	if !sameRelativeIDs(settler.pending, candidateIDs) {
		settler.pending, settler.pendingSince = candidateIDs, now
		settler.accepted = accepted
		return accepted
	}
	settler.accepted = accepted
	elapsed := now.Sub(settler.pendingSince)
	if elapsed < 0 {
		// CachedProjector supplies time.Now (with its monotonic component), but
		// tests and future callers may inject a wall-only time. A backwards clock
		// must never publish a candidate early.
		elapsed = 0
	}
	if elapsed < relativeSettledHold {
		return accepted
	}
	settler.accepted, settler.pending, settler.pendingSince = candidate, nil, time.Time{}
	return candidate
}

func (settler *relativeSettler) reset() { *settler = relativeSettler{} }

func relativeIDs(rows []RelativeRowV2) []string {
	ids := make([]string, len(rows))
	for i := range rows {
		ids[i] = rows[i].VehicleID
	}
	return ids
}
func sameRelativeIDs(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

// rehydrateSettledRows reads accepted vehicles from this FinalState. It does
// not cache rows and does not allocate/publish a full-grid relative view.
func rehydrateSettledRows(final derive.FinalState, accepted []RelativeRowV2) ([]RelativeRowV2, bool) {
	vehicles := make(map[string]int, len(final.Observed.Vehicles))
	positions := resolvedRelativePositions(final.Observed.Vehicles)
	gaps := make(map[string]schema.Field[standings.RelativeTime], len(final.Derived.Gaps.Vehicles))
	for i := range final.Observed.Vehicles {
		vehicles[string(final.Observed.Vehicles[i].Identity.Vehicle)] = i
	}
	for _, gap := range final.Derived.Gaps.Vehicles {
		gaps[string(gap.Vehicle)] = gap.Time
	}
	rows := make([]RelativeRowV2, 0, len(accepted))
	for _, previous := range accepted {
		index, ok := vehicles[previous.VehicleID]
		if !ok {
			return nil, false
		}
		vehicle := final.Observed.Vehicles[index]
		position := positions[previous.VehicleID]
		if previous.Side == RelativeSidePlayer {
			rows = append(rows, playerRelativeRow(vehicle, position, gaps[previous.VehicleID]))
			continue
		}
		rows = append(rows, relativeRow(vehicle, position, gaps[previous.VehicleID], previous.Side))
	}
	return rows, true
}
