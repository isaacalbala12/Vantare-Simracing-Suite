package engineer

import (
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/projection"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
)

func TestFactCursorGapRequiresExplicitResync(t *testing.T) {
	cursor := NewFactCursor(4)
	if err := cursor.Append(cursorFact(2, 1)); err != nil {
		t.Fatal(err)
	}
	err := cursor.Append(cursorFact(2, 3))
	var boundary *FactResyncRequiredError
	if !errors.As(err, &boundary) || boundary.Previous != 1 || boundary.Next != 3 {
		t.Fatalf("gap error = %#v, want previous=1 next=3", err)
	}
}

func TestFactCursorResyncUsesBoundedRetention(t *testing.T) {
	cursor := NewFactCursor(2)
	for sequence := core.FactSequence(1); sequence <= 3; sequence++ {
		if err := cursor.Append(cursorFact(1, sequence)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := cursor.ResyncFacts(0); !errors.Is(err, ErrFactResyncRequired) {
		t.Fatalf("ResyncFacts(0) error = %v, want ErrFactResyncRequired", err)
	}
	facts, err := cursor.ResyncFacts(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(facts) != 2 || facts[0].Fact.Sequence != 2 || facts[1].Fact.Sequence != 3 {
		t.Fatalf("retained facts = %#v", facts)
	}
}

func cursorFact(epoch schema.Epoch, sequence core.FactSequence) FactEnvelopeV1 {
	return FactEnvelopeV1{
		Metadata: projection.Metadata{Epoch: epoch},
		Fact:     FactV1{Sequence: sequence},
	}
}
