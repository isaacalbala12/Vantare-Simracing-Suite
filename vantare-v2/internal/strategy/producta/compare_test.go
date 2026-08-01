package producta

import "testing"

func TestRankSortsByTimeStopsAndMargin(t *testing.T) {
	comparison := Rank([]StrategyCandidate{
		{Name: "more-margin", Valid: true, TotalTimeSeconds: 100, Stops: 2, Margin: 20},
		{Name: "fast", Valid: true, TotalTimeSeconds: 90, Stops: 3, Margin: 5},
		{Name: "tie-fewer-stops", Valid: true, TotalTimeSeconds: 100, Stops: 1, Margin: 1},
		{Name: "tie-more-margin", Valid: true, TotalTimeSeconds: 100, Stops: 1, Margin: 10},
	})

	if len(comparison.Top3) != 3 || comparison.Top3[0].Name != "fast" || comparison.Top3[1].Name != "tie-more-margin" || comparison.Top3[2].Name != "tie-fewer-stops" {
		t.Fatalf("unexpected ranking: %#v", comparison.Top3)
	}
	if len(comparison.All) != 4 || comparison.All[0].Name != "fast" {
		t.Fatalf("all candidates are not sorted: %#v", comparison.All)
	}
}

func TestRankKeepsInvalidVisibleButOutOfRecommendations(t *testing.T) {
	comparison := Rank([]StrategyCandidate{
		{Name: "invalid", Valid: false, TotalTimeSeconds: 1},
		{Name: "valid", Valid: true, TotalTimeSeconds: 100},
	})
	if len(comparison.Top3) != 1 || comparison.Top3[0].Name != "valid" {
		t.Fatalf("invalid candidate entered recommendations: %#v", comparison.Top3)
	}
	if len(comparison.All) != 2 || comparison.All[1].Name != "invalid" {
		t.Fatalf("invalid candidate was not kept visible: %#v", comparison.All)
	}
}

func TestRankMarksOptimisticOnlyWithCriticalRiskAndPenalty(t *testing.T) {
	comparison := Rank([]StrategyCandidate{{Name: "optimistic", Valid: true, OptimisticOnly: true, TotalTimeSeconds: 100}})
	candidate := comparison.All[0]
	if !candidate.CriticalRisk || candidate.RiskCode != "optimistic_only" || candidate.RankingPenaltySeconds <= 0 {
		t.Fatalf("optimistic-only candidate was not hardened: %#v", candidate)
	}
}
