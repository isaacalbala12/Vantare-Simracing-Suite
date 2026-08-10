package signing

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
)

func Build(manifest catalog.Manifest, payload catalog.Payload, privateKey ed25519.PrivateKey, trustedKeys catalog.TrustedKeySet) ([]byte, error) {
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("invalid Ed25519 private key")
	}
	payload.PayloadVersion = catalog.PayloadVersionV1
	payload.Entries = append([]catalog.Entry(nil), payload.Entries...)
	for index := range payload.Entries {
		payload.Entries[index].Package = append([]byte(nil), payload.Entries[index].Package...)
	}
	sort.Slice(payload.Entries, func(left, right int) bool { return payload.Entries[left].ID < payload.Entries[right].ID })
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode payload: %w", err)
	}
	if len(payloadBytes) > catalog.MaxPayloadBytes {
		return nil, fmt.Errorf("payload exceeds limit")
	}
	digest := sha256.Sum256(payloadBytes)
	manifest.BundleVersion = catalog.BundleVersionV1
	manifest.PayloadSHA256 = hex.EncodeToString(digest[:])
	manifest.PayloadLength = uint64(len(payloadBytes))
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		return nil, fmt.Errorf("encode manifest: %w", err)
	}
	if len(manifestBytes) > catalog.MaxManifestBytes {
		return nil, fmt.Errorf("manifest exceeds limit")
	}
	message := make([]byte, 0, len(catalog.SignatureDomain)+8+len(manifestBytes)+len(payloadBytes))
	message = append(message, catalog.SignatureDomain...)
	length := make([]byte, 8)
	binary.BigEndian.PutUint64(length, uint64(len(manifestBytes)))
	message = append(message, length...)
	message = append(message, manifestBytes...)
	message = append(message, payloadBytes...)
	envelope := catalog.Envelope{BundleVersion: catalog.BundleVersionV1, Manifest: manifestBytes, Payload: payloadBytes, Signature: base64.RawURLEncoding.EncodeToString(ed25519.Sign(privateKey, message))}
	document, err := json.Marshal(envelope)
	if err != nil {
		return nil, fmt.Errorf("encode bundle: %w", err)
	}
	if len(document) > catalog.MaxBundleBytes {
		return nil, fmt.Errorf("bundle exceeds limit")
	}
	verifier, err := catalog.NewVerifier(trustedKeys)
	if err != nil {
		return nil, err
	}
	if _, err := verifier.Verify(document); err != nil {
		return nil, fmt.Errorf("built catalog is not verifiable: %w", err)
	}
	return document, nil
}
