package launcher

import (
	"fmt"
	"time"
)

// emaAlpha is the smoothing factor for the exponential moving average
// of AvgChainDurationMs. α=0.3 gives a good balance: it converges to 90%
// of the stable value in ~7 launches and responds quickly to real changes
// without being too noisy.
const emaAlpha = 0.3

// RecordProfileAttempt always increments the launch counter and updates the
// last launched timestamp for the given profile. It is called whether the
// chain succeeds or fails. Returns ErrProfileNotFound if the profile does
// not exist.
func RecordProfileAttempt(backend ProfilesBackend, profileID string) error {
	profiles := backend.GetLauncherProfiles()
	for i := range profiles {
		if profiles[i].ID == profileID {
			profiles[i].LaunchCount++
			now := time.Now()
			profiles[i].LastLaunchedAt = &now
			return backend.SetLauncherProfiles(profiles)
		}
	}
	return fmt.Errorf("%w: %s", ErrProfileNotFound, profileID)
}

// RecordProfileSuccess updates the average chain duration for the given
// profile using an exponential moving average (EMA) with α=0.3. It is
// called only when a chain finishes with total success (all steps started).
// If AvgChainDurationMs is 0 (first successful launch), it is initialized
// directly to durationMs. Returns ErrProfileNotFound if the profile does
// not exist.
func RecordProfileSuccess(backend ProfilesBackend, profileID string, durationMs int64) error {
	profiles := backend.GetLauncherProfiles()
	for i := range profiles {
		if profiles[i].ID == profileID {
			if profiles[i].AvgChainDurationMs == 0 {
				profiles[i].AvgChainDurationMs = durationMs
			} else {
				old := float64(profiles[i].AvgChainDurationMs)
				profiles[i].AvgChainDurationMs = int64(emaAlpha*float64(durationMs) + (1-emaAlpha)*old)
			}
			return backend.SetLauncherProfiles(profiles)
		}
	}
	return fmt.Errorf("%w: %s", ErrProfileNotFound, profileID)
}
