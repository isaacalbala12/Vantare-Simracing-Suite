package contract

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
	"time"
)

func TestPlanRevisionV1Golden(t *testing.T) {
	draft := validDraft(t)
	draft.DraftID = "draft-golden-001"
	draft.PlanID = "plan-golden"
	draft.VariantID = "balanced"
	draft.Name = "Golden balanced plan"
	draft.UpdatedAt = time.Date(2026, 8, 1, 20, 0, 0, 0, time.UTC)
	revision, err := NewPlanRevision(draft, RevisionMetadata{
		RevisionID: "revision-golden-001",
		CreatedAt:  time.Date(2026, 8, 1, 20, 1, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("NewPlanRevision: %v", err)
	}
	encoded, err := json.MarshalIndent(revision, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent: %v", err)
	}
	encoded = append(encoded, '\n')
	want, err := os.ReadFile("testdata/plan_revision_v1.golden.json")
	if err != nil {
		t.Fatalf("read golden: %v\ngenerated:\n%s", err, encoded)
	}
	if !bytes.Equal(encoded, want) {
		t.Fatalf("revision golden drifted\ngenerated:\n%s\ncommitted:\n%s", encoded, want)
	}
}
