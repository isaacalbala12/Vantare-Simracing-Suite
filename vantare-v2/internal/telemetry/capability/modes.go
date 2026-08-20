package capability

import "slices"

// SessionEvidence is what one live session proves about the *resolution* of a
// capability, as opposed to its mere presence. Resolve() already answers "is
// there data"; this answers "which of the declared resolutions still holds".
//
// The composition root fills it from the canonical state. This package never
// reads telemetry and never names a simulator.
type SessionEvidence struct {
	// WorldPosition is the quality of the grid's world coordinates. A
	// geometric spatial mode only survives while these are fresh: a stale
	// position is a position that has already moved.
	WorldPosition Quality
	// LapDistance is the quality of the longitudinal position, which is the
	// fallback a driver degrades to when geometry is gone.
	LapDistance Quality
	// DeltaReferences lists the delta references that currently carry a
	// usable value. Order is irrelevant: the declared order wins.
	DeltaReferences []string
	// Standings is the quality of the simulator-published running order.
	Standings Quality
	// Gaps is the quality of the gap set.
	Gaps Quality
}

// usableNow reports evidence good enough to keep a resolution that describes
// the *current* instant. Stale is not good enough for geometry.
func (quality Quality) usableNow() bool { return quality == QualityFresh }

// usable reports evidence good enough to keep a resolution that tolerates a
// slightly old value.
func (quality Quality) usable() bool {
	return quality == QualityFresh || quality == QualityStale
}

// ResolveModes narrows a driver's declared modes with the evidence of one
// session. It can only ever degrade: a driver that never publishes world
// coordinates cannot be promoted to "xyz" by any amount of live data, and a
// driver that does publish them falls back to lap distance -- and then to
// none -- the moment they stop arriving.
func ResolveModes(declaration Declaration, evidence SessionEvidence) Modes {
	declared := declaration.Modes.normalized()
	resolved := Modes{
		Spatial:         resolveSpatial(declared.Spatial, evidence),
		DeltaReferences: resolveDeltaReferences(declared.DeltaReferences, evidence.DeltaReferences),
		Standings:       resolveStandings(declared.Standings, evidence.Standings),
		Gaps:            resolveGaps(declared.Gaps, evidence.Gaps),
	}
	if !declaration.Supports(Delta) {
		resolved.DeltaReferences = []string{}
	}
	if !declaration.Supports(Standings) {
		resolved.Standings = StandingsNone
	}
	if !declaration.Supports(Gaps) {
		resolved.Gaps = GapsNone
	}
	if !declaration.Supports(SpatialLongitudinal) && !declaration.Supports(SpatialLateral) {
		resolved.Spatial = SpatialNone
	}
	return resolved.normalized()
}

// resolveSpatial degrades geometry to lap distance and lap distance to none.
// XY and lap-distance are declared here for drivers that publish no altitude
// or no coordinates at all; the vocabulary is complete before a driver needs
// it so that consumers never grow a new branch when one arrives.
func resolveSpatial(declared SpatialMode, evidence SessionEvidence) SpatialMode {
	switch declared {
	case SpatialXYZ, SpatialXY:
		if evidence.WorldPosition.usableNow() {
			return declared
		}
		if evidence.LapDistance.usable() {
			return SpatialLapDistance
		}
		return SpatialNone
	case SpatialLapDistance:
		if evidence.LapDistance.usable() {
			return SpatialLapDistance
		}
		return SpatialNone
	default:
		return SpatialNone
	}
}

// resolveDeltaReferences intersects the declared references with the ones that
// currently carry data, preserving the declared order so the consumer's
// fallback is deterministic.
func resolveDeltaReferences(declared, withData []string) []string {
	result := make([]string, 0, len(declared))
	for _, reference := range declared {
		if slices.Contains(withData, reference) {
			result = append(result, reference)
		}
	}
	return result
}

func resolveStandings(declared StandingsMode, quality Quality) StandingsMode {
	if declared == StandingsNone || !quality.usable() {
		return StandingsNone
	}
	return declared
}

func resolveGaps(declared GapsMode, quality Quality) GapsMode {
	if declared == GapsNone || !quality.usable() {
		return GapsNone
	}
	return declared
}
