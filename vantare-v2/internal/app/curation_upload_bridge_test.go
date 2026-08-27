package app

import (
	"context"
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/curation"
)

type fakeCurationUploadService struct {
	snapshot curation.UploadSnapshot
	err      error
}

func (fake *fakeCurationUploadService) Snapshot() curation.UploadSnapshot { return fake.snapshot }
func (fake *fakeCurationUploadService) OptIn(string) (curation.UploadSnapshot, error) {
	return fake.snapshot, fake.err
}
func (fake *fakeCurationUploadService) Pause() (curation.UploadSnapshot, error) {
	return fake.snapshot, fake.err
}
func (fake *fakeCurationUploadService) Resume() (curation.UploadSnapshot, error) {
	return fake.snapshot, fake.err
}
func (fake *fakeCurationUploadService) Revoke() (curation.UploadSnapshot, error) {
	return fake.snapshot, fake.err
}
func (fake *fakeCurationUploadService) DispatchNext(context.Context) error { return fake.err }
func (fake *fakeCurationUploadService) RequestRemoteDeletion(context.Context) (curation.DeletionReceipt, error) {
	return curation.DeletionReceipt{}, fake.err
}

func TestCurationUploadBridgeReturnsSnapshotWithoutSecrets(t *testing.T) {
	emitter := &strategyApplicationEmitterSpy{}
	service := &fakeCurationUploadService{snapshot: curation.UploadSnapshot{Enabled: false}}
	bridge := NewCurationUploadBridge(context.Background(), service, emitter)

	bridge.HandleCommand(map[string]any{
		"protocolVersion": "curation.upload.v1",
		"commandId":       "snapshot-1",
		"operation":       "snapshot",
	})

	if len(emitter.events) != 1 || emitter.events[0].name != CurationUploadResultEvent {
		t.Fatalf("events = %#v", emitter.events)
	}
	result := emitter.events[0].payload.(CurationUploadResult)
	if result.CommandID != "snapshot-1" || result.Snapshot.Enabled {
		t.Fatalf("result = %#v", result)
	}
}

func TestCurationUploadBridgeMapsPrivateFailureToClosedCode(t *testing.T) {
	emitter := &strategyApplicationEmitterSpy{}
	service := &fakeCurationUploadService{err: errors.New(`C:\Users\private token=secret`)}
	NewCurationUploadBridge(context.Background(), service, emitter).HandleCommand(map[string]any{
		"protocolVersion": "curation.upload.v1",
		"commandId":       "dispatch-1",
		"operation":       "dispatch",
	})

	failure := emitter.events[0].payload.(CurationUploadError)
	if failure.Code != "request_failed" || failure.Message != "The curation request could not be completed." {
		t.Fatalf("failure = %#v", failure)
	}
}
