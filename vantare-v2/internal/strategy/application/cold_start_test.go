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
	retried  bool
}

func (stub *coldStartStub) Status(context.Context) (strategycoldstart.Status, error) {
	return stub.status, nil
}
func (stub *coldStartStub) ImportNext(context.Context) (strategycoldstart.Progress, error) {
	return stub.progress, nil
}
func (stub *coldStartStub) RetryFailures(context.Context) (strategycoldstart.Progress, error) {
	stub.retried = true
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
	retry, err := service.RetryColdStartFailures(context.Background(), ColdStartCommand{CommandHeader: commandHeader("cold-retry", OperationRetryColdStartFailures, 0)})
	if err != nil || retry.ColdStartProgress == nil || !stub.retried {
		t.Fatalf("retry=%+v retried=%v err=%v", retry, stub.retried, err)
	}
	stub.retried = false
	if _, err := NewJSONBridge(service).Execute(context.Background(), []byte(`{"protocolVersion":"strategy.application.v1","commandId":"cold-retry-bridge","operation":"retry_cold_start_failures","expectedRepositoryVersion":0}`)); err != nil || !stub.retried {
		t.Fatalf("retry bridge retried=%v err=%v", stub.retried, err)
	}
}

func TestGetColdStartStatusTreatsTypedNilServiceAsPending(t *testing.T) {
	repo := &sessionCatalogRepository[any]{}
	var coldStart *strategycoldstart.Service
	service := NewServiceWithSourcesAndColdStart[any](repo, nil, nil, nil, coldStart)

	result, err := service.GetColdStartStatus(context.Background(), ColdStartCommand{CommandHeader: commandHeader("cold-status", OperationGetColdStartStatus, 0)})
	if err != nil {
		t.Fatalf("GetColdStartStatus() error = %v", err)
	}
	if result.ColdStartStatus == nil || result.ColdStartStatus.Decision != strategycoldstart.DecisionPending {
		t.Fatalf("cold start status = %+v, want pending", result.ColdStartStatus)
	}
}
