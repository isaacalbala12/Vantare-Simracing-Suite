package producta

import (
	"math"
	"sort"
)

// Comparison contains all visible candidates and the recommended valid top
// three subset.
type Comparison struct {
	Top3 []StrategyCandidate `json:"top3"`
	All  []StrategyCandidate `json:"all"`
}

// Rank applies the product ordering: effective time, stops, then remaining
// margin. Invalid candidates remain visible but cannot be recommended.
func Rank(candidates []StrategyCandidate) Comparison {
	all := append([]StrategyCandidate(nil), candidates...)
	for index := range all {
		if all[index].OptimisticOnly {
			all[index].CriticalRisk = true
			all[index].RiskCode = "optimistic_only"
			all[index].RankingPenaltySeconds = math.Max(1, math.Abs(all[index].TotalTimeSeconds)*0.05)
		}
	}
	sort.SliceStable(all, func(left, right int) bool {
		if all[left].Valid != all[right].Valid {
			return all[left].Valid
		}
		leftTime := all[left].TotalTimeSeconds + all[left].RankingPenaltySeconds
		rightTime := all[right].TotalTimeSeconds + all[right].RankingPenaltySeconds
		if leftTime != rightTime {
			return leftTime < rightTime
		}
		if all[left].Stops != all[right].Stops {
			return all[left].Stops < all[right].Stops
		}
		return all[left].Margin > all[right].Margin
	})

	top3 := make([]StrategyCandidate, 0, 3)
	for _, candidate := range all {
		if !candidate.Valid {
			continue
		}
		top3 = append(top3, candidate)
		if len(top3) == 3 {
			break
		}
	}
	return Comparison{Top3: top3, All: all}
}
