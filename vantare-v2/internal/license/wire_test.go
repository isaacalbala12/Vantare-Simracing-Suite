package license

import (
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestResultToWire(t *testing.T) {
	grace := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	last := time.Date(2026, 6, 26, 10, 0, 0, 0, time.UTC)
	r := &Result{
		State:         StateActive,
		Entitlements:  []Entitlement{EntitlementOverlays, EntitlementEngineer},
		UserID:        "user-1",
		Email:         "u@example.com",
		DeviceOK:      true,
		GraceEndsAt:   &grace,
		LastValidated: last,
		Error:         nil,
	}
	w := r.ToWire()
	if w.State != "active" {
		t.Fatalf("state: want active, got %s", w.State)
	}
	if w.UserID != "user-1" {
		t.Fatalf("userId: want user-1, got %s", w.UserID)
	}
	if w.Email != "u@example.com" {
		t.Fatalf("email mismatch")
	}
	if !w.DeviceOK {
		t.Fatalf("deviceOK should be true")
	}
	if w.GraceEndsAt == nil || !w.GraceEndsAt.Equal(grace) {
		t.Fatalf("graceEndsAt mismatch")
	}
	if w.LastValidated != last.UTC().Format(time.RFC3339Nano) {
		t.Fatalf("lastValidated mismatch: got %s", w.LastValidated)
	}
	if w.Error != "" {
		t.Fatalf("error should be empty, got %s", w.Error)
	}
	if len(w.Entitlements) != 2 {
		t.Fatalf("entitlements: want 2, got %d", len(w.Entitlements))
	}
}

func TestResultToWireIncludesErrorMessage(t *testing.T) {
	r := &Result{
		State:         StateExpired,
		LastValidated: time.Now().UTC(),
		Error:         errors.New("upstream down"),
	}
	w := r.ToWire()
	if w.Error != "upstream down" {
		t.Fatalf("error string: want upstream down, got %s", w.Error)
	}
}

func TestResultToWireOmitsGraceWhenNil(t *testing.T) {
	r := &Result{State: StateAnonymous}
	w := r.ToWire()
	if w.GraceEndsAt != nil {
		t.Fatalf("graceEndsAt should be nil")
	}
	if w.Error != "" {
		t.Fatalf("error should be empty, got %s", w.Error)
	}
}

func TestLicenseWireJSONShape(t *testing.T) {
	w := LicenseWire{
		State:         "active",
		Entitlements:  []Entitlement{EntitlementBundle},
		UserID:        "abc",
		Email:         "x@y",
		DeviceOK:      true,
		LastValidated: time.Unix(0, 0).UTC().Format(time.RFC3339Nano),
	}
	b, err := json.Marshal(w)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, key := range []string{"state", "entitlements", "userId", "email", "deviceOK", "lastValidated"} {
		if _, ok := m[key]; !ok {
			t.Fatalf("missing key %q in JSON: %s", key, string(b))
		}
	}
}
