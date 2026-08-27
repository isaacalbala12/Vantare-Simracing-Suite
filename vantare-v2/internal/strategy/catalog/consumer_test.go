package catalog

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestConsumerDegradesRejectedCandidateToValidCacheOrEmpty(t *testing.T) {
	privateKey, publicKey := testKeyPair(t)
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	valid := signedConsumerCatalog(t, privateKey, now, "2026-08-a", 2, SchemaVersionV1, now.Add(24*time.Hour))

	tests := []struct {
		name   string
		mutate func(*SignedCatalog)
		want   WarningCode
	}{
		{name: "firma inválida", mutate: func(value *SignedCatalog) {
			value.Signature = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="
		}, want: WarningInvalidSignature},
		{name: "época desconocida", mutate: func(value *SignedCatalog) { value.Envelope.KeyEpoch = "2026-09-x" }, want: WarningUnknownEpoch},
		{name: "rollback de versión", mutate: func(value *SignedCatalog) {
			*value = signedConsumerCatalog(t, privateKey, now, "2026-08-a", 1, SchemaVersionV1, now.Add(24*time.Hour))
		}, want: WarningRollback},
		{name: "expiresAt vencido", mutate: func(value *SignedCatalog) {
			*value = signedConsumerCatalog(t, privateKey, now, "2026-08-a", 3, SchemaVersionV1, now.Add(-time.Minute))
		}, want: WarningExpired},
		{name: "schema incompatible", mutate: func(value *SignedCatalog) {
			*value = signedConsumerCatalog(t, privateKey, now, "2026-08-a", 3, "9.0.0", now.Add(24*time.Hour))
		}, want: WarningSchema},
	}

	for _, test := range tests {
		t.Run(test.name+" usa caché", func(t *testing.T) {
			statePath := filepath.Join(t.TempDir(), "catalog-state.json")
			consumer := NewConsumer(ConsumerOptions{StatePath: statePath, TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": publicKey}, MinEpoch: "2026-08-a", MinVersion: 1, Now: func() time.Time { return now }})
			consumer.candidate = mustJSON(t, valid)
			first, err := consumer.Load(context.Background())
			if err != nil || first.Source != SourceCandidate || len(first.Catalog.Combinations) != 1 {
				t.Fatalf("prime cache: result=%+v err=%v", first, err)
			}
			rejected := cloneSigned(t, valid)
			test.mutate(&rejected)
			consumer.candidate = mustJSON(t, rejected)
			got, err := consumer.Load(context.Background())
			if err != nil || got.Source != SourceCache || got.Warning != test.want || got.Catalog.Combinations[0].CombinationID != "lmu:spa:lmgt3" {
				t.Fatalf("degraded result=%+v err=%v", got, err)
			}
		})

		t.Run(test.name+" queda vacío", func(t *testing.T) {
			rejected := cloneSigned(t, valid)
			test.mutate(&rejected)
			consumer := NewConsumer(ConsumerOptions{StatePath: filepath.Join(t.TempDir(), "catalog-state.json"), TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": publicKey}, MinEpoch: "2026-08-a", MinVersion: 1, SeenEpoch: "2026-08-a", SeenVersion: 2, Now: func() time.Time { return now }})
			consumer.candidate = mustJSON(t, rejected)
			got, err := consumer.Load(context.Background())
			if err != nil || got.Source != SourceEmpty || got.Warning != test.want || len(got.Catalog.Combinations) != 0 {
				t.Fatalf("empty result=%+v err=%v", got, err)
			}
		})
	}
}

func TestConsumerWithEmptyURLUsesFixtureWithoutNetwork(t *testing.T) {
	_, publicKey := testKeyPair(t)
	fixture, err := os.ReadFile(filepath.Join("testdata", "catalog_fixture_signed.json"))
	if err != nil {
		t.Fatal(err)
	}
	consumer := NewConsumer(ConsumerOptions{StatePath: filepath.Join(t.TempDir(), "state.json"), Fixture: fixture, TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": publicKey}, MinEpoch: "2026-08-a", MinVersion: 1, Now: func() time.Time { return time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC) }})
	got, err := consumer.Load(context.Background())
	if err != nil || got.Source != SourceCandidate || len(got.Catalog.Combinations) == 0 {
		t.Fatalf("fixture result=%+v err=%v", got, err)
	}
}

func signedConsumerCatalog(t *testing.T, privateKey ed25519.PrivateKey, now time.Time, epoch string, version uint64, schema string, expiresAt time.Time) SignedCatalog {
	t.Helper()
	payload := PayloadV1{ContractVersion: PayloadVersionV1, Source: SourceV1{MinimumCohort: 3}, Combinations: []CombinationV1{{CombinationID: "lmu:spa:lmgt3", ReferenceProfile: &ReferenceProfileV1{Provenance: ReferenceProvenanceV1{Kind: "reference"}, Sample: SampleV1{Contributors: 3, Sessions: 4}}}}}
	payloadBytes := mustJSON(t, payload)
	digest, err := PayloadDigestFor(payloadBytes)
	if err != nil {
		t.Fatal(err)
	}
	envelope := Envelope{Domain: DomainV1, CatalogID: "vantare-strategy", Channel: "stable", SchemaID: SchemaIDV1, SchemaVersion: schema, KeyEpoch: epoch, Version: version, PublishedAt: now.Add(-time.Hour), ExpiresAt: expiresAt, PayloadDigest: digest}
	var signature string
	if schema == SchemaVersionV1 {
		signature, err = SignEnvelope(privateKey, envelope)
	} else {
		canonical, canonErr := CanonicalizeJCS(mustMarshal(envelope))
		if canonErr != nil {
			t.Fatal(canonErr)
		}
		signature = signRaw(privateKey, envelope.Domain, canonical)
	}
	if err != nil {
		t.Fatal(err)
	}
	return SignedCatalog{Envelope: envelope, Payload: payloadBytes, Signature: signature, KeyID: "TEST"}
}

func signRaw(privateKey ed25519.PrivateKey, domain string, canonical []byte) string {
	return base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, domainSeparatedMessage(domain, canonical)))
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func cloneSigned(t *testing.T, value SignedCatalog) SignedCatalog {
	t.Helper()
	var clone SignedCatalog
	if err := json.Unmarshal(mustJSON(t, value), &clone); err != nil {
		t.Fatal(err)
	}
	return clone
}
