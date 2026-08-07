package license

import "time"

// Entitlement is a product key a user has unlocked.
type Entitlement string

// OperationalRole grants revocable non-commercial access. It must never be
// displayed as a Polar plan or treated as purchase evidence.
type OperationalRole string

const (
	OperationalRoleTester        OperationalRole = "tester"
	OperationalRoleNightlyTester OperationalRole = "nightly_tester"
	OperationalRoleOwner         OperationalRole = "owner"
)

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
	State            State
	Entitlements     []Entitlement
	Capabilities     []Capability
	OperationalRoles []OperationalRole
	UserID           string
	Email            string
	DeviceOK         bool
	GraceEndsAt      *time.Time
	LastValidated    time.Time
	Error            error
	// OnlineValidated is intentionally omitted from LicenseWire. It marks that
	// Supabase authenticated this exact session during the current request, so
	// only the native auth-session manager can decide whether to persist it.
	OnlineValidated bool
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
	CachePath       string
}

// LicenseWire is the JSON shape sent to the UI via Wails events. Field names
// mirror the TypeScript LicenseResult type in frontend/src/lib/license.tsx.
// LastValidated is an RFC3339 string (not time.Time) so WebView2 receives a
// parseable value instead of an opaque Go struct object.
type LicenseWire struct {
	State            string            `json:"state"`
	Entitlements     []Entitlement     `json:"entitlements"`
	Capabilities     []Capability      `json:"capabilities,omitempty"`
	OperationalRoles []OperationalRole `json:"operationalRoles,omitempty"`
	UserID           string            `json:"userId"`
	Email            string            `json:"email"`
	DeviceOK         bool              `json:"deviceOK"`
	GraceEndsAt      *time.Time        `json:"graceEndsAt,omitempty"`
	LastValidated    string            `json:"lastValidated,omitempty"`
	Error            string            `json:"error,omitempty"`
}

// ToWire converts a Result into the UI-facing JSON wire format.
func (r *Result) ToWire() LicenseWire {
	var errMsg string
	if r.Error != nil {
		errMsg = r.Error.Error()
	}
	var lastValidated string
	if !r.LastValidated.IsZero() {
		lastValidated = r.LastValidated.UTC().Format(time.RFC3339Nano)
	}
	// A nil slice marshals to `null`, and the TypeScript side declares
	// entitlements as a plain array. An account with none therefore handed the
	// UI a null where it had promised a list, and every consumer that trusted
	// the type and called a method on it crashed. An empty list is the honest
	// wire value for "no entitlements". Capabilities and roles are omitempty,
	// so they arrive absent rather than null and the `?? []` on that side holds.
	entitlements := r.Entitlements
	if entitlements == nil {
		entitlements = []Entitlement{}
	}
	return LicenseWire{
		State:            string(r.State),
		Entitlements:     entitlements,
		Capabilities:     r.Capabilities,
		OperationalRoles: r.OperationalRoles,
		UserID:           r.UserID,
		Email:            r.Email,
		DeviceOK:         r.DeviceOK,
		GraceEndsAt:      r.GraceEndsAt,
		LastValidated:    lastValidated,
		Error:            errMsg,
	}
}
