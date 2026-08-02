//go:build windows

package app

import (
	"regexp"
	"testing"
)

func TestTestingCenterOSVersionUsesTheRealWindowsBuild(t *testing.T) {
	version := testingCenterOSVersion("windows")
	if !regexp.MustCompile(`^Windows [0-9]+\.[0-9]+\.[0-9]+$`).MatchString(version) {
		t.Fatalf("Windows version = %q", version)
	}
	if other := testingCenterOSVersion("linux"); other != "Unknown" {
		t.Fatalf("non-Windows version = %q", other)
	}
}
