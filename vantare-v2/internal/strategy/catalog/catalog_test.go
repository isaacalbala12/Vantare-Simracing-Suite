package catalog

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"testing"
	"time"
)

func testKeyPair(t *testing.T) (ed25519.PrivateKey, ed25519.PublicKey) {
	t.Helper()
	seed := make([]byte, 32)
	for i := range seed {
		seed[i] = byte(i + 1)
	}
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)
	return priv, pub
}

func validPayload() json.RawMessage {
	return json.RawMessage(`{"items":[{"combinationId":"spa-lmgt3","bestStrategyId":"s1"}]}`)
}

func validEnvelope(now time.Time, digest string) Envelope {
	return Envelope{
		Domain:        DomainV1,
		CatalogID:     "vantare-strategy",
		Channel:       "stable",
		SchemaID:      SchemaIDV1,
		SchemaVersion: SchemaVersionV1,
		KeyEpoch:      "2026-08-a",
		Version:       2,
		PublishedAt:   now.Add(-time.Minute),
		ExpiresAt:     now.Add(24 * time.Hour),
		PayloadDigest: digest,
	}
}

func TestCatalog_VerifyFixture(t *testing.T) {
	priv, pub := testKeyPair(t)
	now := time.Now().UTC().Truncate(time.Millisecond)
	payload := validPayload()
	digest, _ := PayloadDigestFor(payload)
	env := validEnvelope(now, digest)
	sig, err := SignEnvelope(priv, env)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	signed := SignedCatalog{Envelope: env, Payload: payload, Signature: sig, KeyID: "test-key-1"}
	input := VerificationInput{
		Signed:      signed,
		TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": pub},
		MinEpoch:    "2026-08-a",
		MinVersion:  1,
		SeenEpoch:   "2026-08-a",
		SeenVersion: 1,
		Now:         now,
	}
	if err := VerifySignedCatalog(input); err != nil {
		t.Fatalf("verify: %v", err)
	}
	if digest2, _ := PayloadDigestFor(payload); digest2 != digest {
		t.Fatalf("digest mismatch")
	}
	_ = base64.StdEncoding.EncodeToString
	_ = rand.Reader
}

