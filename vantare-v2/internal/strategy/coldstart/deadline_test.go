package coldstart

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type deadlineImporter struct {
	lateSuccess bool
	calls       int
}

func (i *deadlineImporter) Import(ctx context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	i.calls++
	if _, ok := ctx.Deadline(); !ok {
		return telemetryanalysis.AuthorizedSessionModel{}, errors.New("candidate has no deadline")
	}
	<-ctx.Done()
	if i.lateSuccess {
		return reconciliationModel(candidate.Locator), nil
	}
	return telemetryanalysis.AuthorizedSessionModel{}, ctx.Err()
}

func TestCandidateDeadlineRejectsLateSuccessAndAllowsRetry(t *testing.T) {
	for _, lateSuccess := range []bool{false, true} {
		t.Run(map[bool]string{false: "error", true: "late_success"}[lateSuccess], func(t *testing.T) {
			importer := &deadlineImporter{lateSuccess: lateSuccess}
			store := &sessionStoreStub{}
			service := NewService(ServiceOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), Store: store, Importer: importer, CandidateTimeout: time.Millisecond, Discover: func(context.Context) ([]telemetryanalysis.Candidate, error) {
				return []telemetryanalysis.Candidate{{Locator: "lmu://one"}}, nil
			}})
			progress, err := service.ImportNext(context.Background())
			if err != nil || progress.Imported != 0 || progress.Skipped != 1 || len(progress.Failures) != 1 || progress.Failures[0].Reason != "candidate_timeout" || len(store.models) != 0 {
				t.Fatalf("timeout=%+v stored=%d err=%v", progress, len(store.models), err)
			}
			if _, err := service.RetryFailures(context.Background()); err != nil {
				t.Fatal(err)
			}
			service.options.Importer = &importerStub{}
			service.options.CandidateTimeout = 0
			progress, err = service.ImportNext(context.Background())
			if err != nil || progress.Imported != 1 || !progress.Done {
				t.Fatalf("retry=%+v err=%v", progress, err)
			}
		})
	}
}

func TestImportCandidateRejectsSuccessAfterParentCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	importer := cancelOnImport{cancel: cancel}
	_, err := importCandidate(ctx, importer, telemetryanalysis.Candidate{Locator: "lmu://one"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("late success after parent cancellation: %v", err)
	}
}

type cancelOnImport struct{ cancel context.CancelFunc }

func (i cancelOnImport) Import(_ context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	i.cancel()
	return reconciliationModel(candidate.Locator), nil
}

func TestCandidateTimeoutIsBoundedBelowClientBudget(t *testing.T) {
	for _, configured := range []time.Duration{0, -1, time.Hour} {
		service := NewService(ServiceOptions{CandidateTimeout: configured})
		if got := service.candidateTimeout(); got != 29*time.Minute {
			t.Fatalf("timeout(%s)=%s", configured, got)
		}
	}
}
