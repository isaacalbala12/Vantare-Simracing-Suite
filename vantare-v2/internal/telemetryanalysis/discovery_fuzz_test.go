package telemetryanalysis

import (
	"strings"
	"testing"
)

func FuzzRedactLocator(f *testing.F) {
	for _, seed := range []string{
		`C:\Users\private\UserData\Telemetry\session.duckdb`,
		"/home/private/session.csv",
		".private-name",
		"",
	} {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, sourcePath string) {
		locator := redactLocator(SourceLMU, sourcePath)
		const prefix = "lmu://"
		if !strings.HasPrefix(locator, prefix) {
			t.Fatalf("locator %q has no LMU prefix", locator)
		}
		if !redactedLocatorID.MatchString(strings.TrimPrefix(locator, prefix)) {
			t.Fatalf("locator %q does not contain one bounded redacted ID", locator)
		}
		if strings.ContainsAny(strings.TrimPrefix(locator, prefix), `/\`) {
			t.Fatalf("locator %q leaks a path separator", locator)
		}
	})
}
