package families

import "github.com/vantare/overlays/v2/internal/radio"

const (
	refuelLitres   = 10.0
	maxFuelSamples = 5
)

type fuelState struct {
	lastFuel                                                            float64
	lastLap                                                             int
	fuelAtLapStart                                                      float64
	samples                                                             []float64
	playedHalf, playedOne, playedTwo                                    bool
	playedFour, playedThree, playedLapsTwo, playedLapsOne, playedPitNow bool
	generation                                                          uint64
	intentGenerations                                                   map[string]uint64
	resetIntents                                                        []string
}

func (state *fuelState) Reset() {
	state.bumpIntentGenerations(familyIntents("fuel"))
	generation, intentGenerations := state.generation, state.intentGenerations
	*state = fuelState{generation: generation, intentGenerations: intentGenerations}
}

func (state *fuelState) InvalidateIntents(intents ...string) {
	state.bumpIntentGenerations(intents)
	state.resetIntents = append(state.resetIntents, intents...)
}

func (state *fuelState) TakeResetIntents() []string {
	result := uniqueStrings(state.resetIntents)
	state.resetIntents = nil
	return result
}

func (state *fuelState) bumpIntentGenerations(intents []string) {
	state.generation++
	if state.intentGenerations == nil {
		state.intentGenerations = make(map[string]uint64, len(intents))
	}
	for _, intent := range intents {
		state.intentGenerations[intent] = state.generation
	}
}

func (state *fuelState) resetEvidence() {
	generation, intentGenerations, resetIntents := state.generation, state.intentGenerations, state.resetIntents
	*state = fuelState{generation: generation, intentGenerations: intentGenerations, resetIntents: resetIntents}
}

func (state *fuelState) Started(message radio.RadioMessage) {
	if message.ProducerRevision != state.intentGenerations[message.Intent] {
		return
	}
	switch message.Intent {
	case IntentFuelHalfTank:
		state.playedHalf = true
	case IntentFuelOneLitre:
		state.playedOne = true
	case IntentFuelTwoLitres:
		state.playedTwo = true
	case IntentFuelLapsFour:
		state.playedFour = true
	case IntentFuelLapsThree:
		state.playedThree = true
	case IntentFuelLapsTwo:
		state.playedLapsTwo = true
	case IntentFuelLapsOne:
		state.playedLapsOne = true
	case IntentFuelPitNow:
		state.playedPitNow = true
	}
}

type fuelFamily struct{}

func (fuelFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*fuelState)
	if !e.FuelKnown || e.FuelLitres <= 0 {
		return nil
	}
	if state.lastFuel > 0 && e.FuelLitres-state.lastFuel >= refuelLitres {
		state.InvalidateIntents(familyIntents("fuel")...)
		state.resetEvidence()
	}
	if e.LapKnown {
		if state.lastLap > 0 && e.Lap > state.lastLap {
			used := state.fuelAtLapStart - e.FuelLitres
			if used > 0 {
				state.samples = append(state.samples, used)
				if len(state.samples) > maxFuelSamples {
					state.samples = state.samples[1:]
				}
			}
		}
		if e.Lap != state.lastLap {
			state.lastLap, state.fuelAtLapStart = e.Lap, e.FuelLitres
		}
	}
	state.lastFuel = e.FuelLitres
	var result []radio.RadioMessage
	if e.FuelLitres <= 2 && !state.playedTwo {
		result = append(result, message(IntentFuelTwoLitres, e))
	}
	if e.FuelLitres <= 1 && !state.playedOne {
		result = append(result, message(IntentFuelOneLitre, e))
	}
	if e.FuelCapacityKnown && e.FuelCapacity > 0 && e.FuelLitres <= e.FuelCapacity*0.5 && !state.playedHalf {
		result = append(result, message(IntentFuelHalfTank, e))
	}
	if average := averageFuel(state.samples); e.FuelCapacityKnown && e.FuelCapacity > 0 && average > 0 {
		estimated := e.FuelLitres / average
		switch {
		case estimated <= 1 && !state.playedLapsOne:
			result = append(result, message(IntentFuelLapsOne, e))
		case estimated <= 2 && !state.playedLapsTwo:
			result = append(result, message(IntentFuelLapsTwo, e))
		case estimated <= 3 && !state.playedThree:
			result = append(result, message(IntentFuelLapsThree, e))
		case estimated <= 4 && !state.playedFour:
			result = append(result, message(IntentFuelLapsFour, e))
		}
		if estimated < 4 && !state.playedPitNow {
			result = append(result, message(IntentFuelPitNow, e))
		}
	}
	for index := range result {
		result[index].ProducerRevision = state.intentGenerations[result[index].Intent]
	}
	return result
}

func fuelCapacityIntents() []string {
	return []string{
		IntentFuelHalfTank,
		IntentFuelLapsFour,
		IntentFuelLapsThree,
		IntentFuelLapsTwo,
		IntentFuelLapsOne,
		IntentFuelPitNow,
	}
}

func averageFuel(samples []float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	var total float64
	for _, sample := range samples {
		total += sample
	}
	return total / float64(len(samples))
}
