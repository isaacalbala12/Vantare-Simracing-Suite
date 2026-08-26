package weather

import (
	"testing"
	"time"
)

func TestWeatherScenarioV1_Validate(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	mkNode := func(p WeatherNodeProgress, sky Sky) WeatherNode {
		return WeatherNode{Progress: p, RainChance: 10, Sky: sky, AirTempC: 22, TrackTempC: 30}
	}
	sc := WeatherScenarioV1{
		ContractVersion: ContractVersionWeatherScenarioV1,
		ScenarioID:      "sc-1",
		CombinationID:   "spa-lmgt3",
		GeneratedAt:     now,
		Nodes: [5]WeatherNode{
			mkNode(NodeStart, SkyClear),
			mkNode(Node25, SkyLightClouds),
			mkNode(Node50, SkyClear),
			mkNode(Node75, SkyOvercast),
			mkNode(NodeFinish, SkyClear),
		},
		Provenance: CaptureProvenance{Source: "core.rest /rest/sessions/weather", CapturedAt: now, FreshUntil: now.Add(2 * time.Minute), SessionType: "PRACTICE", SignalFreshness: "fresh"},
	}
	if err := sc.Validate(); err != nil {
		t.Fatalf("validate: %v", err)
	}
	rm := StrategyWeatherReadModelV1{
		ContractVersion: ContractVersionWeatherReadModelV1,
		ModelID:         "rm-1",
		CombinationID:   "spa-lmgt3",
		GeneratedAt:     now,
		Nodes:           sc.Nodes,
		Presence:        "valid",
		Freshness:       Freshness{CapturedAt: now, FreshUntil: now.Add(time.Minute), IsFresh: true},
		Source:          "strategy.weather",
	}
	if err := rm.Validate(); err != nil {
		t.Fatalf("readmodel validate: %v", err)
	}
}

func TestWeatherScenarioV1_InvalidProgress(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	sc := WeatherScenarioV1{
		ContractVersion: ContractVersionWeatherScenarioV1,
		ScenarioID:      "sc-1",
		CombinationID:   "spa",
		GeneratedAt:     now,
		Nodes: [5]WeatherNode{
			{Progress: Node25, RainChance: 0, Sky: SkyClear, AirTempC: 20, TrackTempC: 25},
			{Progress: Node25, RainChance: 0, Sky: SkyClear, AirTempC: 20, TrackTempC: 25},
			{Progress: Node50, RainChance: 0, Sky: SkyClear, AirTempC: 20, TrackTempC: 25},
			{Progress: Node75, RainChance: 0, Sky: SkyClear, AirTempC: 20, TrackTempC: 25},
			{Progress: NodeFinish, RainChance: 0, Sky: SkyClear, AirTempC: 20, TrackTempC: 25},
		},
		Provenance: CaptureProvenance{Source: "core", CapturedAt: now, FreshUntil: now.Add(time.Minute), SessionType: "PRACTICE"},
	}
	if err := sc.Validate(); err == nil {
		t.Fatalf("expected progress order error")
	}
}
