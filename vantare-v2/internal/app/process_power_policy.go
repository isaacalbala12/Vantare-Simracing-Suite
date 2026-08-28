package app

type processPowerPolicy struct {
	ecoQoS      bool
	belowNormal bool
}

func processPowerPolicyForLevel(level int) processPowerPolicy {
	efficient := level >= 4 && level <= 5
	return processPowerPolicy{ecoQoS: efficient, belowNormal: efficient}
}
