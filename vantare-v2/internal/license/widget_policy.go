package license

import (
	"sort"
	"time"
)

// BrandRule is the branding decision for one design system. It carries no
// identity, roles or tokens: the client only interprets the decision plus its
// own persisted preference. A non-paid decision never removes a mandatory brand.
type BrandRule string

const (
	BrandRequired BrandRule = "required"
	BrandOptional BrandRule = "optional"
	BrandNone     BrandRule = "none"
)

// Widget feature gates expressed by the native policy. Names mirror the
// frontend FeatureId values used in WIDGET_REQUIRED_FEATURE_BY_TYPE, so both
// sides resolve the same product contract: Standings/Pedals need
// overlays.basic, Delta and the other premium widgets need overlays.advanced,
// and engineer-radio needs engineer.ai.
const (
	WidgetFeatureOverlaysBasic    = "overlays.basic"
	WidgetFeatureOverlaysAdvanced = "overlays.advanced"
	WidgetFeatureEngineerAI       = "engineer.ai"
)

// WidgetPolicyChangedEvent carries a WidgetPolicyWire derived from the
// effective authority. Publication is serialized (policyMu -> currentMu, the
// same order ClearCurrent uses), so a logout can never be followed by a
// premium computed from pre-logout authority. Emission itself happens outside
// the lock, so two consecutive publications may arrive out of order:
// consumers must keep the newest revision applied and discard any wire whose
// revision is not newer. The stream snapshot is always authoritative.
const WidgetPolicyChangedEvent = "widget-policy:changed"

// WidgetPolicy is the native authority for widget access and branding,
// derived exclusively from the effective license.Result held by Service.
// OverlaysBasic (Standings/Pedals) stays available on Free; OverlaysAdvanced
// (Delta and other premium widgets) and EngineerAI (engineer-radio) need
// their own rights. Crystal/Efficiency require the brand on Free and hide it
// by default on paid access; Original keeps its own presentation.
//
// Revision is a sequence owned by Service: repeated snapshots share it, and
// every effective change (new rights, logout, real expiry) advances it so
// stale responses can be discarded. ValidUntil is the next verified deadline
// that changes the decision (zero when none is known); readers never expire
// locally on their own and a lost transport never extends rights.
type WidgetPolicy struct {
	Revision         uint64
	OverlaysBasic    bool
	OverlaysAdvanced bool
	EngineerAI       bool
	BrandCrystal     BrandRule
	BrandEfficiency  BrandRule
	BrandOriginal    BrandRule
	ValidUntil       time.Time
}

// WidgetPolicyWire is the sanitized DTO shared with Studio/Desktop (Wails
// events) and OBS (SSE). No PII, roles, entitlements, capabilities or tokens.
type WidgetPolicyWire struct {
	Revision         uint64    `json:"revision"`
	OverlaysBasic    bool      `json:"overlaysBasic"`
	OverlaysAdvanced bool      `json:"overlaysAdvanced"`
	EngineerAI       bool      `json:"engineerAI"`
	BrandCrystal     BrandRule `json:"brandCrystal"`
	BrandEfficiency  BrandRule `json:"brandEfficiency"`
	BrandOriginal    BrandRule `json:"brandOriginal"`
	ValidUntil       string    `json:"validUntil,omitempty"`
}

// ToWire exports the sanitized DTO. ValidUntil is an RFC3339 string (not
// time.Time) so WebView2 receives a parseable value; it is omitted when no
// verified transition is known.
func (p WidgetPolicy) ToWire() WidgetPolicyWire {
	wire := WidgetPolicyWire{
		Revision:         p.Revision,
		OverlaysBasic:    p.OverlaysBasic,
		OverlaysAdvanced: p.OverlaysAdvanced,
		EngineerAI:       p.EngineerAI,
		BrandCrystal:     p.BrandCrystal,
		BrandEfficiency:  p.BrandEfficiency,
		BrandOriginal:    p.BrandOriginal,
	}
	if !p.ValidUntil.IsZero() {
		wire.ValidUntil = p.ValidUntil.UTC().Format(time.RFC3339Nano)
	}
	return wire
}

