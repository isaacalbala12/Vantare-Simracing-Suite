package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sync/atomic"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/strategy/live"
	telemetryprojection "github.com/vantare/overlays/v2/internal/telemetry/projection"
	strategyprojection "github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

var (
	ErrInvalidStrategyLiveRuntime = errors.New("invalid Strategy live runtime")
	ErrInvalidStrategyLiveEvent   = errors.New("invalid Strategy live event")
	ErrStrategyLiveAlreadyRunning = errors.New("Strategy live runtime already running")
)

const strategyLiveMaxSafeInteger = uint64(1<<53 - 1)

// StrategyLiveConsumer is owned by the consuming package. The production
// implementation is *live.Engine; the adapter only translates hub envelopes.
type StrategyLiveConsumer interface {
	ApplySourceStatus(live.SourceStatus) error
	ApplySnapshot(strategyprojection.SnapshotV1) error
}

// StrategyLiveRuntime consumes the existing Strategy hub. It starts no
// goroutines and owns exactly one subscription for the duration of Run.
type StrategyLiveRuntime struct {
	hub      *telemetrytransport.Hub
	consumer StrategyLiveConsumer
	running  atomic.Bool
}

func NewStrategyLiveRuntime(hub *telemetrytransport.Hub, consumer StrategyLiveConsumer) (*StrategyLiveRuntime, error) {
	if hub == nil || nilStrategyLiveConsumer(consumer) {
		return nil, ErrInvalidStrategyLiveRuntime
	}
	return &StrategyLiveRuntime{hub: hub, consumer: consumer}, nil
}

func (runtime *StrategyLiveRuntime) Run(ctx context.Context) (runErr error) {
	if runtime == nil || runtime.hub == nil || nilStrategyLiveConsumer(runtime.consumer) || ctx == nil {
		return ErrInvalidStrategyLiveRuntime
	}
	if !runtime.running.CompareAndSwap(false, true) {
		return ErrStrategyLiveAlreadyRunning
	}
	defer runtime.running.Store(false)
	subscription, err := runtime.hub.Subscribe(ctx)
	if err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return fmt.Errorf("subscribe Strategy live hub: %w", err)
	}
	defer func() {
		if err := subscription.Close(); err != nil {
			runErr = errors.Join(runErr, fmt.Errorf("close Strategy live subscription: %w", err))
		}
	}()

	for {
		event, err := subscription.Next(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("receive Strategy live event: %w", err)
		}
		if err := runtime.consumeEvent(event); err != nil {
			return fmt.Errorf("consume Strategy live event: %w", err)
		}
	}
}

func (runtime *StrategyLiveRuntime) consumeEvent(event telemetrytransport.Event) error {
	if event.Product != telemetrytransport.ProductStrategy {
		return fmt.Errorf("%w: event product %q", ErrInvalidStrategyLiveEvent, event.Product)
	}
	switch event.Kind {
	case telemetrytransport.EventStatus:
		status, err := decodeStrategyLiveStatus(event.Data)
		if err != nil {
			return err
		}
		if err := runtime.consumer.ApplySourceStatus(status); err != nil {
			return fmt.Errorf("apply Strategy source status: %w", err)
		}
		return nil
	case telemetrytransport.EventSnapshot:
		snapshot, err := decodeStrategyLiveSnapshot(event.Data)
		if err != nil {
			return err
		}
		if err := runtime.consumer.ApplySnapshot(snapshot); err != nil {
			return fmt.Errorf("apply Strategy live snapshot: %w", err)
		}
		return nil
	default:
		return fmt.Errorf("%w: event kind %q", ErrInvalidStrategyLiveEvent, event.Kind)
	}
}

