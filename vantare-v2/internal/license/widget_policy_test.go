package license

import (
	"encoding/json"
	"testing"
	"time"
)

var widgetPolicyNow = time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)

func grantProUntil(until time.Time) VerifiedGrant {
	return VerifiedGrant{Key: CapabilityPro, ExpiresAt: until}
}

func grantLaunchPerpetual() VerifiedGrant {
	return VerifiedGrant{Key: CapabilityLaunchV1, Perpetual: true}
}

func TestWidgetPolicyCapabilitiesWithoutEntitlementsGrantSuite(t *testing.T) {
	res := &Result{
		State:          StateActive,
		Capabilities:   []Capability{CapabilityPro},
		VerifiedGrants: []VerifiedGrant{grantProUntil(widgetPolicyNow.Add(time.Hour))},
		LastValidated:  widgetPolicyNow,
	}
	policy := deriveWidgetPolicy(res, widgetPolicyNow)
	if !policy.OverlaysBasic || !policy.OverlaysAdvanced || !policy.EngineerAI {
		t.Fatalf("pro capability without entitlements = %+v, want all features", policy)
	}
	if policy.BrandCrystal != BrandOptional || policy.BrandEfficiency != BrandOptional {
		t.Fatalf("brand = %q/%q, want optional", policy.BrandCrystal, policy.BrandEfficiency)
	}
	if policy.BrandOriginal != BrandNone {
		t.Fatalf("original brand = %q, want none", policy.BrandOriginal)
	}
}

func TestWidgetPolicyOverlaysAloneDoesNotGrantEngineerRadio(t *testing.T) {
	res := &Result{
		State:         StateActive,
		Entitlements:  []Entitlement{EntitlementOverlays},
		LastValidated: widgetPolicyNow,
	}
	policy := deriveWidgetPolicy(res, widgetPolicyNow)
	if !policy.OverlaysAdvanced {
		t.Fatalf("overlays must grant overlays.advanced: %+v", policy)
	}
	if policy.EngineerAI {
		t.Fatalf("overlays alone must not grant engineer.ai: %+v", policy)
	}
}

func TestWidgetPolicyEngineerAloneDoesNotGrantOverlaysAdvanced(t *testing.T) {
	res := &Result{
		State:         StateActive,
		Entitlements:  []Entitlement{EntitlementEngineer},
		LastValidated: widgetPolicyNow,
	}
	policy := deriveWidgetPolicy(res, widgetPolicyNow)
	if !policy.EngineerAI {
		t.Fatalf("engineer must grant engineer.ai: %+v", policy)
	}
	if policy.OverlaysAdvanced {
		t.Fatalf("engineer alone must not grant overlays.advanced: %+v", policy)
	}
	if policy.BrandCrystal != BrandOptional {
		t.Fatalf("engineer brand = %q, want optional on accessible widgets", policy.BrandCrystal)
	}
}

func TestWidgetPolicyUnknownRoleGrantsNothing(t *testing.T) {
	res := &Result{
		State:            StateActive,
		OperationalRoles: []OperationalRole{"administrator"},
		LastValidated:    widgetPolicyNow,
	}
	policy := deriveWidgetPolicy(res, widgetPolicyNow)
	if policy.OverlaysAdvanced || policy.EngineerAI {
		t.Fatalf("unknown role must not grant premium: %+v", policy)
	}
	if policy.BrandCrystal != BrandRequired {
		t.Fatalf("unknown role brand = %q, want required", policy.BrandCrystal)
	}
}

func TestWidgetPolicyOperationalCapabilityResolvesRoleFromAuthority(t *testing.T) {
	res := &Result{
		State:         StateActive,
		Capabilities:  []Capability{CapabilityOperationalOwner},
		LastValidated: widgetPolicyNow,
	}
	policy := deriveWidgetPolicy(res, widgetPolicyNow)
	if !policy.OverlaysAdvanced || !policy.EngineerAI {
		t.Fatalf("operational capability must resolve its role: %+v", policy)
	}
}

func TestWidgetPolicyExpiredSuiteFallsBackToFree(t *testing.T) {
	res := &Result{
		State:         StateExpired,
		Entitlements:  []Entitlement{EntitlementBundle},
		Capabilities:  []Capability{CapabilityPro},
		LastValidated: widgetPolicyNow,
	}
	policy := deriveWidgetPolicy(res, widgetPolicyNow)
	if !policy.OverlaysBasic || policy.OverlaysAdvanced || policy.EngineerAI {
		t.Fatalf("expired suite = %+v, want basic only", policy)
	}
	if policy.BrandCrystal != BrandRequired || policy.BrandEfficiency != BrandRequired {
		t.Fatalf("expired brand = %q/%q, want required", policy.BrandCrystal, policy.BrandEfficiency)
	}
}

func TestWidgetPolicyBlockedOwnerLosesPremium(t *testing.T) {
	res := &Result{
		State:            StateDeviceLimit,
		Capabilities:     []Capability{CapabilityOperationalOwner},
		OperationalRoles: []OperationalRole{OperationalRoleOwner},
		LastValidated:    widgetPolicyNow,
	}
	policy := deriveWidgetPolicy(res, widgetPolicyNow)
	if policy.OverlaysAdvanced || policy.EngineerAI {
		t.Fatalf("blocked owner = %+v, want no premium", policy)
	}
}

