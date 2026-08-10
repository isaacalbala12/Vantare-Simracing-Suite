package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

func TestCLIReadsPrivateKeyWithoutPrintingOrPersistingIt(t *testing.T) {
	root := t.TempDir()
	packagePath := filepath.Join(root, "plan.json")
	manifestPath := filepath.Join(root, "manifest.json")
	outputPath := filepath.Join(root, "catalog.json")
	trustedKeysPath := filepath.Join(root, "trusted-keys.json")
	when := time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC)
	draft := contract.PlanDraft[json.RawMessage]{ContractVersion: contract.CurrentVersion, DraftID: "draft-1", PlanID: "plan-1", VariantID: "variant-1", Name: "Official", Mode: contract.PlanModeManual, Capabilities: []contract.Capability{contract.CapabilityManualInputs}, Provenance: contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "test"}, Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: "test"}, UpdatedAt: when, Payload: json.RawMessage(`{"laps":10}`)}
	revision, err := contract.NewPlanRevision(draft, contract.RevisionMetadata{RevisionID: "revision-1", CreatedAt: when})
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := packaging.Build(packaging.Provenance{Application: "vantare", ApplicationVersion: "test", ExportedAt: when}, []packaging.Bundle[json.RawMessage]{{PlanID: draft.PlanID, VariantID: draft.VariantID, Revisions: []contract.PlanRevision[json.RawMessage]{revision}}})
	if err != nil {
		t.Fatal(err)
	}
	packageBytes, err := packaging.Encode(pkg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(packagePath, packageBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	manifest := `{"bundleVersion":"strategy.official-catalog.bundle.v1","sequence":1,"publishedAt":"2026-08-10T12:00:00Z","keyId":"test-key","minimumTrustVersion":1,"payloadVersion":"strategy.official-catalog.payload.v1","entries":[{"id":"one","title":"One","summary":"Summary","compatibility":{"simulator":"LMU","circuit":"Spa","car":"GT3","event":"Race"},"packagePath":"plan.json"}]}`
	if err := os.WriteFile(manifestPath, []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}
	secret := base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{9}, ed25519.SeedSize))
	privateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{9}, ed25519.SeedSize))
	trusted := fmt.Sprintf(`{"trustVersion":"strategy.official-catalog.trust.v1","version":1,"keys":[{"id":"test-key","algorithm":"Ed25519","publicKey":"%s","notBeforeSequence":1}]}`, base64.RawURLEncoding.EncodeToString(privateKey.Public().(ed25519.PublicKey)))
	if err := os.WriteFile(trustedKeysPath, []byte(trusted), 0o600); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	err = run([]string{"-manifest", manifestPath, "-trusted-keys", trustedKeysPath, "-output", outputPath, "-private-key-env", "TEST_SIGNING_KEY"}, func(name string) string {
		if name == "TEST_SIGNING_KEY" {
			return secret
		}
		return ""
	}, &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	output, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(output, []byte(secret)) || strings.Contains(stdout.String()+stderr.String(), secret) {
		t.Fatal("private key was printed or persisted")
	}
	if err := run([]string{"-manifest", manifestPath, "-trusted-keys", trustedKeysPath, "-output", outputPath, "-private-key-env", "TEST_SIGNING_KEY"}, func(name string) string {
		if name == "TEST_SIGNING_KEY" {
			return secret
		}
		return ""
	}, &stdout, &stderr); err != nil {
		t.Fatalf("replace existing output: %v", err)
	}
	replaced, err := os.ReadFile(outputPath)
	if err != nil || !bytes.Equal(output, replaced) {
		t.Fatalf("repeated CLI output changed: %v", err)
	}
}

func TestCLIRejectsDuplicateManifestFields(t *testing.T) {
	root := t.TempDir()
	manifestPath := filepath.Join(root, "manifest.json")
	outputPath := filepath.Join(root, "catalog.json")
	document := `{"bundleVersion":"strategy.official-catalog.bundle.v1","bundleVersion":"strategy.official-catalog.bundle.v1","sequence":1,"publishedAt":"2026-08-10T12:00:00Z","keyId":"test","minimumTrustVersion":1,"payloadVersion":"strategy.official-catalog.payload.v1","entries":[]}`
	if err := os.WriteFile(manifestPath, []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"-manifest", manifestPath, "-trusted-keys", filepath.Join(root, "keys.json"), "-output", outputPath, "-private-key-env", "KEY"}, func(string) string { return "" }, &bytes.Buffer{}, &bytes.Buffer{}); err == nil {
		t.Fatal("accepted duplicate manifest field")
	}
}

