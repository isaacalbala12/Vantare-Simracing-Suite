package license

import "testing"

// TestClassifyPlan is table-driven and locked to docs/stripe-integration-plan.md.
func TestClassifyPlan(t *testing.T) {
	cases := []struct {
		name string
		in   []Entitlement
		want PlanLabel
	}{
		{"empty is free", nil, PlanFree},
		{"empty slice is free", []Entitlement{}, PlanFree},
		{"overlays alone", []Entitlement{EntitlementOverlays}, PlanPaidOverlays},
		{"engineer alone", []Entitlement{EntitlementEngineer}, PlanPaidEngineer},
		{"bundle is suite", []Entitlement{EntitlementBundle}, PlanSuite},
		{"beta_access is suite", []Entitlement{EntitlementBetaAccess}, PlanSuite},
		{"founder is suite", []Entitlement{EntitlementFounder}, PlanSuite},
		{"pro_founder is suite", []Entitlement{EntitlementProFounder}, PlanSuite},
		{"visionary_backer is suite", []Entitlement{EntitlementVisionaryBacker}, PlanSuite},
		{"supporter is paid_overlays", []Entitlement{EntitlementSupporter}, PlanPaidOverlays},
		{"bundle plus ac_lua_pack is suite", []Entitlement{EntitlementBundle, EntitlementACLuaPack}, PlanSuite},
		{"ac_lua_pack alone is free add-on", []Entitlement{EntitlementACLuaPack}, PlanFree},
		{"overlays plus engineer is suite (treated as bundle)", []Entitlement{EntitlementOverlays, EntitlementEngineer}, PlanSuite},
		{"unknown token", []Entitlement{"mystery_key"}, PlanUnknown},
		{"whitespace ignored", []Entitlement{""}, PlanFree},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ClassifyPlan(tc.in)
			if got != tc.want {
				t.Fatalf("ClassifyPlan(%v) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestClassifyStatus locks the State -> PlanStatus mapping.
func TestClassifyStatus(t *testing.T) {
	cases := []struct {
		in   State
		want PlanStatus
	}{
		{StateActive, PlanStatusActive},
		{StateGrace, PlanStatusGrace},
		{StateExpired, PlanStatusBlocked},
		{StateDeviceLimit, PlanStatusBlocked},
		{StateAuthenticatedNoEntitlement, PlanStatusFree},
		{StateAnonymous, PlanStatusAnonymous},
		{StateUnconfigured, PlanStatusUnconfigured},
		{"other", PlanStatusFree},
	}

	for _, tc := range cases {
		t.Run(string(tc.in), func(t *testing.T) {
			got := ClassifyStatus(tc.in)
			if got != tc.want {
				t.Fatalf("ClassifyStatus(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestBuildSummary(t *testing.T) {
	cases := []struct {
		name         string
		state        State
		entitlements []Entitlement
		wantLabel    PlanLabel
		wantStatus   PlanStatus
	}{
		{
			name:         "active suite",
			state:        StateActive,
			entitlements: []Entitlement{EntitlementBundle},
			wantLabel:    PlanSuite,
			wantStatus:   PlanStatusActive,
		},
		{
			name:         "grace overlays",
			state:        StateGrace,
			entitlements: []Entitlement{EntitlementOverlays},
			wantLabel:    PlanPaidOverlays,
			wantStatus:   PlanStatusGrace,
		},
		{
			name:         "blocked without entitlements",
			state:        StateExpired,
			entitlements: nil,
			wantLabel:    PlanFree,
			wantStatus:   PlanStatusBlocked,
		},
		{
			name:         "authenticated-no-entitlement is free",
			state:        StateAuthenticatedNoEntitlement,
			entitlements: nil,
			wantLabel:    PlanFree,
			wantStatus:   PlanStatusFree,
		},
		{
			name:         "blocked suite loses suite label",
			state:        StateDeviceLimit,
			entitlements: []Entitlement{EntitlementBundle},
			wantLabel:    PlanSuite,
			wantStatus:   PlanStatusBlocked,
		},
		{
			name:         "anonymous forces anonymous status",
			state:        StateAnonymous,
			entitlements: []Entitlement{EntitlementBundle},
			wantLabel:    PlanSuite,
			wantStatus:   PlanStatusAnonymous,
		},
		{
			name:         "active unknown becomes free",
			state:        StateActive,
			entitlements: []Entitlement{"mystery"},
			wantLabel:    PlanFree,
			wantStatus:   PlanStatusActive,
		},
		{
			name:         "unconfigured is not blocked",
			state:        StateUnconfigured,
			entitlements: nil,
			wantLabel:    PlanFree,
			wantStatus:   PlanStatusUnconfigured,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := BuildSummary(tc.state, tc.entitlements)
			if got.Label != tc.wantLabel {
				t.Fatalf("label = %q, want %q", got.Label, tc.wantLabel)
			}
			if got.Status != tc.wantStatus {
				t.Fatalf("status = %q, want %q", got.Status, tc.wantStatus)
			}
		})
	}
}

func TestSortedEntitlements(t *testing.T) {
	got := SortedEntitlements([]Entitlement{"bundle", "overlays", "engineer"})
	want := []Entitlement{"bundle", "engineer", "overlays"}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("idx %d: got %q, want %q", i, got[i], want[i])
		}
	}

	// Input is not mutated.
	src := []Entitlement{"b", "a"}
	_ = SortedEntitlements(src)
	if src[0] != "b" || src[1] != "a" {
		t.Fatalf("input mutated: %v", src)
	}
}
