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
	name, data := emitter.Last()
	wire, ok := data.(LicenseWire)
	if emitter.Count() != 1 || name != LicenseChangedEvent || !ok || wire.State != "active" {
		t.Fatalf("event = %d %s %#v", emitter.Count(), name, data)
	}
}

func TestValidateAnonymousEmitsAnonymousState(t *testing.T) {
	emitter := &fakeEmitter{}
	service := NewService(Config{}, emitter, nil)
	_, _ = service.Validate(context.Background(), "")
	_, data := emitter.Last()
	wire, ok := data.(LicenseWire)
	if !ok || wire.State != "anonymous" {
		t.Fatalf("event = %#v", data)
	}
}

func TestEmitChangedNilSafe(t *testing.T) {
	var service *Service
	service.EmitChanged(nil)
	service = NewService(Config{}, &fakeEmitter{}, nil)
	service.EmitChanged(nil)
}
