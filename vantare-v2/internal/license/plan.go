package license

import "sort"

// PlanLabel is the user-facing classification of a license. It is intentionally
// non-overlapping so the UI can render one and only one row.
type PlanLabel string

const (
	PlanFree         PlanLabel = "free"
	PlanPaidOverlays PlanLabel = "paid_overlays"
	PlanPaidEngineer PlanLabel = "paid_engineer"
	PlanSuite        PlanLabel = "suite"
	PlanUnknown      PlanLabel = "unknown"
)

// PlanStatus is the high-level gating state surfaced to the UI together with
// the plan label. It collapses the seven State values into six buckets the
// settings page renders as badges.
type PlanStatus string

const (
	PlanStatusActive       PlanStatus = "active"
	PlanStatusGrace        PlanStatus = "grace"
	PlanStatusBlocked      PlanStatus = "blocked"
	PlanStatusFree         PlanStatus = "free"
	PlanStatusAnonymous    PlanStatus = "anonymous"
	PlanStatusUnconfigured PlanStatus = "unconfigured"
)

// PlanSummary is the wire-shaped status consumed by AccountSettings.
type PlanSummary struct {
	Label  PlanLabel
	Status PlanStatus
}

// ClassifyPlan returns the user-facing plan label for a set of entitlements.
// The rules are intentionally simple and follow docs/stripe-integration-plan.md:
//   - bundle / beta_access / founder / pro_founder / visionary_backer  -> suite
//   - overlays (alone or with supporter)                              -> paid_overlays
//   - engineer (alone or with supporter)                              -> paid_engineer
//   - supporter alone                                                 -> paid_overlays (Supporter is documented as Overlays+badge)
//   - ac_lua_pack alone                                                -> free (add-on, does not unlock the app)
//   - empty                                                            -> free
//   - any other unrecognized token                                     -> unknown
func ClassifyPlan(entitlements []Entitlement) PlanLabel {
	// Deduplicate while preserving presence. Empty strings are ignored so the
	// caller can pass a slice with a stray placeholder without surprises.
	has := map[Entitlement]bool{}
	for _, e := range entitlements {
		if e == "" {
			continue
		}
		has[e] = true
	}
	if len(has) == 0 {
		return PlanFree
	}

	// Suite first: any tier that maps to Overlays + Engineer supersedes
	// standalone entitlements. Overlays+Engineer together also count as the
	// Suite experience even without an explicit bundle token, mirroring the
	// paywall "Si tienes Overlays + Engineer, ya tienes Suite" rule.
	switch {
	case has[EntitlementBundle],
		has[EntitlementBetaAccess],
		has[EntitlementFounder],
		has[EntitlementProFounder],
		has[EntitlementVisionaryBacker],
		has[EntitlementOverlays] && has[EntitlementEngineer]:
		return PlanSuite
	}

	if has[EntitlementOverlays] || has[EntitlementSupporter] {
		return PlanPaidOverlays
	}
	if has[EntitlementEngineer] {
		return PlanPaidEngineer
	}
	if has[EntitlementACLuaPack] {
		return PlanFree
	}

	// Unknown entitlement keys fall back to "unknown" rather than "free" so
	// the UI can flag stale or misconfigured data instead of silently granting
	// access.
	return PlanUnknown
}

// ClassifyStatus collapses the license State into the PlanStatus buckets the
// settings page renders. Anonymous users are kept distinct so the UI can show
// "Sin sesión" instead of "Free" when there is no logged-in user.
func ClassifyStatus(state State) PlanStatus {
	switch state {
	case StateActive:
		return PlanStatusActive
	case StateGrace:
		return PlanStatusGrace
	case StateExpired, StateDeviceLimit:
		return PlanStatusBlocked
	case StateAuthenticatedNoEntitlement:
		return PlanStatusFree
	case StateAnonymous:
		return PlanStatusAnonymous
	case StateUnconfigured:
		return PlanStatusUnconfigured
	default:
		return PlanStatusFree
	}
}

// BuildSummary produces the summary the AccountSettings card renders.
func BuildSummary(state State, entitlements []Entitlement) PlanSummary {
	status := ClassifyStatus(state)
	label := ClassifyPlan(entitlements)

	// Blocked and anonymous states override the label so the UI never shows
	// "Suite" while the user is logged out or the subscription is dead.
	// Unconfigured is a configuration error, not a block: it keeps the label
	// so the UI can show an actionable message without a false paywall.
	if status == PlanStatusBlocked || status == PlanStatusAnonymous {
		return PlanSummary{Label: label, Status: status}
	}

	// Active and grace states only keep a suite/paid label when there is at
	// least one entitlement. Otherwise we surface "free".
	if status == PlanStatusActive || status == PlanStatusGrace {
		if label == PlanUnknown {
			return PlanSummary{Label: PlanFree, Status: status}
		}
		return PlanSummary{Label: label, Status: status}
	}

	return PlanSummary{Label: PlanFree, Status: status}
}

// SortedEntitlements returns a sorted copy of entitlements so the UI can render
// a stable list without changing call sites.
func SortedEntitlements(entitlements []Entitlement) []Entitlement {
	out := make([]Entitlement, len(entitlements))
	copy(out, entitlements)
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
