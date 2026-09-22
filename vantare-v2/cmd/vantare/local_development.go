//go:build vantare_localdev && !production

package main

import "github.com/vantare/overlays/v2/internal/license"

// localDevelopmentResult exists only in an explicit non-production build.
// It is process-local authority, never a signed credential or purchase.
func localDevelopmentResult() *license.Result {
	return &license.Result{
		State: license.StateActive, UserID: "local-development",
		Email: "local-development@vantare.invalid", DeviceOK: true,
		Entitlements: []license.Entitlement{license.EntitlementBundle},
		Capabilities: []license.Capability{license.CapabilityPro},
	}
}
