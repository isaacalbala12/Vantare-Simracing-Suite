package projectioninput

import (
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/engineer/audio"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/spotter"
	engineer "github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
)

var ErrInvalidPolicyCandidate = errors.New("legacy engineer message cannot form a bounded policy candidate")

const (
	maxPolicyPayloadItems = 64
	maxPolicyPayloadBytes = 8_192
)

// PolicyEvidence derives the one bounded proof consumed by message policy
// from the same canonical observation used to feed the legacy monitors.
func PolicyEvidence(snapshot engineer.ObservationSnapshotV1, adapter *Adapter, source engineer.SourceState, freshUntilMS int64, sensitivity spotter.Sensitivity) messagepolicy.Evidence {
	ready := make([]messagepolicy.Family, 0, 6)
	for _, contract := range monitorContracts {
		if contract.State != ParityApproved {
			continue
		}
		gate, err := Evaluate(snapshot, contract.Family)
		if err == nil && gate.Ready {
			ready = append(ready, messagepolicy.Family(contract.Family))
		}
	}
	return messagepolicy.Evidence{
		CanonicalVersion:  snapshot.CanonicalVersion,
		ProjectionVersion: snapshot.ProjectionVersion,
		Context:           snapshot.Context,
		Manifest:          snapshot.Manifest,
		Source:            source,
		FreshUntilMS:      freshUntilMS,
		ReadyFamilies:     ready,
		Semantic:          SemanticEvidence(snapshot, adapter, sensitivity),
	}
}

// SemanticEvidence exposes only the fixed-size claims policy can revalidate.
func SemanticEvidence(snapshot engineer.ObservationSnapshotV1, adapter *Adapter, sensitivity spotter.Sensitivity) messagepolicy.SemanticEvidence {
	var result messagepolicy.SemanticEvidence
	if adapter != nil {
		if frame, err := adapter.FrameFor(FamilySpotter, snapshot); err == nil {
			result.SpotterKnown = true
			for _, zone := range spotter.Classify(frame, sensitivity) {
				switch zone.Side {
				case spotter.SideLeft:
					result.SpotterLeft = true
				case spotter.SideRight:
					result.SpotterRight = true
				}
			}
		}
	}
	if value, present := snapshot.Player.FuelLiters.Value(); present && snapshot.Player.FuelLiters.Usable() {
		result.FuelKnown, result.FuelLitres = true, value
	}
	if value, present := snapshot.Player.FuelCapacity.Value(); present && snapshot.Player.FuelCapacity.Usable() {
		result.FuelCapacityKnown, result.FuelCapacity = true, value
	}
	if value, present := snapshot.Player.InPit.Value(); present && snapshot.Player.InPit.Usable() {
		result.PitKnown, result.InPit = true, value
	}
	if value, present := snapshot.Player.PenaltyCount.Value(); present && snapshot.Player.PenaltyCount.Usable() {
		result.PenaltyKnown, result.PenaltyCount = true, int64(value)
	}
	if value, present := snapshot.Player.LapNumber.Value(); present && snapshot.Player.LapNumber.Usable() {
		result.LapKnown, result.LapNumber = true, int64(value)
	}
	if value, present := snapshot.Player.TimeBehindLeader.Value(); present && snapshot.Player.TimeBehindLeader.Usable() {
		result.GapLeaderKnown, result.GapLeader = true, value
	}
	if value, present := snapshot.Player.TimeBehindNext.Value(); present && snapshot.Player.TimeBehindNext.Usable() {
		result.GapNextKnown, result.GapNext = true, value
	}
	return result
}

// CandidateFromMessage converts the bounded legacy monitor output into the
// transport-neutral policy contract. It does not decide whether the message
// is allowed; the scheduler remains the sole authority for that decision.
func CandidateFromMessage(message audio.Message, snapshot engineer.ObservationSnapshotV1, evidence messagepolicy.SemanticEvidence) (messagepolicy.Candidate, error) {
	if message.CreatedAt < 0 || message.ExpiresAt <= message.CreatedAt {
		return messagepolicy.Candidate{}, ErrInvalidPolicyCandidate
	}
	family := FamilyForMessage(message)
	intent := message.TextKey
	if family == FamilyPenalties && intent == "penalties.new_drivethrough" {
		intent = messagepolicy.IntentPenaltyCountIncreased
	}
	payload, ok := boundedPolicyPayload(message.ValidationData)
	if !ok {
		return messagepolicy.Candidate{}, ErrInvalidPolicyCandidate
	}
	semantic, ok := semanticClaim(message.ValidityRule, intent, evidence)
	if !ok {
		return messagepolicy.Candidate{}, ErrInvalidPolicyCandidate
	}
	return messagepolicy.Candidate{
		Version:           messagepolicy.ContractVersionV1,
		ID:                message.ID,
		Family:            messagepolicy.Family(family),
		Intent:            intent,
		Subject:           string(snapshot.Context.Identity.Vehicle),
		Priority:          policyPriority(family),
		CreatedAtMS:       message.CreatedAt,
		ExpiresAtMS:       message.ExpiresAt,
		CanonicalVersion:  snapshot.CanonicalVersion,
		ProjectionVersion: snapshot.ProjectionVersion,
		Context:           snapshot.Context,
		Semantic:          semantic,
		Payload:           payload,
	}, nil
}

