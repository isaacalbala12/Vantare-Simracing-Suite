package license

import "testing"

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
