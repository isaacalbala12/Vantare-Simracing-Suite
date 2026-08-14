package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
	"github.com/vantare/overlays/v2/internal/strategy/catalog/signing"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

type manifestSource struct {
	BundleVersion       string        `json:"bundleVersion"`
	Sequence            uint64        `json:"sequence"`
	PublishedAt         string        `json:"publishedAt"`
	KeyID               string        `json:"keyId"`
	MinimumTrustVersion uint64        `json:"minimumTrustVersion"`
	PayloadVersion      string        `json:"payloadVersion"`
	Entries             []sourceEntry `json:"entries"`
}
type sourceEntry struct {
	ID            string                `json:"id"`
	Title         string                `json:"title"`
	Summary       string                `json:"summary"`
	Compatibility catalog.Compatibility `json:"compatibility"`
	PackagePath   string                `json:"packagePath"`
}

func main() {
	if err := run(os.Args[1:], os.Getenv, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "strategy catalog generation failed")
		os.Exit(1)
	}
}

func run(args []string, getenv func(string) string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("strategy-catalog", flag.ContinueOnError)
	flags.SetOutput(stderr)
	manifestPath := flags.String("manifest", "", "source manifest")
	trustedKeysPath := flags.String("trusted-keys", "", "trusted public keyset")
	outputPath := flags.String("output", "", "output bundle")
	keyEnv := flags.String("private-key-env", "", "environment variable containing the Ed25519 key")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *manifestPath == "" || *trustedKeysPath == "" || *outputPath == "" || *keyEnv == "" || flags.NArg() != 0 {
		return errors.New("required flags missing")
	}
	sourceBytes, err := readBounded(*manifestPath, catalog.MaxManifestBytes)
	if err != nil {
		return fmt.Errorf("read manifest: %w", err)
	}
	if err := validateJSONShape(sourceBytes); err != nil {
		return errors.New("manifest JSON is invalid")
	}
	var source manifestSource
	decoder := json.NewDecoder(bytes.NewReader(sourceBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&source); err != nil {
		return fmt.Errorf("decode manifest: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("manifest contains trailing data")
	}
	if source.BundleVersion != catalog.BundleVersionV1 || source.PayloadVersion != catalog.PayloadVersionV1 {
		return errors.New("unsupported manifest version")
	}
	if source.MinimumTrustVersion == 0 {
		return errors.New("minimum trust version is required")
	}
	if len(source.Entries) > catalog.MaxEntries {
		return errors.New("manifest has too many entries")
	}
	realManifest, err := filepath.EvalSymlinks(*manifestPath)
	if err != nil {
		return fmt.Errorf("resolve manifest: %w", err)
	}
	realManifest, err = filepath.Abs(realManifest)
	if err != nil {
		return fmt.Errorf("resolve manifest: %w", err)
	}
	base := filepath.Dir(realManifest)
	realTrustedKeys, err := resolveContainedFile(base, *trustedKeysPath)
	if err != nil {
		return fmt.Errorf("resolve trusted keys: %w", err)
	}
	trustedDocument, err := readBounded(realTrustedKeys, catalog.MaxManifestBytes)
	if err != nil {
		return fmt.Errorf("read trusted keys: %w", err)
	}
	trustedKeys, err := catalog.ParseTrustedKeySet(trustedDocument)
	if err != nil {
		return errors.New("trusted keys are invalid")
	}
	payload := catalog.Payload{PayloadVersion: source.PayloadVersion, Entries: make([]catalog.Entry, 0, len(source.Entries))}
	var retainedPackageBytes uint64
	for _, item := range source.Entries {
		if filepath.IsAbs(item.PackagePath) {
			return errors.New("package path must be relative")
		}
		joined := filepath.Clean(filepath.Join(base, item.PackagePath))
		relative, relErr := filepath.Rel(base, joined)
		if relErr != nil || relative == ".." || len(relative) >= 3 && relative[:3] == ".."+string(filepath.Separator) {
			return errors.New("package path escapes manifest directory")
		}
		realPackage, resolveErr := filepath.EvalSymlinks(joined)
		if resolveErr != nil {
			return fmt.Errorf("resolve package: %w", resolveErr)
		}
		realPackage, resolveErr = filepath.Abs(realPackage)
		if resolveErr != nil {
			return fmt.Errorf("resolve package: %w", resolveErr)
		}
		realRelative, resolveErr := filepath.Rel(base, realPackage)
		if resolveErr != nil || realRelative == ".." || len(realRelative) >= 3 && realRelative[:3] == ".."+string(filepath.Separator) {
			return errors.New("package path escapes manifest directory")
		}
		packageBytes, readErr := readBounded(realPackage, packaging.MaxPackageBytes)
		if readErr != nil {
			return fmt.Errorf("read package: %w", readErr)
		}
		if uint64(len(packageBytes)) > uint64(catalog.MaxDecodedPackagesBytes)-retainedPackageBytes {
			return errors.New("decoded package byte budget exceeds catalog limit")
		}
		retainedPackageBytes += uint64(len(packageBytes))
		payload.Entries = append(payload.Entries, catalog.Entry{ID: item.ID, Title: item.Title, Summary: item.Summary, Compatibility: item.Compatibility, Package: packageBytes})
	}
	sort.Slice(payload.Entries, func(left, right int) bool { return payload.Entries[left].ID < payload.Entries[right].ID })
	encodedKey := getenv(*keyEnv)
	keyBytes, err := base64.RawURLEncoding.DecodeString(encodedKey)
	if err != nil || base64.RawURLEncoding.EncodeToString(keyBytes) != encodedKey {
		return errors.New("private key environment value is invalid")
	}
	var privateKey ed25519.PrivateKey
	switch len(keyBytes) {
	case ed25519.SeedSize:
		privateKey = ed25519.NewKeyFromSeed(keyBytes)
	case ed25519.PrivateKeySize:
		privateKey = append(ed25519.PrivateKey(nil), keyBytes...)
	default:
		return errors.New("private key environment value is invalid")
	}
	document, err := signing.Build(catalog.Manifest{BundleVersion: source.BundleVersion, Sequence: source.Sequence, PublishedAt: source.PublishedAt, KeyID: source.KeyID, MinimumTrustVersion: source.MinimumTrustVersion}, payload, privateKey, trustedKeys)
	if err != nil {
		return err
	}
	if err := writeOutputAtomic(*outputPath, document); err != nil {
		return err
	}
	_, _ = fmt.Fprintln(stdout, "strategy catalog written")
	return nil
}

func resolveContainedFile(base, path string) (string, error) {
	candidate := path
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(base, candidate)
	}
	real, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		return "", err
	}
	real, err = filepath.Abs(real)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(base, real)
	if err != nil || relative == ".." || len(relative) >= 3 && relative[:3] == ".."+string(filepath.Separator) {
		return "", errors.New("path escapes manifest directory")
	}
	info, err := os.Stat(real)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("path must identify a regular file")
	}
	return real, nil
}

