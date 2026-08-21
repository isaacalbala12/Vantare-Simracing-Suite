// Package families implements the declarative Engineer family engine over radio.v1.
package families

import (
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/radio"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

var ErrObservationNotReady = errors.New("engineer family observation is not ready")

type Clock interface{ NowMS() int64 }

type State interface{ Reset() }

type startedState interface{ Started(radio.RadioMessage) }

type Family interface {
	Evaluate(Evidence, State) []radio.RadioMessage
}

type Evidence struct {
	NowMS             int64
	Ready             bool
	PlayerReady       bool
	Subject           string
	FuelLitres        float64
	FuelKnown         bool
	FuelCapacity      float64
	FuelCapacityKnown bool
	Lap               int
	LapKnown          bool
	PenaltyCount      int
	PenaltyKnown      bool
	GapLeader         float64
	GapLeaderKnown    bool
	GapNext           float64
	GapNextKnown      bool
	InPit             bool
	PitKnown          bool
}

type registration struct {
	name         string
	family       Family
	state        State
	capabilities []engineer.CapabilityID
	intents      []string
	ready        func(Evidence) bool
	wasReady     bool
}

func familyTable() []registration {
	return []registration{
		{
			name: "fuel", family: fuelFamily{}, state: &fuelState{}, intents: familyIntents("fuel"),
			capabilities: []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityFuel},
			ready:        func(e Evidence) bool { return e.FuelKnown && e.LapKnown },
		},
		{
			name: "penalties", family: penaltiesFamily{}, state: &penaltiesState{}, intents: familyIntents("penalties"),
			capabilities: []engineer.CapabilityID{engineer.CapabilityStandings},
			ready:        func(e Evidence) bool { return e.PenaltyKnown },
		},
		{
			name: "laps", family: lapsFamily{}, state: &lapsState{}, intents: familyIntents("laps"),
			capabilities: []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings},
			ready:        func(e Evidence) bool { return e.LapKnown },
		},
		{
			name: "timings", family: timingsFamily{}, state: &timingsState{}, intents: familyIntents("timings"),
			capabilities: []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityGaps},
			ready:        func(e Evidence) bool { return e.GapLeaderKnown || e.GapNextKnown },
		},
		{
			name: "pitstops", family: pitstopsFamily{}, state: &pitstopsState{}, intents: familyIntents("pitstops"),
			capabilities: []engineer.CapabilityID{engineer.CapabilitySession, engineer.CapabilityStandings, engineer.CapabilityControls, engineer.CapabilityPit},
			ready:        func(e Evidence) bool { return e.PitKnown },
		},
	}
}

type Evaluation struct {
	Messages     []radio.RadioMessage
	ResetIntents []string
}

type Engine struct {
	mu       sync.Mutex
	clock    Clock
	locale   radio.Locale
	nextID   uint64
	families []registration
}

func New(clock Clock, locale radio.Locale) (*Engine, error) {
	if clock == nil || !supportedLocale(locale) {
		return nil, errors.New("engineer family engine configuration is invalid")
	}
	return &Engine{clock: clock, locale: locale, families: familyTable()}, nil
}

func (engine *Engine) ActiveCount() int {
	if engine == nil {
		return 0
	}
	return len(engine.families)
}

func (engine *Engine) SetLocale(locale radio.Locale) error {
	if !supportedLocale(locale) {
		return errors.New("engineer family locale is unsupported")
	}
	engine.mu.Lock()
	defer engine.mu.Unlock()
	engine.locale = locale
	return nil
}

func (engine *Engine) Reset() {
	if engine == nil {
		return
	}
	engine.mu.Lock()
	defer engine.mu.Unlock()
	for index := range engine.families {
		engine.families[index].state.Reset()
		engine.families[index].wasReady = false
	}
}

func (engine *Engine) Evaluate(snapshot engineer.ObservationSnapshotV1) (Evaluation, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	evidence := evidenceFromObservation(snapshot, engine.clock.NowMS())
	if !evidence.Ready {
		return engine.resetReadyFamiliesLocked(), ErrObservationNotReady
	}
	if !evidence.PlayerReady {
		return engine.resetReadyFamiliesLocked(), ErrObservationNotReady
	}
	var result Evaluation
	for index := range engine.families {
		registration := &engine.families[index]
		if !registrationReady(snapshot, evidence, registration) {
			registration.state.Reset()
			if registration.wasReady {
				result.ResetIntents = append(result.ResetIntents, registration.intents...)
			}
			registration.wasReady = false
			continue
		}
		registration.wasReady = true
		result.Messages = append(result.Messages, registration.family.Evaluate(evidence, registration.state)...)
	}
	for index := range result.Messages {
		engine.nextID++
		result.Messages[index].ID = fmt.Sprintf("families-%d-%s", engine.nextID, result.Messages[index].Intent)
		result.Messages[index].Locale = engine.locale
	}
	return result, nil
}

