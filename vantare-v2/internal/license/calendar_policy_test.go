package license

import "testing"

func TestCalendarReminderAccessUsesCurrentAuthority(t *testing.T) {
	tests := []struct {
		name   string
		result *Result
		want   bool
	}{
		{"missing", nil, false},
		{"free", &Result{State: StateAuthenticatedNoEntitlement}, false},
		{"active free", &Result{State: StateActive}, false},
		{"overlays", &Result{State: StateActive, Entitlements: []Entitlement{EntitlementOverlays}}, true},
		{"engineer grace", &Result{State: StateGrace, Entitlements: []Entitlement{EntitlementEngineer}}, true},
		{"suite", &Result{State: StateActive, Entitlements: []Entitlement{EntitlementBundle}}, true},
		{"expired paid", &Result{State: StateExpired, Entitlements: []Entitlement{EntitlementBundle}}, false},
		{"unconfigured paid", &Result{State: StateUnconfigured, Entitlements: []Entitlement{EntitlementBundle}}, false},
		{"unknown entitlement", &Result{State: StateActive, Entitlements: []Entitlement{"unknown"}}, false},
		{"owner", &Result{State: StateActive, OperationalRoles: []OperationalRole{OperationalRoleOwner}}, true},
		{"tester", &Result{State: StateActive, OperationalRoles: []OperationalRole{OperationalRoleTester}}, true},
		{"nightly grace", &Result{State: StateGrace, OperationalRoles: []OperationalRole{OperationalRoleNightlyTester}}, true},
		{"blocked owner", &Result{State: StateDeviceLimit, OperationalRoles: []OperationalRole{OperationalRoleOwner}}, false},
		{"unknown role", &Result{State: StateActive, OperationalRoles: []OperationalRole{"administrator"}}, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			svc := &Service{}
			if test.result != nil {
				svc.EmitChanged(test.result)
			}
			if got := svc.AllowsCalendarReminders(); got != test.want {
				t.Fatalf("got %v want %v", got, test.want)
			}
			svc.ClearCurrent()
			if svc.AllowsCalendarReminders() {
				t.Fatal("sign-out retained permission")
			}
		})
	}
}
