package catalog_test

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
	"github.com/vantare/overlays/v2/internal/strategy/catalog/signing"
	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

var testSeed = bytes.Repeat([]byte{0x42}, ed25519.SeedSize)

func testKeys(t *testing.T, before, after uint64) (ed25519.PrivateKey, *catalog.Verifier) {
	t.Helper()
	privateKey := ed25519.NewKeyFromSeed(testSeed)
	keys := catalog.TrustedKeySet{Version: 1, TrustVersion: catalog.TrustVersionV1, Keys: []catalog.TrustedKey{{
		ID: "test-key", Algorithm: "Ed25519", PublicKey: privateKey.Public().(ed25519.PublicKey),
		NotBeforeSequence: before, NotAfterSequence: after,
	}}}
	verifier, err := catalog.NewVerifier(keys)
	if err != nil {
		t.Fatal(err)
	}
	return privateKey, verifier
}

func signingKeys(privateKey ed25519.PrivateKey, id string, version, before, after uint64) catalog.TrustedKeySet {
	return catalog.TrustedKeySet{Version: version, TrustVersion: catalog.TrustVersionV1, Keys: []catalog.TrustedKey{{ID: id, Algorithm: "Ed25519", PublicKey: privateKey.Public().(ed25519.PublicKey), NotBeforeSequence: before, NotAfterSequence: after}}}
}

func officialPackage(t *testing.T, application string, withDraft bool, bundles int) []byte {
	t.Helper()
	when := time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC)
	draft := contract.PlanDraft[json.RawMessage]{
		ContractVersion: contract.CurrentVersion, DraftID: "draft-1", PlanID: "plan-1", VariantID: "variant-1",
		Name: "Official", Mode: contract.PlanModeManual, Capabilities: []contract.Capability{contract.CapabilityManualInputs},
		Provenance: contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "catalog-test"},
		Confidence: contract.Confidence{Level: contract.ConfidenceHigh, Basis: "fixture"}, UpdatedAt: when,
		Payload: json.RawMessage(`{"laps":10}`),
	}
	revision, err := contract.NewPlanRevision(draft, contract.RevisionMetadata{RevisionID: "revision-1", CreatedAt: when})
	if err != nil {
		t.Fatal(err)
	}
	bundle := packaging.Bundle[json.RawMessage]{PlanID: draft.PlanID, VariantID: draft.VariantID, Revisions: []contract.PlanRevision[json.RawMessage]{revision}}
	if withDraft {
		bundle.Draft = &draft
	}
	all := []packaging.Bundle[json.RawMessage]{bundle}
	if bundles == 2 {
		second := draft
		second.DraftID = "draft-2"
		second.PlanID = "plan-2"
		rev, makeErr := contract.NewPlanRevision(second, contract.RevisionMetadata{RevisionID: "revision-2", CreatedAt: when})
		if makeErr != nil {
			t.Fatal(makeErr)
		}
		all = append(all, packaging.Bundle[json.RawMessage]{PlanID: second.PlanID, VariantID: second.VariantID, Revisions: []contract.PlanRevision[json.RawMessage]{rev}})
	}
	pkg, err := packaging.Build(packaging.Provenance{Application: application, ApplicationVersion: "test", ExportedAt: when}, all)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := packaging.Encode(pkg)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func validPayload(t *testing.T) catalog.Payload {
	t.Helper()
	return catalog.Payload{PayloadVersion: catalog.PayloadVersionV1, Entries: []catalog.Entry{{
		ID: "spa-race", Title: "Spa race", Summary: "Conservative official plan",
		Compatibility: catalog.Compatibility{Simulator: "LMU", Circuit: "Spa", Car: "GT3", Event: "Race"},
		Package:       officialPackage(t, "  VANTARE ", false, 1),
	}}}
}

func validManifest(sequence uint64) catalog.Manifest {
	return catalog.Manifest{BundleVersion: catalog.BundleVersionV1, Sequence: sequence, PublishedAt: "2026-08-10T12:00:00Z", KeyID: "test-key", MinimumTrustVersion: 1}
}

