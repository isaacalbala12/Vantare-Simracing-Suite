package calendar

import (
	"errors"
	"strings"
	"testing"
	"time"
)

// mustLoad is a small helper for tests so we keep the assertions terse.
func mustLoad(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("loading location %q: %v", name, err)
	}
	return loc
}

func TestParse_AcceptsValidLines(t *testing.T) {
	loc := mustLoad(t, "UTC")
	reference := time.Date(2026, time.July, 1, 0, 0, 0, 0, loc)

	text := strings.Join([]string{
		"# cabecera ignorada",
		"",
		"Martes 2 Julio | 20:00 | Practice | Le Mans | 60",
		"2 Julio | 21:00 | Qualy | Le Mans | 30",
		"Miercoles 3 Julio | 20:00 | Race | Le Mans | 45",
	}, "\n")

	events, err := Parse(text, "UTC")
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}

	if events[0].Title != "Practice" {
		t.Errorf("event[0].Title = %q, want Practice", events[0].Title)
	}
	if events[0].Track != "Le Mans" {
		t.Errorf("event[0].Track = %q, want Le Mans", events[0].Track)
	}
	if events[0].DurationMin != 60 {
		t.Errorf("event[0].DurationMin = %d, want 60", events[0].DurationMin)
	}
	if !events[0].StartTime.Equal(time.Date(2026, time.July, 2, 20, 0, 0, 0, loc)) {
		t.Errorf("event[0].StartTime = %v, want 2026-07-02 20:00 UTC", events[0].StartTime)
	}

	if events[1].Series != "" {
		t.Errorf("event[1].Series should default to empty, got %q", events[1].Series)
	}
	if events[1].DurationMin != 30 {
		t.Errorf("event[1].DurationMin = %d, want 30", events[1].DurationMin)
	}

	if events[2].SessionLabel != "" {
		t.Errorf("event[2].SessionLabel should be empty, got %q", events[2].SessionLabel)
	}

	for i, ev := range events {
		if ev.ID == "" {
			t.Errorf("event[%d].ID is empty", i)
		}
		if ev.Sim != "lmu" {
			t.Errorf("event[%d].Sim = %q, want lmu", i, ev.Sim)
		}
	}
	if reference.IsZero() {
		t.Fatal("reference should be set for documentation purposes")
	}
}

func TestParse_EmptyTextReturnsNoEvents(t *testing.T) {
	events, err := Parse("", "UTC")
	if err != nil {
		t.Fatalf("Parse(empty) error: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected 0 events, got %d", len(events))
	}
}

func TestParse_OnlyWhitespaceAndComments(t *testing.T) {
	text := "\n  \n# comment\n\t\n"
	events, err := Parse(text, "UTC")
	if err != nil {
		t.Fatalf("Parse(only blanks) error: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected 0 events, got %d", len(events))
	}
}

func TestParse_InvalidLineReturnsErrInvalidLine(t *testing.T) {
	cases := []struct {
		name string
		text string
		want string
	}{
		{
			name: "missing pipes",
			text: "Martes 2 Julio 20:00 Practice Le Mans",
			want: "expected at least 3 fields",
		},
		{
			name: "empty title",
			text: "2 Julio | 20:00 |   | Le Mans | 60",
			want: "title is empty",
		},
		{
			name: "unknown month",
			text: "2 Smarch | 20:00 | Race | Le Mans | 60",
			want: "unknown month",
		},
		{
			name: "invalid time",
			text: "2 Julio | 25:00 | Race | Le Mans | 60",
			want: "time hour",
		},
		{
			name: "invalid duration",
			text: "2 Julio | 20:00 | Race | Le Mans | many",
			want: "durationMin must be a non-negative integer",
		},
		{
			name: "too many fields",
			text: "2 Julio | 20:00 | Race | Le Mans | 45 | LMC | Practice | https://x | extra",
			want: "too many fields",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse(tc.text, "UTC")
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.want)
			}
			if !IsErrInvalidLine(err) {
				t.Fatalf("expected *ErrInvalidLine, got %T (%v)", err, err)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error %q does not contain %q", err.Error(), tc.want)
			}
		})
	}
}

func TestParse_InvalidTimezoneFails(t *testing.T) {
	_, err := Parse("2 Julio | 20:00 | Race | Le Mans | 60", "Not/AZone")
	if err == nil {
		t.Fatal("expected error for invalid timezone, got nil")
	}
	if IsErrInvalidLine(err) {
		t.Fatalf("invalid timezone should NOT be wrapped as ErrInvalidLine, got %v", err)
	}
}

func TestParse_LineNumbersPointAtOffender(t *testing.T) {
	text := strings.Join([]string{
		"2 Julio | 20:00 | Practice | Le Mans | 60",
		"esta linea no es valida",
	}, "\n")
	_, err := Parse(text, "UTC")
	var lerr *ErrInvalidLine
	if !errors.As(err, &lerr) {
		t.Fatalf("expected *ErrInvalidLine, got %T (%v)", err, err)
	}
	if lerr.Line != 2 {
		t.Errorf("line = %d, want 2", lerr.Line)
	}
}

func TestParse_PreservesTimezone(t *testing.T) {
	loc, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		t.Skipf("Europe/Madrid not available in test env: %v", err)
	}
	events, err := Parse("2 Julio | 20:00 | Race | Le Mans | 45", "Europe/Madrid")
	if err != nil {
		t.Fatalf("Parse error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	got := events[0].StartTime
	if got.Location().String() != loc.String() {
		t.Errorf("event location = %q, want %q", got.Location(), loc)
	}
	if got.Hour() != 20 || got.Minute() != 0 {
		t.Errorf("event hour/min = %d:%d, want 20:00", got.Hour(), got.Minute())
	}
}

func TestParse_DefaultsTimezoneWhenEmpty(t *testing.T) {
	events, err := Parse("2 Julio | 20:00 | Race | Le Mans | 45", "")
	if err != nil {
		t.Fatalf("Parse error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	// The location is whatever the OS resolves "Europe/Madrid" to. The point
	// is the call did not fail and produced a valid time.Time.
	if events[0].StartTime.IsZero() {
		t.Fatal("event startTime is zero")
	}
}

func TestIsWeekdayToken(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"Martes", true},
		{"  miercoles  ", true},
		{"Miércoles", true},
		{"foo", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := IsWeekdayToken(tc.in); got != tc.want {
			t.Errorf("IsWeekdayToken(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}