func TestCatalog_FirmaInvalida(t *testing.T) {
	priv, pub := testKeyPair(t)
	now := time.Now().UTC().Truncate(time.Millisecond)
	payload := validPayload()
	digest, _ := PayloadDigestFor(payload)
	env := validEnvelope(now, digest)
	sig, _ := SignEnvelope(priv, env)
	b, _ := base64.StdEncoding.DecodeString(sig)
	b[0] ^= 0xFF
	badSig := base64.StdEncoding.EncodeToString(b)
	signed := SignedCatalog{Envelope: env, Payload: payload, Signature: badSig, KeyID: "test-key-1"}
	input := VerificationInput{Signed: signed, TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": pub}, MinEpoch: "2026-08-a", MinVersion: 1, Now: now}
	if err := VerifySignedCatalog(input); err == nil || !contains(err.Error(), "firma") {
		t.Fatalf("expected firma inválida, got %v", err)
	}
}

func TestCatalog_KeyEpochDesconocida(t *testing.T) {
	priv, _ := testKeyPair(t)
	now := time.Now().UTC().Truncate(time.Millisecond)
	payload := validPayload()
	digest, _ := PayloadDigestFor(payload)
	env := Envelope{Domain: DomainV1, CatalogID: "vantare-strategy", Channel: "stable", SchemaID: SchemaIDV1, SchemaVersion: SchemaVersionV1, KeyEpoch: "9999-xx", Version: 1, PublishedAt: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), PayloadDigest: digest}
	sig, _ := SignEnvelope(priv, env)
	signed := SignedCatalog{Envelope: env, Payload: payload, Signature: sig, KeyID: "k"}
	input := VerificationInput{Signed: signed, TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": make(ed25519.PublicKey, 32)}, MinEpoch: "2026-08-a", MinVersion: 1, Now: now}
	if err := VerifySignedCatalog(input); err == nil || !contains(err.Error(), "keyEpoch") {
		t.Fatalf("expected keyEpoch desconocida, got %v", err)
	}
}

func TestCatalog_RollbackVersion(t *testing.T) {
	priv, pub := testKeyPair(t)
	now := time.Now().UTC().Truncate(time.Millisecond)
	payload := validPayload()
	digest, _ := PayloadDigestFor(payload)
	env := Envelope{Domain: DomainV1, CatalogID: "vantare-strategy", Channel: "stable", SchemaID: SchemaIDV1, SchemaVersion: SchemaVersionV1, KeyEpoch: "2026-08-a", Version: 1, PublishedAt: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), PayloadDigest: digest}
	sig, _ := SignEnvelope(priv, env)
	signed := SignedCatalog{Envelope: env, Payload: payload, Signature: sig}
	input := VerificationInput{Signed: signed, TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": pub}, MinEpoch: "2026-08-a", MinVersion: 1, SeenEpoch: "2026-08-a", SeenVersion: 2, Now: now}
	if err := VerifySignedCatalog(input); err == nil || !contains(err.Error(), "rollback") {
		t.Fatalf("expected rollback, got %v", err)
	}
}

func TestCatalog_ExpiresAtVencido(t *testing.T) {
	priv, pub := testKeyPair(t)
	now := time.Now().UTC().Truncate(time.Millisecond)
	payload := validPayload()
	digest, _ := PayloadDigestFor(payload)
	env := Envelope{Domain: DomainV1, CatalogID: "vantare-strategy", Channel: "stable", SchemaID: SchemaIDV1, SchemaVersion: SchemaVersionV1, KeyEpoch: "2026-08-a", Version: 2, PublishedAt: now.Add(-2 * time.Hour), ExpiresAt: now.Add(-time.Minute), PayloadDigest: digest}
	sig, _ := SignEnvelope(priv, env)
	signed := SignedCatalog{Envelope: env, Payload: payload, Signature: sig}
	input := VerificationInput{Signed: signed, TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": pub}, MinEpoch: "2026-08-a", MinVersion: 1, Now: now}
	if err := VerifySignedCatalog(input); err == nil || !contains(err.Error(), "expired") {
		t.Fatalf("expected expiresAt vencido, got %v", err)
	}
}

func TestCatalog_SchemaIncompatible(t *testing.T) {
	priv, pub := testKeyPair(t)
	now := time.Now().UTC().Truncate(time.Millisecond)
	payload := validPayload()
	digest, _ := PayloadDigestFor(payload)
	env := Envelope{Domain: DomainV1, CatalogID: "vantare-strategy", Channel: "stable", SchemaID: SchemaIDV1, SchemaVersion: "9.9.9", KeyEpoch: "2026-08-a", Version: 2, PublishedAt: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), PayloadDigest: digest}
	canon, _ := CanonicalizeJCS(mustMarshal(env))
	msg := domainSeparatedMessage(env.Domain, canon)
	sig := base64.StdEncoding.EncodeToString(ed25519.Sign(priv, msg))
	signed := SignedCatalog{Envelope: env, Payload: payload, Signature: sig}
	input := VerificationInput{Signed: signed, TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": pub}, MinEpoch: "2026-08-a", MinVersion: 1, Now: now}
	if err := VerifySignedCatalog(input); err == nil || !contains(err.Error(), "schema") {
		t.Fatalf("expected schema incompatible, got %v", err)
	}
}

func TestCatalog_FixtureFile(t *testing.T) {
	raw, err := os.ReadFile("testdata/catalog_fixture_signed.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var signed SignedCatalog
	if err := json.Unmarshal(raw, &signed); err != nil {
		t.Fatalf("unmarshal fixture: %v", err)
	}
	_, pub := testKeyPair(t)
	input := VerificationInput{
		Signed:      signed,
		TrustedKeys: map[string]ed25519.PublicKey{"2026-08-a": pub},
		MinEpoch:    "2026-08-a",
		MinVersion:  1,
		Now:         time.Date(2026, 8, 22, 0, 0, 0, 0, time.UTC),
	}
	if err := VerifySignedCatalog(input); err != nil {
		t.Fatalf("fixture verify: %v", err)
	}
}

func contains(s, sub string) bool { return len(s) >= len(sub) && (s == sub || len(sub) == 0 || search(s, sub)) }
func search(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
