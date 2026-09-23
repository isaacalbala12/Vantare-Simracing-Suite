package app

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/service"
)

type engineerReplyEmitter struct {
	t       *testing.T
	replies []map[string]any
}

func (e *engineerReplyEmitter) Emit(name string, data any) {
	if name != "engineer:command:result" {
		return
	}
	raw, err := json.Marshal(data)
	if err != nil {
		e.t.Fatal(err)
	}
	var reply map[string]any
	if err := json.Unmarshal(raw, &reply); err != nil {
		e.t.Fatal(err)
	}
	e.replies = append(e.replies, reply)
}
func TestEngineerCommandConfirmsPersistenceAndRejection(t *testing.T) {
	for _, tc := range []struct {
		name, action, value, want string
		settings                  bool
	}{
		{"saved", "sensitivity", "aggressive", "saved", true},
		{"save failed", "sensitivity", "aggressive", "save_failed", false},
		{"invalid", "sensitivity", "invalid", "rejected", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			emitter := &engineerReplyEmitter{t: t}
			svc := service.NewEngineerService(nil)
			bridge := NewEngineerBridge(nil, emitter, svc)
			path := filepath.Join(t.TempDir(), "settings.json")
			if tc.settings {
				settings := NewSettingsService(path, nil, nil)
				if err := settings.Load(); err != nil {
					t.Fatal(err)
				}
				bridge.SetSettingsService(settings)
			}
			bridge.handleCommand(map[string]any{"requestId": "test-request", "action": tc.action, "value": tc.value})
			if len(emitter.replies) != 1 || emitter.replies[0]["outcome"] != tc.want || emitter.replies[0]["requestId"] != "test-request" {
				t.Fatalf("reply=%+v", emitter.replies)
			}
			if tc.want == "saved" {
				loaded := NewSettingsService(path, nil, nil)
				if err := loaded.Load(); err != nil {
					t.Fatal(err)
				}
				if loaded.EngineerSettings().Sensitivity != "aggressive" {
					t.Fatal("not persisted")
				}
			}
			if tc.want == "rejected" && svc.Status().Sensitivity != "normal" {
				t.Fatal("invalid mutation applied")
			}
		})
	}
}
