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
