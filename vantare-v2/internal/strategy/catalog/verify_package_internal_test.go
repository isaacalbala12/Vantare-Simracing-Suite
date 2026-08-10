package catalog

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func signedCatalogWithPackage(t *testing.T, packageBytes []byte) ([]byte, *Verifier) {
	t.Helper()
	base, verifier := cacheFixture(t, 1)
	var envelope Envelope
	if err := json.Unmarshal(base, &envelope); err != nil {
		t.Fatal(err)
	}
	var payload Payload
	if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	payload.Entries[0].Package = packageBytes
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var manifest Manifest
	if err := json.Unmarshal(envelope.Manifest, &manifest); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(payloadBytes)
	manifest.PayloadSHA256 = hex.EncodeToString(digest[:])
	manifest.PayloadLength = uint64(len(payloadBytes))
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	key := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{3}, ed25519.SeedSize))
	envelope.Manifest = manifestBytes
	envelope.Payload = payloadBytes
	envelope.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, signatureMessage(manifestBytes, payloadBytes)))
	document, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return document, verifier
}

func TestVerifyRejectsDuplicateTrailingAndDeepPackageJSONBeforeDecode(t *testing.T) {
	base, _ := cacheFixture(t, 1)
	var envelope Envelope
	_ = json.Unmarshal(base, &envelope)
	var payload Payload
	_ = json.Unmarshal(envelope.Payload, &payload)
	valid := payload.Entries[0].Package
	mutations := []struct {
		name     string
		document []byte
		cause    error
	}{
		{"root duplicate", bytes.Replace(valid, []byte(`"packageVersion":`), []byte(`"packageVersion":"strategy.package.v1","packageVersion":`), 1), errorsTrailingJSON},
		{"nested duplicate", bytes.Replace(valid, []byte(`"application": "vantare"`), []byte(`"application": "vantare", "application": "vantare"`), 1), errorsTrailingJSON},
		{"trailing", append(append([]byte(nil), valid...), []byte(` {}`)...), errorsTrailingJSON},
	}
	deep := append([]byte(nil), valid[:len(valid)-2]...)
	deep = append(deep, []byte(`,"deep":`+strings.Repeat("[", 65)+"0"+strings.Repeat("]", 65)+`}`)...)
	mutations = append(mutations, struct {
		name     string
		document []byte
		cause    error
	}{"depth", deep, errJSONLimit})
	for _, tc := range mutations {
		t.Run(tc.name, func(t *testing.T) {
			document, verifier := signedCatalogWithPackage(t, tc.document)
			_, err := verifier.Verify(document)
			if err == nil || !errors.Is(err, tc.cause) {
				t.Fatalf("expected strict package JSON rejection, got %v", err)
			}
		})
	}
}
