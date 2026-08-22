package application

import (
	"context"
	"testing"

	strategycoldstart "github.com/vantare/overlays/v2/internal/strategy/coldstart"
)

type coldStartStub struct {
	status   strategycoldstart.Status
	progress strategycoldstart.Progress
	rejected bool
}

func (stub *coldStartStub) Status(context.Context) (strategycoldstart.Status, error) {
	return stub.status, nil
}
func (stub *coldStartStub) ImportNext(context.Context) (strategycoldstart.Progress, error) {
	return stub.progress, nil
}
func (stub *coldStartStub) Reject(context.Context) error { stub.rejected = true; return nil }

func TestColdStartCommandsExposeStatusProgressAndRejection(t *testing.T) {
	repo := &sessionCatalogRepository[any]{}
	stub := &coldStartStub{status: strategycoldstart.Status{ShouldShow: true, Found: 2, Decision: strategycoldstart.DecisionPending}, progress: strategycoldstart.Progress{Imported: 1, Total: 2}}
	service := NewServiceWithSourcesAndColdStart[any](repo, nil, nil, nil, stub)
	status, err := service.GetColdStartStatus(context.Background(), ColdStartCommand{CommandHeader: commandHeader("cold-status", OperationGetColdStartStatus, 0)})
	if err != nil || status.ColdStartStatus == nil || status.ColdStartStatus.Found != 2 {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	progress, err := service.ImportColdStartNext(context.Background(), ColdStartCommand{CommandHeader: commandHeader("cold-import", OperationImportColdStartNext, 0)})
	if err != nil || progress.ColdStartProgress == nil || progress.ColdStartProgress.Imported != 1 {
		t.Fatalf("progress=%+v err=%v", progress, err)
	}
	if _, err := service.RejectColdStart(context.Background(), ColdStartCommand{CommandHeader: commandHeader("cold-reject", OperationRejectColdStart, 0)}); err != nil || !stub.rejected {
		t.Fatalf("rejected=%v err=%v", stub.rejected, err)
	}
}
