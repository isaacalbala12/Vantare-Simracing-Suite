package app

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

type failureClass uint8

const (
	failureProgramming failureClass = iota
	failureProductOrPayload
	failureConsumer
)

type telemetryConsumerError struct {
	boundary string
	err      error
}

func (err *telemetryConsumerError) Error() string {
	return fmt.Sprintf("telemetry consumer %s: %v", err.boundary, err.err)
}

func (err *telemetryConsumerError) Unwrap() error { return err.err }

func newTelemetryConsumerError(boundary string, err error) error {
	if err == nil {
		return nil
	}
	return &telemetryConsumerError{boundary: boundary, err: err}
}

// classifyTelemetryError is deliberately closed: an error not listed here is
// treated as a programming failure and logged instead of being silently made
// recoverable. Errors rejected by lmu.IsUnmappableFrame describe incomplete
// product input and are transient. Reducer cursor errors such as ErrStaleBatch
// are programming errors until F3 owns mapper and reducer in one atomic commit.
// Sink backpressure/closure belongs to the consumer boundary and must not stop
// acquisition (06-reliability-review section 13).
func classifyTelemetryError(err error) failureClass {
	if err == nil {
		return failureProgramming
	}

	var consumerErr *telemetryConsumerError
	if errors.As(err, &consumerErr) ||
		errors.Is(err, telemetrycore.ErrBackpressure) ||
		errors.Is(err, telemetrycore.ErrClosed) ||
		errors.Is(err, projection.ErrResyncRequired) ||
		errors.Is(err, projection.ErrSubscriptionClosed) ||
		errors.Is(err, telemetrytransport.ErrSubscriberLimit) {
		return failureConsumer
	}

	if errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) ||
		lmu.IsUnmappableFrame(err) ||
		errors.Is(err, telemetrycore.ErrReconnectExhausted) ||
		errors.Is(err, telemetrytransport.ErrClosed) ||
		errors.Is(err, telemetrytransport.ErrInvalidPayload) ||
		errors.Is(err, telemetrytransport.ErrPayloadTooLarge) ||
		errors.Is(err, telemetrytransport.ErrSequenceGap) ||
		errors.Is(err, telemetrytransport.ErrStatusRevision) ||
		errors.Is(err, telemetrytransport.ErrUnsupportedProtocol) ||
		errors.Is(err, projection.ErrUnknownProjectionVersion) ||
		errors.Is(err, engineerprojection.ErrInvalidProjectionEpoch) ||
		errors.Is(err, engineerprojection.ErrStaleProjection) ||
		errors.Is(err, engineerprojection.ErrProjectionIdentityChange) ||
		errors.Is(err, engineerprojection.ErrInvalidCapability) ||
		errors.Is(err, engineerprojection.ErrDuplicateCapability) ||
		errors.Is(err, engineerprojection.ErrCapabilityUnknown) ||
		errors.Is(err, engineerprojection.ErrCapabilityUnsupported) ||
		errors.Is(err, engineerprojection.ErrInvalidProjectedField) ||
		errors.Is(err, engineerprojection.ErrProjectionCapabilityConflict) ||
		errors.Is(err, engineerprojection.ErrProjectionPayloadConflict) ||
		errors.Is(err, engineerprojection.ErrProjectionCanonicalVersion) ||
		errors.Is(err, engineerprojection.ErrInvalidSourceStatus) ||
		errors.Is(err, engineerprojection.ErrUnknownFactKind) {
		return failureProductOrPayload
	}

	if errors.Is(err, telemetrycore.ErrInvalidInitialCursor) ||
		errors.Is(err, telemetrycore.ErrStaleBatch) ||
		errors.Is(err, telemetrycore.ErrSequenceGap) ||
		errors.Is(err, telemetrycore.ErrEpochGap) ||
		errors.Is(err, telemetrycore.ErrInvalidEpochReset) ||
		errors.Is(err, telemetrycore.ErrDuplicateVehicle) ||
		errors.Is(err, telemetrycore.ErrMissingVehicleID) ||
		errors.Is(err, telemetrycore.ErrVehicleRunMismatch) ||
		errors.Is(err, telemetrycore.ErrVehicleCountMismatch) ||
		errors.Is(err, telemetrycore.ErrIncompleteRunIdentity) ||
		errors.Is(err, telemetrycore.ErrRunIdentityChanged) ||
		errors.Is(err, telemetrycore.ErrReducerRunning) ||
		errors.Is(err, telemetrycore.ErrCoordinatorRunning) ||
		errors.Is(err, telemetrycore.ErrFactBatchOverflow) ||
		errors.Is(err, telemetrycore.ErrFactSequenceExhausted) ||
		errors.Is(err, telemetrycore.ErrVehicleHistoryOverflow) ||
		errors.Is(err, telemetrycore.ErrManagerAlreadyStarted) ||
		errors.Is(err, telemetrycore.ErrManagerRunning) ||
		errors.Is(err, telemetrycore.ErrInvalidDriverCatalog) ||
		errors.Is(err, telemetrycore.ErrInvalidDriverTransition) ||
		errors.Is(err, telemetrytransport.ErrInvalidEnvelope) ||
		errors.Is(err, telemetrytransport.ErrProductMismatch) ||
		errors.Is(err, envelope.ErrCloneRequired) {
		return failureProgramming
	}

	log.Printf("telemetry failure policy: unknown error classified as programming: %v", err)
	return failureProgramming
}
