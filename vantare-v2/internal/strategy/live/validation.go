package live

import (
	"errors"
	"math"
	"slices"
	"time"

	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

var errInvalidFieldQuality = errors.New("presence, provenance and freshness are incoherent")

func validateProjection(snapshot strategyprojection.SnapshotV1) error {
	if snapshot.CanonicalVersion != 1 ||
		snapshot.ProjectionVersion != strategyprojection.VersionV1 {
		return invalid(ErrInvalidProjection, "version", nil)
	}
	if snapshot.Epoch == 0 || uint64(snapshot.Epoch) > uint64(maxSafeInteger) ||
		snapshot.Sequence == 0 || uint64(snapshot.Sequence) > uint64(maxSafeInteger) {
		return invalid(ErrInvalidProjection, "cursor", nil)
	}
	captured, err := time.Parse(time.RFC3339Nano, snapshot.CapturedAt)
	if err != nil || snapshot.CapturedAt != captured.UTC().Format(time.RFC3339Nano) {
		return invalid(ErrInvalidProjection, "capturedAt", err)
	}

	fields := []error{
		validateField(snapshot.TrackName), validateField(snapshot.SessionType), validateField(snapshot.SourceTime),
		validateField(snapshot.EndTime), validateField(snapshot.Remaining), validateField(snapshot.MaximumLaps),
		validateField(snapshot.Player.LapNumber), validateField(snapshot.Player.CompletedLaps),
		validateField(snapshot.Player.Sector), validateField(snapshot.Player.LapDistance),
		validateField(snapshot.Player.InPit), validateField(snapshot.Player.PitStopCount),
		validateField(snapshot.Player.FuelLiters), validateField(snapshot.Player.FuelCapacity),
	}
	for _, fieldErr := range fields {
		if fieldErr != nil {
			return invalid(ErrInvalidProjection, "payload", fieldErr)
		}
	}
	if err := validateNumbers(snapshot); err != nil {
		return invalid(ErrInvalidProjection, "payload", err)
	}
	if snapshot.Player.FuelLiters.Present != snapshot.Player.FuelCapacity.Present ||
		snapshot.Player.FuelLiters.Provenance != snapshot.Player.FuelCapacity.Provenance ||
		snapshot.Player.FuelLiters.Freshness != snapshot.Player.FuelCapacity.Freshness {
		return invalid(ErrInvalidProjection, "player.fuel", errInvalidFieldQuality)
	}
	if !slices.Equal(snapshot.Capabilities, expectedCapabilities(snapshot.PayloadV1)) {
		return invalid(ErrCapabilityConflict, "capabilities", nil)
	}
	return nil
}

func validateField[T comparable](field telemetryprojection.Field[T]) error {
	switch field.Freshness {
	case telemetryprojection.FreshnessMissing:
		var zero T
		if field.Present || field.Value != zero || field.Provenance != telemetryprojection.ProvenanceUnknown {
			return errInvalidFieldQuality
		}
	case telemetryprojection.FreshnessFresh, telemetryprojection.FreshnessStale, telemetryprojection.FreshnessInvalid:
		if !field.Present || field.Provenance == telemetryprojection.ProvenanceUnknown {
			return errInvalidFieldQuality
		}
		if field.Provenance != telemetryprojection.ProvenanceObserved &&
			field.Provenance != telemetryprojection.ProvenanceDerived &&
			field.Provenance != telemetryprojection.ProvenanceEstimated {
			return errInvalidFieldQuality
		}
	default:
		return errInvalidFieldQuality
	}
	return nil
}

func validateNumbers(snapshot strategyprojection.SnapshotV1) error {
	for _, value := range []float64{
		snapshot.SourceTime.Value, float64(snapshot.EndTime.Value), float64(snapshot.Remaining.Value),
		float64(snapshot.Player.LapDistance.Value), float64(snapshot.Player.FuelLiters.Value), float64(snapshot.Player.FuelCapacity.Value),
	} {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return errors.New("numeric projection values must be finite and non-negative")
		}
	}
	if snapshot.MaximumLaps.Value < 0 || snapshot.Player.LapNumber.Value < 0 ||
		snapshot.Player.CompletedLaps.Value < 0 || snapshot.Player.PitStopCount.Value < 0 {
		return errors.New("integer projection values must be non-negative")
	}
	if snapshot.Player.Sector.Present && snapshot.Player.Sector.Value > 3 {
		return errors.New("present sector exceeds the producer v1 range")
	}
	if snapshot.Player.FuelLiters.Present &&
		float64(snapshot.Player.FuelLiters.Value) > float64(snapshot.Player.FuelCapacity.Value) {
		return errors.New("fuel amount and capacity must preserve the atomic fuel invariant")
	}
	return nil
}

func expectedCapabilities(payload strategyprojection.PayloadV1) []strategyprojection.Capability {
	result := make([]strategyprojection.Capability, 0, 4)
	if available(payload.TrackName) || available(payload.SessionType) || available(payload.SourceTime) ||
		available(payload.EndTime) || available(payload.Remaining) || available(payload.MaximumLaps) {
		result = append(result, strategyprojection.CapabilitySession)
	}
	if available(payload.Player.LapNumber) || available(payload.Player.CompletedLaps) ||
		available(payload.Player.Sector) || available(payload.Player.LapDistance) {
		result = append(result, strategyprojection.CapabilityProgress)
	}
	if available(payload.Player.InPit) || available(payload.Player.PitStopCount) {
		result = append(result, strategyprojection.CapabilityPit)
	}
	if available(payload.Player.FuelLiters) || available(payload.Player.FuelCapacity) {
		result = append(result, strategyprojection.CapabilityFuel)
	}
	return result
}

func available[T comparable](field telemetryprojection.Field[T]) bool {
	return field.Present && field.Freshness != telemetryprojection.FreshnessInvalid
}

func capabilityPresent(capabilities []strategyprojection.Capability, wanted strategyprojection.Capability) bool {
	return slices.Contains(capabilities, wanted)
}

func cloneProjection(snapshot strategyprojection.SnapshotV1) strategyprojection.SnapshotV1 {
	snapshot.Capabilities = slices.Clone(snapshot.Capabilities)
	return snapshot
}
