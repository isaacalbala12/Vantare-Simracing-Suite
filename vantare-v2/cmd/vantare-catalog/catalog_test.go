package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
)

func TestBuildUnsignedIsDeterministicAndKeepsReferenceEvidence(t *testing.T) {
	summary := readFixture(t, "curator-summary-v2.json")
	selection := readFixture(t, "approved-selection-v1.json")
	metadata := validBuildMetadata()

	first, err := buildUnsigned(summary, selection, metadata)
	if err != nil {
		t.Fatalf("first build: %v", err)
	}
	second, err := buildUnsigned(summary, selection, metadata)
	if err != nil {
		t.Fatalf("second build: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("same reviewed inputs produced different unsigned bytes")
	}

	var unsigned unsignedCatalog
	if err := strictDecode(first, &unsigned); err != nil {
		t.Fatalf("decode unsigned catalog: %v", err)
	}
	if len(unsigned.Payload.Combinations) != 1 {
		t.Fatalf("combinations = %d, want 1", len(unsigned.Payload.Combinations))
	}
	combination := unsigned.Payload.Combinations[0]
	if combination.Reference == nil || combination.Reference.Provenance.Kind != "reference" ||
		combination.Reference.Provenance.Environment != productionEnvironment || combination.Reference.Sample.Contributors != 4 ||
		combination.Reference.Sample.Sessions != 10 || combination.Reference.Quality.ValidSessions != 9 {
		t.Fatalf("reference evidence = %+v", combination.Reference)
	}
	if len(combination.Strategies) != 1 || combination.Strategies[0].Provenance.Kind != "reference" ||
		combination.Strategies[0].Sample.SemanticBundles != 3 || combination.Strategies[0].Sample.Sessions != 10 ||
		combination.Strategies[0].Quality.ValidRatio != 0.9 {
		t.Fatalf("strategy evidence = %+v", combination.Strategies)
	}
	if bytes.Contains(first, []byte("test-only")) || bytes.Contains(first, []byte("controlled-only")) || bytes.Contains(first, []byte("lemans-hyper")) {
		t.Fatalf("unsigned catalog contains unapproved or non-production content: %s", first)
	}
}

func TestBuildUnsignedRejectsNonPublishableContent(t *testing.T) {
	summary := readFixture(t, "curator-summary-v2.json")
	tests := []struct {
		name        string
		environment string
		combination string
	}{
		{name: "test environment never publishes", environment: "test", combination: "test-only"},
		{name: "controlled capture never publishes", environment: "controlled-capture", combination: "controlled-only"},
		{name: "production below k never publishes", environment: productionEnvironment, combination: "lemans-hyper"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			selection := []byte(`{"contractVersion":"vantare.catalog.selection.v1","items":[{"environment":"` + test.environment + `","combinationId":"` + test.combination + `","includeReferenceProfile":true,"strategyClusterDigests":[]}]}`)
			_, err := buildUnsigned(summary, selection, validBuildMetadata())
			if !errors.Is(err, errNotPublishable) {
				t.Fatalf("error = %v, want errNotPublishable", err)
			}
		})
	}
}

func TestBuildUnsignedRequiresMonotonicVersion(t *testing.T) {
	metadata := validBuildMetadata()
	metadata.PreviousVersion = metadata.Version
	_, err := buildUnsigned(readFixture(t, "curator-summary-v2.json"), readFixture(t, "approved-selection-v1.json"), metadata)
	if err == nil || !strings.Contains(err.Error(), "greater than previous") {
		t.Fatalf("error = %v, want monotonic version rejection", err)
	}
}

