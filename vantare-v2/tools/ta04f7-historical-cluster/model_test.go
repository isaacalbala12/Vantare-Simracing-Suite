package main

import (
	"encoding/json"
	"testing"
)

func TestManifestRejectsConservationMutationsAndUnknownKey(t *testing.T) {
	b, err := syntheticManifest()
	if err != nil {
		t.Fatal(err)
	}
	m, err := strictDecode(b)
	if err != nil {
		t.Fatal(err)
	}
	mutations := []func(*Manifest){
		func(x *Manifest) { x.Population.InsufficientLapsRecordings++ },
		func(x *Manifest) { x.Population.EligibleRecordings++ },
		func(x *Manifest) { x.Groups[0].DiscoveredRecordings++ },
		func(x *Manifest) { x.Groups[0].ContributingRecordings++ },
		func(x *Manifest) { x.Groups[0].PassingRecordings++ },
		func(x *Manifest) { x.Groups[0].EvaluatedSlots++ },
		func(x *Manifest) { x.Groups[0].Decision = "stop_insufficient" },
		func(x *Manifest) { x.Groups[0].CrossRecordingConfidence = "none" },
		func(x *Manifest) { x.Outcome = "stop_insufficient" },
	}
	for i, mutate := range mutations {
		x := m
		x.Groups = append([]Group(nil), m.Groups...)
		mutate(&x)
		if x.Validate() == nil {
			t.Fatalf("mutation %d accepted", i)
		}
	}
	var raw map[string]any
	if err = json.Unmarshal(b, &raw); err != nil {
		t.Fatal(err)
	}
	raw["candidate_id"] = "sensitive"
	bad, _ := json.Marshal(raw)
	if _, err = strictDecode(bad); err == nil {
		t.Fatal("unknown key accepted")
	}
}

func TestInternalClassificationVocabulary(t *testing.T) {
	for _, v := range []string{"duplicate", "authorization", "stability", "artifact_guard", "data_invalid", "insufficient_laps", "accepted"} {
		if !validClass(v) {
			t.Fatal(v)
		}
	}
	if validClass("low_event") || validClass("other") {
		t.Fatal("non-terminal class accepted")
	}
}