func (p WidgetPolicy) sameDecision(q WidgetPolicy) bool {
	return sameAccessAndBrand(p, q) && p.ValidUntil.Equal(q.ValidUntil)
}

// sameAccessAndBrand compares the enforceable decision, ignoring the
// publication metadata (revision) and the next transition (validUntil).
func sameAccessAndBrand(p, q WidgetPolicy) bool {
	return p.OverlaysBasic == q.OverlaysBasic &&
		p.OverlaysAdvanced == q.OverlaysAdvanced &&
		p.EngineerAI == q.EngineerAI &&
		p.BrandCrystal == q.BrandCrystal &&
		p.BrandEfficiency == q.BrandEfficiency &&
		p.BrandOriginal == q.BrandOriginal
}

func freeWidgetPolicy() WidgetPolicy {
	return WidgetPolicy{
		OverlaysBasic:   true,
		BrandCrystal:    BrandRequired,
		BrandEfficiency: BrandRequired,
		BrandOriginal:   BrandNone,
	}
}

// widgetEffective is the authority after applying the verified deadlines the
// verifier already checked, at a given instant. It never invents grace and
// never changes billing or auth rules: it only drops what verifiably expired.
type widgetEffective struct {
	state        State
	entitlements []Entitlement
	caps         []Capability
	roles        []OperationalRole
}

var widgetRoleCapability = map[OperationalRole]Capability{
	OperationalRoleTester:        CapabilityOperationalTester,
	OperationalRoleNightlyTester: CapabilityOperationalNightlyTester,
	OperationalRoleOwner:         CapabilityOperationalOwner,
}

func hasWidgetCapability(caps []Capability, wanted Capability) bool {
	for _, current := range caps {
		if current == wanted {
			return true
		}
	}
	return false
}

// grantExpired reports whether a verified deadline for key has passed. Keys
// without a verified deadline (unknown, e.g. merged online capabilities) and
// perpetual grants never expire natively.
func grantExpired(grants map[Capability]VerifiedGrant, key Capability, now time.Time) bool {
	grant, ok := grants[key]
	if !ok || grant.Perpetual || grant.ExpiresAt.IsZero() {
		return false
	}
	return !grant.ExpiresAt.After(now)
}

func effectiveWidgetAuthority(stored *Result, now time.Time) widgetEffective {
	var eff widgetEffective
	if stored == nil {
		return eff
	}
	now = now.UTC()
	byKey := make(map[Capability]VerifiedGrant, len(stored.VerifiedGrants))
	for _, grant := range stored.VerifiedGrants {
		if _, seen := byKey[grant.Key]; !seen {
			byKey[grant.Key] = grant
		}
	}
	for _, capability := range stored.Capabilities {
		if !grantExpired(byKey, capability, now) {
			eff.caps = append(eff.caps, capability)
		}
	}
	seenRole := make(map[OperationalRole]struct{})
	for _, role := range stored.OperationalRoles {
		capability, ok := widgetRoleCapability[role]
		if !ok {
			// Unknown roles never grant: only the authority's own
			// operational assignments resolve.
			continue
		}
		if grantExpired(byKey, capability, now) {
			continue
		}
		if _, seen := seenRole[role]; !seen {
			seenRole[role] = struct{}{}
			eff.roles = append(eff.roles, role)
		}
	}
	for _, capability := range eff.caps {
		switch capability {
		case CapabilityOperationalTester:
			if _, seen := seenRole[OperationalRoleTester]; !seen {
				seenRole[OperationalRoleTester] = struct{}{}
				eff.roles = append(eff.roles, OperationalRoleTester)
			}
		case CapabilityOperationalNightlyTester:
			if _, seen := seenRole[OperationalRoleNightlyTester]; !seen {
				seenRole[OperationalRoleNightlyTester] = struct{}{}
				eff.roles = append(eff.roles, OperationalRoleNightlyTester)
			}
		case CapabilityOperationalOwner:
			if _, seen := seenRole[OperationalRoleOwner]; !seen {
				seenRole[OperationalRoleOwner] = struct{}{}
				eff.roles = append(eff.roles, OperationalRoleOwner)
			}
		}
	}
	// The bundle token is the legacy projection of the Pro/Launch
	// capabilities, so it only lapses with affirmative evidence: a verified
	// Pro/Launch deadline in the past. Without that evidence a stored bundle
	// is preserved as-is -- the policy must neither deny rights it cannot
	// expire natively nor invent them.
	suiteGrantDead := grantExpired(byKey, CapabilityPro, now) ||
		grantExpired(byKey, CapabilityLaunchV1, now)
	hasSuiteCap := hasWidgetCapability(eff.caps, CapabilityPro) ||
		hasWidgetCapability(eff.caps, CapabilityLaunchV1)
	for _, entitlement := range stored.Entitlements {
		if entitlement == EntitlementBundle && !hasSuiteCap && suiteGrantDead {
			continue
		}
		eff.entitlements = append(eff.entitlements, entitlement)
	}
	if hasSuiteCap && !hasWidgetEntitlement(eff.entitlements, EntitlementBundle) {
		// A signed Pro/Launch capability grants suite rights even when the
		// legacy entitlement list was not populated alongside it.
		eff.entitlements = append(eff.entitlements, EntitlementBundle)
	}
	eff.state = stored.State
	if stored.State == StateActive || stored.State == StateGrace {
		if len(eff.caps) == 0 && (len(stored.Capabilities) > 0 || hasTemporalGrant(stored.VerifiedGrants)) {
			eff.state = StateExpired
		}
	}
	return eff
}

