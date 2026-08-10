package catalog

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

func cacheFixture(t *testing.T, sequence uint64) ([]byte, *Verifier) {
	t.Helper()
	privateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{3}, ed25519.SeedSize))
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
	payloadBytes, err := json.Marshal(Payload{PayloadVersion: PayloadVersionV1, Entries: []Entry{{ID: "one", Title: "One", Summary: "Summary", Compatibility: Compatibility{Simulator: "LMU", Circuit: "Spa", Car: "GT3", Event: "Race"}, Package: packageBytes}}})
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(payloadBytes)
	manifestBytes, err := json.Marshal(Manifest{BundleVersion: BundleVersionV1, Sequence: sequence, PublishedAt: "2026-08-10T12:00:00Z", KeyID: "test-key", MinimumTrustVersion: 1, PayloadSHA256: hex.EncodeToString(digest[:]), PayloadLength: uint64(len(payloadBytes))})
	if err != nil {
		t.Fatal(err)
	}
	document, err := json.Marshal(Envelope{BundleVersion: BundleVersionV1, Manifest: manifestBytes, Payload: payloadBytes, Signature: base64.RawURLEncoding.EncodeToString(ed25519.Sign(privateKey, signatureMessage(manifestBytes, payloadBytes)))})
	if err != nil {
		t.Fatal(err)
	}
	verifier, err := NewVerifier(TrustedKeySet{TrustVersion: TrustVersionV1, Version: 1, Keys: []TrustedKey{{ID: "test-key", Algorithm: "Ed25519", PublicKey: privateKey.Public().(ed25519.PublicKey), NotBeforeSequence: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	return document, verifier
}

func TestCacheWriteFailureDoesNotReplaceLastKnownGood(t *testing.T) {
	first, verifier := cacheFixture(t, 1)
	second, _ := cacheFixture(t, 2)
	cache, err := OpenCache(t.TempDir(), verifier)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := cache.Accept(first); err != nil {
		t.Fatal(err)
	}
	realWriter := cache.write
	cache.write = func(path string, data []byte) error {
		if filepath.Base(path) == currentName {
			return errors.New("injected current write failure")
		}
		return realWriter(path, data)
	}
	if _, _, err := cache.Accept(second); err == nil {
		t.Fatal("expected injected failure")
	}
	loaded, _, err := cache.Load()
	if err != nil || loaded.Sequence != 1 {
		t.Fatalf("LKG changed after failed write: %+v %v", loaded, err)
	}
}

func TestCacheReconcilesCurrentWriteErrorAfterReplace(t *testing.T) {
	first, verifier := cacheFixture(t, 1)
	second, _ := cacheFixture(t, 2)
	root := t.TempDir()
	cache, err := OpenCache(root, verifier)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := cache.Accept(first); err != nil {
		t.Fatal(err)
	}
	realWriter := cache.write
	cache.write = func(path string, data []byte) error {
		if err := realWriter(path, data); err != nil {
			return err
		}
		if filepath.Base(path) == currentName {
			return errors.New("injected uncertainty after replace")
		}
		return nil
	}
	accepted, status, err := cache.Accept(second)
	if err != nil || status != CacheAccepted || accepted.Sequence != 2 {
		t.Fatalf("post-replace reconciliation failed: %+v %q %v", accepted, status, err)
	}
	for _, name := range []string{currentName, previousName} {
		document, readErr := readCacheFile(filepath.Join(root, name))
		if readErr != nil {
			t.Fatal(readErr)
		}
		verified, verifyErr := verifier.Verify(document)
		if verifyErr != nil {
			t.Fatalf("%s is not verified: %v", name, verifyErr)
		}
		if name == currentName && verified.Sequence != 2 {
			t.Fatalf("current sequence=%d", verified.Sequence)
		}
		if name == previousName && verified.Sequence != 1 {
			t.Fatalf("previous sequence=%d", verified.Sequence)
		}
	}
}

func TestCacheLoadUsesHighestVerifiedSequenceAcrossBothSlots(t *testing.T) {
	sequence9, verifier := cacheFixture(t, 9)
	sequence10, _ := cacheFixture(t, 10)
	for _, tc := range []struct {
		name              string
		current, previous []byte
		wantStatus        CacheStatus
	}{
		{"current newer", sequence10, sequence9, CacheCurrent},
		{"previous newer", sequence9, sequence10, CacheRecovered},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			cache, err := OpenCache(root, verifier)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, currentName), tc.current, 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, previousName), tc.previous, 0o600); err != nil {
				t.Fatal(err)
			}
			loaded, status, err := cache.Load()
			if err != nil || loaded.Sequence != 10 || status != tc.wantStatus {
				t.Fatalf("Load=%+v %q %v", loaded, status, err)
			}
			currentBytes, readErr := readCacheFile(filepath.Join(root, currentName))
			if readErr != nil {
				t.Fatal(readErr)
			}
			currentVerified, verifyErr := verifier.Verify(currentBytes)
			if verifyErr != nil || currentVerified.Sequence != 10 {
				t.Fatalf("current was not highest verified: %+v %v", currentVerified, verifyErr)
			}
		})
	}
}

