package calendar

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadBundledSeed_ValidEmpty(t *testing.T) {
	cal, err := LoadBundledSeed()
	require.NoError(t, err)

	assert.Equal(t, 1, cal.Version, "version should default to 1")
	assert.Equal(t, "Europe/Madrid", cal.Timezone, "timezone should be Europe/Madrid")
	assert.Equal(t, []int{30, 15, 10, 5, 2}, cal.ReminderMinutes, "reminder minutes should match defaults")
	assert.Empty(t, cal.Events, "seed should have no events")
	assert.Empty(t, cal.FollowedEventIDs, "seed should have no followed events")
}

func TestLoadBundledSeed_NormalisesDefaults(t *testing.T) {
	// Test normaliseSeed directly with a zero-value Calendar.
	cal := Calendar{}
	normaliseSeed(&cal)

	assert.Equal(t, 1, cal.Version, "zero version should become 1")
	assert.Equal(t, DefaultTimezone, cal.Timezone, "empty timezone should get default")
	assert.Equal(t, DefaultReminderMinutes, cal.ReminderMinutes, "nil reminder minutes should get default")
	assert.NotNil(t, cal.Events, "nil events should become non-nil empty slice")
	assert.NotNil(t, cal.FollowedEventIDs, "nil followed IDs should become non-nil empty slice")
	assert.Empty(t, cal.Events)
	assert.Empty(t, cal.FollowedEventIDs)
}

func TestValidateSeed_RejectsDuplicateIDs(t *testing.T) {
	events := []RaceEvent{
		{
			ID:        "dup-1",
			Title:     "Race A",
			StartTime: time.Date(2026, 7, 4, 20, 0, 0, 0, time.UTC),
		},
		{
			ID:        "dup-1",
			Title:     "Race B",
			StartTime: time.Date(2026, 7, 5, 20, 0, 0, 0, time.UTC),
		},
	}
	cal := Calendar{Events: events}
	err := validateSeed(cal)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "duplicate event ID: dup-1")
}

func TestValidateSeed_RejectsInvalidEvent(t *testing.T) {
	events := []RaceEvent{
		{
			ID:    "bad-1",
			Title: "", // empty title fails Validate
		},
	}
	cal := Calendar{Events: events}
	err := validateSeed(cal)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "event[0]")
	assert.Contains(t, err.Error(), "title is required")
}

func TestValidateSeed_RejectsEmptyID(t *testing.T) {
	// Events with empty ID must be rejected.
	events := []RaceEvent{
		{
			Title:     "Race A",
			StartTime: time.Date(2026, 7, 4, 20, 0, 0, 0, time.UTC),
		},
	}
	cal := Calendar{Events: events}
	err := validateSeed(cal)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "id is required")
}
