package commands

import "context"

const maxReplaySteps = 256

type ReplayReport struct {
	SchemaVersion string `json:"schema_version"`
	Turns         []Turn `json:"turns"`
}

// RunReplay drives the same text router used by tests with an explicit clock.
// It performs no I/O and owns no product runtime, audio, STT or action port.
func RunReplay(ctx context.Context, router *Router, steps []TurnInput) (ReplayReport, error) {
	if ctx == nil || router == nil || len(steps) == 0 || len(steps) > maxReplaySteps {
		return ReplayReport{}, ErrInvalidInput
	}
	report := ReplayReport{SchemaVersion: DialogueContractVersionV1, Turns: make([]Turn, 0, len(steps))}
	for _, step := range steps {
		if err := ctx.Err(); err != nil {
			return ReplayReport{}, err
		}
		report.Turns = append(report.Turns, router.Handle(ctx, step))
	}
	return report, nil
}
