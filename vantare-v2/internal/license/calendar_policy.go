package license

// AllowsCalendarReminders mirrors the paid calendar feature using current
// native authority. Operational assignments stay separate from commercial plans.
func (s *Service) AllowsCalendarReminders() bool {
	current := s.currentResult()
	if current == nil || current.State != StateActive && current.State != StateGrace {
		return false
	}
	for _, role := range current.OperationalRoles {
		switch role {
		case OperationalRoleTester, OperationalRoleNightlyTester, OperationalRoleOwner:
			return true
		}
	}
	switch ClassifyPlan(current.Entitlements) {
	case PlanPaidOverlays, PlanPaidEngineer, PlanSuite:
		return true
	}
	return false
}
