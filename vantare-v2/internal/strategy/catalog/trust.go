package catalog

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"regexp"
)

type TrustedKeySet struct {
	TrustVersion string       `json:"trustVersion"`
	Version      uint64       `json:"version"`
	Keys         []TrustedKey `json:"keys"`
}

type TrustedKey struct {
	ID                string
	Algorithm         string
	PublicKey         ed25519.PublicKey
	NotBeforeSequence uint64
	NotAfterSequence  uint64
}

type trustedKeySetWire struct {
	TrustVersion string           `json:"trustVersion"`
	Version      uint64           `json:"version"`
	Keys         []trustedKeyWire `json:"keys"`
}
type trustedKeyWire struct {
	ID                string `json:"id"`
	Algorithm         string `json:"algorithm"`
	PublicKey         string `json:"publicKey"`
	NotBeforeSequence uint64 `json:"notBeforeSequence"`
	NotAfterSequence  uint64 `json:"notAfterSequence,omitempty"`
}

var safeID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

func ParseTrustedKeySet(document []byte) (TrustedKeySet, error) {
	if len(document) == 0 || len(document) > MaxManifestBytes {
		return TrustedKeySet{}, catalogError(ErrorInvalidTrust, "")
	}
	if err := rejectDuplicateJSON(document); err != nil {
		return TrustedKeySet{}, wrapCatalogError(ErrorInvalidTrust, "", err)
	}
	var wire trustedKeySetWire
	if err := decodeStrict(document, &wire); err != nil {
		return TrustedKeySet{}, wrapCatalogError(ErrorInvalidTrust, "", err)
	}
	keys := TrustedKeySet{TrustVersion: wire.TrustVersion, Version: wire.Version, Keys: make([]TrustedKey, 0, len(wire.Keys))}
	for _, item := range wire.Keys {
		decoded, err := base64.RawURLEncoding.DecodeString(item.PublicKey)
		if err != nil || base64.RawURLEncoding.EncodeToString(decoded) != item.PublicKey {
			return TrustedKeySet{}, catalogError(ErrorInvalidTrust, "keys.publicKey")
		}
		keys.Keys = append(keys.Keys, TrustedKey{ID: item.ID, Algorithm: item.Algorithm, PublicKey: append(ed25519.PublicKey(nil), decoded...), NotBeforeSequence: item.NotBeforeSequence, NotAfterSequence: item.NotAfterSequence})
	}
	if err := validateKeySet(keys); err != nil {
		return TrustedKeySet{}, err
	}
	return keys, nil
}

func validateKeySet(keys TrustedKeySet) error {
	if keys.TrustVersion != TrustVersionV1 || keys.Version == 0 || keys.Version > MaxJSONSafeInteger || len(keys.Keys) == 0 || len(keys.Keys) > 128 {
		return catalogError(ErrorInvalidTrust, "")
	}
	seen := make(map[string]struct{}, len(keys.Keys))
	for _, key := range keys.Keys {
		if !safeID.MatchString(key.ID) || key.Algorithm != "Ed25519" || len(key.PublicKey) != ed25519.PublicKeySize || key.NotBeforeSequence == 0 || key.NotBeforeSequence > MaxJSONSafeInteger || key.NotAfterSequence > MaxJSONSafeInteger || (key.NotAfterSequence != 0 && key.NotAfterSequence < key.NotBeforeSequence) {
			return catalogError(ErrorInvalidTrust, "keys")
		}
		if _, exists := seen[key.ID]; exists {
			return catalogError(ErrorInvalidTrust, "keys.id")
		}
		seen[key.ID] = struct{}{}
	}
	return nil
}

func decodeStrict(document []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return errorsTrailingJSON
		}
		return err
	}
	return nil
}

var (
	errorsTrailingJSON = errors.New("invalid or trailing JSON")
	errJSONLimit       = errors.New("JSON nesting or item limit exceeded")
)

func rejectDuplicateJSON(document []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.UseNumber()
	items := 0
	if err := walkJSONValue(decoder, 0, &items); err != nil {
		return err
	}
	if _, err := decoder.Token(); err != io.EOF {
		if err == nil {
			return errorsTrailingJSON
		}
		return err
	}
	return nil
}

func walkJSONValue(decoder *json.Decoder, depth int, items *int) error {
	if depth > 64 {
		return errJSONLimit
	}
	(*items)++
	if *items > 1<<20 {
		return errJSONLimit
	}
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]struct{}{}
		for decoder.More() {
			keyToken, tokenErr := decoder.Token()
			if tokenErr != nil {
				return tokenErr
			}
			key, ok := keyToken.(string)
			if !ok {
				return errorsTrailingJSON
			}
			if _, exists := seen[key]; exists {
				return errorsTrailingJSON
			}
			seen[key] = struct{}{}
			if err := walkJSONValue(decoder, depth+1, items); err != nil {
				return err
			}
		}
		end, endErr := decoder.Token()
		if endErr != nil {
			return endErr
		}
		if end != json.Delim('}') {
			return errorsTrailingJSON
		}
	case '[':
		for decoder.More() {
			if err := walkJSONValue(decoder, depth+1, items); err != nil {
				return err
			}
		}
		end, endErr := decoder.Token()
		if endErr != nil {
			return endErr
		}
		if end != json.Delim(']') {
			return errorsTrailingJSON
		}
	default:
		return errorsTrailingJSON
	}
	return nil
}