func TestCacheLoadRejectsSameSequenceWithDifferentBytes(t *testing.T) {
	document, verifier := cacheFixture(t, 9)
	different := append(append([]byte(nil), document...), byte('\n'))
	root := t.TempDir()
	cache, _ := OpenCache(root, verifier)
	if err := os.WriteFile(filepath.Join(root, currentName), document, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, previousName), different, 0o600); err != nil {
		t.Fatal(err)
	}
	if loaded, _, err := cache.Load(); err == nil || loaded.Sequence != 0 {
		t.Fatalf("same-sequence conflict became success: %+v %v", loaded, err)
	}
}

func TestCacheRecoveryReconcilesErrorAfterCurrentReplace(t *testing.T) {
	sequence9, verifier := cacheFixture(t, 9)
	sequence10, _ := cacheFixture(t, 10)
	root := t.TempDir()
	cache, _ := OpenCache(root, verifier)
	if err := os.WriteFile(filepath.Join(root, currentName), sequence9, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, previousName), sequence10, 0o600); err != nil {
		t.Fatal(err)
	}
	realWriter := cache.write
	cache.write = func(path string, data []byte) error {
		if err := realWriter(path, data); err != nil {
			return err
		}
		if filepath.Base(path) == currentName {
			return errors.New("injected uncertainty after recovery replace")
		}
		return nil
	}
	loaded, status, err := cache.Load()
	if err != nil || status != CacheRecovered || loaded.Sequence != 10 {
		t.Fatalf("recovery reconciliation: %+v %q %v", loaded, status, err)
	}
}

func TestCacheAcceptUsesHighestSlotAsRollbackAuthority(t *testing.T) {
	sequence9, verifier := cacheFixture(t, 9)
	sequence10, _ := cacheFixture(t, 10)
	root := t.TempDir()
	cache, _ := OpenCache(root, verifier)
	if err := os.WriteFile(filepath.Join(root, currentName), sequence9, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, previousName), sequence10, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := cache.Accept(sequence9); !HasErrorCode(err, ErrorRollback) {
		t.Fatalf("expected rollback against highest slot, got %v", err)
	}
}

func TestCacheRejectsOversizedFileWithoutReturningEmptySuccess(t *testing.T) {
	_, verifier := cacheFixture(t, 1)
	root := t.TempDir()
	cache, err := OpenCache(root, verifier)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, currentName)
	handle, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := handle.Truncate(MaxBundleBytes + 1); err != nil {
		t.Fatal(err)
	}
	if err := handle.Close(); err != nil {
		t.Fatal(err)
	}
	loaded, _, err := cache.Load()
	if err == nil || loaded.Sequence != 0 {
		t.Fatalf("oversized cache became success: %+v %v", loaded, err)
	}
}

func TestJSONDepthBoundary(t *testing.T) {
	accepted := []byte(strings.Repeat("[", 64) + "0" + strings.Repeat("]", 64))
	if err := rejectDuplicateJSON(accepted); err != nil {
		t.Fatalf("depth boundary rejected: %v", err)
	}
	rejected := []byte(strings.Repeat("[", 65) + "0" + strings.Repeat("]", 65))
	if err := rejectDuplicateJSON(rejected); err == nil {
		t.Fatal("accepted depth over boundary")
	}
}

func TestAtomicWriteReplacesExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "catalog.json")
	if err := os.WriteFile(path, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeAtomic(path, []byte("new")); err != nil {
		t.Fatal(err)
	}
	document, err := os.ReadFile(path)
	if err != nil || string(document) != "new" {
		t.Fatalf("replacement=%q %v", document, err)
	}
}
