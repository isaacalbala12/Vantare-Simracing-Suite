package lmu

import (
	"strings"
	"testing"
	"time"
)

func TestBuildEvidenceUsesExplicitAllowlist(t *testing.T) {
	tests := []struct {
		name     string
		evidence BuildEvidence
		want     string
		ok       bool
	}{
		{name: "file exact", evidence: BuildEvidence{FileVersion: "1.3.0.0"}, want: supportedLMUVersion, ok: true},
		{name: "product three components normalizes", evidence: BuildEvidence{ProductVersion: "1.3.0"}, want: supportedLMUVersion, ok: true},
		{name: "absent", evidence: BuildEvidence{}},
		{name: "newer not allowlisted", evidence: BuildEvidence{FileVersion: "1.4.0.0"}},
		{name: "malformed", evidence: BuildEvidence{FileVersion: "path/C:/private/1.3.0.0"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := tt.evidence.supportedVersion()
			if got != tt.want || ok != tt.ok {
				t.Fatalf("supportedVersion = %q,%v want %q,%v", got, ok, tt.want, tt.ok)
			}
		})
	}
}

func TestBuildProfilesGateEveryOffsetField(t *testing.T) {
	fixture := knownBuffer(t)
	for _, tt := range []struct {
		name  string
		build BuildEvidence
		known bool
	}{
		{name: "allowlisted file", build: BuildEvidence{FileVersion: "1.3.0.0"}, known: true},
		{name: "allowlisted product", build: BuildEvidence{ProductVersion: "1.3.0"}, known: true},
		{name: "absent", build: BuildEvidence{}},
		{name: "not allowlisted", build: BuildEvidence{FileVersion: "1.4.0.0"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseWithBuild(fixture, time.Now(), tt.build)
			if err != nil {
				t.Fatal(err)
			}
			if (got.Compatibility == CompatibilityKnown) != tt.known {
				t.Fatalf("compatibility=%v", got.Compatibility)
			}
			if tt.known {
				if !strings.Contains(got.Fingerprint, "build=1.3.0.0") {
					t.Fatalf("fingerprint=%q", got.Fingerprint)
				}
			} else {
				assertNoPublishedFields(t, got)
				if strings.Contains(got.Fingerprint, tt.build.FileVersion) && tt.build.FileVersion != "" {
					t.Fatalf("unsupported version leaked: %q", got.Fingerprint)
				}
			}
		})
	}
}
