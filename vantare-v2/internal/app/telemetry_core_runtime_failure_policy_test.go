package app

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	engineerprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

func TestFailureClassificationTable(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want failureClass
	}{
		{name: "consumer wrapper", err: newTelemetryConsumerError("overlay.publish", errors.New("boom")), want: failureConsumer},
		{name: "sink backpressure", err: telemetrycore.ErrBackpressure, want: failureConsumer},
		{name: "sink closed", err: telemetrycore.ErrClosed, want: failureConsumer},
		{name: "projection resync", err: projection.ErrResyncRequired, want: failureConsumer},
		{name: "projection subscription closed", err: projection.ErrSubscriptionClosed, want: failureConsumer},
		{name: "transport subscriber limit", err: telemetrytransport.ErrSubscriberLimit, want: failureConsumer},

		{name: "context canceled", err: context.Canceled, want: failureProductOrPayload},
		{name: "context deadline", err: context.DeadlineExceeded, want: failureProductOrPayload},
		{name: "LMU incompatible observation", err: lmu.ErrIncompatibleObservation, want: failureProductOrPayload},
		{name: "LMU invalid session", err: lmu.ErrInvalidSessionIdentity, want: failureProductOrPayload},
		{name: "LMU invalid vehicle count", err: lmu.ErrInvalidVehicleCount, want: failureProductOrPayload},
		{name: "LMU invalid source slot", err: lmu.ErrInvalidSourceSlot, want: failureProductOrPayload},
		{name: "LMU duplicate source slot", err: lmu.ErrDuplicateSourceSlot, want: failureProductOrPayload},
		{name: "LMU invalid player", err: lmu.ErrInvalidPlayerIdentity, want: failureProductOrPayload},
		{name: "reconnect exhausted", err: telemetrycore.ErrReconnectExhausted, want: failureProductOrPayload},
		{name: "transport closed", err: telemetrytransport.ErrClosed, want: failureProductOrPayload},
		{name: "transport invalid payload", err: telemetrytransport.ErrInvalidPayload, want: failureProductOrPayload},
		{name: "transport payload too large", err: telemetrytransport.ErrPayloadTooLarge, want: failureProductOrPayload},
		{name: "transport sequence gap", err: telemetrytransport.ErrSequenceGap, want: failureProductOrPayload},
		{name: "transport status revision", err: telemetrytransport.ErrStatusRevision, want: failureProductOrPayload},
		{name: "transport unsupported protocol", err: telemetrytransport.ErrUnsupportedProtocol, want: failureProductOrPayload},
		{name: "projection version", err: projection.ErrUnknownProjectionVersion, want: failureProductOrPayload},
		{name: "engineer invalid epoch", err: engineerprojection.ErrInvalidProjectionEpoch, want: failureProductOrPayload},
		{name: "engineer stale projection", err: engineerprojection.ErrStaleProjection, want: failureProductOrPayload},
		{name: "engineer identity", err: engineerprojection.ErrProjectionIdentityChange, want: failureProductOrPayload},
		{name: "engineer invalid capability", err: engineerprojection.ErrInvalidCapability, want: failureProductOrPayload},
		{name: "engineer duplicate capability", err: engineerprojection.ErrDuplicateCapability, want: failureProductOrPayload},
		{name: "engineer unknown capability", err: engineerprojection.ErrCapabilityUnknown, want: failureProductOrPayload},
		{name: "engineer unsupported capability", err: engineerprojection.ErrCapabilityUnsupported, want: failureProductOrPayload},
		{name: "engineer invalid projected field", err: engineerprojection.ErrInvalidProjectedField, want: failureProductOrPayload},
		{name: "engineer capability conflict", err: engineerprojection.ErrProjectionCapabilityConflict, want: failureProductOrPayload},
		{name: "engineer payload conflict", err: engineerprojection.ErrProjectionPayloadConflict, want: failureProductOrPayload},
		{name: "engineer canonical version", err: engineerprojection.ErrProjectionCanonicalVersion, want: failureProductOrPayload},
		{name: "engineer source status", err: engineerprojection.ErrInvalidSourceStatus, want: failureProductOrPayload},
		{name: "engineer unknown fact", err: engineerprojection.ErrUnknownFactKind, want: failureProductOrPayload},

		{name: "invalid initial cursor", err: telemetrycore.ErrInvalidInitialCursor, want: failureProgramming},
		{name: "stale batch", err: telemetrycore.ErrStaleBatch, want: failureProgramming},
		{name: "core sequence gap", err: telemetrycore.ErrSequenceGap, want: failureProgramming},
		{name: "core epoch gap", err: telemetrycore.ErrEpochGap, want: failureProgramming},
		{name: "invalid epoch reset", err: telemetrycore.ErrInvalidEpochReset, want: failureProgramming},
		{name: "duplicate vehicle", err: telemetrycore.ErrDuplicateVehicle, want: failureProgramming},
		{name: "missing vehicle ID", err: telemetrycore.ErrMissingVehicleID, want: failureProgramming},
		{name: "vehicle run mismatch", err: telemetrycore.ErrVehicleRunMismatch, want: failureProgramming},
		{name: "vehicle count mismatch", err: telemetrycore.ErrVehicleCountMismatch, want: failureProgramming},
		{name: "incomplete run identity", err: telemetrycore.ErrIncompleteRunIdentity, want: failureProgramming},
		{name: "run identity changed", err: telemetrycore.ErrRunIdentityChanged, want: failureProgramming},
		{name: "reducer running", err: telemetrycore.ErrReducerRunning, want: failureProgramming},
		{name: "coordinator running", err: telemetrycore.ErrCoordinatorRunning, want: failureProgramming},
		{name: "fact batch overflow", err: telemetrycore.ErrFactBatchOverflow, want: failureProgramming},
		{name: "fact sequence exhausted", err: telemetrycore.ErrFactSequenceExhausted, want: failureProgramming},
		{name: "vehicle history overflow", err: telemetrycore.ErrVehicleHistoryOverflow, want: failureProgramming},
		{name: "manager already started", err: telemetrycore.ErrManagerAlreadyStarted, want: failureProgramming},
		{name: "manager running", err: telemetrycore.ErrManagerRunning, want: failureProgramming},
		{name: "invalid driver catalog", err: telemetrycore.ErrInvalidDriverCatalog, want: failureProgramming},
		{name: "invalid driver transition", err: telemetrycore.ErrInvalidDriverTransition, want: failureProgramming},
		{name: "transport invalid envelope", err: telemetrytransport.ErrInvalidEnvelope, want: failureProgramming},
		{name: "transport product mismatch", err: telemetrytransport.ErrProductMismatch, want: failureProgramming},
		{name: "clone required", err: envelope.ErrCloneRequired, want: failureProgramming},
		{name: "wrapped sentinel", err: fmt.Errorf("wrapped: %w", telemetrytransport.ErrPayloadTooLarge), want: failureProductOrPayload},
		{name: "unknown", err: errors.New("unknown"), want: failureProgramming},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := classifyTelemetryError(test.err); got != test.want {
				t.Fatalf("classifyTelemetryError(%v) = %d, want %d", test.err, got, test.want)
			}
		})
	}
}
