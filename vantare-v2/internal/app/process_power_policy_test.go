package app

import "testing"

func TestEcoQoSIsNotSelectedForLevelsOneToThree(t *testing.T) {
	for level := 1; level <= 3; level++ {
		policy := processPowerPolicyForLevel(level)
		if policy.ecoQoS || policy.belowNormal {
			t.Fatalf("level %d selected efficient process policy: %+v", level, policy)
		}
	}
}

func TestEcoQoSIsSelectedForLevelsFourAndFive(t *testing.T) {
	for level := 4; level <= 5; level++ {
		policy := processPowerPolicyForLevel(level)
		if !policy.ecoQoS || !policy.belowNormal {
			t.Fatalf("level %d policy = %+v, want EcoQoS and below-normal", level, policy)
		}
	}
}
