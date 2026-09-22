//go:build vantare_localdev && !production

package main

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/license"
)

func TestLocalDevelopmentBuildProfileEnabled(t *testing.T) {
	result := localDevelopmentResult()
	if result == nil || result.State != license.StateActive || result.UserID != "local-development" {
		t.Fatal("explicit local development build must publish local authority")
	}
	if len(result.OperationalRoles) != 0 || len(result.VerifiedGrants) != 0 || result.OnlineValidated {
		t.Fatal("local development must not create a role, signed grant or online validation")
	}
	service := license.NewService(license.Config{}, nil, nil)
	service.EmitChanged(result)
	if !service.AllowsTelemetryAnalysis() || !service.AllowsCalendarReminders() {
		t.Fatal("local development must unlock native product workflows")
	}
	policy := service.CurrentWidgetPolicy()
	if !policy.OverlaysAdvanced || !policy.EngineerAI {
		t.Fatal("local development must unlock native widget policy")
	}
	if service.AllowsUpdateChannel("testers") || service.AllowsUpdateChannel("nightly") {
		t.Fatal("local development must not unlock distribution channels")
	}
	if hubWindowOptions("test").Title != "Vantare — Desarrollo local" {
		t.Fatal("local development window must be identifiable")
	}
}
