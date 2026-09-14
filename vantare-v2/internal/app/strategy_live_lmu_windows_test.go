//go:build windows

package app

import (
	"context"
	"math"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/live"
)

const (
	strategyLiveLMULapBoundary = contract.LapCount(4096)
	strategyLiveLMUMaxCursor   = uint64(1<<53 - 1)
)

func TestStrategyLiveLMUOptIn(t *testing.T) {
	if os.Getenv("LMU_LIVE_SHARED_MEMORY_TEST") != "1" {
		t.Skip("set LMU_LIVE_SHARED_MEMORY_TEST=1 with LMU and the player on track to verify Strategy live")
	}

	activePlan, err := contract.NewActivePlan("lmu-live-evidence", contract.RevisionRef{
		PlanID:      "lmu-live-plan",
		VariantID:   "lmu-live-variant",
		RevisionID:  "lmu-live-revision",
		ContentHash: strings.Repeat("a", 64),
	}, time.Date(2026, 8, 13, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("build active plan: %v", err)
	}
	plan, err := live.NewPlan(live.PlanInput{
		ActivePlan: activePlan,
		Stints:     []live.Stint{{ID: "lmu-live-stint", Laps: strategyLiveLMULapBoundary}},
	})
	if err != nil {
		t.Fatalf("build live plan: %v", err)
	}
	engine, err := live.NewEngine(plan)
	if err != nil {
		t.Fatalf("build live engine: %v", err)
	}
	telemetryRuntime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{Enabled: true, StrategyPublicTransport: true})
	if err != nil {
		t.Fatalf("build telemetry core runtime: %v", err)
	}
	strategyRuntime, err := NewStrategyLiveRuntime(telemetryRuntime.StrategyHub(), engine)
	if err != nil {
		t.Fatalf("build Strategy live runtime: %v", err)
	}

	adapterCtx, cancelAdapter := context.WithCancel(t.Context())
	runtimeCtx, cancelRuntime := context.WithCancel(t.Context())
	adapterDone := make(chan error, 1)
	t.Cleanup(func() {
		cancelAdapter()
		cancelRuntime()

		adapterWaitCtx, cancelAdapterWait := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancelAdapterWait()
		select {
		case runErr := <-adapterDone:
			if runErr != nil {
				t.Errorf("Strategy live Run after cancellation: %v", runErr)
			}
		case <-adapterWaitCtx.Done():
			t.Errorf("wait Strategy live Run after cancellation: %v", adapterWaitCtx.Err())
		}

		stopCtx, cancelStop := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelStop()
		if stopErr := telemetryRuntime.Stop(stopCtx); stopErr != nil {
			t.Errorf("stop telemetry core runtime: %v", stopErr)
		}
		metrics := telemetryRuntime.Metrics()
		if metrics.StrategyTransport.CurrentSubscribers != 0 {
			t.Errorf("subscribers after cleanup: strategy=%d, want 0",
				metrics.StrategyTransport.CurrentSubscribers)
		}
	})

	go func() {
		adapterDone <- strategyRuntime.Run(adapterCtx)
	}()
	waitStrategyLiveLMUSubscribers(t, runtimeCtx, telemetryRuntime, 1)
	if err := telemetryRuntime.Start(runtimeCtx); err != nil {
		t.Fatalf("start telemetry core runtime: %v", err)
	}

	evidenceCtx, cancelEvidence := context.WithTimeout(t.Context(), 20*time.Second)
	defer cancelEvidence()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	var model live.ReadModel
	for {
		model = engine.Snapshot()
		if strategyLiveLMUEvidenceReady(model) {
			break
		}
		select {
		case <-evidenceCtx.Done():
			logStrategyLiveLMUEvidence(t, model)
			t.Fatalf("wait for live player progress and Fuel: %v", evidenceCtx.Err())
		case <-ticker.C:
		}
	}

	completed, completedPresent := model.CompletedLaps.Value()
	fuelAmount, amountPresent := model.FuelAmount.Value()
	fuelCapacity, capacityPresent := model.FuelCapacity.Value()
	if !completedPresent || !amountPresent || !capacityPresent {
		t.Fatal("ready Strategy live model omitted required evidence")
	}
	if model.Cursor.Epoch == 0 || model.Cursor.Sequence == 0 ||
		model.Cursor.Epoch > strategyLiveLMUMaxCursor || model.Cursor.Sequence > strategyLiveLMUMaxCursor {
		t.Fatalf("unsafe Strategy live cursor epoch=%d sequence=%d", model.Cursor.Epoch, model.Cursor.Sequence)
	}
	amount := fuelAmount.Value()
	capacity := fuelCapacity.Value()
	if math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 ||
		math.IsNaN(capacity) || math.IsInf(capacity, 0) || capacity < 0 || amount > capacity {
		t.Fatalf("invalid Strategy Fuel amount=%v capacity=%v", amount, capacity)
	}
	if completed >= strategyLiveLMULapBoundary {
		t.Fatalf("completed laps=%d reached test plan boundary=%d", completed, strategyLiveLMULapBoundary)
	}
	stint, stintPresent := model.Stint.Value()
	if !stintPresent || !model.Stint.Usable() || stint.LapBoundary != strategyLiveLMULapBoundary ||
		stint.CompletedLaps != completed {
		t.Fatalf("invalid live stint present=%v usable=%v completed=%d boundary=%d",
			stintPresent, model.Stint.Usable(), stint.CompletedLaps, stint.LapBoundary)
	}
	action, actionPresent := model.NextAction.Value()
	if !actionPresent || !model.NextAction.Usable() || action.Kind != live.ActionFinish ||
		action.LapBoundary != strategyLiveLMULapBoundary {
		t.Fatalf("invalid next action present=%v usable=%v kind=%q boundary=%d",
			actionPresent, model.NextAction.Usable(), action.Kind, action.LapBoundary)
	}
	if _, present := model.FuelDeviationLiters.Value(); present || model.FuelDeviationLiters.Usable() ||
		model.FuelDeviationLiters.State() != live.ValueMissing {
		t.Fatalf("Fuel deviation state=%v present=%v usable=%v, want missing/false/false",
			model.FuelDeviationLiters.State(), present, model.FuelDeviationLiters.Usable())
	}

	logStrategyLiveLMUEvidence(t, model)
}

