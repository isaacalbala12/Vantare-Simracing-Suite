package app

import "testing"

func TestFastestLapUsesAdvancedOverlaySaveGate(t *testing.T) {
	saved := guardDoc()
	draft := guardDoc(guardWidget("fastest", "fastest-lap"))
	ids := guardDeniedIDs(t, checkStudioProfileSave(guardFreePolicy(), saved, draft))
	if len(ids) != 1 || ids[0] != "fastest" {
		t.Fatalf("Free must not add a fastest-lap widget: %v", ids)
	}
	if err := checkStudioProfileSave(guardSuitePolicy(), saved, draft); err != nil {
		t.Fatalf("advanced overlay entitlement must allow saving fastest-lap: %v", err)
	}
}
