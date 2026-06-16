package delta

import "fmt"

// Store holds reference laps per mode and live lap buffers per vehicle.
// It accumulates LapPoints during a lap and promotes the buffer to a
// ReferenceLap when CompleteLap is called.
type Store struct {
	selfLaps    map[string]*ReferenceLap // key: track|carClass|vehicleID
	sessionLap  *ReferenceLap
	globalLap   *ReferenceLap
	liveBuffers map[string][]LapPoint // key: track|carClass|vehicleID
}

// NewStore creates an empty Store.
func NewStore() *Store {
	return &Store{
		selfLaps:    make(map[string]*ReferenceLap),
		liveBuffers: make(map[string][]LapPoint),
	}
}

func storeKey(trackName, carClass string, vehicleID int) string {
	return fmt.Sprintf("%s|%s|%d", trackName, carClass, vehicleID)
}

// RecordPoint appends a lap point to the live buffer for the given vehicle.
// Call this on every telemetry tick for the player vehicle.
func (s *Store) RecordPoint(vehicleID int, trackName, carClass string, distance, timeIntoLap float64) {
	key := storeKey(trackName, carClass, vehicleID)
	point := LapPoint{Distance: distance, TimeIntoLap: timeIntoLap}
	s.liveBuffers[key] = append(s.liveBuffers[key], point)
}

// CompleteLap promotes the live buffer for the given vehicle into a
// ReferenceLap under the specified mode. For ModeSelf it stores per-vehicle;
// for ModeSession/Global it replaces the single reference only if the new lap
// is faster. The live buffer is cleared after promotion.
func (s *Store) CompleteLap(vehicleID int, trackName, carClass string, bestLapTime float64, mode ReferenceMode) {
	key := storeKey(trackName, carClass, vehicleID)
	points := s.liveBuffers[key]
	if len(points) == 0 {
		return
	}
	ref := NewReferenceLap(mode, trackName, carClass, points)
	switch mode {
	case ModeSelf:
		s.selfLaps[key] = ref
	case ModeSession:
		if s.sessionLap == nil || bestLapTime < s.sessionLap.Total {
			s.sessionLap = ref
		}
	case ModeGlobal:
		if s.globalLap == nil || bestLapTime < s.globalLap.Total {
			s.globalLap = ref
		}
	}
	s.liveBuffers[key] = nil
}

// GetReference returns the best reference lap for the given mode and vehicle.
// For ModeSession and ModeGlobal, if no reference exists yet a synthetic
// reference is created from bestLapTime and trackLength.
func (s *Store) GetReference(mode ReferenceMode, vehicleID int, trackName, carClass string, trackLength, bestLapTime float64) *ReferenceLap {
	switch mode {
	case ModeSelf:
		key := storeKey(trackName, carClass, vehicleID)
		if ref, ok := s.selfLaps[key]; ok {
			return ref
		}
		// Fall back to synthetic if we have a best lap time
		if bestLapTime > 0 && trackLength > 0 {
			return SyntheticReference(bestLapTime, trackLength, 20)
		}
		return nil
	case ModeSession:
		if s.sessionLap != nil {
			return s.sessionLap
		}
		if bestLapTime > 0 && trackLength > 0 {
			return SyntheticReference(bestLapTime, trackLength, 20)
		}
		return nil
	case ModeGlobal:
		if s.globalLap != nil {
			return s.globalLap
		}
		if bestLapTime > 0 && trackLength > 0 {
			return SyntheticReference(bestLapTime, trackLength, 20)
		}
		return nil
	default:
		return nil
	}
}