func waitStrategyLiveLMUSubscribers(t *testing.T, ctx context.Context, telemetryRuntime *TelemetryCoreRuntime, want int) {
	t.Helper()
	waitCtx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		if current := telemetryRuntime.StrategyHub().Metrics().CurrentSubscribers; current == want {
			return
		}
		select {
		case <-waitCtx.Done():
			t.Fatalf("wait for Strategy subscribers: %v", waitCtx.Err())
		case <-ticker.C:
		}
	}
}

func strategyLiveLMUEvidenceReady(model live.ReadModel) bool {
	source, sourcePresent := model.Source.Value()
	_, completedPresent := model.CompletedLaps.Value()
	_, amountPresent := model.FuelAmount.Value()
	_, capacityPresent := model.FuelCapacity.Value()
	return sourcePresent && model.Source.State() == live.ValueFresh && source.State == live.SourceLive &&
		completedPresent && model.CompletedLaps.State() == live.ValueFresh && model.CompletedLaps.Usable() &&
		amountPresent && model.FuelAmount.State() == live.ValueFresh && model.FuelAmount.Usable() &&
		capacityPresent && model.FuelCapacity.State() == live.ValueFresh && model.FuelCapacity.Usable()
}

func logStrategyLiveLMUEvidence(t *testing.T, model live.ReadModel) {
	t.Helper()
	source, sourcePresent := model.Source.Value()
	completed, completedPresent := model.CompletedLaps.Value()
	amount, amountPresent := model.FuelAmount.Value()
	capacity, capacityPresent := model.FuelCapacity.Value()
	t.Logf(
		"source-state=%q source-value-state=%v source-present=%v epoch=%d sequence=%d completed-laps=%d completed-state=%v completed-present=%v fuel-amount=%v fuel-amount-state=%v fuel-amount-present=%v fuel-capacity=%v fuel-capacity-state=%v fuel-capacity-present=%v deviation-state=%v",
		source.State, model.Source.State(), sourcePresent, model.Cursor.Epoch, model.Cursor.Sequence,
		completed, model.CompletedLaps.State(), completedPresent,
		amount.Value(), model.FuelAmount.State(), amountPresent,
		capacity.Value(), model.FuelCapacity.State(), capacityPresent,
		model.FuelDeviationLiters.State(),
	)
}