func (engine *Engine) resetReadyFamiliesLocked() Evaluation {
	var result Evaluation
	for index := range engine.families {
		registration := &engine.families[index]
		registration.state.Reset()
		if registration.wasReady {
			result.ResetIntents = append(result.ResetIntents, registration.intents...)
		}
		registration.wasReady = false
	}
	return result
}

func registrationReady(snapshot engineer.ObservationSnapshotV1, evidence Evidence, registration *registration) bool {
	for _, capability := range registration.capabilities {
		if snapshot.Manifest.State(capability) != engineer.CapabilitySupported {
			return false
		}
	}
	return registration.ready(evidence)
}

func (engine *Engine) AcknowledgeStarted(message radio.RadioMessage) {
	if engine == nil {
		return
	}
	engine.mu.Lock()
	defer engine.mu.Unlock()
	family, ok := FamilyForIntent(message.Intent)
	if !ok {
		return
	}
	for index := range engine.families {
		registration := &engine.families[index]
		if registration.name == family && registration.wasReady {
			if state, ok := registration.state.(startedState); ok {
				state.Started(message)
			}
			return
		}
	}
}

func (engine *Engine) ResetFamily(family string) []string {
	if engine == nil {
		return nil
	}
	engine.mu.Lock()
	defer engine.mu.Unlock()
	for index := range engine.families {
		registration := &engine.families[index]
		if registration.name == family {
			registration.state.Reset()
			registration.wasReady = false
			return append([]string(nil), registration.intents...)
		}
	}
	return nil
}

func evidenceFromObservation(snapshot engineer.ObservationSnapshotV1, nowMS int64) Evidence {
	present, presentOK := usable(snapshot.PlayerPresent)
	evidence := Evidence{NowMS: nowMS, Subject: string(snapshot.Player.ID)}
	evidence.Ready = snapshot.Context.Complete()
	evidence.PlayerReady = presentOK && present
	evidence.FuelLitres, evidence.FuelKnown = usable(snapshot.Player.FuelLiters)
	evidence.FuelCapacity, evidence.FuelCapacityKnown = usable(snapshot.Player.FuelCapacity)
	evidence.Lap, evidence.LapKnown = usable(snapshot.Player.LapNumber)
	evidence.PenaltyCount, evidence.PenaltyKnown = usable(snapshot.Player.PenaltyCount)
	evidence.GapLeader, evidence.GapLeaderKnown = usable(snapshot.Player.TimeBehindLeader)
	evidence.GapNext, evidence.GapNextKnown = usable(snapshot.Player.TimeBehindNext)
	evidence.InPit, evidence.PitKnown = usable(snapshot.Player.InPit)
	return evidence
}

func usable[T comparable](field engineer.Field[T]) (T, bool) {
	if !field.Usable() {
		var zero T
		return zero, false
	}
	return field.Value()
}

func message(intent string, evidence Evidence) radio.RadioMessage {
	definition := intentTable[intent]
	return radio.RadioMessage{Version: radio.VersionV1, Source: "telemetry-core", Intent: intent,
		Subject: definition.Subject, Priority: definition.Priority, TTL: definition.TTL,
		CreatedAtMS: evidence.NowMS, ExpiresAtMS: evidence.NowMS + definition.TTL.Milliseconds(), Payload: map[string]string{}}
}

func FamilyForIntent(intent string) (string, bool) {
	definition, ok := intentTable[intent]
	return definition.Family, ok
}

func familyIntents(family string) []string {
	var result []string
	for intent, definition := range intentTable {
		if definition.Family == family {
			result = append(result, intent)
		}
	}
	sort.Strings(result)
	return result
}

func IntentsForFamily(family string) []string { return familyIntents(family) }

func Cooldowns() map[string]time.Duration {
	result := make(map[string]time.Duration, len(intentTable))
	for intent, definition := range intentTable {
		result[intent] = definition.Cooldown
	}
	return result
}

func supportedLocale(locale radio.Locale) bool {
	return locale == radio.LocaleES || locale == radio.LocaleEN || locale == radio.LocaleIT || locale == radio.LocalePTBR
}
