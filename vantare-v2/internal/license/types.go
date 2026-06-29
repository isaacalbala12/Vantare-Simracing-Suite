package license

import "time"

// Entitlement is a product key a user has unlocked.
type Entitlement string

const (
	EntitlementOverlays        Entitlement = "overlays"
	EntitlementEngineer        Entitlement = "engineer"
	EntitlementBundle          Entitlement = "bundle"
	EntitlementBetaAccess      Entitlement = "beta_access"
	EntitlementSupporter       Entitlement = "supporter"
	EntitlementFounder         Entitlement = "founder"
	EntitlementProFounder      Entitlement = "pro_founder"
	EntitlementVisionaryBacker Entitlement = "visionary_backer"
	EntitlementACLuaPack       Entitlement = "ac_lua_pack"
)

// State is the high-level license state surfaced to the UI and runtime gating.
type State string

const (
	StateAnonymous                  State = "anonymous"
	StateAuthenticatedNoEntitlement State = "authenticated-no-entitlement"
	StateActive                     State = "active"
	StateGrace                      State = "grace"
	StateExpired                    State = "expired"
	StateDeviceLimit                State = "device-limit"
	// StateUnconfigured is returned when the backend has no Supabase client
	// and no usable cache. It must never be treated as expired/device-limit
	// (which would block the user behind a paywall). The frontend surfaces it
	// as an actionable configuration error instead of a hard block.
	StateUnconfigured State = "unconfigured"
)

// Result is the outcome of a license validation cycle.
type Result struct {
	State         State
	Entitlements  []Entitlement
	UserID        string
	Email         string
	DeviceOK      bool
	GraceEndsAt   *time.Time
	LastValidated time.Time
	Error         error
}

// AccountInfo is the entitlement/device row returned by Supabase RPC.
type AccountInfo struct {
	UserID       string        `json:"user_id"`
	Email        string        `json:"email"`
	Entitlements []Entitlement `json:"entitlements"`
	ActiveDevice string        `json:"active_device"`
	ExpiresAt    *time.Time    `json:"expires_at"`
}

// Config holds the configurable inputs for the license service.
type Config struct {
	SupabaseURL     string
	SupabaseAnonKey string
	GracePeriod     time.Duration
	CachePath       string
}

// LicenseWire is the JSON shape sent to the UI via Wails events. Field names
// mirror the TypeScript LicenseResult type in frontend/src/lib/license.tsx.
type LicenseWire struct {
	State         string        `json:"state"`
	Entitlements  []Entitlement `json:"entitlements"`
	UserID        string        `json:"userId"`
	Email         string        `json:"email"`
	DeviceOK      bool          `json:"deviceOK"`
	GraceEndsAt   *time.Time    `json:"graceEndsAt,omitempty"`
	LastValidated time.Time     `json:"lastValidated"`
	Error         string        `json:"error,omitempty"`
}

// ToWire converts a Result into the UI-facing JSON wire format.
func (r *Result) ToWire() LicenseWire {
	var errMsg string
	if r.Error != nil {
		errMsg = r.Error.Error()
	}
	return LicenseWire{
		State:         string(r.State),
		Entitlements:  r.Entitlements,
		UserID:        r.UserID,
		Email:         r.Email,
		DeviceOK:      r.DeviceOK,
		GraceEndsAt:   r.GraceEndsAt,
		LastValidated: r.LastValidated,
		Error:         errMsg,
	}
}
