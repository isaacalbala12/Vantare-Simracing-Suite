package document

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/solver"
)

func TestEventRulesRequireVersionAndSurviveSerialization(t *testing.T) {
	doc := validDocumentV2(t)
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	events := raw["events"].([]any)
	event := events[0].(map[string]any)
	event["rules"] = map[string]any{"value": map[string]any{"minPitStops": float64(2)}, "evidence": event["tankLiters"].(map[string]any)["evidence"]}
	for _, version := range []string{"2.0.0", "2.1.0"} {
		t.Run(version, func(t *testing.T) {
			raw["schemaVersion"] = version
			encoded, err := json.Marshal(raw)
			if err != nil {
				t.Fatal(err)
			}
			var got StrategyDocumentV2
			if err := json.Unmarshal(encoded, &got); err != nil {
				t.Fatal(err)
			}
			err = got.Validate()
			if version == "2.0.0" {
				if err == nil {
					t.Fatal("old schema silently accepted new rules")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			roundtrip, err := json.Marshal(got)
			if err != nil {
				t.Fatal(err)
			}
			var restored map[string]any
			if err := json.Unmarshal(roundtrip, &restored); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(restored["events"].([]any)[0].(map[string]any)["rules"], event["rules"]) {
				t.Fatal("rules lost in serialization")
			}
		})
	}
}

func TestEventRulesValidateEvidenceAndValue(t *testing.T) {
	doc := validDocumentV2(t)
	doc.SchemaVersion = SchemaVersionV2Rules
	minimum := -1
	doc.Events[0].Rules = &Sourced[solver.EventRules]{Value: solver.EventRules{MinPitStops: &minimum}, Evidence: doc.Events[0].TankLiters.Evidence}
	if err := doc.Validate(); err == nil {
		t.Fatal("invalid rules accepted")
	}
	minimum = 1
	doc.Events[0].Rules.Evidence = Evidence{}
	if err := doc.Validate(); err == nil {
		t.Fatal("rules without evidence accepted")
	}
}