func TestWidgetPolicyProExpiryDropsRightsAtRealDeadline(t *testing.T) {
	res := &Result{
		State:          StateActive,
		Capabilities:   []Capability{CapabilityPro},
		Entitlements:   []Entitlement{EntitlementBundle},
		VerifiedGrants: []VerifiedGrant{grantProUntil(widgetPolicyNow.Add(time.Hour))},
		LastValidated:  widgetPolicyNow,
	}
	before := deriveWidgetPolicy(res, widgetPolicyNow)
	if !before.OverlaysAdvanced {
		t.Fatalf("before deadline must keep premium: %+v", before)
	}
	if before.ValidUntil.IsZero() || !before.ValidUntil.Equal(widgetPolicyNow.Add(time.Hour)) {
		t.Fatalf("validUntil = %v, want the verified deadline", before.ValidUntil)
	}
	after := deriveWidgetPolicy(res, widgetPolicyNow.Add(2*time.Hour))
	if after.OverlaysAdvanced || after.EngineerAI {
		t.Fatalf("after deadline must lose premium without network: %+v", after)
	}
	if after.BrandCrystal != BrandRequired {
		t.Fatalf("after deadline brand = %q, want required", after.BrandCrystal)
	}
}

func TestWidgetPolicyLaunchPerpetualSurvivesProExpiry(t *testing.T) {
	res := &Result{
		State:          StateActive,
		Capabilities:   []Capability{CapabilityLaunchV1, CapabilityPro},
		VerifiedGrants: []VerifiedGrant{grantLaunchPerpetual(), grantProUntil(widgetPolicyNow.Add(time.Hour))},
		LastValidated:  widgetPolicyNow,
	}
	before := deriveWidgetPolicy(res, widgetPolicyNow)
	if !before.OverlaysAdvanced || !before.EngineerAI {
		t.Fatalf("before deadline must keep premium: %+v", before)
	}
	// The Pro deadline changes nothing while Launch perpetual holds the
	// same decision, so it must not be published: a client invalidating to
	// Free on it would flap premium without any real loss.
	if !before.ValidUntil.IsZero() {
		t.Fatalf("validUntil = %v, want zero when no expiry changes the decision", before.ValidUntil)
	}
	after := deriveWidgetPolicy(res, widgetPolicyNow.Add(2*time.Hour))
	if !after.OverlaysAdvanced || !after.EngineerAI {
		t.Fatalf("launch perpetual must survive pro expiry: %+v", after)
	}
	if after.BrandCrystal != BrandOptional {
		t.Fatalf("launch brand after pro expiry = %q, want optional", after.BrandCrystal)
	}
	if !after.ValidUntil.IsZero() {
		t.Fatalf("validUntil after pro expiry = %v, want zero", after.ValidUntil)
	}
}

func TestWidgetPolicyNilIsFree(t *testing.T) {
	policy := deriveWidgetPolicy(nil, widgetPolicyNow)
	if !policy.OverlaysBasic || policy.OverlaysAdvanced || policy.EngineerAI {
		t.Fatalf("nil = %+v, want basic only", policy)
	}
	if policy.BrandCrystal != BrandRequired || policy.BrandOriginal != BrandNone {
		t.Fatalf("nil brand = %+v, want required/none", policy)
	}
	if !policy.ValidUntil.IsZero() {
		t.Fatalf("nil validUntil = %v, want zero", policy.ValidUntil)
	}
}

func TestWidgetPolicyWireHasNoPII(t *testing.T) {
	res := &Result{
		State:            StateActive,
		Capabilities:     []Capability{CapabilityPro},
		Entitlements:     []Entitlement{EntitlementBundle},
		OperationalRoles: []OperationalRole{OperationalRoleOwner},
		VerifiedGrants:   []VerifiedGrant{grantProUntil(widgetPolicyNow.Add(time.Hour))},
		UserID:           "user-1",
		Email:            "u@example.com",
		DeviceOK:         true,
		LastValidated:    widgetPolicyNow,
	}
	policy := deriveWidgetPolicy(res, widgetPolicyNow)
	policy.Revision = 7
	wire := policy.ToWire()
	raw, err := json.Marshal(wire)
	if err != nil {
		t.Fatal(err)
	}
	var shaped map[string]any
	if err := json.Unmarshal(raw, &shaped); err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"userId", "email", "entitlements", "capabilities", "operationalRoles", "roles", "token", "sessionToken", "deviceOK", "error"} {
		if _, ok := shaped[forbidden]; ok {
			t.Fatalf("wire leaks %q: %s", forbidden, string(raw))
		}
	}
	for _, required := range []string{"revision", "overlaysBasic", "overlaysAdvanced", "engineerAI", "brandCrystal", "brandEfficiency", "brandOriginal", "validUntil"} {
		if _, ok := shaped[required]; !ok {
			t.Fatalf("wire missing %q: %s", required, string(raw))
		}
	}
	if revision, ok := shaped["revision"].(float64); !ok || revision != 7 {
		t.Fatalf("wire revision = %v, want 7", shaped["revision"])
	}
	if _, err := time.Parse(time.RFC3339Nano, wire.ValidUntil); err != nil {
		t.Fatalf("wire validUntil unparseable: %q", wire.ValidUntil)
	}
}
