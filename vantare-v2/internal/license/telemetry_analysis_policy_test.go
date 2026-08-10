package license

import (
	"errors"
	"testing"
	"time"
)

func TestAllowsTelemetryAnalysisUsesTheDedicatedFailClosedMatrix(t *testing.T) {
	tests := []struct {
		name   string
		result *Result
		want   bool
	}{
		{name: "no current result", result: nil},
		{name: "active pro", result: &Result{State: StateActive, Capabilities: []Capability{CapabilityPro}}, want: true},
		{name: "grace pro", result: &Result{State: StateGrace, Capabilities: []Capability{CapabilityPro}}, want: true},
		{name: "active launch", result: &Result{State: StateActive, Capabilities: []Capability{CapabilityLaunchV1}}, want: true},
		{name: "grace launch", result: &Result{State: StateGrace, Capabilities: []Capability{CapabilityLaunchV1}}, want: true},
		{name: "active tester role", result: &Result{State: StateActive, OperationalRoles: []OperationalRole{OperationalRoleTester}}, want: true},
		{name: "grace nightly tester role", result: &Result{State: StateGrace, OperationalRoles: []OperationalRole{OperationalRoleNightlyTester}}, want: true},
		{name: "active owner role", result: &Result{State: StateActive, OperationalRoles: []OperationalRole{OperationalRoleOwner}}, want: true},
		{name: "active without grant", result: &Result{State: StateActive}},
		{name: "update testers capability is unrelated", result: &Result{State: StateActive, Capabilities: []Capability{CapabilityTesters}}},
		{name: "update nightly capability is unrelated", result: &Result{State: StateActive, Capabilities: []Capability{CapabilityNightly}}},
		{name: "operational capability is not read as a commercial capability", result: &Result{State: StateActive, Capabilities: []Capability{CapabilityOperationalOwner}}},
		{name: "unknown role", result: &Result{State: StateActive, OperationalRoles: []OperationalRole{"administrator"}}},
		{name: "anonymous pro", result: &Result{State: StateAnonymous, Capabilities: []Capability{CapabilityPro}}},
		{name: "no entitlement owner", result: &Result{State: StateAuthenticatedNoEntitlement, OperationalRoles: []OperationalRole{OperationalRoleOwner}}},
		{name: "expired pro", result: &Result{State: StateExpired, Capabilities: []Capability{CapabilityPro}}},
		{name: "device limited owner", result: &Result{State: StateDeviceLimit, OperationalRoles: []OperationalRole{OperationalRoleOwner}}},
		{name: "unconfigured launch", result: &Result{State: StateUnconfigured, Capabilities: []Capability{CapabilityLaunchV1}}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			svc := &Service{}
			if test.result != nil {
				svc.EmitChanged(test.result)
			}
			if got := svc.AllowsTelemetryAnalysis(); got != test.want {
				t.Fatalf("AllowsTelemetryAnalysis() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestCurrentResultIsCopiedOnWriteAndReadUnderTheServiceLock(t *testing.T) {
	graceEnd := time.Date(2026, 8, 12, 10, 0, 0, 0, time.UTC)
	original := &Result{
		State:            StateGrace,
		Entitlements:     []Entitlement{EntitlementBundle},
		Capabilities:     []Capability{CapabilityPro},
		OperationalRoles: []OperationalRole{OperationalRoleTester},
		GraceEndsAt:      &graceEnd,
		Error:            errors.New("offline"),
	}
	svc := &Service{}
	svc.EmitChanged(original)

	original.Entitlements[0] = EntitlementACLuaPack
	original.Capabilities[0] = CapabilityNightly
	original.OperationalRoles[0] = OperationalRoleOwner
	mutatedGraceEnd := graceEnd.Add(24 * time.Hour)
	original.GraceEndsAt = &mutatedGraceEnd

	first := svc.CurrentResult()
	if first == nil || first.Entitlements[0] != EntitlementBundle || first.Capabilities[0] != CapabilityPro ||
		first.OperationalRoles[0] != OperationalRoleTester || first.GraceEndsAt == nil || !first.GraceEndsAt.Equal(graceEnd) {
		t.Fatalf("stored result was mutated through the input: %#v", first)
	}
	first.Entitlements[0] = EntitlementACLuaPack
	first.Capabilities[0] = CapabilityNightly
	first.OperationalRoles[0] = OperationalRoleOwner
	*first.GraceEndsAt = first.GraceEndsAt.Add(48 * time.Hour)

	second := svc.CurrentResult()
	if second == nil || second.Entitlements[0] != EntitlementBundle || second.Capabilities[0] != CapabilityPro ||
		second.OperationalRoles[0] != OperationalRoleTester || second.GraceEndsAt == nil || !second.GraceEndsAt.Equal(graceEnd) {
		t.Fatalf("stored result was mutated through the returned snapshot: %#v", second)
	}
}
