package signing_test

import (
	"bytes"
	"crypto/ed25519"
	"testing"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
	"github.com/vantare/overlays/v2/internal/strategy/catalog/signing"
)

func TestSignProducesIdenticalBytesForIdenticalInputs(t *testing.T) {
	key := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{7}, ed25519.SeedSize))
	manifest := catalog.Manifest{BundleVersion: catalog.BundleVersionV1, Sequence: 1, PublishedAt: "2026-08-10T12:00:00Z", KeyID: "test", MinimumTrustVersion: 1}
	payload := catalog.Payload{PayloadVersion: catalog.PayloadVersionV1, Entries: []catalog.Entry{}}
	keys := catalog.TrustedKeySet{TrustVersion: catalog.TrustVersionV1, Version: 1, Keys: []catalog.TrustedKey{{ID: "test", Algorithm: "Ed25519", PublicKey: key.Public().(ed25519.PublicKey), NotBeforeSequence: 1}}}
	first, err := signing.Build(manifest, payload, key, keys)
	if err != nil {
		t.Fatal(err)
	}
	second, err := signing.Build(manifest, payload, key, keys)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("signing is not deterministic")
	}
}

func TestSignRejectsPrivateKeyOutsideTrustedKeySet(t *testing.T) {
	privateKey := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{7}, ed25519.SeedSize))
	other := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{8}, ed25519.SeedSize))
	keys := catalog.TrustedKeySet{TrustVersion: catalog.TrustVersionV1, Version: 1, Keys: []catalog.TrustedKey{{ID: "test", Algorithm: "Ed25519", PublicKey: other.Public().(ed25519.PublicKey), NotBeforeSequence: 1}}}
	manifest := catalog.Manifest{BundleVersion: catalog.BundleVersionV1, Sequence: 1, PublishedAt: "2026-08-10T12:00:00Z", KeyID: "test", MinimumTrustVersion: 1}
	payload := catalog.Payload{PayloadVersion: catalog.PayloadVersionV1, Entries: []catalog.Entry{}}
	if _, err := signing.Build(manifest, payload, privateKey, keys); err == nil {
		t.Fatal("signed with a private key outside the real trusted keyset")
	}
}
