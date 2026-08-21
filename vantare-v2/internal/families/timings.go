package families

import "github.com/vantare/overlays/v2/internal/radio"

type timingsState struct {
	initialized  bool
	lastReportMS int64
}

func (state *timingsState) Reset() { *state = timingsState{} }

type timingsFamily struct{}

func (timingsFamily) Evaluate(e Evidence, raw State) []radio.RadioMessage {
	state := raw.(*timingsState)
	if (!e.GapLeaderKnown && !e.GapNextKnown) || (e.PitKnown && e.InPit) {
		return nil
	}
	if !state.initialized {
		state.initialized, state.lastReportMS = true, e.NowMS
		return nil
	}
	if e.NowMS-state.lastReportMS < 60_000 {
		return nil
	}
	state.lastReportMS = e.NowMS
	readable := (e.GapLeaderKnown && e.GapLeader > 0.5 && e.GapLeader < 20) || (e.GapNextKnown && e.GapNext > 0.5 && e.GapNext < 20)
	if readable {
		return []radio.RadioMessage{message(IntentTimingGapReport, e)}
	}
	return nil
}