func TestCLIRejectsPackageSymlinkEscapingManifestDirectory(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.json")
	if err := os.WriteFile(outside, []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "linked.json")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	manifestPath := filepath.Join(root, "manifest.json")
	trustedKeysPath := writeTestTrustedKeys(t, root, "test", bytes.Repeat([]byte{4}, ed25519.SeedSize))
	document := `{"bundleVersion":"strategy.official-catalog.bundle.v1","sequence":1,"publishedAt":"2026-08-10T12:00:00Z","keyId":"test","minimumTrustVersion":1,"payloadVersion":"strategy.official-catalog.payload.v1","entries":[{"id":"one","title":"One","summary":"Summary","compatibility":{"simulator":"LMU","circuit":"Spa","car":"GT3","event":"Race"},"packagePath":"linked.json"}]}`
	if err := os.WriteFile(manifestPath, []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"-manifest", manifestPath, "-trusted-keys", trustedKeysPath, "-output", filepath.Join(root, "out.json"), "-private-key-env", "KEY"}, func(string) string { return "" }, &bytes.Buffer{}, &bytes.Buffer{}); err == nil {
		t.Fatal("accepted package symlink outside manifest directory")
	}
}

func TestCLIRejectsTrustedKeySymlinkEscapingManifestDirectory(t *testing.T) {
	root := t.TempDir()
	outsideRoot := t.TempDir()
	outside := writeTestTrustedKeys(t, outsideRoot, "test", bytes.Repeat([]byte{4}, ed25519.SeedSize))
	link := filepath.Join(root, "keys.json")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	manifestPath := filepath.Join(root, "manifest.json")
	document := `{"bundleVersion":"strategy.official-catalog.bundle.v1","sequence":1,"publishedAt":"2026-08-10T12:00:00Z","keyId":"test","minimumTrustVersion":1,"payloadVersion":"strategy.official-catalog.payload.v1","entries":[]}`
	if err := os.WriteFile(manifestPath, []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"-manifest", manifestPath, "-trusted-keys", link, "-output", filepath.Join(root, "out.json"), "-private-key-env", "KEY"}, func(string) string { return "" }, &bytes.Buffer{}, &bytes.Buffer{}); err == nil {
		t.Fatal("accepted trusted-key symlink outside manifest directory")
	}
}

func TestCLIRejectsAggregatePackageBudgetBeforeSigning(t *testing.T) {
	root := t.TempDir()
	entries := make([]sourceEntry, 0, 5)
	for index := 0; index < 5; index++ {
		name := fmt.Sprintf("package-%d.json", index)
		path := filepath.Join(root, name)
		handle, err := os.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		if err := handle.Truncate(packaging.MaxPackageBytes); err != nil {
			t.Fatal(err)
		}
		if err := handle.Close(); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, sourceEntry{ID: fmt.Sprintf("entry-%d", index), Title: "Title", Summary: "Summary", Compatibility: catalog.Compatibility{Simulator: "LMU", Circuit: "Spa", Car: "GT3", Event: "Race"}, PackagePath: name})
	}
	source := manifestSource{BundleVersion: catalog.BundleVersionV1, Sequence: 1, PublishedAt: "2026-08-10T12:00:00Z", KeyID: "test", MinimumTrustVersion: 1, PayloadVersion: catalog.PayloadVersionV1, Entries: entries}
	manifestBytes, err := json.Marshal(source)
	if err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(root, "manifest.json")
	if err := os.WriteFile(manifestPath, manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	trusted := writeTestTrustedKeys(t, root, "test", bytes.Repeat([]byte{4}, ed25519.SeedSize))
	err = run([]string{"-manifest", manifestPath, "-trusted-keys", trusted, "-output", filepath.Join(root, "out.json"), "-private-key-env", "KEY"}, func(string) string { return "" }, &bytes.Buffer{}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "package byte budget") {
		t.Fatalf("expected early aggregate budget rejection, got %v", err)
	}
}

func writeTestTrustedKeys(t *testing.T, root, keyID string, seed []byte) string {
	t.Helper()
	key := ed25519.NewKeyFromSeed(seed)
	document := fmt.Sprintf(`{"trustVersion":"strategy.official-catalog.trust.v1","version":1,"keys":[{"id":"%s","algorithm":"Ed25519","publicKey":"%s","notBeforeSequence":1}]}`, keyID, base64.RawURLEncoding.EncodeToString(key.Public().(ed25519.PublicKey)))
	path := filepath.Join(root, "trusted-keys.json")
	if err := os.WriteFile(path, []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
