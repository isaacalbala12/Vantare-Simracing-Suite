package license

import (
	"context"
	"sync"
	"testing"
	"time"
)

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
func (f *fakeEmitter) Count() int { f.mu.Lock(); defer f.mu.Unlock(); return len(f.names) }
func (f *fakeEmitter) Last() (string, any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.names) == 0 {
		return "", nil
	}
	i := len(f.names) - 1
	return f.names[i], f.data[i]
}

// findEvent returns the most recent payload emitted under name, if any.
func (f *fakeEmitter) findEvent(name string) (any, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.names) - 1; i >= 0; i-- {
		if f.names[i] == name {
			return f.data[i], true
		}
	}
	return nil, false
}

func TestValidateEmitsVerifiedLicense(t *testing.T) {
	now := time.Now().UTC()
	client := &mockSupabaseClient{}
	service, private := newTestService(t, now, client)
	client.credential = signTestCredential(t, private, now, []OfflineCapability{{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339)}}, testSubject, "device-1")
	emitter := &fakeEmitter{}
	service.WithEmitter(emitter)
	if _, err := service.Validate(context.Background(), testJWT(testSubject)); err != nil {
		t.Fatal(err)
	}
	data, ok := emitter.findEvent(LicenseChangedEvent)
	wire, okWire := data.(LicenseWire)
	if !ok || !okWire || wire.State != "active" {
		t.Fatalf("license event = %#v", data)
	}
	policyData, ok := emitter.findEvent(WidgetPolicyChangedEvent)
	policyWire, okWire := policyData.(WidgetPolicyWire)
	if !ok || !okWire || !policyWire.OverlaysAdvanced || !policyWire.EngineerAI {
		t.Fatalf("widget policy event = %#v", policyData)
	}
}

func TestValidateAnonymousEmitsAnonymousState(t *testing.T) {
	emitter := &fakeEmitter{}
	service := NewService(Config{}, emitter, nil)
	_, _ = service.Validate(context.Background(), "")
	data, ok := emitter.findEvent(LicenseChangedEvent)
	wire, okWire := data.(LicenseWire)
	if !ok || !okWire || wire.State != "anonymous" {
		t.Fatalf("license event = %#v", data)
	}
	policyData, ok := emitter.findEvent(WidgetPolicyChangedEvent)
	policyWire, okWire := policyData.(WidgetPolicyWire)
	if !ok || !okWire || policyWire.OverlaysAdvanced || policyWire.EngineerAI {
		t.Fatalf("widget policy event = %#v", policyData)
	}
}

func TestEmitChangedNilSafe(t *testing.T) {
	var service *Service
	service.EmitChanged(nil)
	service = NewService(Config{}, &fakeEmitter{}, nil)
	service.EmitChanged(nil)
}
