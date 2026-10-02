package service

import (
	"fmt"
	"testing"
)

func TestDeliveryJournalBoundsHistoryAndOwnsSnapshots(t *testing.T) {
	var journal deliveryJournal
	for i := 0; i < 205; i++ {
		journal.add(DeliveryDiagnostic{ID: fmt.Sprint(i), Audio: "completed"})
	}
	snapshot := journal.snapshot()
	if len(snapshot) != 200 || snapshot[0].ID != "5" || snapshot[199].ID != "204" {
		t.Fatalf("retained history: count=%d first=%s last=%s", len(snapshot), snapshot[0].ID, snapshot[len(snapshot)-1].ID)
	}
	snapshot[0].Audio = "changed"
	if journal.snapshot()[0].Audio != "completed" {
		t.Fatal("consumer mutated retained history")
	}
}
