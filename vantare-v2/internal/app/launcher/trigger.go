package launcher

import "context"

type LMUTrigger struct {
	enabled   bool
	profileID string
	wasOpen   bool
}

func NewLMUTrigger(enabled bool, profileID string) *LMUTrigger {
	return &LMUTrigger{enabled: enabled, profileID: profileID}
}

func (t *LMUTrigger) Observe(ctx context.Context, inspector ProcessInspector, identity ProcessIdentity) (string, bool, error) {
	if !t.enabled || t.profileID == "" {
		t.wasOpen = false
		return "", false, nil
	}
	_, open := inspector.Find(ctx, identity)
	launch := open && !t.wasOpen
	t.wasOpen = open
	if !launch {
		return "", false, nil
	}
	return t.profileID, true, nil
}
