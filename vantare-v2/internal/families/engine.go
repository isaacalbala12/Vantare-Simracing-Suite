// Package families implements the declarative Engineer family engine over radio.v1.
package families

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/radio"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

var ErrObservationNotReady = errors.New("engineer family observation is not ready")

type Clock interface{ NowMS() int64 }

type State interface{ Reset() }

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
	name   string
	family Family
	state  State
}

func familyTable() []registration {
	return []registration{
		{name: "fuel", family: fuelFamily{}, state: &fuelState{}},
		{name: "penalties", family: penaltiesFamily{}, state: &penaltiesState{}},
		{name: "laps", family: lapsFamily{}, state: &lapsState{}},
		{name: "timings", family: timingsFamily{}, state: &timingsState{}},
		{name: "pitstops", family: pitstopsFamily{}, state: &pitstopsState{}},
	}
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
	}
}

func (engine *Engine) Evaluate(snapshot engineer.ObservationSnapshotV1) ([]radio.RadioMessage, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	evidence := evidenceFromObservation(snapshot, engine.clock.NowMS())
	if !evidence.Ready {
		for index := range engine.families {
			engine.families[index].state.Reset()
		}
		return nil, ErrObservationNotReady
	}
	if !evidence.PlayerReady {
		for index := range engine.families {
			engine.families[index].state.Reset()
		}
		return nil, nil
	}
	var messages []radio.RadioMessage
	for index := range engine.families {
		messages = append(messages, engine.families[index].family.Evaluate(evidence, engine.families[index].state)...)
	}
	for index := range messages {
		engine.nextID++
		messages[index].ID = fmt.Sprintf("families-%d-%s", engine.nextID, messages[index].Intent)
		messages[index].Locale = engine.locale
	}
	return messages, nil
}

func evidenceFromObservation(snapshot engineer.ObservationSnapshotV1, nowMS int64) Evidence {
	present, presentOK := usable(snapshot.PlayerPresent)
	evidence := Evidence{NowMS: nowMS, Subject: string(snapshot.Player.ID)}
	evidence.Ready = snapshot.Context.Epoch != 0 && evidence.Subject != ""
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
