package license

// currentResult returns a defensive snapshot of the authority currently held
// by the native license service. Callers cannot mutate the stored slices or
// grace timestamp, and the copy is taken while the service read lock is held.
func (s *Service) currentResult() *Result {
	if s == nil {
		return nil
	}
	s.currentMu.RLock()
	defer s.currentMu.RUnlock()
	return cloneResult(s.current)
}

// currentResultLocked is currentResult for callers already holding policyMu.
// Lock order is always policyMu -> currentMu; never take policyMu while
// holding currentMu.
func (s *Service) currentResultLocked() *Result {
	if s == nil {
		return nil
	}
	s.currentMu.RLock()
	defer s.currentMu.RUnlock()
	return cloneResult(s.current)
}

// AllowsTelemetryAnalysis is the dedicated access policy for historical
// telemetry. Operational roles grant revocable internal access only; they are
// checked separately and are never converted into commercial capabilities.
func (s *Service) AllowsTelemetryAnalysis() bool {
	current := s.currentResult()
	if current == nil || current.State != StateActive && current.State != StateGrace {
		return false
	}
	for _, capability := range current.Capabilities {
		if capability == CapabilityPro || capability == CapabilityLaunchV1 {
			return true
		}
	}
	for _, role := range current.OperationalRoles {
		switch role {
		case OperationalRoleTester, OperationalRoleNightlyTester, OperationalRoleOwner:
			return true
		}
	}
	return false
}

func cloneResult(source *Result) *Result {
	if source == nil {
		return nil
	}
	result := *source
	result.Entitlements = append([]Entitlement(nil), source.Entitlements...)
	result.Capabilities = append([]Capability(nil), source.Capabilities...)
	result.OperationalRoles = append([]OperationalRole(nil), source.OperationalRoles...)
	result.VerifiedGrants = append([]VerifiedGrant(nil), source.VerifiedGrants...)
	if source.GraceEndsAt != nil {
		graceEndsAt := *source.GraceEndsAt
		result.GraceEndsAt = &graceEndsAt
	}
	return &result
}