func signed(t *testing.T, sequence uint64) ([]byte, *catalog.Verifier) {
	t.Helper()
	privateKey, verifier := testKeys(t, 1, 0)
	document, err := signing.Build(validManifest(sequence), validPayload(t), privateKey, signingKeys(privateKey, "test-key", 1, 1, 0))
	if err != nil {
		t.Fatal(err)
	}
	return document, verifier
}

func signRaw(t *testing.T, privateKey ed25519.PrivateKey, manifest catalog.Manifest, payload any) []byte {
	t.Helper()
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(payloadBytes)
	manifest.BundleVersion = catalog.BundleVersionV1
	manifest.PayloadSHA256 = hex.EncodeToString(digest[:])
	manifest.PayloadLength = uint64(len(payloadBytes))
	return signExact(t, privateKey, manifest, payloadBytes)
}

func signExact(t *testing.T, privateKey ed25519.PrivateKey, manifest catalog.Manifest, payloadBytes []byte) []byte {
	t.Helper()
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	message := append([]byte(catalog.SignatureDomain), make([]byte, 8)...)
	binary.BigEndian.PutUint64(message[len(catalog.SignatureDomain):], uint64(len(manifestBytes)))
	message = append(message, manifestBytes...)
	message = append(message, payloadBytes...)
	envelope := catalog.Envelope{BundleVersion: catalog.BundleVersionV1, Manifest: manifestBytes, Payload: payloadBytes, Signature: base64.RawURLEncoding.EncodeToString(ed25519.Sign(privateKey, message))}
	document, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return document
}

func signExactBytes(t *testing.T, privateKey ed25519.PrivateKey, manifestBytes, payloadBytes []byte) []byte {
	t.Helper()
	message := append([]byte(catalog.SignatureDomain), make([]byte, 8)...)
	binary.BigEndian.PutUint64(message[len(catalog.SignatureDomain):], uint64(len(manifestBytes)))
	message = append(message, manifestBytes...)
	message = append(message, payloadBytes...)
	document, err := json.Marshal(catalog.Envelope{BundleVersion: catalog.BundleVersionV1, Manifest: manifestBytes, Payload: payloadBytes, Signature: base64.RawURLEncoding.EncodeToString(ed25519.Sign(privateKey, message))})
	if err != nil {
		t.Fatal(err)
	}
	return document
}

func TestVerifyAcceptsExactSignedBytes(t *testing.T) {
	document, verifier := signed(t, 1)
	verified, err := verifier.Verify(document)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if verified.Sequence != 1 || len(verified.Entries) != 1 || verified.Entries[0].ID != "spa-race" {
		t.Fatalf("unexpected catalog: %+v", verified)
	}
}

func TestVerifyRejectsEverySingleByteMutation(t *testing.T) {
	document, verifier := signed(t, 1)
	var envelope catalog.Envelope
	if err := json.Unmarshal(document, &envelope); err != nil {
		t.Fatal(err)
	}
	regions := []*[]byte{&envelope.Manifest, &envelope.Payload}
	for regionIndex, region := range regions {
		for index := range *region {
			mutated := append([]byte(nil), (*region)...)
			mutated[index] ^= 1
			copyEnvelope := envelope
			if regionIndex == 0 {
				copyEnvelope.Manifest = mutated
			} else {
				copyEnvelope.Payload = mutated
			}
			candidate, _ := json.Marshal(copyEnvelope)
			if _, err := verifier.Verify(candidate); err == nil {
				t.Fatalf("accepted mutation region=%d byte=%d", regionIndex, index)
			}
		}
	}
	signature, _ := base64.RawURLEncoding.DecodeString(envelope.Signature)
	for index := range signature {
		mutated := append([]byte(nil), signature...)
		mutated[index] ^= 1
		copyEnvelope := envelope
		copyEnvelope.Signature = base64.RawURLEncoding.EncodeToString(mutated)
		candidate, _ := json.Marshal(copyEnvelope)
		if _, err := verifier.Verify(candidate); err == nil {
			t.Fatalf("accepted signature mutation byte=%d", index)
		}
	}
}

