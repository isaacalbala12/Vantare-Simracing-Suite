package catalog

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

const MaxDecodedPackageBytes = packaging.MaxPackageBytes

type Verifier struct {
	keys         map[string]TrustedKey
	trustVersion uint64
}

func NewVerifier(keySet TrustedKeySet) (*Verifier, error) {
	if err := validateKeySet(keySet); err != nil {
		return nil, err
	}
	// The configuration/binary anti-rollback that chooses keySet.Version is
	// wired in Task 2. This verifier only enforces the signed minimum against
	// the already selected, defensively copied keyset.
	verifier := &Verifier{keys: make(map[string]TrustedKey, len(keySet.Keys)), trustVersion: keySet.Version}
	for _, key := range keySet.Keys {
		key.PublicKey = append(ed25519.PublicKey(nil), key.PublicKey...)
		verifier.keys[key.ID] = key
	}
	return verifier, nil
}

func (verifier *Verifier) Verify(document []byte) (VerifiedCatalog, error) {
	if verifier == nil || len(document) == 0 || len(document) > MaxSerializedBundleBytes {
		return VerifiedCatalog{}, catalogError(ErrorInvalidBundle, "")
	}
	if err := rejectDuplicateJSON(document); err != nil {
		return VerifiedCatalog{}, wrapCatalogError(ErrorInvalidBundle, "", err)
	}
	var envelope Envelope
	if err := decodeStrict(document, &envelope); err != nil {
		return VerifiedCatalog{}, wrapCatalogError(ErrorInvalidBundle, "", err)
	}
	if envelope.BundleVersion != BundleVersionV1 || len(envelope.Manifest) == 0 || len(envelope.Manifest) > MaxManifestBytes || len(envelope.Payload) == 0 || len(envelope.Payload) > MaxSerializedPayloadBytes {
		return VerifiedCatalog{}, catalogError(ErrorInvalidBundle, "bundleVersion")
	}
	if err := rejectDuplicateJSON(envelope.Manifest); err != nil {
		return VerifiedCatalog{}, wrapCatalogError(ErrorInvalidManifest, "", err)
	}
	var manifest Manifest
	if err := decodeStrict(envelope.Manifest, &manifest); err != nil {
		return VerifiedCatalog{}, wrapCatalogError(ErrorInvalidManifest, "", err)
	}
	if err := validateManifest(manifest); err != nil {
		return VerifiedCatalog{}, err
	}
	if manifest.MinimumTrustVersion > verifier.trustVersion {
		return VerifiedCatalog{}, catalogError(ErrorInvalidTrust, "minimumTrustVersion")
	}
	key, exists := verifier.keys[manifest.KeyID]
	if !exists {
		return VerifiedCatalog{}, catalogError(ErrorUnknownKey, "keyId")
	}
	if manifest.Sequence < key.NotBeforeSequence || (key.NotAfterSequence != 0 && manifest.Sequence > key.NotAfterSequence) {
		return VerifiedCatalog{}, catalogError(ErrorKeyWindow, "sequence")
	}
	signature, err := base64.RawURLEncoding.DecodeString(envelope.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize || base64.RawURLEncoding.EncodeToString(signature) != envelope.Signature {
		return VerifiedCatalog{}, catalogError(ErrorSignature, "signature")
	}
	message := signatureMessage(envelope.Manifest, envelope.Payload)
	if !ed25519.Verify(key.PublicKey, message, signature) {
		return VerifiedCatalog{}, catalogError(ErrorSignature, "signature")
	}
	digest := sha256.Sum256(envelope.Payload)
	declared, err := hex.DecodeString(manifest.PayloadSHA256)
	if err != nil || len(declared) != sha256.Size || subtle.ConstantTimeCompare(declared, digest[:]) != 1 {
		return VerifiedCatalog{}, catalogError(ErrorChecksum, "payloadSHA256")
	}
	if manifest.PayloadLength != uint64(len(envelope.Payload)) {
		return VerifiedCatalog{}, catalogError(ErrorChecksum, "payloadLength")
	}
	if err := rejectDuplicateJSON(envelope.Payload); err != nil {
		return VerifiedCatalog{}, wrapCatalogError(ErrorInvalidPayload, "", err)
	}
	var payload Payload
	if err := decodeStrict(envelope.Payload, &payload); err != nil {
		return VerifiedCatalog{}, wrapCatalogError(ErrorInvalidPayload, "", err)
	}
	if err := validatePayload(payload); err != nil {
		return VerifiedCatalog{}, err
	}
	return VerifiedCatalog{Sequence: manifest.Sequence, PublishedAt: manifest.PublishedAt, KeyID: manifest.KeyID, TrustVersion: verifier.trustVersion, Entries: cloneEntries(payload.Entries), document: append([]byte(nil), document...)}, nil
}

func validateManifest(manifest Manifest) error {
	if manifest.BundleVersion != BundleVersionV1 || manifest.Sequence == 0 || manifest.Sequence > MaxJSONSafeInteger || manifest.MinimumTrustVersion == 0 || manifest.MinimumTrustVersion > MaxJSONSafeInteger || !safeID.MatchString(manifest.KeyID) || len(manifest.PayloadSHA256) != 64 || strings.ToLower(manifest.PayloadSHA256) != manifest.PayloadSHA256 {
		return catalogError(ErrorInvalidManifest, "")
	}
	if _, err := hex.DecodeString(manifest.PayloadSHA256); err != nil {
		return catalogError(ErrorInvalidManifest, "payloadSHA256")
	}
	parsed, err := time.Parse(time.RFC3339Nano, manifest.PublishedAt)
	if err != nil || !strings.HasSuffix(manifest.PublishedAt, "Z") || parsed.Format(time.RFC3339Nano) != manifest.PublishedAt {
		return catalogError(ErrorInvalidManifest, "publishedAt")
	}
	return nil
}

func validatePayload(payload Payload) error {
	if payload.PayloadVersion != PayloadVersionV1 || len(payload.Entries) > MaxEntries {
		return catalogError(ErrorInvalidPayload, "payloadVersion")
	}
	previous := ""
	decodedPackageBytes := 0
	for _, entry := range payload.Entries {
		if !safeID.MatchString(entry.ID) || entry.ID <= previous || !boundedText(entry.Title, 160) || !boundedText(entry.Summary, 1024) || !boundedText(entry.Compatibility.Simulator, 128) || !boundedText(entry.Compatibility.Circuit, 128) || !boundedText(entry.Compatibility.Car, 128) || !boundedText(entry.Compatibility.Event, 128) || len(entry.Package) == 0 {
			return catalogError(ErrorInvalidPayload, "entries")
		}
		previous = entry.ID
		if len(entry.Package) > MaxDecodedPackageBytes || len(entry.Package) > MaxDecodedPackagesBytes-decodedPackageBytes {
			return catalogError(ErrorInvalidPayload, "entries.package")
		}
		decodedPackageBytes += len(entry.Package)
		if err := rejectDuplicateJSON(entry.Package); err != nil {
			return wrapCatalogError(ErrorInvalidPayload, "entries.package", err)
		}
		pkg, err := packaging.Decode[json.RawMessage](entry.Package)
		if err != nil {
			return wrapCatalogError(ErrorInvalidPayload, "entries.package", err)
		}
		if strings.ToLower(strings.TrimSpace(pkg.Provenance.Application)) != "vantare" || len(pkg.Bundles) != 1 || pkg.Bundles[0].Draft != nil || len(pkg.Bundles[0].Revisions) == 0 {
			return catalogError(ErrorInvalidPayload, "entries.package")
		}
	}
	return nil
}

func boundedText(value string, max int) bool {
	return strings.TrimSpace(value) != "" && len(value) <= max
}

func signatureMessage(manifest, payload []byte) []byte {
	message := make([]byte, 0, len(SignatureDomain)+8+len(manifest)+len(payload))
	message = append(message, SignatureDomain...)
	length := make([]byte, 8)
	binary.BigEndian.PutUint64(length, uint64(len(manifest)))
	message = append(message, length...)
	message = append(message, manifest...)
	message = append(message, payload...)
	return message
}