func decodeStrategyLiveStatus(data json.RawMessage) (live.SourceStatus, error) {
	var envelope telemetrytransport.StatusEnvelope
	if err := decodeStrategyLiveJSON(data, &envelope); err != nil {
		return live.SourceStatus{}, fmt.Errorf("%w: decode status envelope: %w", ErrInvalidStrategyLiveEvent, err)
	}
	if _, err := requireStrategyLiveObject(data, "product", "statusRevision", "capturedAt", "payload"); err != nil {
		return live.SourceStatus{}, fmt.Errorf("%w: status envelope shape: %w", ErrInvalidStrategyLiveEvent, err)
	}
	if envelope.Product != telemetrytransport.ProductStrategy ||
		!strategyLiveSafePositive(envelope.StatusRevision) {
		return live.SourceStatus{}, fmt.Errorf("%w: invalid status envelope", ErrInvalidStrategyLiveEvent)
	}
	updatedAt, err := parseStrategyLiveTimestamp(envelope.CapturedAt)
	if err != nil {
		return live.SourceStatus{}, fmt.Errorf("%w: status timestamp: %w", ErrInvalidStrategyLiveEvent, err)
	}
	var payload telemetrytransport.StatusPayload
	if err := decodeStrategyLiveJSON(envelope.Payload, &payload); err != nil {
		return live.SourceStatus{}, fmt.Errorf("%w: decode status payload: %w", ErrInvalidStrategyLiveEvent, err)
	}
	if _, err := requireStrategyLiveObject(envelope.Payload, "state", "reconnectAttempt"); err != nil {
		return live.SourceStatus{}, fmt.Errorf("%w: status payload shape: %w", ErrInvalidStrategyLiveEvent, err)
	}
	if payload.ReconnectAttempt < 0 {
		return live.SourceStatus{}, fmt.Errorf("%w: negative reconnect attempt", ErrInvalidStrategyLiveEvent)
	}
	state, ok := strategyLiveSourceState(payload.State)
	if !ok {
		return live.SourceStatus{}, fmt.Errorf("%w: unknown source state %q", ErrInvalidStrategyLiveEvent, payload.State)
	}
	return live.SourceStatus{
		State: state, Revision: envelope.StatusRevision,
		ReconnectAttempt: payload.ReconnectAttempt, UpdatedAt: updatedAt,
	}, nil
}

func decodeStrategyLiveSnapshot(data json.RawMessage) (strategyprojection.SnapshotV1, error) {
	var envelope telemetrytransport.Envelope
	if err := decodeStrategyLiveJSON(data, &envelope); err != nil {
		return strategyprojection.SnapshotV1{}, fmt.Errorf("%w: decode snapshot envelope: %w", ErrInvalidStrategyLiveEvent, err)
	}
	if _, err := requireStrategyLiveObject(
		data, "product", "projectionVersion", "epoch", "sequence", "kind", "capturedAt", "statusRevision", "payload",
	); err != nil {
		return strategyprojection.SnapshotV1{}, fmt.Errorf("%w: snapshot envelope shape: %w", ErrInvalidStrategyLiveEvent, err)
	}
	if envelope.Product != telemetrytransport.ProductStrategy ||
		envelope.ProjectionVersion != strategyprojection.VersionV1 ||
		envelope.Kind != telemetrytransport.Full ||
		!strategyLiveSafePositive(uint64(envelope.Epoch)) ||
		!strategyLiveSafePositive(uint64(envelope.Sequence)) ||
		!strategyLiveSafePositive(envelope.StatusRevision) {
		return strategyprojection.SnapshotV1{}, fmt.Errorf("%w: invalid full snapshot envelope", ErrInvalidStrategyLiveEvent)
	}
	if _, err := parseStrategyLiveTimestamp(envelope.CapturedAt); err != nil {
		return strategyprojection.SnapshotV1{}, fmt.Errorf("%w: snapshot timestamp: %w", ErrInvalidStrategyLiveEvent, err)
	}
	payload, err := decodeStrategyLivePayload(envelope.Payload)
	if err != nil {
		return strategyprojection.SnapshotV1{}, fmt.Errorf("%w: decode snapshot payload: %w", ErrInvalidStrategyLiveEvent, err)
	}
	return strategyprojection.SnapshotV1{
		Metadata: telemetryprojection.Metadata{
			CanonicalVersion:  1,
			ProjectionVersion: strategyprojection.VersionV1,
			Epoch:             envelope.Epoch, Sequence: envelope.Sequence, CapturedAt: envelope.CapturedAt,
		},
		PayloadV1: payload,
	}, nil
}

func decodeStrategyLiveJSON(data json.RawMessage, destination any) error {
	return decodeStrategyLiveJSONPolicy(data, destination, true)
}

func decodeStrategyLiveJSONAllowUnknown(data json.RawMessage, destination any) error {
	return decodeStrategyLiveJSONPolicy(data, destination, false)
}

func decodeStrategyLiveJSONPolicy(data json.RawMessage, destination any, disallowUnknown bool) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	if disallowUnknown {
		decoder.DisallowUnknownFields()
	}
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("trailing JSON value")
		}
		return err
	}
	return nil
}