func FamilyForMessage(message audio.Message) MonitorFamily {
	if message.Category == audio.CategorySpotter {
		return FamilySpotter
	}
	return MonitorFamily(message.Category)
}

func semanticClaim(validityRule, intent string, evidence messagepolicy.SemanticEvidence) (messagepolicy.SemanticClaim, bool) {
	claim := messagepolicy.SemanticClaim{}
	switch validityRule {
	case "spotter.active_left":
		claim.Rule = messagepolicy.SemanticSpotterLeftActive
	case "spotter.active_right":
		claim.Rule = messagepolicy.SemanticSpotterRightActive
	case "spotter.active_both":
		claim.Rule = messagepolicy.SemanticSpotterBothActive
	case "spotter.clear_left":
		claim.Rule = messagepolicy.SemanticSpotterLeftClear
	case "spotter.clear_right":
		claim.Rule = messagepolicy.SemanticSpotterRightClear
	case "spotter.all_clear":
		claim.Rule = messagepolicy.SemanticSpotterAllClear
	case "":
	default:
		return messagepolicy.SemanticClaim{}, false
	}
	if claim.Rule != messagepolicy.SemanticUnknown {
		return claim, true
	}
	switch intent {
	case messagepolicy.IntentSpotterCarLeft:
		claim.Rule = messagepolicy.SemanticSpotterLeftActive
	case messagepolicy.IntentSpotterCarRight:
		claim.Rule = messagepolicy.SemanticSpotterRightActive
	case messagepolicy.IntentSpotterStillThere:
		claim.Rule = messagepolicy.SemanticSpotterAnyActive
	case messagepolicy.IntentSpotterClearLeft:
		claim.Rule = messagepolicy.SemanticSpotterLeftClear
	case messagepolicy.IntentSpotterClearRight:
		claim.Rule = messagepolicy.SemanticSpotterRightClear
	case messagepolicy.IntentSpotterAllClear:
		claim.Rule = messagepolicy.SemanticSpotterAllClear
	case messagepolicy.IntentSpotterThreeWide:
		claim.Rule = messagepolicy.SemanticSpotterBothActive
	case messagepolicy.IntentFuelHalfTank:
		claim.Rule = messagepolicy.SemanticFuelHalfTank
	case messagepolicy.IntentFuelOneLitre:
		claim.Rule = messagepolicy.SemanticFuelAtMostOneLitre
	case messagepolicy.IntentFuelTwoLitres:
		claim.Rule = messagepolicy.SemanticFuelAtMostTwoLitres
	case messagepolicy.IntentFuelLapsFour, messagepolicy.IntentFuelLapsThree, messagepolicy.IntentFuelLapsTwo,
		messagepolicy.IntentFuelLapsOne, messagepolicy.IntentFuelPitNow:
		if !evidence.FuelKnown {
			return messagepolicy.SemanticClaim{}, false
		}
		claim.Rule, claim.Primary, claim.HasPrimary = messagepolicy.SemanticFuelNotRefuelled, evidence.FuelLitres, true
	case messagepolicy.IntentPenaltyCountIncreased:
		if !evidence.PenaltyKnown {
			return messagepolicy.SemanticClaim{}, false
		}
		claim.Rule, claim.Integer = messagepolicy.SemanticPenaltyOutstanding, evidence.PenaltyCount
	case messagepolicy.IntentLapCompleted:
		if !evidence.LapKnown {
			return messagepolicy.SemanticClaim{}, false
		}
		claim.Rule, claim.Integer = messagepolicy.SemanticLapCurrent, evidence.LapNumber
	case messagepolicy.IntentTimingGapReport:
		claim.Rule = messagepolicy.SemanticTimingUnchanged
		if evidence.GapLeaderKnown {
			claim.Primary, claim.HasPrimary = evidence.GapLeader, true
		}
		if evidence.GapNextKnown {
			claim.Secondary, claim.HasSecondary = evidence.GapNext, true
		}
		if !claim.HasPrimary && !claim.HasSecondary {
			return messagepolicy.SemanticClaim{}, false
		}
	case messagepolicy.IntentPitEntry:
		claim.Rule = messagepolicy.SemanticInPit
	case messagepolicy.IntentPitExit:
		claim.Rule = messagepolicy.SemanticOutOfPit
	default:
		return messagepolicy.SemanticClaim{}, true
	}
	return claim, true
}

func policyPriority(family MonitorFamily) messagepolicy.Priority {
	switch family {
	case FamilySpotter:
		return messagepolicy.PrioritySpotter
	case FamilyFuel:
		return messagepolicy.PriorityFailureResource
	case FamilyPenalties:
		return messagepolicy.PriorityPenalty
	default:
		return messagepolicy.PriorityInformation
	}
}

func boundedPolicyPayload(input map[string]any) (map[string]string, bool) {
	if len(input) == 0 {
		return nil, true
	}
	if len(input) > maxPolicyPayloadItems {
		return nil, false
	}
	result := make(map[string]string, len(input))
	total := 0
	for key, value := range input {
		switch value.(type) {
		case string, bool,
			int, int8, int16, int32, int64,
			uint, uint8, uint16, uint32, uint64,
			float32, float64:
			formatted := fmt.Sprint(value)
			total += len(key) + len(formatted)
			if total > maxPolicyPayloadBytes {
				return nil, false
			}
			result[key] = formatted
		default:
			return nil, false
		}
	}
	return result, true
}
