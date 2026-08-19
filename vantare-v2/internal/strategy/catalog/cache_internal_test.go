package catalog

import (
	"bufio"
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

func cacheFixture(t *testing.T, sequence uint64) ([]byte, *Verifier) {
	return cacheFixtureWithKey(t, sequence, bytes.Repeat([]byte{3}, ed25519.SeedSize), "test-key")
}

func cacheFixtureWithKey(t *testing.T, sequence uint64, seed []byte, keyID string) ([]byte, *Verifier) {
	t.Helper()
	privateKey := ed25519.NewKeyFromSeed(seed)
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
	manifestBytes, err := json.Marshal(Manifest{BundleVersion: BundleVersionV1, Sequence: sequence, PublishedAt: "2026-08-10T12:00:00Z", KeyID: keyID, MinimumTrustVersion: 1, PayloadSHA256: hex.EncodeToString(digest[:]), PayloadLength: uint64(len(payloadBytes))})
	if err != nil {
		t.Fatal(err)
	}
	document, err := json.Marshal(Envelope{BundleVersion: BundleVersionV1, Manifest: manifestBytes, Payload: payloadBytes, Signature: base64.RawURLEncoding.EncodeToString(ed25519.Sign(privateKey, signatureMessage(manifestBytes, payloadBytes)))})
	if err != nil {
		t.Fatal(err)
	}
	verifier, err := NewVerifier(TrustedKeySet{TrustVersion: TrustVersionV1, Version: 1, Keys: []TrustedKey{{ID: keyID, Algorithm: "Ed25519", PublicKey: privateKey.Public().(ed25519.PublicKey), NotBeforeSequence: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	return document, verifier
}

func TestOldVerifierNeverOverwritesUnknownCurrentDuringKeyRotation(t *testing.T) {
	oldSeed := bytes.Repeat([]byte{0x31}, ed25519.SeedSize)
	newSeed := bytes.Repeat([]byte{0x32}, ed25519.SeedSize)
	previousSequence1, oldVerifier := cacheFixtureWithKey(t, 1, oldSeed, "old-key")
	currentSequence2, newOnlyVerifier := cacheFixtureWithKey(t, 2, newSeed, "new-key")
	oldCandidateSequence2, _ := cacheFixtureWithKey(t, 2, oldSeed, "old-key")
	newPrivateKey := ed25519.NewKeyFromSeed(newSeed)
	oldPrivateKey := ed25519.NewKeyFromSeed(oldSeed)
	newVerifier, err := NewVerifier(TrustedKeySet{TrustVersion: TrustVersionV1, Version: 2, Keys: []TrustedKey{
		{ID: "old-key", Algorithm: "Ed25519", PublicKey: oldPrivateKey.Public().(ed25519.PublicKey), NotBeforeSequence: 1},
		{ID: "new-key", Algorithm: "Ed25519", PublicKey: newPrivateKey.Public().(ed25519.PublicKey), NotBeforeSequence: 2},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := newOnlyVerifier.Verify(currentSequence2); err != nil {
		t.Fatalf("new-key fixture is not valid: %v", err)
	}

	root := t.TempDir()
	currentPath := filepath.Join(root, currentName)
	previousPath := filepath.Join(root, previousName)
	if err := os.WriteFile(currentPath, currentSequence2, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(previousPath, previousSequence1, 0o600); err != nil {
		t.Fatal(err)
	}
	oldCache, err := OpenCache(root, oldVerifier)
	if err != nil {
		t.Fatal(err)
	}
	loaded, status, err := oldCache.Load()
	if err != nil || loaded.Sequence != 1 || status != CacheRecovered {
		t.Fatalf("old Load=%+v %q %v, want verified previous without repair", loaded, status, err)
	}
	assertCacheSlotBytes(t, currentPath, currentSequence2)
	assertCacheSlotBytes(t, previousPath, previousSequence1)

	_, _, err = oldCache.Accept(oldCandidateSequence2)
	assertCatalogErrorField(t, err, ErrorUnavailable, "cache.current")
	assertCacheSlotBytes(t, currentPath, currentSequence2)
	assertCacheSlotBytes(t, previousPath, previousSequence1)

	newCache, err := OpenCache(root, newVerifier)
	if err != nil {
		t.Fatal(err)
	}
	modern, modernStatus, err := newCache.Load()
	if err != nil || modern.Sequence != 2 || modernStatus != CacheCurrent {
		t.Fatalf("new verifier lost modern LKG: %+v %q %v", modern, modernStatus, err)
	}
}

func TestOldVerifierNeverOverwritesUnknownPreviousDuringKeyRotation(t *testing.T) {
	oldSeed := bytes.Repeat([]byte{0x41}, ed25519.SeedSize)
	newSeed := bytes.Repeat([]byte{0x42}, ed25519.SeedSize)
	currentSequence1, oldVerifier := cacheFixtureWithKey(t, 1, oldSeed, "old-key")
	previousSequence2, _ := cacheFixtureWithKey(t, 2, newSeed, "new-key")
	oldPrivateKey := ed25519.NewKeyFromSeed(oldSeed)
	newPrivateKey := ed25519.NewKeyFromSeed(newSeed)
	newVerifier, err := NewVerifier(TrustedKeySet{TrustVersion: TrustVersionV1, Version: 2, Keys: []TrustedKey{
		{ID: "old-key", Algorithm: "Ed25519", PublicKey: oldPrivateKey.Public().(ed25519.PublicKey), NotBeforeSequence: 1},
		{ID: "new-key", Algorithm: "Ed25519", PublicKey: newPrivateKey.Public().(ed25519.PublicKey), NotBeforeSequence: 2},
	}})
	if err != nil {
		t.Fatal(err)
	}

	for _, candidateSequence := range []uint64{2, 3} {
		t.Run(fmt.Sprintf("candidate-sequence-%d", candidateSequence), func(t *testing.T) {
			candidate, _ := cacheFixtureWithKey(t, candidateSequence, oldSeed, "old-key")
			root := t.TempDir()
			currentPath := filepath.Join(root, currentName)
			previousPath := filepath.Join(root, previousName)
			if err := os.WriteFile(currentPath, currentSequence1, 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(previousPath, previousSequence2, 0o600); err != nil {
				t.Fatal(err)
			}

			oldCache, err := OpenCache(root, oldVerifier)
			if err != nil {
				t.Fatal(err)
			}
			loaded, status, err := oldCache.Load()
			if err != nil || loaded.Sequence != 1 || status != CacheCurrent {
				t.Fatalf("old Load=%+v %q %v, want verified current without repair", loaded, status, err)
			}
			assertCacheSlotBytes(t, currentPath, currentSequence1)
			assertCacheSlotBytes(t, previousPath, previousSequence2)

			_, _, err = oldCache.Accept(candidate)
			assertCatalogErrorField(t, err, ErrorUnavailable, "cache.previous")
			assertCacheSlotBytes(t, currentPath, currentSequence1)
			assertCacheSlotBytes(t, previousPath, previousSequence2)

			newCache, err := OpenCache(root, newVerifier)
			if err != nil {
				t.Fatal(err)
			}
			modern, modernStatus, err := newCache.Load()
			if err != nil || modern.Sequence != 2 || modernStatus != CacheRecovered {
				t.Fatalf("new verifier lost previous authority: %+v %q %v", modern, modernStatus, err)
			}
			assertCacheSlotBytes(t, currentPath, previousSequence2)
			assertCacheSlotBytes(t, previousPath, previousSequence2)
		})
	}
}

func assertCacheSlotBytes(t *testing.T, path string, want []byte) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("slot %s changed: got %d bytes want %d byte-exact", filepath.Base(path), len(got), len(want))
	}
}

func assertCatalogErrorField(t *testing.T, err error, code ErrorCode, field string) {
	t.Helper()
	var catalogErr *CatalogError
	if !errors.As(err, &catalogErr) || catalogErr.Code != code || catalogErr.Field != field {
		t.Fatalf("error=%v, want code %q field %q", err, code, field)
	}
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

func TestCacheLeaseHelperProcess(t *testing.T) {
	if os.Getenv("STRATEGY_CATALOG_LEASE_HELPER") != "1" {
		return
	}
	root := os.Getenv("STRATEGY_CATALOG_LEASE_ROOT")
	lease, err := acquireCacheLease(filepath.Join(root, leaseFileName))
	if err != nil {
		fmt.Fprintf(os.Stderr, "acquire catalog lease: %v\n", err)
		os.Exit(2)
	}
	fmt.Println("READY")
	_, _ = io.Copy(io.Discard, os.Stdin)
	if err := lease.Close(); err != nil {
		fmt.Fprintf(os.Stderr, "release catalog lease: %v\n", err)
		os.Exit(3)
	}
}

type cacheLeaseHelper struct {
	command *exec.Cmd
	stdin   io.WriteCloser
	stderr  *bytes.Buffer
}

func startCacheLeaseHelper(t *testing.T, root string) cacheLeaseHelper {
	t.Helper()
	command := exec.Command(os.Args[0], "-test.run=^TestCacheLeaseHelperProcess$")
	command.Env = append(os.Environ(),
		"STRATEGY_CATALOG_LEASE_HELPER=1",
		"STRATEGY_CATALOG_LEASE_ROOT="+root,
	)
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	stderr := &bytes.Buffer{}
	command.Stderr = stderr
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	readyResult := make(chan struct {
		line string
		err  error
	}, 1)
	go func() {
		line, readErr := bufio.NewReader(stdout).ReadString('\n')
		readyResult <- struct {
			line string
			err  error
		}{line: line, err: readErr}
	}()
	select {
	case ready := <-readyResult:
		if ready.err != nil || strings.TrimSpace(ready.line) != "READY" {
			_ = command.Process.Kill()
			_ = command.Wait()
			t.Fatalf("helper readiness=%q err=%v stderr=%q", ready.line, ready.err, stderr.String())
		}
	case <-time.After(10 * time.Second):
		_ = command.Process.Kill()
		_ = command.Wait()
		t.Fatalf("helper readiness timed out: %s", stderr.String())
	}
	return cacheLeaseHelper{command: command, stdin: stdin, stderr: stderr}
}

func TestCacheLeaseSerializesProcessesReleasesOnCloseAndDeathAndPreventsDurableDowngrade(t *testing.T) {
	sequence1, verifier := cacheFixture(t, 1)
	sequence2, _ := cacheFixture(t, 2)
	sequence3, _ := cacheFixture(t, 3)
	root := t.TempDir()
	cache, err := OpenCache(root, verifier)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := cache.Accept(sequence1); err != nil {
		t.Fatal(err)
	}

	graceful := startCacheLeaseHelper(t, root)
	if _, _, err := cache.Accept(sequence3); !errors.Is(err, ErrUnavailable) {
		_ = graceful.command.Process.Kill()
		_ = graceful.command.Wait()
		t.Fatalf("Accept while another process holds lease=%v, want unavailable", err)
	}
	if err := graceful.stdin.Close(); err != nil {
		t.Fatal(err)
	}
	if err := graceful.command.Wait(); err != nil {
		t.Fatalf("helper graceful close: %v (%s)", err, graceful.stderr.String())
	}
	if _, _, err := cache.Accept(sequence3); err != nil {
		t.Fatalf("lease not released after Close: %v", err)
	}

	abrupt := startCacheLeaseHelper(t, root)
	if _, _, err := cache.Accept(sequence2); !errors.Is(err, ErrUnavailable) {
		_ = abrupt.command.Process.Kill()
		_ = abrupt.command.Wait()
		t.Fatalf("rollback attempt was not excluded by lease: %v", err)
	}
	if err := abrupt.command.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	if err := abrupt.command.Wait(); err == nil {
		t.Fatal("abrupt helper death unexpectedly reported success")
	}
	if _, _, err := cache.Accept(sequence2); !HasErrorCode(err, ErrorRollback) {
		t.Fatalf("sequence 2 after sequence 3=%v, want rollback", err)
	}
	reopened, err := OpenCache(root, verifier)
	if err != nil {
		t.Fatal(err)
	}
	loaded, _, err := reopened.Load()
	if err != nil || loaded.Sequence != 3 {
		t.Fatalf("durable catalog after contention=%+v err=%v, want sequence 3", loaded, err)
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
	if err := handle.Truncate(int64(MaxSerializedBundleBytes) + 1); err != nil {
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