func decodeStrategyLivePayload(data json.RawMessage) (strategyprojection.PayloadV1, error) {
	payloadObject, err := requireStrategyLiveObjectFields(data, "capabilities", "trackName", "sessionType", "player")
	if err != nil {
		return strategyprojection.PayloadV1{}, err
	}
	for _, name := range []string{"trackName", "sessionType"} {
		if err := validateStrategyLiveFieldShape(payloadObject[name]); err != nil {
			return strategyprojection.PayloadV1{}, fmt.Errorf("%s: %w", name, err)
		}
	}
	for _, name := range []string{"sourceTimeSeconds", "endTimeSeconds", "remainingSeconds", "maximumLaps"} {
		if field, present := payloadObject[name]; present {
			if err := validateStrategyLiveFieldShape(field); err != nil {
				return strategyprojection.PayloadV1{}, fmt.Errorf("%s: %w", name, err)
			}
		}
	}
	playerObject, err := requireStrategyLiveObjectFields(
		payloadObject["player"], "id", "lapNumber", "completedLaps", "inPit", "pitStopCount",
	)
	if err != nil {
		return strategyprojection.PayloadV1{}, fmt.Errorf("player: %w", err)
	}
	for _, name := range []string{"lapNumber", "completedLaps", "inPit", "pitStopCount"} {
		if err := validateStrategyLiveFieldShape(playerObject[name]); err != nil {
			return strategyprojection.PayloadV1{}, fmt.Errorf("player.%s: %w", name, err)
		}
	}
	for _, name := range []string{"sector", "lapDistanceMeters", "fuelLiters", "fuelCapacityLiters"} {
		if field, present := playerObject[name]; present {
			if err := validateStrategyLiveFieldShape(field); err != nil {
				return strategyprojection.PayloadV1{}, fmt.Errorf("player.%s: %w", name, err)
			}
		}
	}

	var payload strategyprojection.PayloadV1
	setStrategyLiveMissing(&payload.SourceTime)
	setStrategyLiveMissing(&payload.EndTime)
	setStrategyLiveMissing(&payload.Remaining)
	setStrategyLiveMissing(&payload.MaximumLaps)
	setStrategyLiveMissing(&payload.Player.Sector)
	setStrategyLiveMissing(&payload.Player.LapDistance)
	setStrategyLiveMissing(&payload.Player.FuelLiters)
	setStrategyLiveMissing(&payload.Player.FuelCapacity)
	if err := decodeStrategyLiveJSONAllowUnknown(data, &payload); err != nil {
		return strategyprojection.PayloadV1{}, err
	}
	payload.Capabilities = filterStrategyLiveCapabilities(payload.Capabilities)
	return payload, nil
}

func setStrategyLiveMissing[T comparable](field *telemetryprojection.Field[T]) {
	*field = telemetryprojection.MissingField[T]()
}

func requireStrategyLiveObject(data json.RawMessage, keys ...string) (map[string]json.RawMessage, error) {
	object, err := requireStrategyLiveObjectFields(data, keys...)
	if err != nil {
		return nil, err
	}
	if len(object) != len(keys) {
		return nil, errors.New("object fields do not match the required shape")
	}
	return object, nil
}

func requireStrategyLiveObjectFields(data json.RawMessage, keys ...string) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(data, &object); err != nil || object == nil {
		if err == nil {
			err = errors.New("expected JSON object")
		}
		return nil, err
	}
	for _, key := range keys {
		if _, present := object[key]; !present {
			return nil, fmt.Errorf("missing field %q", key)
		}
	}
	return object, nil
}

func validateStrategyLiveFieldShape(data json.RawMessage) error {
	_, err := requireStrategyLiveObjectFields(data, "present", "value", "provenance", "freshness")
	return err
}

func filterStrategyLiveCapabilities(capabilities []strategyprojection.Capability) []strategyprojection.Capability {
	result := make([]strategyprojection.Capability, 0, len(capabilities))
	for _, capability := range capabilities {
		switch capability {
		case strategyprojection.CapabilitySession, strategyprojection.CapabilityProgress,
			strategyprojection.CapabilityPit, strategyprojection.CapabilityFuel:
			result = append(result, capability)
		}
	}
	return result
}

func parseStrategyLiveTimestamp(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil || parsed.Location() != time.UTC || value != parsed.UTC().Format(time.RFC3339Nano) {
		if err == nil {
			err = errors.New("timestamp is not canonical UTC RFC3339Nano")
		}
		return time.Time{}, err
	}
	return parsed, nil
}

func strategyLiveSafePositive(value uint64) bool {
	return value > 0 && value <= strategyLiveMaxSafeInteger
}

func strategyLiveSourceState(state string) (live.SourceState, bool) {
	switch state {
	case "stopped", "stopping":
		return live.SourceStopped, true
	case "detecting":
		return live.SourceDetecting, true
	case "connecting":
		return live.SourceConnecting, true
	case "live":
		return live.SourceLive, true
	case "degraded":
		return live.SourceDegraded, true
	case "stale":
		return live.SourceStale, true
	case "error":
		return live.SourceError, true
	default:
		return "", false
	}
}

func nilStrategyLiveConsumer(consumer StrategyLiveConsumer) bool {
	if consumer == nil {
		return true
	}
	value := reflect.ValueOf(consumer)
	switch value.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return value.IsNil()
	default:
		return false
	}
}