func hasWidgetEntitlement(entitlements []Entitlement, wanted Entitlement) bool {
	for _, entitlement := range entitlements {
		if entitlement == wanted {
			return true
		}
	}
	return false
}

func hasTemporalGrant(grants []VerifiedGrant) bool {
	for _, grant := range grants {
		if !grant.Perpetual && !grant.ExpiresAt.IsZero() {
			return true
		}
	}
	return false
}

// deriveWidgetPolicy derives the widget decision from a stored result at an
// instant. It is pure: the returned Revision is always zero and Service
// assigns the published sequence. A nil result is Free.
func deriveWidgetPolicy(stored *Result, now time.Time) WidgetPolicy {
	policy := decideWidgetPolicy(effectiveWidgetAuthority(stored, now.UTC()))
	policy.ValidUntil = nextDecisionChangingDeadline(stored, now.UTC(), policy)
	return policy
}

// nextDecisionChangingDeadline is the next verified deadline that changes
// access or branding, or zero when no expiry changes the decision. A Launch
// perpetual next to a temporary Pro therefore yields no deadline: the client
// must never invalidate to Free on a transition that changes nothing. Only
// already-verified grants are read; auth and billing rules are untouched.
func nextDecisionChangingDeadline(stored *Result, now time.Time, current WidgetPolicy) time.Time {
	if stored == nil {
		return time.Time{}
	}
	deadlines := make([]time.Time, 0, len(stored.VerifiedGrants))
	for _, grant := range stored.VerifiedGrants {
		if grant.Perpetual || grant.ExpiresAt.IsZero() || !grant.ExpiresAt.After(now) {
			continue
		}
		deadlines = append(deadlines, grant.ExpiresAt.UTC())
	}
	sort.Slice(deadlines, func(i, j int) bool { return deadlines[i].Before(deadlines[j]) })
	for _, deadline := range deadlines {
		if !sameAccessAndBrand(decideWidgetPolicy(effectiveWidgetAuthority(stored, deadline)), current) {
			return deadline
		}
	}
	return time.Time{}
}

func decideWidgetPolicy(eff widgetEffective) WidgetPolicy {
	policy := freeWidgetPolicy()
	if eff.state != StateActive && eff.state != StateGrace {
		return policy
	}
	label := ClassifyPlan(eff.entitlements)
	hasSuiteCap := hasWidgetCapability(eff.caps, CapabilityPro) ||
		hasWidgetCapability(eff.caps, CapabilityLaunchV1)
	hasOperational := len(eff.roles) > 0
	if label == PlanPaidOverlays || label == PlanSuite || hasSuiteCap || hasOperational {
		policy.OverlaysAdvanced = true
	}
	if label == PlanPaidEngineer || label == PlanSuite || hasSuiteCap || hasOperational {
		policy.EngineerAI = true
	}
	if label == PlanPaidOverlays || label == PlanPaidEngineer || label == PlanSuite || hasSuiteCap || hasOperational {
		policy.BrandCrystal = BrandOptional
		policy.BrandEfficiency = BrandOptional
	}
	return policy
}