func TestVerifyRejectsUnknownExpiredAndFutureKeys(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(testSeed)
	for _, tc := range []struct {
		name          string
		before, after uint64
		keyID         string
	}{{"unknown", 1, 0, "other"}, {"future", 3, 0, "test-key"}, {"expired", 1, 1, "test-key"}} {
		t.Run(tc.name, func(t *testing.T) {
			_, verifier := testKeys(t, tc.before, tc.after)
			manifest := validManifest(2)
			manifest.KeyID = tc.keyID
			document, err := signing.Build(manifest, validPayload(t), privateKey, signingKeys(privateKey, tc.keyID, 1, 1, 0))
			if err != nil {
				t.Fatal(err)
			}
			if _, err := verifier.Verify(document); err == nil {
				t.Fatal("expected key rejection")
			}
		})
	}
}

func TestVerifyRejectsWrongSchemaChecksumLengthAndSignature(t *testing.T) {
	document, verifier := signed(t, 1)
	var envelope catalog.Envelope
	_ = json.Unmarshal(document, &envelope)
	for _, mutate := range []func(*catalog.Envelope){
		func(value *catalog.Envelope) { value.BundleVersion = "wrong" },
		func(value *catalog.Envelope) {
			value.Signature = base64.RawURLEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))
		},
	} {
		copyEnvelope := envelope
		mutate(&copyEnvelope)
		candidate, _ := json.Marshal(copyEnvelope)
		if _, err := verifier.Verify(candidate); err == nil {
			t.Fatal("expected envelope rejection")
		}
	}
	privateKey := ed25519.NewKeyFromSeed(testSeed)
	payloadBytes, _ := json.Marshal(validPayload(t))
	digest := sha256.Sum256(payloadBytes)
	for _, tc := range []struct {
		name   string
		mutate func(*catalog.Manifest)
	}{
		{"checksum", func(value *catalog.Manifest) { value.PayloadSHA256 = strings.Repeat("0", 64) }},
		{"length", func(value *catalog.Manifest) { value.PayloadLength++ }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manifest := validManifest(1)
			manifest.PayloadSHA256 = hex.EncodeToString(digest[:])
			manifest.PayloadLength = uint64(len(payloadBytes))
			tc.mutate(&manifest)
			if _, err := verifier.Verify(signExact(t, privateKey, manifest, payloadBytes)); err == nil {
				t.Fatalf("accepted false %s", tc.name)
			}
		})
	}
}

func TestVerifyRejectsUnknownDuplicateAndTrailingSignedJSON(t *testing.T) {
	privateKey, verifier := testKeys(t, 1, 0)
	payloadBytes, _ := json.Marshal(validPayload(t))
	digest := sha256.Sum256(payloadBytes)
	manifest := validManifest(1)
	manifest.PayloadSHA256 = hex.EncodeToString(digest[:])
	manifest.PayloadLength = uint64(len(payloadBytes))
	manifestBytes, _ := json.Marshal(manifest)
	manifestUnknown := append(append([]byte(nil), manifestBytes[:len(manifestBytes)-1]...), []byte(`,"extra":true}`)...)
	if _, err := verifier.Verify(signExactBytes(t, privateKey, manifestUnknown, payloadBytes)); err == nil {
		t.Fatal("accepted unknown manifest field")
	}
	payloadDuplicate := bytes.Replace(payloadBytes, []byte(`"payloadVersion":`), []byte(`"payloadVersion":"strategy.official-catalog.payload.v1","payloadVersion":`), 1)
	digest = sha256.Sum256(payloadDuplicate)
	manifest.PayloadSHA256 = hex.EncodeToString(digest[:])
	manifest.PayloadLength = uint64(len(payloadDuplicate))
	manifestBytes, _ = json.Marshal(manifest)
	if _, err := verifier.Verify(signExactBytes(t, privateKey, manifestBytes, payloadDuplicate)); err == nil {
		t.Fatal("accepted duplicate payload field")
	}
	payloadTrailing := append(append([]byte(nil), payloadBytes...), []byte(` {}`)...)
	digest = sha256.Sum256(payloadTrailing)
	manifest.PayloadSHA256 = hex.EncodeToString(digest[:])
	manifest.PayloadLength = uint64(len(payloadTrailing))
	manifestBytes, _ = json.Marshal(manifest)
	if _, err := verifier.Verify(signExactBytes(t, privateKey, manifestBytes, payloadTrailing)); err == nil {
		t.Fatal("accepted trailing payload JSON")
	}
}

