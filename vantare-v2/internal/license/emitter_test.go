package license

import (
	"context"
	"sync"
	"testing"
	"time"
)

// fakeEmitter captures Emit calls for assertion.
type fakeEmitter struct {
	mu    sync.Mutex
	names []string
	data  []any
}

func (f *fakeEmitter) Emit(name string, data any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.names = append(f.names, name)
	f.data = append(f.data, data)
}

func (f *fakeEmitter) Count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.names)
}

func (f *fakeEmitter) Last() (string, any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.names) == 0 {
		return "", nil
	}
	return f.names[len(f.names)-1], f.data[len(f.data)-1]
}

func TestValidateEmitsLicenseChanged(t *testing.T) {
	em := &fakeEmitter{}
	mock := &mockSupabaseClient{
		info: &AccountInfo{
			UserID:       "u1",
			Email:        "u1@example.com",
			Entitlements: []Entitlement{EntitlementOverlays},
			ActiveDevice: "fp",
			ExpiresAt:    func() *time.Time { t := time.Now().Add(time.Hour).UTC(); return &t }(),
		},
	}
	svc := NewService(Config{GracePeriod: 24 * time.Hour}, em, func() (string, error) { return "fp", nil })
	svc.WithClient(mock)
	if _, err := svc.Validate(context.Background(), "token"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if em.Count() != 1 {
		t.Fatalf("expected 1 emit, got %d", em.Count())
	}
	name, data := em.Last()
	if name != LicenseChangedEvent {
		t.Fatalf("expected %q, got %q", LicenseChangedEvent, name)
	}
	w, ok := data.(LicenseWire)
	if !ok {
		t.Fatalf("expected LicenseWire, got %T", data)
	}
	if w.State != "active" {
		t.Fatalf("expected state active, got %s", w.State)
	}
	if w.LastValidated == "" {
		t.Fatalf("expected lastValidated RFC3339 string on wire")
	}
}

func TestValidateWithoutEmitterIsNoop(t *testing.T) {
	mock := &mockSupabaseClient{
		info: &AccountInfo{
			UserID:       "u1",
			Email:        "u1@example.com",
			Entitlements: []Entitlement{EntitlementOverlays},
			ActiveDevice: "fp",
		},
	}
	svc := NewService(Config{}, nil, func() (string, error) { return "fp", nil })
	svc.WithClient(mock)
	if _, err := svc.Validate(context.Background(), "token"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateAnonymousEmitsAnonymousState(t *testing.T) {
	em := &fakeEmitter{}
	svc := NewService(Config{}, em, func() (string, error) { return "fp", nil })
	if _, err := svc.Validate(context.Background(), ""); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if em.Count() != 1 {
		t.Fatalf("expected 1 emit, got %d", em.Count())
	}
	name, data := em.Last()
	if name != LicenseChangedEvent {
		t.Fatalf("expected %q, got %q", LicenseChangedEvent, name)
	}
	if w, ok := data.(LicenseWire); !ok || w.State != "anonymous" {
		t.Fatalf("expected anonymous wire, got %+v", data)
	}
}

func TestEmitChangedIsSafeWithNilReceiver(t *testing.T) {
	var s *Service
	s.EmitChanged(nil)
	s.EmitChanged(&Result{State: StateActive})
}

func TestEmitChangedNilResultSkipsEmit(t *testing.T) {
	em := &fakeEmitter{}
	svc := NewService(Config{}, em, func() (string, error) { return "fp", nil })
	svc.EmitChanged(nil)
	if em.Count() != 0 {
		t.Fatalf("expected no emits, got %d", em.Count())
	}
}

func TestResetDeviceEmitsFreshState(t *testing.T) {
	em := &fakeEmitter{}
	mock := &mockSupabaseClient{
		info: &AccountInfo{
			UserID:       "u2",
			Email:        "u2@example.com",
			Entitlements: []Entitlement{EntitlementBundle},
			ActiveDevice: "fp",
		},
	}
	svc := NewService(Config{}, em, func() (string, error) { return "fp", nil })
	svc.WithClient(mock)
	if err := svc.ResetDevice(context.Background(), "token"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if em.Count() == 0 {
		t.Fatalf("expected at least one emit after reset")
	}
}

func TestWithEmitterReplaces(t *testing.T) {
	em1 := &fakeEmitter{}
	em2 := &fakeEmitter{}
	svc := NewService(Config{}, em1, func() (string, error) { return "fp", nil })
	svc.WithEmitter(em2)
	mock := &mockSupabaseClient{
		info: &AccountInfo{
			UserID:       "u3",
			Email:        "u3@example.com",
			Entitlements: []Entitlement{EntitlementOverlays},
			ActiveDevice: "fp",
		},
	}
	svc.WithClient(mock)
	if _, err := svc.Validate(context.Background(), "token"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if em1.Count() != 0 {
		t.Fatalf("emitter 1 should not receive events, got %d", em1.Count())
	}
	if em2.Count() != 1 {
		t.Fatalf("emitter 2 should receive 1 event, got %d", em2.Count())
	}
}
