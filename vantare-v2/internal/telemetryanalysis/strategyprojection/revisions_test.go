package strategyprojection

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestProjectionRequiresCompleteRevisionReferences(t *testing.T) {
	data, err := os.ReadFile("testdata/strategyinputprojection_v2_new.json")
	if err != nil {
		t.Fatal(err)
	}
	var original StrategyInputProjectionV2
	if err := json.Unmarshal(data, &original); err != nil {
		t.Fatal(err)
	}
	ref := AnalysisRevisionRef{SessionID: "session", BaseDigest: strings.Repeat("a", 64), RevisionID: strings.Repeat("b", 64), SnapshotID: strings.Repeat("c", 64)}
	cases := []struct {
		name     string
		sessions []string
		refs     []AnalysisRevisionRef
		valid    bool
	}{
		{"legacy", nil, nil, true},
		{"complete", []string{"session"}, []AnalysisRevisionRef{ref}, true},
		{"explicit empty", []string{"session"}, []AnalysisRevisionRef{}, false},
		{"partial", []string{"session", "other"}, []AnalysisRevisionRef{ref}, false},
		{"foreign", []string{"other"}, []AnalysisRevisionRef{ref}, false},
		{"duplicate", []string{"session", "session"}, []AnalysisRevisionRef{ref, ref}, false},
		{"duplicate reference", []string{"session", "other"}, []AnalysisRevisionRef{ref, ref}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := original
			p.SourceSessions = tc.sessions
			p.SourceRevisions = tc.refs
			if err := p.Validate(); (err == nil) != tc.valid {
				t.Fatalf("valid=%v: %v", tc.valid, err)
			}
		})
	}
	for _, field := range []string{"base", "revision", "snapshot"} {
		t.Run(field, func(t *testing.T) {
			for _, bad := range []string{"", strings.Repeat("A", 64), strings.Repeat("g", 64), strings.Repeat("a", 63)} {
				r := ref
				switch field {
				case "base":
					r.BaseDigest = bad
				case "revision":
					r.RevisionID = bad
				case "snapshot":
					r.SnapshotID = bad
				}
				p := original
				p.SourceSessions = []string{"session"}
				p.SourceRevisions = []AnalysisRevisionRef{r}
				if err := p.Validate(); err == nil {
					t.Fatal("accepted invalid digest", field, bad)
				}
			}
		})
	}
	encoded, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "sourceRevisions") {
		t.Fatal("changed legacy payload")
	}
	original.SourceSessions = []string{"session"}
	original.SourceRevisions = []AnalysisRevisionRef{ref}
	encoded, err = json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	var restored StrategyInputProjectionV2
	if err := json.Unmarshal(encoded, &restored); err != nil {
		t.Fatal(err)
	}
	if err := restored.Validate(); err != nil {
		t.Fatal(err)
	}
	if len(restored.SourceRevisions) != 1 || restored.SourceRevisions[0] != ref {
		t.Fatal("lost exact revision")
	}
}