func TestVerifierDefensivelyCopiesTrustedPublicKeys(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(testSeed)
	publicKey := append(ed25519.PublicKey(nil), privateKey.Public().(ed25519.PublicKey)...)
	verifier, err := catalog.NewVerifier(catalog.TrustedKeySet{TrustVersion: catalog.TrustVersionV1, Version: 1, Keys: []catalog.TrustedKey{{ID: "test-key", Algorithm: "Ed25519", PublicKey: publicKey, NotBeforeSequence: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	document, err := signing.Build(validManifest(1), validPayload(t), privateKey, signingKeys(privateKey, "test-key", 1, 1, 0))
	if err != nil {
		t.Fatal(err)
	}
	for index := range publicKey {
		publicKey[index] = 0
	}
	if _, err := verifier.Verify(document); err != nil {
		t.Fatalf("caller mutation changed verifier trust: %v", err)
	}
}

func TestVerifierEnforcesSignedMinimumTrustVersion(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(testSeed)
	verifier, err := catalog.NewVerifier(catalog.TrustedKeySet{TrustVersion: catalog.TrustVersionV1, Version: 2, Keys: []catalog.TrustedKey{{ID: "test-key", Algorithm: "Ed25519", PublicKey: privateKey.Public().(ed25519.PublicKey), NotBeforeSequence: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name     string
		minimum  uint64
		accepted bool
	}{{"older", 1, true}, {"equal", 2, true}, {"future", 3, false}, {"zero", 0, false}} {
		t.Run(tc.name, func(t *testing.T) {
			manifest := validManifest(1)
			manifest.MinimumTrustVersion = tc.minimum
			var document []byte
			if tc.minimum == 0 {
				document = signRaw(t, privateKey, manifest, validPayload(t))
			} else {
				document, err = signing.Build(manifest, validPayload(t), privateKey, signingKeys(privateKey, "test-key", tc.minimum, 1, 0))
				if err != nil {
					t.Fatal(err)
				}
			}
			verified, verifyErr := verifier.Verify(document)
			if tc.accepted && (verifyErr != nil || verified.TrustVersion != 2) {
				t.Fatalf("expected trust v2 acceptance: %+v %v", verified, verifyErr)
			}
			if !tc.accepted && verifyErr == nil {
				t.Fatal("accepted unavailable trust version")
			}
		})
	}
}

func TestJSONSafeIntegerBoundaries(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(testSeed)
	public := base64.RawURLEncoding.EncodeToString(privateKey.Public().(ed25519.PublicKey))
	exact := catalog.MaxJSONSafeInteger
	valid := fmt.Sprintf(`{"trustVersion":"%s","version":%d,"keys":[{"id":"test-key","algorithm":"Ed25519","publicKey":"%s","notBeforeSequence":%d,"notAfterSequence":%d}]}`, catalog.TrustVersionV1, exact, public, exact, exact)
	if _, err := catalog.ParseTrustedKeySet([]byte(valid)); err != nil {
		t.Fatalf("exact safe integer rejected: %v", err)
	}
	for _, bad := range []string{
		fmt.Sprintf(`{"trustVersion":"%s","version":%d,"keys":[{"id":"test-key","algorithm":"Ed25519","publicKey":"%s","notBeforeSequence":1}]}`, catalog.TrustVersionV1, exact+1, public),
		fmt.Sprintf(`{"trustVersion":"%s","version":1,"keys":[{"id":"test-key","algorithm":"Ed25519","publicKey":"%s","notBeforeSequence":%d}]}`, catalog.TrustVersionV1, public, exact+1),
		fmt.Sprintf(`{"trustVersion":"%s","version":1,"keys":[{"id":"test-key","algorithm":"Ed25519","publicKey":"%s","notBeforeSequence":1,"notAfterSequence":%d}]}`, catalog.TrustVersionV1, public, exact+1),
	} {
		if _, err := catalog.ParseTrustedKeySet([]byte(bad)); err == nil {
			t.Fatal("accepted integer above JSON-safe maximum")
		}
	}
	verifier, err := catalog.NewVerifier(catalog.TrustedKeySet{TrustVersion: catalog.TrustVersionV1, Version: exact, Keys: []catalog.TrustedKey{{ID: "test-key", Algorithm: "Ed25519", PublicKey: privateKey.Public().(ed25519.PublicKey), NotBeforeSequence: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	manifest := validManifest(exact)
	manifest.MinimumTrustVersion = exact
	if _, err := verifier.Verify(signRaw(t, privateKey, manifest, validPayload(t))); err != nil {
		t.Fatalf("exact manifest safe integer rejected: %v", err)
	}
	manifest.Sequence = exact + 1
	if _, err := verifier.Verify(signRaw(t, privateKey, manifest, validPayload(t))); err == nil {
		t.Fatal("accepted sequence above JSON-safe maximum")
	}
	manifest.Sequence = 1
	manifest.MinimumTrustVersion = exact + 1
	if _, err := verifier.Verify(signRaw(t, privateKey, manifest, validPayload(t))); err == nil {
		t.Fatal("accepted minimum trust above JSON-safe maximum")
	}
}

func TestVerifyRejectsDuplicateOrIncompatibleEntries(t *testing.T) {
	privateKey, verifier := testKeys(t, 1, 0)
	payload := validPayload(t)
	payload.Entries = append(payload.Entries, payload.Entries[0])
	if _, err := verifier.Verify(signRaw(t, privateKey, validManifest(1), payload)); err == nil {
		t.Fatal("accepted duplicate")
	}
	payload = validPayload(t)
	payload.Entries[0].Compatibility.Car = ""
	if _, err := verifier.Verify(signRaw(t, privateKey, validManifest(1), payload)); err == nil {
		t.Fatal("accepted incompatible entry")
	}
}

func TestVerifyRejectsDraftsMultipleBundlesAndNonVantareProvenance(t *testing.T) {
	privateKey, verifier := testKeys(t, 1, 0)
	for _, pkg := range [][]byte{officialPackage(t, "vantare", true, 1), officialPackage(t, "vantare", false, 2), officialPackage(t, "somebody-else", false, 1)} {
		payload := validPayload(t)
		payload.Entries[0].Package = pkg
		if _, err := verifier.Verify(signRaw(t, privateKey, validManifest(1), payload)); err == nil {
			t.Fatal("accepted non-official package")
		}
	}
}

func TestCacheRejectedCandidateNeverReplacesLastKnownGood(t *testing.T) {
	first, verifier := signed(t, 1)
	cache, err := catalog.OpenCache(t.TempDir(), verifier)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := cache.Accept(first); err != nil {
		t.Fatal(err)
	}
	rejected := append([]byte(nil), first...)
	rejected[len(rejected)/2] ^= 1
	if _, _, err := cache.Accept(rejected); err == nil {
		t.Fatal("expected rejection")
	}
	loaded, _, err := cache.Load()
	if err != nil || loaded.Sequence != 1 {
		t.Fatalf("lost LKG: %+v %v", loaded, err)
	}
}

func TestCacheRecoversVerifiedPreviousWhenCurrentIsCorrupt(t *testing.T) {
	first, verifier := signed(t, 1)
	second, _ := signed(t, 2)
	root := t.TempDir()
	cache, _ := catalog.OpenCache(root, verifier)
	if _, _, err := cache.Accept(first); err != nil {
		t.Fatal(err)
	}
	if _, _, err := cache.Accept(second); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "official-catalog.current.json"), []byte("corrupt"), 0o600); err != nil {
		t.Fatal(err)
	}
	loaded, status, err := cache.Load()
	if err != nil || loaded.Sequence != 1 || status != catalog.CacheRecovered {
		t.Fatalf("recovery failed: %+v %q %v", loaded, status, err)
	}
}

func TestCacheRejectsRollbackWhenOnlyPreviousExists(t *testing.T) {
	high, verifier := signed(t, 3)
	old, _ := signed(t, 2)
	root := t.TempDir()
	cache, _ := catalog.OpenCache(root, verifier)
	if _, _, err := cache.Accept(high); err != nil {
		t.Fatal(err)
	}
	current := filepath.Join(root, "official-catalog.current.json")
	previous := filepath.Join(root, "official-catalog.previous.json")
	bytes, err := os.ReadFile(current)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(previous, bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(current); err != nil {
		t.Fatal(err)
	}
	if _, _, err := cache.Accept(old); !catalog.HasErrorCode(err, catalog.ErrorRollback) {
		t.Fatalf("expected rollback rejection, got %v", err)
	}
	loaded, _, err := cache.Load()
	if err != nil || loaded.Sequence != 3 {
		t.Fatalf("lost previous LKG: %+v %v", loaded, err)
	}
}

type fixedSource struct {
	document []byte
	err      error
}

func (source fixedSource) Fetch(context.Context) ([]byte, error) {
	return append([]byte(nil), source.document...), source.err
}

func TestServiceRejectsSequenceRollbackAndUsesVerifiedOfflineCache(t *testing.T) {
	first, verifier := signed(t, 1)
	second, _ := signed(t, 2)
	cache, _ := catalog.OpenCache(t.TempDir(), verifier)
	_, _, _ = cache.Accept(second)
	service := catalog.NewService(fixedSource{document: first}, cache)
	result, err := service.Refresh(context.Background())
	if err != nil || result.Catalog.Sequence != 2 || result.Status != catalog.StatusStale {
		t.Fatalf("rollback fallback: %+v %v", result, err)
	}
	offline := catalog.NewService(fixedSource{err: errors.New("secret internal path C:/private")}, cache)
	result, err = offline.Refresh(context.Background())
	if err != nil || result.Status != catalog.StatusOffline || strings.Contains(result.Warning, "private") {
		t.Fatalf("offline fallback: %+v %v", result, err)
	}
}

func TestServiceDoesNotTurnMissingCacheIntoEmptyCatalog(t *testing.T) {
	_, verifier := signed(t, 1)
	cache, _ := catalog.OpenCache(t.TempDir(), verifier)
	service := catalog.NewService(fixedSource{err: errors.New("offline")}, cache)
	if result, err := service.Refresh(context.Background()); err == nil || result.Catalog.Sequence != 0 {
		t.Fatalf("missing cache became success: %+v %v", result, err)
	}
}

func TestJSONBridgePreservesCorrelationAndSanitizesErrors(t *testing.T) {
	document, verifier := signed(t, 1)
	cache, _ := catalog.OpenCache(t.TempDir(), verifier)
	_, _, _ = cache.Accept(document)
	service := catalog.NewService(fixedSource{document: document}, cache)
	response := catalog.ExecuteJSON(context.Background(), service, []byte(`{"version":"strategy.official-catalog.command.v1","requestId":"request-1","operation":"load"}`))
	if !bytes.Contains(response, []byte(`"requestId":"request-1"`)) || !bytes.Contains(response, []byte(`"ok":true`)) {
		t.Fatalf("lost correlation: %s", response)
	}
	invalid := catalog.ExecuteJSON(context.Background(), service, []byte(`{"version":"strategy.official-catalog.command.v1","requestId":"request-2","operation":"delete"}`))
	if !bytes.Contains(invalid, []byte(`"requestId":"request-2"`)) || bytes.Contains(invalid, []byte(`C:\`)) {
		t.Fatalf("unsafe bridge error: %s", invalid)
	}
}

func TestTrustedKeySetRejectsDuplicatesUnknownFieldsAndTrailingData(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(testSeed)
	encoded := base64.RawURLEncoding.EncodeToString(privateKey.Public().(ed25519.PublicKey))
	valid := `{"trustVersion":"strategy.official-catalog.trust.v1","version":1,"keys":[{"id":"test-key","algorithm":"Ed25519","publicKey":"` + encoded + `","notBeforeSequence":1}]}`
	if _, err := catalog.ParseTrustedKeySet([]byte(valid)); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{strings.Replace(valid, `"version":1`, `"version":1,"version":1`, 1), strings.Replace(valid, `"keys":`, `"extra":true,"keys":`, 1), valid + ` {}`} {
		if _, err := catalog.ParseTrustedKeySet([]byte(bad)); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
}

func TestTrustedKeySetRejectsExcessiveJSONDepth(t *testing.T) {
	document := strings.Repeat("[", 66) + strings.Repeat("]", 66)
	if _, err := catalog.ParseTrustedKeySet([]byte(document)); err == nil {
		t.Fatal("accepted excessive JSON depth")
	}
}