func TestBuildAndSignRoundTripWithExistingVerifier(t *testing.T) {
	temporary := t.TempDir()
	unsignedPath := filepath.Join(temporary, "catalog-unsigned.json")
	signedPath := filepath.Join(temporary, "catalog-signed.json")
	metadata := validBuildMetadata()

	buildArgs := []string{
		"build", "--summary", filepath.Join("testdata", "curator-summary-v2.json"),
		"--selection", filepath.Join("testdata", "approved-selection-v1.json"), "--out", unsignedPath,
		"--key-epoch", metadata.KeyEpoch, "--version", "4", "--previous-version", "3",
		"--published-at", metadata.PublishedAt.Format(time.RFC3339), "--expires-at", metadata.ExpiresAt.Format(time.RFC3339),
	}
	if err := run(buildArgs, &bytes.Buffer{}); err != nil {
		t.Fatalf("run build: %v", err)
	}
	keyPath := filepath.Join("..", "..", "internal", "strategy", "catalog", "testdata", "test_private_seed.hex")
	if err := run([]string{"sign", "--in", unsignedPath, "--out", signedPath, "--private-key-file", keyPath, "--key-id", "TEST-key-2026-08-a"}, &bytes.Buffer{}); err != nil {
		t.Fatalf("run sign: %v", err)
	}

	signedBytes, err := os.ReadFile(signedPath)
	if err != nil {
		t.Fatalf("read signed catalog: %v", err)
	}
	var signed catalog.SignedCatalog
	if err := json.Unmarshal(signedBytes, &signed); err != nil {
		t.Fatalf("decode signed catalog: %v", err)
	}
	seedText, err := os.ReadFile(keyPath)
	if err != nil {
		t.Fatalf("read TEST seed: %v", err)
	}
	seed, err := hex.DecodeString(strings.TrimSpace(string(seedText)))
	if err != nil {
		t.Fatalf("decode TEST seed: %v", err)
	}
	privateKey := ed25519.NewKeyFromSeed(seed)
	verification := catalog.VerificationInput{
		Signed: signed, TrustedKeys: map[string]ed25519.PublicKey{metadata.KeyEpoch: privateKey.Public().(ed25519.PublicKey)},
		MinEpoch: metadata.KeyEpoch, MinVersion: 4, SeenEpoch: metadata.KeyEpoch, SeenVersion: 3,
		Now: metadata.PublishedAt.Add(time.Minute),
	}
	if err := catalog.VerifySignedCatalog(verification); err != nil {
		t.Fatalf("existing verifier rejected round trip: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*catalog.VerificationInput)
		want   string
	}{
		{name: "unknown key epoch", mutate: func(input *catalog.VerificationInput) {
			input.TrustedKeys = map[string]ed25519.PublicKey{}
		}, want: "keyEpoch"},
		{name: "non monotonic minimum version", mutate: func(input *catalog.VerificationInput) {
			input.MinVersion = 5
		}, want: "below minimum"},
		{name: "hard expiration", mutate: func(input *catalog.VerificationInput) {
			input.Now = metadata.ExpiresAt
		}, want: "expired"},
		{name: "incompatible schema", mutate: func(input *catalog.VerificationInput) {
			input.Signed.Envelope.SchemaVersion = "9.9.9"
		}, want: "schema incompatible"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := verification
			test.mutate(&input)
			if err := catalog.VerifySignedCatalog(input); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("verification error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestSignUnsignedRejectsPayloadChangedAfterReview(t *testing.T) {
	unsigned, err := buildUnsigned(readFixture(t, "curator-summary-v2.json"), readFixture(t, "approved-selection-v1.json"), validBuildMetadata())
	if err != nil {
		t.Fatalf("build unsigned: %v", err)
	}
	tampered := bytes.Replace(unsigned, []byte(`"contributors":4`), []byte(`"contributors":5`), 1)
	seed := readTestSeed(t)
	if _, err := signUnsigned(tampered, seed, "TEST-key"); err == nil || !strings.Contains(err.Error(), "digest does not match") {
		t.Fatalf("tampered payload error = %v", err)
	}
}

func validBuildMetadata() buildMetadata {
	return buildMetadata{
		CatalogID: "vantare-strategy", Channel: "stable", KeyEpoch: "2026-08-a",
		Version: 4, PreviousVersion: 3,
		PublishedAt: time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC),
		ExpiresAt:   time.Date(2026, 9, 21, 12, 0, 0, 0, time.UTC),
	}
}

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return data
}

func readTestSeed(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "internal", "strategy", "catalog", "testdata", "test_private_seed.hex"))
	if err != nil {
		t.Fatalf("read TEST seed: %v", err)
	}
	return data
}