func (s *Service) policyClock() time.Time {
	if s != nil && s.policyNow != nil {
		return s.policyNow().UTC()
	}
	return time.Now().UTC()
}

// updateWidgetPolicy recomputes the effective decision and, when it differs
// from the published snapshot (or logout forces it), advances the sequence,
// caches the snapshot and reschedules the native transition. It reports the
// wire to emit; callers emit outside the policy lock.
//
// Lock order is always policyMu -> currentMu: the authority is read while
// holding policyMu, so ClearCurrent can never slip between the read and the
// publication and resurrect a stale premium after logout.
func (s *Service) updateWidgetPolicy(force bool) (WidgetPolicy, WidgetPolicyWire, bool) {
	now := s.policyClock()
	s.policyMu.Lock()
	defer s.policyMu.Unlock()
	return s.updateWidgetPolicyLocked(s.currentResultLocked(), now, force)
}

// updateWidgetPolicyLocked is the publication core for holders of policyMu.
func (s *Service) updateWidgetPolicyLocked(stored *Result, now time.Time, force bool) (WidgetPolicy, WidgetPolicyWire, bool) {
	if stored == nil && !s.policyPublished {
		return freeWidgetPolicy(), WidgetPolicyWire{}, false
	}
	return s.publishWidgetPolicyLocked(stored, now, force)
}

func (s *Service) publishWidgetPolicyLocked(stored *Result, now time.Time, force bool) (WidgetPolicy, WidgetPolicyWire, bool) {
	next := deriveWidgetPolicy(stored, now)
	if s.policyPublished && !force && s.policy.sameDecision(next) {
		return s.policy, WidgetPolicyWire{}, false
	}
	s.policySeq++
	next.Revision = s.policySeq
	s.policy = next
	s.policyPublished = true
	s.schedulePolicyTimerLocked(next.ValidUntil, now)
	return next, next.ToWire(), true
}

func (s *Service) schedulePolicyTimerLocked(validUntil, now time.Time) {
	s.stopPolicyTimerLocked()
	if validUntil.IsZero() || !validUntil.After(now) {
		return
	}
	// One-shot push so active surfaces lose rights at the real deadline even
	// when nobody re-reads the snapshot. Cancelable via stopPolicyTimer on
	// every republish and on logout.
	s.policyTimer = time.AfterFunc(validUntil.Sub(now), func() {
		s.onWidgetPolicyDeadline()
	})
}

func (s *Service) onWidgetPolicyDeadline() {
	if s == nil {
		return
	}
	_, wire, changed := s.updateWidgetPolicy(false)
	if changed && s.emitter != nil {
		s.emitter.Emit(WidgetPolicyChangedEvent, wire)
	}
}

func (s *Service) stopPolicyTimerLocked() {
	if s.policyTimer != nil {
		s.policyTimer.Stop()
		s.policyTimer = nil
	}
}

func (s *Service) stopPolicyTimer() {
	if s == nil {
		return
	}
	s.policyMu.Lock()
	defer s.policyMu.Unlock()
	s.stopPolicyTimerLocked()
}

// CurrentWidgetPolicy returns the snapshot derived from the effective
// authority. Repeated snapshots share the revision until an effective change,
// logout or real expiry advances it. The value contains no shared mutable
// references, so callers cannot corrupt the cached authority.
func (s *Service) CurrentWidgetPolicy() WidgetPolicy {
	if s == nil {
		return freeWidgetPolicy()
	}
	next, wire, changed := s.updateWidgetPolicy(false)
	if changed && s.emitter != nil {
		s.emitter.Emit(WidgetPolicyChangedEvent, wire)
	}
	return next
}

// refreshWidgetPolicy recalculates the effective decision at the policy clock
// (timer path and controlled-clock tests). It is CurrentWidgetPolicy spelled
// for the refresh call-site.
func (s *Service) refreshWidgetPolicy() WidgetPolicy {
	return s.CurrentWidgetPolicy()
}
