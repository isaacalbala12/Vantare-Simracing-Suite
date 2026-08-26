package telemetryanalysis

import "sort"

// RacePracticeGroup associates one race with every practice of its combination.
type RacePracticeGroup struct {
	Race      ClassifiedSession   `json:"race"`
	Practices []ClassifiedSession `json:"practices"`
}

// CombinationGroup contains all classified sessions sharing one combination.
type CombinationGroup struct {
	Combination CombinationIdentity `json:"combination"`
	Sessions    []ClassifiedSession `json:"sessions"`
	Races       []RacePracticeGroup `json:"races"`
}

// GroupClassifiedSessions groups sessions deterministically and preserves unusable captures.
func GroupClassifiedSessions(sessions []ClassifiedSession) []CombinationGroup {
	groupsByKey := make(map[string]*CombinationGroup, len(sessions))
	for _, session := range sessions {
		key := combinationKey(session.Combination)
		group, exists := groupsByKey[key]
		if !exists {
			group = &CombinationGroup{
				Combination: session.Combination,
				Sessions:    []ClassifiedSession{},
				Races:       []RacePracticeGroup{},
			}
			groupsByKey[key] = group
		}
		group.Sessions = append(group.Sessions, session)
	}

	groups := make([]CombinationGroup, 0, len(groupsByKey))
	for _, group := range groupsByKey {
		sort.Slice(group.Sessions, func(i, j int) bool {
			return group.Sessions[i].SessionID < group.Sessions[j].SessionID
		})
		practices := sessionsOfType(group.Sessions, SessionTypePractice)
		for _, race := range sessionsOfType(group.Sessions, SessionTypeRace) {
			group.Races = append(group.Races, RacePracticeGroup{
				Race:      race,
				Practices: append([]ClassifiedSession{}, practices...),
			})
		}
		groups = append(groups, *group)
	}
	sort.Slice(groups, func(i, j int) bool {
		return groups[i].Combination.ID < groups[j].Combination.ID
	})
	return groups
}

func sessionsOfType(sessions []ClassifiedSession, sessionType SessionType) []ClassifiedSession {
	result := []ClassifiedSession{}
	for _, session := range sessions {
		if session.Type == sessionType {
			result = append(result, session)
		}
	}
	return result
}
