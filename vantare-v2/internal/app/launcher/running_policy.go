package launcher

import (
	"context"
	"fmt"
	"sort"

	"github.com/vantare/overlays/v2/internal/app"
)

// resolveRunningStep handles an executable that is already open. handled is
// true when no new launch should happen; abort is true for an explicit cancel
// or an expired decision. Reused processes never carry ownership evidence.
func (r *ChainRunner) resolveRunningStep(ctx context.Context, profile app.LaunchProfile, entry app.LauncherAppEntry) (result chainStepResult, handled, abort bool) {
	if r.findRunning == nil || entry.ExecutablePath == "" {
		return chainStepResult{}, false, false
	}
	candidates, err := r.findRunning(ctx, entry.ExecutablePath)
	if err != nil {
		return chainStepResult{message: fmt.Sprintf("no se pudo comprobar si ya está abierta: %v", err)}, true, false
	}
	running := make([]ProcessInfo, 0, len(candidates))
	for _, process := range candidates {
		if process.CreationTime != 0 && ProcessIsReady(ProcessIdentity{ExecutablePath: entry.ExecutablePath}, process) {
			running = append(running, process)
		}
	}
	if len(running) == 0 {
		return chainStepResult{}, false, false
	}
	sort.Slice(running, func(i, j int) bool { return running[i].PID < running[j].PID })
	owned := make([]ProcessIdentity, 0, len(running))
	allOwned := r.ownedProcess != nil && r.closeOwned != nil
	if allOwned {
		for _, process := range running {
			identity, ok := r.ownedProcess(entry.ID, process.PID)
			if !ok || identity.CreationTime == 0 || !ProcessIsReady(identity, process) {
				allOwned = false
				break
			}
			owned = append(owned, identity)
		}
	}
	policy := app.NormalizeLaunchPolicy(profile.Policy)
	action := ResolveAlreadyRunning(policy.AlreadyRunning, RunningPending)
	if action == RunningPending {
		actions := []string{string(RunningReuse), string(RunningCancel)}
		if allOwned {
			actions = []string{string(RunningReuse), string(RunningRestart), string(RunningCancel)}
		}
		action = RunningAction(r.requestDecision(ctx, profile.ID, entry.ID, "alreadyRunning", "la aplicación ya está abierta", actions))
	}
	switch action {
	case RunningReuse:
		return chainStepResult{success: true, pid: running[0].PID}, true, false
	case RunningRestart:
		if !allOwned {
			return chainStepResult{message: "no se puede reiniciar una aplicación abierta fuera de Vantare"}, true, false
		}
		for _, identity := range owned {
			if err := r.closeOwned(ctx, entry.ID, identity); err != nil {
				return chainStepResult{message: fmt.Sprintf("no se pudo cerrar antes de reiniciar: %v", err)}, true, false
			}
		}
		return chainStepResult{}, false, false
	default:
		r.CancelChain(profile.ID)
		return chainStepResult{}, true, true
	}
}
