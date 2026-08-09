package license

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestEntitlementConstants(t *testing.T) {
	cases := []Entitlement{
		EntitlementOverlays,
		EntitlementEngineer,
		EntitlementBundle,
		EntitlementBetaAccess,
		EntitlementACLuaPack,
	}
	for _, c := range cases {
		if c == "" {
			t.Fatalf("entitlement constant must not be empty")
		}
	}
}

func TestStateConstants(t *testing.T) {
	cases := []State{
		StateAnonymous,
		StateAuthenticatedNoEntitlement,
		StateActive,
		StateGrace,
		StateExpired,
		StateDeviceLimit,
	}
	for _, c := range cases {
		if c == "" {
			t.Fatalf("state constant must not be empty")
		}
	}
}

// The UI declares entitlements as a plain array and calls methods on it without
// guarding. A nil slice marshals to `null`, so an account with no entitlements
// used to hand the settings page a null where the type promised a list and take
// it down with "Cannot read properties of null (reading 'join')".
func TestToWireNeverSendsNullEntitlements(t *testing.T) {
	result := &Result{State: StateActive}
	if result.Entitlements != nil {
		t.Fatal("this test is only meaningful with a nil slice")
	}

	wire := result.ToWire()
	if wire.Entitlements == nil {
		t.Fatal("ToWire must turn a nil slice into an empty list")
	}

	encoded, err := json.Marshal(wire)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(encoded), `"entitlements":[]`) {
		t.Fatalf("entitlements must serialise as [], got %s", encoded)
	}
}

func TestToWireKeepsTheEntitlementsItWasGiven(t *testing.T) {
	result := &Result{
		State:        StateActive,
		Entitlements: []Entitlement{EntitlementOverlays, EntitlementEngineer},
	}

	wire := result.ToWire()

	if len(wire.Entitlements) != 2 ||
		wire.Entitlements[0] != EntitlementOverlays ||
		wire.Entitlements[1] != EntitlementEngineer {
		t.Fatalf("entitlements = %v, want the two it was given", wire.Entitlements)
	}
}