func readBounded(path string, maximum int) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Size() < 0 || info.Size() > int64(maximum) {
		return nil, errors.New("file exceeds size limit")
	}
	handle, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer handle.Close()
	document, err := io.ReadAll(io.LimitReader(handle, int64(maximum)+1))
	if err != nil {
		return nil, err
	}
	if len(document) > maximum {
		return nil, errors.New("file exceeds size limit")
	}
	return document, nil
}

func validateJSONShape(document []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(document))
	items := 0
	if err := walkJSON(decoder, 0, &items); err != nil {
		return err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}

func walkJSON(decoder *json.Decoder, depth int, items *int) error {
	if depth > 64 {
		return errors.New("JSON limit exceeded")
	}
	(*items)++
	if *items > 1<<16 {
		return errors.New("JSON limit exceeded")
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
			keyToken, keyErr := decoder.Token()
			if keyErr != nil {
				return keyErr
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("invalid object key")
			}
			if _, duplicate := seen[key]; duplicate {
				return errors.New("duplicate object key")
			}
			seen[key] = struct{}{}
			if err := walkJSON(decoder, depth+1, items); err != nil {
				return err
			}
		}
		end, endErr := decoder.Token()
		if endErr != nil || end != json.Delim('}') {
			return errors.New("invalid object")
		}
	case '[':
		for decoder.More() {
			if err := walkJSON(decoder, depth+1, items); err != nil {
				return err
			}
		}
		end, endErr := decoder.Token()
		if endErr != nil || end != json.Delim(']') {
			return errors.New("invalid array")
		}
	default:
		return errors.New("invalid JSON delimiter")
	}
	return nil
}

func writeOutputAtomic(path string, data []byte) error {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".strategy-catalog-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		if !committed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		return err
	}
	if err := temporary.Sync(); err != nil {
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := replaceOutput(temporaryPath, path); err != nil {
		return err
	}
	committed = true
	return nil
}
