package spotter

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/radio"
	"github.com/vantare/overlays/v2/internal/spotter/geometry"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

var (
	ErrObservationNotReady = errors.New("spotter observation is not ready")
	ErrDecisionObsolete    = errors.New("spotter decision is obsolete")
)

const messageTTL = 3 * time.Second

type Clock interface{ NowMS() int64 }

type wallClock struct{}

func (wallClock) NowMS() int64 { return time.Now().UnixMilli() }

// Producer evaluates the canonical Engineer observation and produces P0 radio
// messages. It performs no I/O and owns no goroutine.
type Producer struct {
	mu          sync.Mutex
	clock       Clock
	locale      radio.Locale
	sensitivity geometry.Sensitivity
	policy      Policy
	nextID      uint64
}

func NewProducer(clock Clock, locale radio.Locale) (*Producer, error) {
	if clock == nil {
		clock = wallClock{}
	}
	if locale != radio.LocaleES && locale != radio.LocaleEN && locale != radio.LocaleIT && locale != radio.LocalePTBR {
		return nil, errors.New("spotter locale is unsupported")
	}
	return &Producer{clock: clock, locale: locale, sensitivity: geometry.SensitivityNormal}, nil
}

func (producer *Producer) SetSensitivity(sensitivity geometry.Sensitivity) {
	producer.mu.Lock()
	defer producer.mu.Unlock()
	producer.sensitivity = sensitivity
}

func (producer *Producer) SetLocale(locale radio.Locale) error {
	if locale != radio.LocaleES && locale != radio.LocaleEN && locale != radio.LocaleIT && locale != radio.LocalePTBR {
		return errors.New("spotter locale is unsupported")
	}
	producer.mu.Lock()
	defer producer.mu.Unlock()
	producer.locale = locale
	return nil
}

func (producer *Producer) Reset() {
	producer.mu.Lock()
	defer producer.mu.Unlock()
	producer.policy.Reset()
}

func (producer *Producer) Evaluate(snapshot engineer.ObservationSnapshotV1) (radio.RadioMessage, bool, error) {
	producer.mu.Lock()
	defer producer.mu.Unlock()
	activeLeft, activeRight := producer.policy.ActiveSides()
	left, right, ready := classify(snapshot, producer.sensitivity, activeLeft, activeRight)
	if !ready {
		producer.policy.Reset()
		return radio.RadioMessage{}, false, ErrObservationNotReady
	}
	nowMS := producer.clock.NowMS()
	intent, emit := producer.policy.Evaluate(nowMS, left, right)
	if !emit {
		return radio.RadioMessage{}, false, nil
	}
	revision, value := producer.policy.Coalescing(intent)
	expiresAtMS := producer.policy.Deadline(intent, nowMS+messageTTL.Milliseconds())
	producer.nextID++
	return radio.RadioMessage{
		Version: radio.VersionV1, ID: fmt.Sprintf("spotter-%d-%s", producer.nextID, intent),
		Source: "telemetry-core", Intent: intent, Subject: "player", Priority: radio.PriorityP0,
		CreatedAtMS: nowMS, ExpiresAtMS: expiresAtMS, Locale: producer.locale,
		Payload: map[string]string{}, CoalesceRevision: revision, CoalesceValue: value,
	}, true, nil
}

func (producer *Producer) AcknowledgeStarted(message radio.RadioMessage, atMS int64) error {
	producer.mu.Lock()
	defer producer.mu.Unlock()
	if !producer.policy.Start(message.Intent, message.ExpiresAtMS, atMS) {
		return ErrDecisionObsolete
	}
	return nil
}

func classify(snapshot engineer.ObservationSnapshotV1, sensitivity geometry.Sensitivity, activeLeft, activeRight bool) (bool, bool, bool) {
	if snapshot.Manifest.State(engineer.CapabilitySpatial) != engineer.CapabilitySupported {
		return false, false, false
	}
	present, ok := usable(snapshot.PlayerPresent)
	if !ok || !present {
		return false, false, false
	}
	position, positionOK := usable(snapshot.Player.WorldPosition)
	orientation, orientationOK := usable(snapshot.Player.Orientation)
	speed, speedOK := usable(snapshot.Player.Speed)
	inPit, inPitOK := usable(snapshot.Player.InPit)
	if !positionOK || !orientationOK || !speedOK || !inPitOK || inPit || speed < geometry.MinSpotterSpeedMPS {
		return false, false, false
	}
	yaw, yawOK := geometry.YawFromForward(vector(orientation.Row2))
	if !yawOK {
		return false, false, false
	}
	config := geometry.ConfigForSensitivity(sensitivity)
	var left, right bool
	for _, opponent := range snapshot.Vehicles {
		if opponent.ID == snapshot.Player.ID {
			continue
		}
		if isPlayer, usablePlayer := usable(opponent.IsPlayer); usablePlayer && isPlayer {
			continue
		}
		opponentPosition, positionReady := usable(opponent.WorldPosition)
		opponentInPit, pitReady := usable(opponent.InPit)
		if !positionReady || !pitReady || opponentInPit {
			continue
		}
		if lapDistance, lapReady := usable(opponent.LapDistance); lapReady && lapDistance < 0 {
			continue
		}
		aligned := geometry.AlignOpponentXZ(yaw, vector(position), vector(opponentPosition))
		existing := (aligned.X > 0 && activeLeft) || (aligned.X < 0 && activeRight)
		overlap := geometry.ClassifyAlignedOverlap(aligned, existing, config)
		if overlap.InOverlap && overlap.Side == geometry.SideLeft {
			left = true
		}
		if overlap.InOverlap && overlap.Side == geometry.SideRight {
			right = true
		}
	}
	return left, right, true
}

func usable[T comparable](field engineer.Field[T]) (T, bool) {
	if !field.Usable() {
		var zero T
		return zero, false
	}
	return field.Value()
}

func vector(value engineer.Vector3) geometry.Vec3 {
	return geometry.Vec3{X: value.X, Y: value.Y, Z: value.Z}
}
